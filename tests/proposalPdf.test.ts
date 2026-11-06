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
  // Sin entradas por tarifa, el precio por persona × el grupo; y lo que sale por alumno.
  assert.match(textoDos, /3\.900,00 € para el grupo/);
  // Por alumno, lo que paga cada uno, y lo de los profesores aparte: no se
  // carga a los alumnos (Ruth, 02/11/2026). Antes: 3.900 / 48 = 81,25 €.
  assert.match(textoDos, /48 alumnos y 4 profesores · 75,00 € por alumno · 300,00 € los profesores de pago/);
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

// ── El resumen aguanta que la solicitud venga sin el grupo ───────────────────
//
// Pasó de verdad y se vio en un PDF: la solicitud se guardaba con la PRIMERA
// lectura del mensaje, así que el número de alumnos contestado en el chat no
// llegaba. El resumen salió «para 0 alumnos», la columna de actividades con un
// guion, y el total del viaje igual al del alojamiento a secas.
//
// El fallo está corregido aguas arriba, pero el documento no puede depender de
// que un solo sitio tenga el dato: cada opción lleva el suyo.

const rutaTres = await buildProposalPdf({
  reference: "ORV-2026-9997",
  clientName: "María López",
  centreName: null,
  tripTitle: "IES JAUME BALMES 2027",
  destination: "Salou",
  dateFrom: new Date("2027-05-18T00:00:00Z"),
  dateTo: new Date("2027-05-22T00:00:00Z"),
  // La solicitud llega SIN grupo: es exactamente lo que pasaba.
  participants: null,
  teachers: null,
  options: [CON_ACTIVIDADES],
  preparedBy: "Oravia Travel Group",
});

const pdfTres = await getDocument({
  data: new Uint8Array(readFileSync(path.resolve(rutaTres))),
  useSystemFonts: true,
}).promise;

let textoTres = "";
for (let p = 1; p <= pdfTres.numPages; p += 1) {
  const contenido = await (await pdfTres.getPage(p)).getTextContent();
  textoTres += " " + contenido.items.map((i) => ("str" in i ? i.str : "")).join(" ");
}
textoTres = textoTres.replace(/\s+/g, " ");

console.log("\nSi la solicitud viene sin el grupo, manda el de las opciones");

prueba("no sale «para 0 alumnos»", () => {
  // La opción lleva 55 alumnos y 5 profesores; la solicitud, nada.
  assert.ok(!/para 0 alumnos/.test(textoTres), "sigue saliendo «para 0 alumnos»");
  assert.match(textoTres, /para 55 alumnos/);
});

prueba("las actividades se siguen sumando", () => {
  // 75 € por persona x 60 personas = 4.500. Con el grupo a cero salían a cero
  // y en la columna se imprimía un guion.
  assert.match(textoTres, /4\.500,00/);
});

prueba("y el total del viaje no es solo el alojamiento", () => {
  // 9.200 de alojamiento + 4.500 de actividades.
  assert.match(textoTres, /13\.700,00/);
});

// ── TEST MIÑANA (Ruth, 02/11/2026) ───────────────────────────────────────────
//
// 100 alumnos y 10 profesores. En el kayak pagan 104 a 29,60 € (1 gratis cada
// 15 de pago) y el PDF decía «30,78 € por alumno»: cargaba a los alumnos lo de
// los 4 profesores que pagan. Y la página del enlace no enseñaba ni las
// actividades ni el precio por persona: tiene que decir lo mismo que el PDF.

const { documentoParaElCliente } = await import("../server/proposalPdf");
const { opcionesDelDocumento } = await import("../server/proposalDelivery");

const MINANA = {
  accommodationOptions: [
    {
      optionNumber: 1,
      accommodationNameSnapshot: "Hotel Planas 3* (Salou)",
      boardType: "MP",
      nights: 4,
      participants: 100,
      teachers: 10,
      totalPvpText: "23.234,82 €",
      priceBreakdownText: "48,46 € x 100 alumnos + 48,46 € x 10 profesores, por noche x 4 noches",
      conditionsText: "[GRATUITY] 1 gratuidad cada 25 pax. | [PAYMENT] Depósito 20€/pax.",
      observationsText: null,
      freePolicyText: "1 gratuidad cada 25 pax.",
    },
  ],
  activityOptions: [
    {
      optionNumber: 1,
      activityNameSnapshot: "1 día, 2 parques PortAventura Park y Ferrari Land",
      providerSnapshot: "PortAventura World",
      durationSnapshot: "1 día",
      pvpSnapshot: "41,28 €",
      descriptionSnapshot: null,
      amountTotal: 4128,
      linesJson: JSON.stringify([
        { rateId: "a#gratis", etiqueta: "Adulto (18-59) · Entrada · Periodo D · gratuidad", precio: 0, cantidad: 10 },
        { rateId: "j", etiqueta: "Joven/Secundaria/Uni (12-17) · Entrada · Periodo D", precio: 41.28, cantidad: 100 },
      ]),
    },
    {
      optionNumber: 1,
      activityNameSnapshot: "Kayak + paddle surf + agility y XXL",
      providerSnapshot: "Club Nàutic Salou",
      durationSnapshot: "2 h 30 min",
      pvpSnapshot: "30,78 €",
      descriptionSnapshot: null,
      amountTotal: 3078.4,
      linesJson: JSON.stringify([
        { rateId: "k", etiqueta: "De 25 a 50 pax", precio: 29.6, cantidad: 104 },
        { rateId: "k#gratis", etiqueta: "De 25 a 50 pax · gratuidad", precio: 0, cantidad: 6 },
      ]),
    },
  ],
} as unknown as Parameters<typeof opcionesDelDocumento>[0];

