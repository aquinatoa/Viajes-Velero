/**
 * Las peticiones de Deportivo, que llegan en inglés o alemán (Ricard,
 * 27/10/2026): de «got a new request from FC Sins in MSH … 21 pax …
 * 17.-21. February» la app solo entendía las plazas, y hubo que escribir
 * fechas, destino, centro y acompañantes a mano.
 *
 * Cómo correrla:  npm run test:deportiva
 */
import assert from "node:assert/strict";

import { leerRango } from "../src/domain/fechas";
import { extractCentreName, readTripMessage } from "../src/services/requestService";

let pasadas = 0;
let fallidas = 0;

function prueba(nombre: string, cuerpo: () => void) {
  try {
    cuerpo();
    pasadas += 1;
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallidas += 1;
    console.log(`  FALLA  ${nombre}`);
    console.log(`         ${error instanceof Error ? error.message : String(error)}`);
  }
}

const HOY = new Date("2026-10-27T10:00:00Z");
const FC_SINS = "got a new request from FC Sins in MSH\n\nBungalows\n\n21 pax\n\n17.-21. February\n\nNatural or Artificial";

prueba("FC Sins: Cambrils, del 17 al 21 de febrero de 2027, 21 plazas, en inglés, centro FC Sins", () => {
  const n = readTripMessage(FC_SINS, HOY).normalized;
  assert.equal(n.destinationText, "Cambrils");
  assert.equal(n.dateFrom, "2027-02-17");
  assert.equal(n.dateTo, "2027-02-21");
  assert.equal(n.participants, 21);
  assert.equal(n.language, "Inglés");
  assert.equal(extractCentreName(FC_SINS), "FC Sins");
});

const casos: Array<[string, string, string]> = [
  ["17.-21. February", "2027-02-17", "2027-02-21"],
  ["17-21 February 2027", "2027-02-17", "2027-02-21"],
  ["from 17th to 21st of February, 2027", "2027-02-17", "2027-02-21"],
  ["February 17-21, 2027", "2027-02-17", "2027-02-21"],
  ["Feb 17 to 21", "2027-02-17", "2027-02-21"],
  ["28 February - 3 March 2027", "2027-02-28", "2027-03-03"],
  ["28. Februar bis 3. März 2027", "2027-02-28", "2027-03-03"],
  ["30 Dec - 3 Jan 2027", "2026-12-30", "2027-01-03"],
  ["du 12 au 16 avril 2027", "2027-04-12", "2027-04-16"],
];
for (const [texto, desde, hasta] of casos) {
  prueba(`«${texto}»`, () => {
    assert.deepEqual(leerRango(texto, HOY), { desde, hasta });
  });
}

prueba("lo de los colegios se sigue leyendo igual", () => {
  assert.deepEqual(leerRango("del 12 al 16 de mayo de 2027", HOY), { desde: "2027-05-12", hasta: "2027-05-16" });
  assert.deepEqual(leerRango("mayo de 2027, del 12 al 16", HOY), { desde: "2027-05-12", hasta: "2027-05-16" });
});

prueba("«you may 3 to 5…» no es mayo", () => {
  assert.deepEqual(leerRango("you may 3 to 5 people", HOY), { desde: "", hasta: "" });
});

prueba("jugadores y entrenadores, también escritos «profesores: 2»", () => {
  const n = readTripMessage("we have 4 coaches and 22 players", HOY).normalized;
  assert.equal(n.participants, 22);
  assert.equal(n.teachers, 4);
  assert.equal(readTripMessage("21 jugadores\nprofesores: 2", HOY).normalized.teachers, 2);
});

prueba("MSH solo como palabra entera; el colegio de siempre no cambia", () => {
  assert.equal(readTripMessage("we stay at the Mediterranean Sports Hub", HOY).normalized.destinationText, "Cambrils");
  assert.equal(readTripMessage("viaje a Salou, harmshire", HOY).normalized.destinationText, "Salou");
  assert.equal(extractCentreName("Hola, somos del IES Ramón y Cajal de Madrid"), "IES Ramón y Cajal");
  assert.equal(extractCentreName("la AD Alcorcón"), "AD Alcorcón");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
