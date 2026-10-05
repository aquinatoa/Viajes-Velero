/**
 * Qué hace la app cuando le contestan otra cosa.
 *
 * El caso está sacado de la pantalla, literal. A «¿A qué destino quieren ir?»
 * se contestó «Seríamos 48 alumnos de entre 15 y 17 años. Nos interesa un
 * hotel de 3 estrellas en pensión completa.» y la app guardó esa frase entera
 * COMO DESTINO, dio la pregunta por contestada, y después volvió a preguntar
 * cuántos alumnos eran —que estaban ahí escritos—.
 *
 * Las dos pruebas que gobiernan el fichero son ésas: no tragarse una frase
 * como si fuera un dato, y aprovechar todo lo que venga aunque no conteste.
 *
 * Cómo correrla:  npm run test:respuestas
 * No necesita base de datos: es una función pura.
 */
import assert from "node:assert/strict";

import { interpretarRespuesta, numeroDe, pareceUnLugar } from "../src/domain/interpretarRespuesta";
import { siguientePregunta } from "../src/domain/loQueFalta";

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

/** La pregunta del destino, tal y como la genera el motor del chat. */
const DESTINO = siguientePregunta({ destinationText: "", dateFrom: "2027-05-12", dateTo: "2027-05-16", participants: 48 })!;
const ALUMNOS = siguientePregunta({ destinationText: "Salou", dateFrom: "2027-05-12", dateTo: "2027-05-16" })!;
const TOPE = siguientePregunta(
  { destinationText: "Salou", dateFrom: "2027-05-12", dateTo: "2027-05-16", participants: 48, regimeRequested: "PC" },
  ["regimeRequested"],
)!;

console.log("\nEl caso de la pantalla");

const FRASE = "Seríamos 48 alumnos de entre 15 y 17 años. Nos interesa un hotel de 3 estrellas en pensión completa.";
// Lo que los lectores de siempre sacan de esa frase. Comprobado contra ellos.
const LEIDO_DE_LA_FRASE = {
  destinationText: "",
  participants: 48,
  ageRangeText: "15-17",
  regimeRequested: "pensión completa",
  categoryRequested: "3*",
};

prueba("una frase NO se guarda como destino", () => {
  const r = interpretarRespuesta(DESTINO, FRASE, LEIDO_DE_LA_FRASE);
  assert.equal(r.contesta, false);
  assert.equal(r.aplicar.destinationText, undefined);
});

prueba("pero se aprovecha todo lo que traía", () => {
  // Volver a preguntar los alumnos cuando están escritos es lo que hace
  // abandonar una conversación.
  const r = interpretarRespuesta(DESTINO, FRASE, LEIDO_DE_LA_FRASE);
  assert.equal(r.aplicar.participants, 48);
  assert.equal(r.aplicar.regimeRequested, "pensión completa");
  assert.equal(r.aplicar.categoryRequested, "3*");
  assert.equal(r.aplicar.ageRangeText, "15-17");
});

prueba("y la app lo dice, y vuelve a preguntar", () => {
  const r = interpretarRespuesta(DESTINO, FRASE, LEIDO_DE_LA_FRASE);
  assert.match(String(r.dice), /Apunto/);
  assert.match(String(r.dice), /48 alumnos/);
  assert.match(String(r.dice), /sigo necesitando/i);
  assert.match(String(r.dice), /destino/i);
});

console.log("\nCuando sí contesta");

prueba("«Salou» a secas", () => {
  const r = interpretarRespuesta(DESTINO, "Salou", { destinationText: "Salou" });
  assert.equal(r.contesta, true);
  assert.equal(r.aplicar.destinationText, "Salou");
  assert.equal(r.dice, null);
});

prueba("un pueblo que los lectores no conocen, si parece un nombre", () => {
  const r = interpretarRespuesta(DESTINO, "Vilanova i la Geltrú", { destinationText: "" });
  assert.equal(r.contesta, true);
  assert.equal(r.aplicar.destinationText, "Vilanova i la Geltrú");
});

prueba("contestar de más también se reconoce", () => {
  const r = interpretarRespuesta(DESTINO, "A Salou, y seríamos 48", {
    destinationText: "Salou",
    participants: 48,
  });
  assert.equal(r.contesta, true);
  assert.equal(r.aplicar.participants, 48);
  assert.match(String(r.dice), /Apunto también/);
  assert.match(String(r.dice), /48 alumnos/);
});

prueba("un número pelado vale donde se pide un número", () => {
  // Los lectores no sacan nada de «48» suelto: hace falta el respaldo literal.
  const r = interpretarRespuesta(ALUMNOS, "48", {});
  assert.equal(r.contesta, true);
  assert.equal(r.aplicar.participants, 48);
});

prueba("«unos 48 alumnos» también", () => {
  assert.equal(interpretarRespuesta(ALUMNOS, "unos 48 alumnos", { participants: 48 }).aplicar.participants, 48);
  assert.equal(numeroDe("unos 48 alumnos"), 48);
});

prueba("el tope escrito con euros", () => {
  const r = interpretarRespuesta(TOPE, "unos 300 € por alumno", {});
  assert.equal(r.contesta, true);
  assert.equal(r.aplicar.topePorAlumno, 300);
});

console.log("\nLo que NO puede colarse como dato");

prueba("«ni idea» no es un pueblo", () => {
  // Guardaría un destino llamado «ni idea» y la búsqueda no encontraría nada,
  // sin decir por qué.
  const r = interpretarRespuesta(DESTINO, "ni idea", { destinationText: "" });
  assert.equal(r.contesta, false);
  assert.equal(r.aplicar.destinationText, undefined);
});

prueba("«todavía no lo sabemos» tampoco", () => {
  assert.equal(interpretarRespuesta(DESTINO, "todavía no lo sabemos", {}).contesta, false);
});

prueba("ni una frase larga, aunque no tenga cifras", () => {
  assert.equal(pareceUnLugar("Nos gustaría algo de playa cerca de Tarragona"), false);
  assert.equal(pareceUnLugar("Salou"), true);
  assert.equal(pareceUnLugar("Vilanova i la Geltrú"), true);
});

prueba("nada con cifras se toma por un pueblo", () => {
  assert.equal(pareceUnLugar("48 alumnos"), false);
});

console.log("\nLa insistencia");

prueba("en lo que bloquea, se dice por qué no se puede seguir", () => {
  const r = interpretarRespuesta(DESTINO, "ya te diré", {});
  assert.match(String(r.dice), /para poder buscar/i);
  assert.match(String(r.dice), /¿A qué destino quieren ir\?/);
});

prueba("en lo que no bloquea, se pide concretar sin dramatizar", () => {
  const r = interpretarRespuesta(TOPE, "lo que sea razonable", {});
  assert.equal(r.contesta, false);
  assert.match(String(r.dice), /concretar/i);
  assert.ok(!/sigo necesitando/i.test(String(r.dice)), "no debe sonar a bloqueo");
});

prueba("las fechas se dicen juntas, no una por una", () => {
  const r = interpretarRespuesta(DESTINO, "del 12 al 16 de mayo de 2027", {
    dateFrom: "2027-05-12",
    dateTo: "2027-05-16",
  });
  assert.match(String(r.dice), /las fechas: 2027-05-12 → 2027-05-16/);
  assert.ok(!/la salida/.test(String(r.dice)), "«la llegada y la salida» suena a robot");
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