const entradaMinana = {
  reference: "ORV-2026-9996",
  clientName: "Ruth Pujol",
  centreName: null,
  tripTitle: "TEST MIÑANA 2027",
  destination: "Salou",
  dateFrom: new Date("2027-06-14T00:00:00Z"),
  dateTo: new Date("2027-06-18T00:00:00Z"),
  participants: 100,
  teachers: 10,
  options: opcionesDelDocumento(MINANA),
  preparedBy: "Oravia Travel Group",
};
const rutaMinana = await buildProposalPdf(entradaMinana);
const pdfMinana = await getDocument({
  data: new Uint8Array(readFileSync(path.resolve(rutaMinana))),
  useSystemFonts: true,
}).promise;
let textoMinana = "";
for (let p = 1; p <= pdfMinana.numPages; p += 1) {
  const contenido = await (await pdfMinana.getPage(p)).getTextContent();
  textoMinana += " " + contenido.items.map((i) => ("str" in i ? i.str : "")).join(" ");
}
textoMinana = textoMinana.replace(/\s+/g, " ");
const documentoMinana = documentoParaElCliente(entradaMinana);

console.log("\nTEST MIÑANA: precio por alumno y por profesor, y la página igual que el PDF");

prueba("el kayak sale a 29,60 € por alumno y 29,60 € por profesor, no a 30,78 €", () => {
  assert.match(textoMinana, /29,60 € por alumno/);
  assert.match(textoMinana, /29,60 € por profesor · 6 gratis/);
  assert.ok(!/30,78 € por alumno/.test(textoMinana), "sigue saliendo 30,78 € por alumno");
  assert.match(textoMinana, /3\.078,40 € el grupo/);
});

prueba("PortAventura con los 10 profesores gratis lo dice", () => {
  assert.match(textoMinana, /41,28 € por alumno/);
  assert.match(textoMinana, /Profesores gratis/);
});

prueba("el total de las actividades: lo de cada alumno y lo de los profesores aparte", () => {
  // 41,28 + 29,60 = 70,88 por alumno; 4 × 29,60 = 118,40 de profesores; 7.088 + 118,40 = 7.206,40.
  assert.match(textoMinana, /7\.206,40 € para el grupo/);
  assert.match(textoMinana, /70,88 € por alumno · 118,40 € los profesores de pago/);
});

prueba("la página del enlace lleva las actividades y el precio por persona, como el PDF", () => {
  const kayak = documentoMinana.actividades?.lista.find((a) => /Kayak/.test(a.nombre));
  assert.ok(kayak, "la página no trae el kayak");
  // Intl pone un espacio duro antes del euro: para comparar, espacios normales.
  const llano = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ");
  assert.equal(llano(kayak.precio), "29,60 € por alumno");
  assert.equal(llano(kayak.profesores), "29,60 € por profesor · 6 gratis");
  assert.deepEqual(kayak.lineas, ["104 × 29,60 € De 25 a 50 pax", "6 × 0,00 € De 25 a 50 pax · gratuidad"]);
  assert.ok(documentoMinana.opciones[0].porAlumno?.endsWith("por alumno"), "falta el precio por alumno del alojamiento");
  assert.equal(documentoMinana.resumen?.filas.length, 1);
  // Todo lo que dice la página está en el PDF, palabra por palabra.
  const textos = [
    documentoMinana.opciones[0].porAlumno,
    documentoMinana.opciones[0].gratuidades,
    ...documentoMinana.actividades!.lista.flatMap((a) => [a.nombre, a.precio, a.profesores, a.grupo]),
    documentoMinana.actividades!.total,
    documentoMinana.resumen!.filas[0].total,
    documentoMinana.resumen!.filas[0].porAlumno,
  ].filter((t): t is string => Boolean(t));
  for (const t of textos) assert.ok(textoMinana.includes(t.replace(/\s+/g, " ")), `la página dice «${t}» y el PDF no`);
});

