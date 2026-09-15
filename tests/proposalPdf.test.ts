/**
 * El PDF de la propuesta: el documento que sale de la casa.
 *
 * Es lo último de la cadena y lo único que el colegio archiva, reenvía a
 * dirección y enseña a las familias. Nunca se había mirado uno generado: al
 * hacerlo aparecieron dos páginas en blanco, un «≤» convertido en basura y la
 * base de coste de Oravia impresa para el cliente.
 *
 * Cómo correrla:  npm run test:pdf
 *
 * No necesita base de datos: se le dan los datos a mano y se lee el PDF.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// El almacén se elige al importar el módulo, así que se fija ANTES.
const ALMACEN = mkdtempSync(path.join(os.tmpdir(), "oravia-pdf-"));
process.env.ORAVIA_STORAGE_DIR = ALMACEN;

const { buildProposalPdf, textoParaElCliente } = await import("../server/proposalPdf");
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");

let pasadas = 0;
let fallidas = 0;

function prueba(nombre: string, cuerpo: () => void) {
  try {
    cuerpo();
    pasadas += 1;
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallidas += 1;
    console.error(`  FALLA  ${nombre}`);
    console.error(`        ${(error as Error).message.split("\n")[0]}`);
  }
}

// ── Lo que no puede salir de casa ─────────────────────────────────────────────

console.log("\nLo que no puede salir de casa");

prueba("la trazabilidad interna del documento origen no se imprime", () => {
  const limpio = textoParaElCliente(
    "Rooming list obligatoria 30 días antes. Fuente: COSTE_ALOJAMIENTO_ESTUDIANTES_2027_ACTUALIZADO_TAIGA (Word).",
  );
  assert.ok(!/fuente/i.test(limpio), limpio);
  assert.ok(!/COSTE_ALOJAMIENTO/i.test(limpio), limpio);
  assert.match(limpio, /Rooming list obligatoria 30 días antes/);
});

prueba("la base de coste tampoco", () => {
  const limpio = textoParaElCliente(
    "Precios netos por persona y noche (coste). Distribución en habitaciones dobles.",
  );
  assert.ok(!/coste/i.test(limpio), limpio);
  assert.equal(limpio, "Distribución en habitaciones dobles.");
});

prueba("pero lo que el cliente sí necesita sobrevive a la limpieza", () => {
  // La misma frase lleva el precio neto (nuestro) y el IVA (suyo). Tirar la
  // frase entera se llevaba el IVA por delante.
  const limpio = textoParaElCliente("Preus nets PPPN, IVA 10% inclòs. Mínim 2 nits.");
  assert.ok(!/preus nets/i.test(limpio), limpio);
  assert.match(limpio, /IVA 10% inclòs/);
  assert.match(limpio, /Mínim 2 nits/);
});

prueba("un texto sin nada interno se queda como está", () => {
  const original = "Agua incluida. Rooming list 30 días antes.";
  assert.equal(textoParaElCliente(original), original);
});

// ── Lo que la fuente no sabe dibujar ──────────────────────────────────────────

console.log("\nCaracteres que la fuente del PDF no tiene");

prueba("«≤» no se convierte en basura", () => {
  // Helvetica va en WinAnsi y no tiene «≤». Antes salía «Tarifa estudiantes
  // ("d16 años)», que no es que se viera raro: decía otra cosa.
  const limpio = textoParaElCliente("Tarifa estudiantes (≤16 años).");
  assert.equal(limpio, "Tarifa estudiantes (<=16 años).");
});

prueba("«≥» tampoco", () => {
  assert.equal(textoParaElCliente("Grupos ≥25 pax."), "Grupos >=25 pax.");
});

prueba("los acentos y el euro se conservan", () => {
  assert.equal(textoParaElCliente("Suplemento +15 €/día en Vila-seca."), "Suplemento +15 €/día en Vila-seca.");
});

// ── El documento entero ───────────────────────────────────────────────────────

const OPCION = (n: number) => ({
  optionNumber: n,
  accommodationName: `Hotel de prueba ${n}`,
  boardType: "PC",
  nights: 4,
  participants: 55,
  teachers: 5,
  totalPvpText: "8.294,40 €",
  priceBreakdownText: "34,56 € x 55 alumnos + 34,56 € x 5 profesores, por noche x 4 noches",
  conditionsText: "Individual +75% s/múltiple.",
  observationsText: "Tarifa estudiantes (≤16 años). Rooming list 30 días antes.",
});

const ruta = await buildProposalPdf({
  reference: "ORV-2026-9999",
  clientName: "María López",
  centreName: null,
  tripTitle: "Viaje fin de curso Salou 2027",
  destination: "Salou",
  dateFrom: new Date("2027-05-18T00:00:00Z"),
  dateTo: new Date("2027-05-22T00:00:00Z"),
  participants: 55,
  teachers: 5,
  options: [OPCION(1), OPCION(2), OPCION(3)],
  preparedBy: "Oravia Travel Group",
});

const pdf = await getDocument({
  data: new Uint8Array(readFileSync(path.resolve(ruta))),
  useSystemFonts: true,
}).promise;

const textoPorPagina: string[] = [];
for (let p = 1; p <= pdf.numPages; p += 1) {
  const contenido = await (await pdf.getPage(p)).getTextContent();
  textoPorPagina.push(
    contenido.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

console.log("\nEl documento entero");

prueba("no hay páginas que solo lleven el pie", () => {
  // El pie se escribía a 790 pt, dentro del margen inferior, y pdfkit pasaba de
  // página: cada pie acababa en una página nueva y vacía. Una propuesta de dos
  // páginas salía con cuatro.
  const soloPie = textoPorPagina.filter((t) => /^Oravia Travel Group\b.*Página \d+ de \d+$/.test(t));
  assert.equal(soloPie.length, 0, `${soloPie.length} página(s) en blanco con pie`);
});

prueba("el pie está en todas las páginas y la cuenta cuadra", () => {
  for (const [indice, texto] of textoPorPagina.entries()) {
    assert.match(
      texto,
      new RegExp(`Página ${indice + 1} de ${pdf.numPages}`),
      `la página ${indice + 1} no lleva su pie`,
    );
  }
});

prueba("las tres opciones están", () => {
  const todo = textoPorPagina.join(" ");
  for (const n of [1, 2, 3]) {
    assert.match(todo, new RegExp(`OPCIÓN ${n}`));
  }
});

prueba("el título no sale dos veces", () => {
  const todo = textoPorPagina.join(" ");
  const veces = todo.split("Viaje fin de curso Salou 2027").length - 1;
  assert.equal(veces, 1, `el título aparece ${veces} veces`);
});

prueba("el desglose cuadra con el total", () => {
  // 34,56 x 60 personas x 4 noches = 8.294,40. Si el desglose se redondea a
  // euros da 8.400 y el colegio encuentra 106 € que no existen.
  const todo = textoPorPagina.join(" ");
  assert.match(todo, /34,56 €/);
  assert.match(todo, /8\.294,40 €/);
});

rmSync(ALMACEN, { recursive: true, force: true });

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
