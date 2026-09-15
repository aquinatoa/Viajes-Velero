/**
 * Lectura del mensaje del cliente (bloque «Solicitud»).
 *
 * Cada caso es un correo de colegio escrito como se escriben de verdad, no
 * como conviene al analizador. El bloque nunca se había ejercitado y el único
 * mensaje que se entendía entero era el de la demo, que está redactado con los
 * patrones que el código esperaba.
 *
 * Cómo correrla:  npm run test:solicitud
 * (equivale a: node --import tsx tests/tripRequest.test.ts)
 *
 * No necesita base de datos ni red: todo esto pasa en el navegador.
 */
import assert from "node:assert/strict";

import {
  extractClientInfo,
  extractRequestExtras,
  readTripMessage,
} from "../src/services/requestService";

// Fecha fija: las pruebas de «del 10 al 14 de mayo» dependen de cuándo se
// leen, y una prueba que caduca sola no es una prueba.
const HOY = new Date("2026-09-15T00:00:00Z");

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

// ── Correos de muestra ────────────────────────────────────────────────────────

const CORREO_DEMO = `Hola, buenos días:

Soy María López, del IES Ramón y Cajal de Madrid. Estamos organizando el viaje
de fin de curso a Salou del 18 al 22 de mayo de 2027. Seríamos un grupo de 55
estudiantes de entre 15 y 17 años, más 5 profesores acompañantes.

Nos interesaría un hotel de 3 estrellas en pensión completa. El presupuesto que
manejamos es de unos 350 € por alumno.

Un saludo,
María López
mlopez@iesramonycajal.es`;

const CORREO_SIN_ESTRUCTURA = `Buenas,
os escribo del Colegio Sagrado Corazón. Queríamos pedir presupuesto para el
viaje de estudios. Iríamos a La Pineda del 4 al 8 de junio de 2027.
Somos 48 alumnos de 15 años y vamos 4 profes. Media pensión estaría bien.
Hay dos niños celíacos y una alumna en silla de ruedas.
Gracias
Jose Antonio Ruiz - jaruiz@sagradocorazon.edu.es`;

const CORREO_SIN_ANIO = `Hola, queremos ir a Cambrils del 10 al 14 de mayo con 40 alumnos de 14 años y
3 profesores en media pensión. Colegio Ntra. Sra. del Carmen.
Luis Peña, lpena@carmen.es`;

const CORREO_INGLES = `Dear Sirs,
We are a school from Zurich planning a study trip to Salou from 2027-05-10 to
2027-05-15. We would be 62 students aged 14 to 16 plus 6 teachers. Half board,
3-star hotel please.
Best regards,
Anna Weber - a.weber@schule-zh.ch`;

const CORREO_DESTINO_NO_OPERADO = `Estimados,
somos el Colegio San Vicente de Alicante. Nos gustaría organizar el viaje de
fin de curso a Benidorm del 12 al 16 de abril de 2027, para 60 alumnos de 16 y
17 años y 6 profesores, en régimen de pensión completa, hotel de 4 estrellas.
Atentamente, Carmen Gil
cgil@sanvicente.es`;

// ── La edad ───────────────────────────────────────────────────────────────────

console.log("\nLa edad, que es lo que filtra las actividades");

prueba("un rango se lee como rango", () => {
  const { normalized } = readTripMessage(CORREO_DEMO, HOY);
  assert.equal(normalized.ageRangeText, "15-17");
});

prueba("una edad única también cuenta como edad", () => {
  const { normalized } = readTripMessage(CORREO_SIN_ESTRUCTURA, HOY);
  assert.equal(normalized.ageRangeText, "15");
  // El buscador saca el número de aquí cuando no hay guion: si se queda vacío,
  // la edad se ve en pantalla pero no filtra nada.
  assert.equal(normalized.averageAgeText, "15 años");
});

prueba("«aged 14 to 16» no se queda sin edad", () => {
  const { normalized } = readTripMessage(CORREO_INGLES, HOY);
  assert.equal(normalized.ageRangeText, "14-16");
});