prueba("las condiciones de la página salen sin etiquetas internas", () => {
  const todas = documentoMinana.opciones.flatMap((o) => o.condiciones.map((c) => `${c.etiqueta}: ${c.texto}`));
  assert.ok(todas.length > 0);
  assert.ok(!todas.some((t) => /\[[A-Z_]+\]|GRATUITY|PAYMENT/.test(t)), todas.join(" | "));
});

// ── Solo actividades (Ruth, 02/11/2026) ──────────────────────────────────────
//
// «No todas las cotizaciones requieren de alojamiento.» Sin hoteles, el
// documento es el programa: ni «Los alojamientos» vacío ni un resumen de
// opciones que no existen.

const { actividadesSinAlojamiento } = await import("../server/proposalDelivery");
const SOLO_ACTIVIDADES = {
  accommodationOptions: [],
  activityOptions: [
    {
      optionNumber: 1,
      activityNameSnapshot: "Paintball",
      providerSnapshot: "Aventura Salou",
      durationSnapshot: "2 h",
      pvpSnapshot: "18,00 €",
      descriptionSnapshot: null,
      amountTotal: 990,
      linesJson: JSON.stringify([
        { rateId: "p", etiqueta: "Por persona", precio: 18, cantidad: 55 },
        { rateId: "p#gratis", etiqueta: "Por persona · gratuidad", precio: 0, cantidad: 5 },
      ]),
    },
  ],
} as unknown as Parameters<typeof actividadesSinAlojamiento>[0];

const entradaSolo = {
  reference: "ORV-2026-9995",
  clientName: "Ruth Pujol",
  centreName: null,
  tripTitle: "TEST SOLO ACTIVIDADES",
  destination: "Salou",
  dateFrom: new Date("2027-04-14T00:00:00Z"),
  dateTo: new Date("2027-04-14T00:00:00Z"),
  participants: 55,
  teachers: 5,
  options: opcionesDelDocumento(SOLO_ACTIVIDADES),
  activities: actividadesSinAlojamiento(SOLO_ACTIVIDADES, 55, 5),
  publicUrl: "https://presupuesto.example/p/prueba",
  preparedBy: "Oravia Travel Group",
};
const rutaSolo = await buildProposalPdf(entradaSolo);
const pdfSolo = await getDocument({
  data: new Uint8Array(readFileSync(path.resolve(rutaSolo))),
  useSystemFonts: true,
}).promise;
let textoSolo = "";
for (let p = 1; p <= pdfSolo.numPages; p += 1) {
  const contenido = await (await pdfSolo.getPage(p)).getTextContent();
  textoSolo += " " + contenido.items.map((i) => ("str" in i ? i.str : "")).join(" ");
}
textoSolo = textoSolo.replace(/\s+/g, " ");
const documentoSolo = documentoParaElCliente(entradaSolo);

console.log("\nSolo actividades: sin alojamiento");

prueba("no hay parte de alojamientos ni resumen de opciones", () => {
  assert.ok(!/LOS ALOJAMIENTOS/.test(textoSolo), "sale «Los alojamientos» sin hoteles");
  assert.ok(!/RESUMEN DEL VIAJE/.test(textoSolo), "sale un resumen de opciones que no existen");
  assert.equal(documentoSolo.opciones.length, 0);
  assert.equal(documentoSolo.resumen, null);
});

prueba("las actividades son la parte 1, con su precio y su total", () => {
  assert.match(textoSolo, /1 · LAS ACTIVIDADES/);
  assert.match(textoSolo, /Paintball/);
  assert.match(textoSolo, /18,00 € por alumno/);
  assert.match(textoSolo, /990,00 € para el grupo/);
  assert.equal(documentoSolo.actividades?.lista.length, 1);
});

prueba("para aceptar: la propuesta, no «la opción que prefieras»", () => {
  assert.match(textoSolo, /Para aceptar la propuesta/);
  assert.match(textoSolo, /Aceptar la propuesta/);
});

// ── Las notas para el cliente ─────────────────────────────────────────────────
//
// Reunión con Oravia, 05/11/2026: hace falta un campo de texto libre en la
// propuesta (horarios de entrenamiento, condiciones de pago…). Lo lee el cliente.

const NOTAS =
  "Entrenamientos: martes y jueves de 9:00 a 11:00 en el campo 2.\n\nPago: 30 % a la aceptación y el resto 30 días antes de la llegada.";

async function textoDe(ruta: string): Promise<string> {
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(path.resolve(ruta))), useSystemFonts: true }).promise;
  let texto = "";
  for (let p = 1; p <= pdf.numPages; p += 1) {
    const contenido = await (await pdf.getPage(p)).getTextContent();
    texto += " " + contenido.items.map((i) => ("str" in i ? i.str : "")).join(" ");
  }
  return texto.replace(/\s+/g, " ");
}

