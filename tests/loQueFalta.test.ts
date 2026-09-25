/**
 * Qué pregunta el chat de «La petición», y en qué orden.
 *
 * El caso que motiva todo esto es real: en la reunión del 21/09 una petición
 * llegó sin destino, el aviso decía «revisa el destino o las fechas», y se
 * probaron 2026, 2027, octubre y junio antes de caer en que lo que faltaba era
 * el pueblo. Veinte minutos. La prueba que lo cubre es la primera.
 *
 * La otra prueba importante es la de «no lo han dicho»: una respuesta así no
 * puede convertirse en un dato. Si el colegio no dijo el régimen, la petición
 * se queda sin régimen; rellenarla con «pensión completa» porque es lo normal
 * es inventarse lo que pidió un cliente.
 *
 * Cómo correrla:  npm run test:preguntas
 * No necesita base de datos: son funciones puras.
 */
import assert from "node:assert/strict";

import {
  conservarLoContestado,
  loQueFalta,
  loQueSeIgnora,
  sePuedeRecomendar,
  siguientePregunta,
} from "../src/domain/loQueFalta";

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

/** Una petición completa, para ir quitándole cosas. */
const COMPLETA = {
  destinationText: "Salou",
  dateFrom: "2027-05-12",
  dateTo: "2027-05-16",
  participants: 48,
  teachers: 4,
  regimeRequested: "Pensión completa",
  categoryRequested: "3*",
  topePorAlumno: 300,
  requisitos: ["Alergias / dietas especiales"],
};

const claves = (p: Parameters<typeof loQueFalta>[0], ya: string[] = []) =>
  loQueFalta(p, ya).map((h) => h.clave);

console.log("\nLo primero es lo que impide buscar");

prueba("sin destino, la primera pregunta es el destino", () => {
  // El caso del 21/09: faltaba el pueblo y el aviso mandaba a mirar las fechas.
  const h = siguientePregunta({ ...COMPLETA, destinationText: "" });
  assert.equal(h?.clave, "destinationText");
  assert.match(h?.pregunta ?? "", /destino/i);
  assert.equal(h?.bloquea, true);
});

prueba("y el porqué va con la pregunta, no aparte", () => {
  const h = siguientePregunta({ ...COMPLETA, destinationText: "" });
  assert.match(h?.porque ?? "", /no se puede buscar/i);
});

prueba("el orden es destino, llegada, salida, alumnos", () => {
  const p = { destinationText: "", dateFrom: "", dateTo: "", participants: null };
  assert.deepEqual(claves(p).slice(0, 4), ["destinationText", "dateFrom", "dateTo", "participants"]);
});

prueba("una salida anterior a la llegada se vuelve a preguntar", () => {
  // Sin esto el viaje son cero noches y todos los precios salen a cero.
  const h = siguientePregunta({ ...COMPLETA, dateFrom: "2027-05-16", dateTo: "2027-05-12" });
  assert.equal(h?.clave, "dateTo");
  assert.match(h?.pregunta ?? "", /no puede ser anterior/i);
});

prueba("una fecha ilegible cuenta como que falta", () => {
  assert.equal(siguientePregunta({ ...COMPLETA, dateFrom: "el puente de mayo" })?.clave, "dateFrom");
});

console.log("\nCuándo se puede recomendar");

prueba("con destino, fechas y alumnos ya se recomienda", () => {
  const minima = { destinationText: "Salou", dateFrom: "2027-05-12", dateTo: "2027-05-16", participants: 48 };
  assert.equal(sePuedeRecomendar(minima), true);
});

prueba("sin alumnos todavía no: el hotel pide mínimo de plazas", () => {
  assert.equal(sePuedeRecomendar({ ...COMPLETA, participants: null }), false);
});

prueba("una petición completa no pregunta nada", () => {
  assert.deepEqual(loQueFalta(COMPLETA), []);
  assert.equal(siguientePregunta(COMPLETA), null);
});

console.log("\n«No lo han dicho» cierra la pregunta, pero no rellena el dato");

prueba("lo que no bloquea se pregunta UNA vez", () => {
  const p = { ...COMPLETA, regimeRequested: "" };
  assert.deepEqual(claves(p), ["regimeRequested"]);
  // Preguntado y sin respuesta: no se vuelve a preguntar.
  assert.deepEqual(claves(p, ["regimeRequested"]), []);
});