prueba("con edad, la solicitud deja de estar incompleta", () => {
  const resultado = readTripMessage(CORREO_SIN_ANIO, HOY);
  assert.ok(!resultado.missingFields.some((f) => f.field === "ageRangeText"));
});

// ── Las fechas ────────────────────────────────────────────────────────────────

console.log("\nLas fechas");

prueba("«del 18 al 22 de mayo de 2027»", () => {
  const { normalized } = readTripMessage(CORREO_DEMO, HOY);
  assert.equal(normalized.dateFrom, "2027-05-18");
  assert.equal(normalized.dateTo, "2027-05-22");
});

prueba("sin año, se entiende el próximo que llegue", () => {
  const { normalized } = readTripMessage(CORREO_SIN_ANIO, HOY);
  assert.equal(normalized.dateFrom, "2027-05-10");
  assert.equal(normalized.dateTo, "2027-05-14");
});

prueba("sin año, un mes que aún no ha pasado es de este año", () => {
  const { normalized } = readTripMessage(
    "Queremos ir a Salou del 2 al 6 de diciembre con 30 alumnos de 15 años y 3 profesores.",
    HOY,
  );
  assert.equal(normalized.dateFrom, "2026-12-02");
  assert.equal(normalized.dateTo, "2026-12-06");
});

prueba("un viaje que cruza el fin de año vuelve en el año siguiente", () => {
  const { normalized } = readTripMessage(
    "Queremos ir a Salou del 28 de diciembre al 3 de enero, 30 alumnos de 15 años y 3 profesores.",
    HOY,
  );
  assert.equal(normalized.dateFrom, "2026-12-28");
  assert.equal(normalized.dateTo, "2027-01-03");
});

// ── Participantes y acompañantes ──────────────────────────────────────────────

console.log("\nQuién va");

prueba("«48 alumnos» y «4 profes»", () => {
  const { normalized } = readTripMessage(CORREO_SIN_ESTRUCTURA, HOY);
  assert.equal(normalized.participants, 48);
  assert.equal(normalized.teachers, 4);
});

prueba("«62 students plus 6 teachers»", () => {
  const { normalized } = readTripMessage(CORREO_INGLES, HOY);
  assert.equal(normalized.participants, 62);
  assert.equal(normalized.teachers, 6);
});

prueba("un IES es un grupo escolar, no un grupo sin tipo", () => {
  const { normalized } = readTripMessage(CORREO_DEMO, HOY);
  assert.equal(normalized.groupType, "Grupo escolar");
});

// ── Régimen y categoría ───────────────────────────────────────────────────────

console.log("\nQué piden");

prueba("«Half board» es media pensión", () => {
  const { normalized } = readTripMessage(CORREO_INGLES, HOY);
  assert.equal(normalized.regimeRequested, "media pensión");
});

prueba("«3-star hotel» es 3*, no «hotel»", () => {
  const { normalized } = readTripMessage(CORREO_INGLES, HOY);
  assert.equal(normalized.categoryRequested, "3*");
});

prueba("«3 estrellas» sigue siendo 3*", () => {
  const { normalized } = readTripMessage(CORREO_DEMO, HOY);
  assert.equal(normalized.categoryRequested, "3*");
});

// ── El destino ────────────────────────────────────────────────────────────────

console.log("\nEl destino");

prueba("el origen no se confunde con el destino", () => {
  const { normalized } = readTripMessage(
    "Somos un colegio de Barcelona y queremos ir a Valencia del 3 al 7 de marzo de 2027, 50 alumnos de 15 años, 5 profesores.",
    HOY,
  );
  assert.equal(normalized.destinationText, "Valencia");
});

prueba("un destino que no operamos se nombra en el aviso", () => {
  const resultado = readTripMessage(CORREO_DESTINO_NO_OPERADO, HOY);
  const aviso = resultado.missingFields.find((f) => f.field === "destinationText");
  assert.ok(aviso, "debería faltar el destino");
  assert.match(aviso.reason, /Benidorm/);
});

prueba("y llega al nombre de la oportunidad, para reconocerla en el CRM", () => {
  const info = extractClientInfo(CORREO_DESTINO_NO_OPERADO);
  assert.equal(info.opportunityName, "Viaje fin de curso Benidorm 2027");
});

