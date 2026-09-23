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

// ── Las tres partes del documento ─────────────────────────────────────────────
//
// Es como lo pidió Oravia: 1) los alojamientos, cada uno con todo lo que
// supone; 2) las actividades, el itinerario entero UNA vez y lo que cuesta el
// conjunto; 3) el resumen del viaje. Antes el PDF ni cargaba las actividades,
// y cuando empezaron a salir iban repetidas bajo cada hotel: para comparar
// tres alojamientos había que leer tres veces el mismo programa.

const CON_ACTIVIDADES = {
  ...OPCION(1),
  accommodationName: "Hotel Santa Mónica Playa",
  totalPvpText: "9.200,00 €",
  totalAmount: 9200,
  // Tal y como las guarda el importador: con el tipo entre corchetes y unidas
  // por barras verticales. Es lo que de verdad hay en la base.
  freePolicyText: "1 gratuidad cada 25 de pago (hab. múltiple).",
  conditionsText:
    "[SUPLEMENTO] Individual +50% s/régimen. | [TASA] No incluida. | " +
    "[CANCELACION] 25-7 días 20% y menos de 7 días 50%.",
  activities: [
    { name: "1 día PortAventura Park", provider: "PortAventura", duration: "1 día", priceText: "52,00 €", amount: 52 },
    { name: "Caribe Aquatic Park", provider: "PortAventura", duration: "1 día", priceText: "23,00 €", amount: 23 },
  ],
};

const rutaDos = await buildProposalPdf({
  reference: "ORV-2026-9998",
  clientName: "María López",
  centreName: null,
  tripTitle: "IES JAUME BALMES 2027",
  destination: "Salou",
  dateFrom: new Date("2027-05-18T00:00:00Z"),
  dateTo: new Date("2027-05-22T00:00:00Z"),
  participants: 48,
  teachers: 4,
  options: [CON_ACTIVIDADES, { ...OPCION(2), totalAmount: 11000, totalPvpText: "11.000,00 €" }],
  preparedBy: "Oravia Travel Group",
});

const pdfDos = await getDocument({
  data: new Uint8Array(readFileSync(path.resolve(rutaDos))),
  useSystemFonts: true,
}).promise;

let textoDos = "";
for (let p = 1; p <= pdfDos.numPages; p += 1) {
  const contenido = await (await pdfDos.getPage(p)).getTextContent();
  textoDos += " " + contenido.items.map((i) => ("str" in i ? i.str : "")).join(" ");
}
textoDos = textoDos.replace(/\s+/g, " ");

console.log("\nLas actividades y el resumen");

prueba("el documento va en tres partes, y en este orden", () => {
  const alojamientos = textoDos.indexOf("1 · LOS ALOJAMIENTOS");
  const actividades = textoDos.indexOf("2 · LAS ACTIVIDADES");
  const resumen = textoDos.indexOf("3 · RESUMEN DEL VIAJE");

  assert.ok(alojamientos >= 0, "falta la parte de alojamientos");
  assert.ok(actividades > alojamientos, "las actividades no van tras los alojamientos");
  assert.ok(resumen > actividades, "el resumen no va al final");
});

prueba("el itinerario sale una sola vez, no bajo cada hotel", () => {
  assert.match(textoDos, /PortAventura Park/);
  // Repetirlo bajo cada alojamiento obligaba a leer tres veces lo mismo para
  // poder comparar tres hoteles.
  const veces = textoDos.split("Caribe Aquatic Park").length - 1;
  assert.equal(veces, 1, `la actividad aparece ${veces} veces`);
});

prueba("se dice lo que cuestan TODAS las actividades juntas", () => {
  // 52 + 23 = 75 € por persona; 48 alumnos + 4 profesores = 52 personas.
  assert.match(textoDos, /Total de las actividades/);
  assert.match(textoDos, /75,00 € por persona/);
  assert.match(textoDos, /3\.900,00 € para las 52 personas/);
});

prueba("las condiciones del alojamiento se leen, sin corchetes en mayúsculas", () => {
  // El importador las guarda como «[GRATUIDAD] texto | [CANCELACION] texto».
  // Sacar eso tal cual al PDF hacía que el colegio leyera una base de datos.
  assert.ok(!/\[[A-Z_]+\]/.test(textoDos), "quedan etiquetas del importador en el PDF");
  assert.match(textoDos, /Cancelación: /);
  assert.match(textoDos, /Tasa turística: /);
  assert.match(textoDos, /GRATUIDADES/);
  assert.match(textoDos, /1 gratuidad cada 25 de pago/);
});

prueba("el total de una opción suma alojamiento MÁS actividades", () => {
  // 52 + 23 = 75 € por persona, y van 48 alumnos + 4 profesores = 52 personas.
  // 75 x 52 = 3.900 de actividades, más 9.200 de alojamiento = 13.100.
  assert.match(textoDos, /13\.100,00/);
});

prueba("y se dice cuánto sale por alumno", () => {
  // 13.100 / 48 alumnos = 272,92.
  assert.match(textoDos, /272,92/);
  assert.match(textoDos, /por alumno/);
});

prueba("una opción sin actividades no inventa importes", () => {
  // La opción 2 no tiene ninguna: su total es el del alojamiento a secas.
  assert.match(textoDos, /11\.000,00/);
});

rmSync(ALMACEN, { recursive: true, force: true });

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