prueba("pero lo que bloquea se pregunta hasta que se conteste", () => {
  // Insistir molesta; no insistir con el destino deja la app sin poder buscar.
  const p = { ...COMPLETA, destinationText: "" };
  assert.deepEqual(claves(p, ["destinationText"]), ["destinationText"]);
});

prueba("haber preguntado no es saberlo: se sigue diciendo que se ignora", () => {
  const p = { ...COMPLETA, regimeRequested: "", topePorAlumno: null };
  const ignora = loQueSeIgnora(p, ["regimeRequested", "topePorAlumno"]);
  assert.ok(ignora.includes("el régimen"));
  assert.ok(ignora.includes("el tope por alumno"));
});

prueba("y cuando se sabe todo, no se ignora nada", () => {
  assert.deepEqual(loQueSeIgnora(COMPLETA), []);
});

console.log("\nLas respuestas que se ofrecen");

prueba("el régimen se elige de una lista, no se escribe", () => {
  const h = siguientePregunta({ ...COMPLETA, regimeRequested: "" });
  assert.equal(h?.tipo, "opciones");
  assert.deepEqual(
    h?.opciones?.map((o) => o.valor),
    ["Pensión completa", "Media pensión", "Alojamiento y desayuno", "Solo alojamiento"],
  );
});

prueba("los requisitos admiten varios a la vez", () => {
  const h = siguientePregunta({ ...COMPLETA, requisitos: [] });
  assert.equal(h?.clave, "requisitos");
  assert.equal(h?.tipo, "varias");
  assert.ok((h?.opciones?.length ?? 0) >= 2);
});

prueba("los requisitos que se preguntan son los que se saben comprobar", () => {
  // Preguntar por algo que despues no se sabe mirar en el texto del hotel solo
  // sirve para llenar la pantalla de «no consta».
  const h = siguientePregunta({ ...COMPLETA, requisitos: [] });
  const valores = h?.opciones?.map((o) => o.valor) ?? [];
  assert.ok(valores.includes("Alergias / dietas especiales"));
  assert.ok(valores.includes("Habitación adaptada / accesibilidad"));
});

prueba("el tope y los alumnos se piden como número, con ejemplo", () => {
  const tope = siguientePregunta({ ...COMPLETA, topePorAlumno: null });
  assert.equal(tope?.tipo, "numero");
  assert.equal(tope?.ejemplo, "300");
});

prueba("cero profesores es una respuesta, no un hueco", () => {
  // `null` es «no se sabe»; `0` es «no va ninguno». Confundirlos hace que la
  // app pregunte para siempre a quien ya contestó.
  assert.deepEqual(claves({ ...COMPLETA, teachers: 0 }), []);
  assert.deepEqual(claves({ ...COMPLETA, teachers: null }), ["teachers"]);
});

prueba("un tope de cero también es una respuesta", () => {
  assert.deepEqual(claves({ ...COMPLETA, topePorAlumno: 0 }), []);
});

console.log("\nUn segundo correo no puede borrar lo ya contestado");

prueba("lo que el mensaje nuevo no dice, no borra", () => {
  // El colegio manda un segundo correo que no repite el destino. Sin esta
  // mezcla la app borraría el «Salou» recién contestado y lo preguntaría otra
  // vez, que es justo el bucle que el chat viene a quitar.
  const leido = { ...COMPLETA, destinationText: "", participants: null };
  const fundido = conservarLoContestado(leido, COMPLETA);
  assert.equal(fundido.destinationText, "Salou");
  assert.equal(fundido.participants, 48);
});

prueba("pero lo que el mensaje nuevo sí dice manda", () => {
  // Si el segundo correo dice que al final son 60 y van a Cambrils, eso gana:
  // es una corrección del cliente, no un hueco.
  const leido = { ...COMPLETA, destinationText: "Cambrils", participants: 60 };
  const fundido = conservarLoContestado(leido, COMPLETA);
  assert.equal(fundido.destinationText, "Cambrils");
  assert.equal(fundido.participants, 60);
});

prueba("sin nada anterior, se queda lo leído", () => {
  assert.deepEqual(conservarLoContestado(COMPLETA, null), COMPLETA);
});

prueba("una lista vacía tampoco borra la que había", () => {
  const fundido = conservarLoContestado({ ...COMPLETA, requisitos: [] }, COMPLETA);
  assert.deepEqual(fundido.requisitos, ["Alergias / dietas especiales"]);
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