// ── El contacto ───────────────────────────────────────────────────────────────

console.log("\nQuién escribe");

prueba("«Soy María López» se lee", () => {
  const info = extractClientInfo(CORREO_DEMO);
  assert.equal(info.firstName, "María");
  assert.equal(info.lastName, "López");
  assert.equal(info.email, "mlopez@iesramonycajal.es");
});

prueba("una firma normal, pegada al correo, también", () => {
  const info = extractClientInfo(CORREO_SIN_ESTRUCTURA);
  assert.equal(info.firstName, "Jose");
  assert.equal(info.lastName, "Antonio Ruiz");
});

prueba("el nombre en la línea de encima del correo", () => {
  const info = extractClientInfo("Hola.\nQueremos ir a Salou.\nLuis Peña\nlpena@carmen.es");
  assert.equal(info.firstName, "Luis");
  assert.equal(info.lastName, "Peña");
});

prueba("«Gracias» no es el nombre de nadie", () => {
  const info = extractClientInfo("Queremos ir a Salou.\nGracias\ninfo@colegio.es");
  assert.equal(info.firstName, "");
  assert.equal(info.lastName, "");
});

// ── El texto que se guarda ────────────────────────────────────────────────────

console.log("\nEl texto que se guarda y que luego lee una persona");

prueba("la firma no acaba dentro de los requisitos", () => {
  const { normalized } = readTripMessage(CORREO_SIN_ANIO, HOY);
  assert.ok(
    !normalized.requirementsText.includes("lpena@carmen"),
    `la firma se coló: «${normalized.requirementsText}»`,
  );
});

prueba("una dirección de correo no se parte por su punto", () => {
  const { normalized } = readTripMessage(CORREO_SIN_ESTRUCTURA, HOY);
  assert.ok(
    !normalized.requirementsText.includes(". es"),
    `se partió una dirección: «${normalized.requirementsText}»`,
  );
});

prueba("las condiciones especiales se detectan", () => {
  const extras = extractRequestExtras(CORREO_SIN_ESTRUCTURA);
  assert.deepEqual(extras.specialRequirements, [
    "Alergias / dietas especiales",
    "Habitación adaptada / accesibilidad",
  ]);
});

prueba("el presupuesto por alumno se detecta", () => {
  const extras = extractRequestExtras(CORREO_DEMO);
  assert.equal(extras.budgetPerStudent, 350);
});

// ── El estado final ───────────────────────────────────────────────────────────

console.log("\nEl veredicto de cada correo");

prueba("el correo de la demo está listo para buscar", () => {
  assert.equal(readTripMessage(CORREO_DEMO, HOY).requestStatus, "READY_FOR_SEARCH");
});

prueba("uno escrito a la carrera también, ahora", () => {
  assert.equal(readTripMessage(CORREO_SIN_ESTRUCTURA, HOY).requestStatus, "READY_FOR_SEARCH");
});

prueba("uno sin año también", () => {
  assert.equal(readTripMessage(CORREO_SIN_ANIO, HOY).requestStatus, "READY_FOR_SEARCH");
});

prueba("uno en inglés también", () => {
  assert.equal(readTripMessage(CORREO_INGLES, HOY).requestStatus, "READY_FOR_SEARCH");
});

prueba("uno a un destino que no operamos, no: hace falta decidir", () => {
  assert.equal(readTripMessage(CORREO_DESTINO_NO_OPERADO, HOY).requestStatus, "PARSED_WITH_GAPS");
});

// ── Lo que sigue sin entenderse ───────────────────────────────────────────────
//
// Se deja escrito porque es el argumento para leer el mensaje con IA, igual que
// se hizo con los documentos de proveedor. Ninguna expresión regular va a
// resolver esto:
//
//   «la semana del 4 de junio, volvemos el 8»   → fechas
//   «somos 4º de la ESO»                        → edad (hay que saber que son 15)
//   «la última semana de mayo»                  → fechas
//
// Cuando se entienda el mensaje con IA, estas pruebas siguen valiendo: lo
// heurístico se queda como relleno instantáneo y como red si la IA falla.

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