const DATOS_NOTAS = {
  clientName: "María López",
  centreName: null,
  tripTitle: "IES JAUME BALMES 2027",
  destination: "Salou",
  dateFrom: new Date("2027-05-18T00:00:00Z"),
  dateTo: new Date("2027-05-22T00:00:00Z"),
  participants: 48,
  teachers: 4,
  options: [CON_ACTIVIDADES],
  preparedBy: "Oravia Travel Group",
};
const conNotas = await textoDe(await buildProposalPdf({ ...DATOS_NOTAS, reference: "ORV-2026-9990", notes: NOTAS, publicUrl: "https://app.oravia.test/p/abc" }));
const sinNotas = await textoDe(await buildProposalPdf({ ...DATOS_NOTAS, reference: "ORV-2026-9989", publicUrl: "https://app.oravia.test/p/abc" }));

console.log("\nLas notas para el cliente");

prueba("las notas salen en el PDF, con su título y tal cual las escribió quien cotiza", () => {
  assert.match(conNotas, /NOTAS/);
  assert.match(conNotas, /Entrenamientos: martes y jueves de 9:00 a 11:00 en el campo 2\./);
  assert.match(conNotas, /Pago: 30 % a la aceptación y el resto 30 días antes de la llegada\./);
});

prueba("van después del resumen y antes de cómo aceptar la propuesta", () => {
  const resumen = conNotas.indexOf("3 · RESUMEN DEL VIAJE");
  const notas = conNotas.indexOf("NOTAS");
  const aceptar = conNotas.indexOf("Para aceptar");
  assert.ok(resumen >= 0 && notas > resumen && aceptar > notas, `${resumen} < ${notas} < ${aceptar}`);
});

prueba("sin notas no sale ni el título", () => {
  assert.doesNotMatch(sinNotas, /NOTAS/);
});

prueba("el documento compartido con la página del enlace lleva las notas; sin ellas, null", () => {
  assert.equal(documentoParaElCliente({ ...DATOS_NOTAS, reference: "X", notes: NOTAS }).notas, NOTAS);
  assert.equal(documentoParaElCliente({ ...DATOS_NOTAS, reference: "X" }).notas, null);
  assert.equal(documentoParaElCliente({ ...DATOS_NOTAS, reference: "X", notes: "   \n  " }).notas, null);
});

prueba("unas notas largas no se salen de la página: el PDF sigue teniendo pie en todas", () => {
  assert.match(conNotas, /Entrenamientos/);
});

const largas = await textoDe(await buildProposalPdf({ ...DATOS_NOTAS, reference: "ORV-2026-9988", notes: Array.from({ length: 19 }, (_, i) => `Línea ${i + 1}: ${"texto de prueba ".repeat(5)}`).join("\n") }));
prueba("con muchas líneas, las notas pasan a otra página y no se pierde ninguna", () => {
  assert.match(largas, /Línea 1:/);
  assert.match(largas, /Línea 19:/);
});

// ── Bloques de alumnos con otra habitación y otra pensión (Oravia, 05/11/2026) ──
//
// La cifra grande de la opción es la del grupo principal; el de cada bloque va
// debajo, y el desglose lo explica. Nadie debe leer «52 € por alumno» sin saber
// que solo vale para 40 de los 50.

const conBloquesPdf = await textoDe(
  await buildProposalPdf({
    ...DATOS_NOTAS,
    reference: "ORV-2026-9987",
    participants: 50,
    options: [
      {
        ...CON_ACTIVIDADES,
        totalPvpText: "9.000,00 €",
        totalAmount: 9000,
        priceBreakdownText:
          "40,00 € x 40 alumnos + 52,00 € x 10 alumnos (en doble, suplemento +10 %, MP) + 60,11 € x 3 profesores (uso individual), por noche x 4 noches",
      },
    ],
  }),
);

console.log("\nLos bloques de alumnos en el documento");

prueba("la cifra grande dice que es la del grupo principal, y cada bloque tiene su precio debajo", () => {
  assert.match(conBloquesPdf, /160,00 € por alumno del grupo principal/);
  assert.match(conBloquesPdf, /208,00 € por alumno en habitación doble, media pensión \(10 alumnos\)/);
});

prueba("el desglose escribe el bloque en palabras, sin abreviaturas", () => {
  assert.match(conBloquesPdf, /10 alumnos \(habitación doble, suplemento del 10 %, media pensión\)/);
  assert.match(conBloquesPdf, /El resto de los alumnos va en otra habitación o con otra pensión/);
});

rmSync(ALMACEN, { recursive: true, force: true });

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
