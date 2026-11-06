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
import {
  completarDatosDeContacto,
  extractCentreName,
  parecenSoloNombreYApellidos,
  readTripMessage,
  sugerirDepartamento,
} from "../src/services/requestService";

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

// Reunión con Oravia, 05/11/2026: «el extractor del chat no recoge el contacto
// ni el email si no vienen en el primer mensaje». El chat solo leía el destino,
// las fechas y los alumnos de lo que se contestaba.
console.log("\nContacto en un mensaje posterior al primero");

const VACIO = { email: "", firstName: "", lastName: "", centreName: "", opportunityName: "" };

prueba("el correo y el nombre del segundo mensaje rellenan los huecos", () => {
  const r = completarDatosDeContacto(VACIO, "Perdón, se me olvidó:\nLuis Peña, lpena@carmen.es");
  assert.equal(r.email, "lpena@carmen.es");
  assert.equal(r.firstName, "Luis");
  assert.equal(r.lastName, "Peña");
});

prueba("lo que ya había (escrito a mano o leído antes) no se pisa", () => {
  const actual = { ...VACIO, email: "ruth@oravia.com", firstName: "Ruth", lastName: "García" };
  const r = completarDatosDeContacto(actual, "Luis Peña, lpena@carmen.es");
  assert.equal(r, actual, "sin cambios devuelve el mismo objeto");
});

prueba("un nombre tecleado a medias no se mezcla con el apellido de otra persona", () => {
  const r = completarDatosDeContacto({ ...VACIO, firstName: "Ruth" }, "Luis Peña, lpena@carmen.es");
  assert.equal(r.firstName, "Ruth");
  assert.equal(r.lastName, "");
  assert.equal(r.email, "lpena@carmen.es");
});

prueba("una respuesta corta no inventa nada ni cambia el nombre de la oportunidad", () => {
  for (const respuesta of ["Salou", "del 12 al 16 de mayo", "48 alumnos y 4 profesores"]) {
    const r = completarDatosDeContacto(VACIO, respuesta);
    assert.equal(r, VACIO, respuesta);
  }
});

prueba("si trae el centro, la oportunidad lo sigue; sin centro no se toca", () => {
  const conCentro = completarDatosDeContacto(VACIO, "Somos del IES Ramón y Cajal, para 2027. rcajal@ies.es");
  assert.equal(conCentro.centreName, "IES Ramón y Cajal");
  assert.equal(conCentro.opportunityName, "IES RAMÓN Y CAJAL 2027");
  const sinCentro = completarDatosDeContacto(VACIO, "mi correo es ana@colegio.es");
  assert.equal(sinCentro.email, "ana@colegio.es");
  assert.equal(sinCentro.opportunityName, "");
});

// El caso real de Anthony, 05/11/2026: contestó a «¿Cuántos profesores van?» con
// «correo» y «nombre» en dos respuestas, y el nombre no llegó a ninguna parte.
prueba("el nombre en la línea de debajo del correo se reconoce", () => {
  const r = completarDatosDeContacto(VACIO, "anthonyquinatoa@gmail.com\nAnthony Quinatoa");
  assert.equal(r.email, "anthonyquinatoa@gmail.com");
  assert.equal(r.firstName, "Anthony");
  assert.equal(r.lastName, "Quinatoa");
});

prueba("un nombre suelto es el contacto SOLO si la respuesta no ha servido para nada más", () => {
  const conCorreo = { ...VACIO, email: "anthonyquinatoa@gmail.com" };
  const r = completarDatosDeContacto(conCorreo, "Anthony Quinatoa", { nombreSuelto: true });
  assert.equal(r.firstName, "Anthony");
  assert.equal(r.lastName, "Quinatoa");
  assert.equal(completarDatosDeContacto(conCorreo, "Anthony Quinatoa"), conCorreo, "sin la señal no se arriesga");
  assert.equal(completarDatosDeContacto(VACIO, "Anthony Quinatoa", { nombreSuelto: true }), VACIO, "sin correo tampoco");
});

prueba("un sitio o una frase no son una persona", () => {
  for (const texto of ["La Pineda", "Salou", "Costa Daurada", "ni idea", "48 alumnos", "Gracias, un saludo"]) {
    assert.equal(parecenSoloNombreYApellidos(texto), false, texto);
  }
  for (const texto of ["Anthony Quinatoa", "Marta de la Fuente", "Luis Peña"]) {
    assert.equal(parecenSoloNombreYApellidos(texto), true, texto);
  }
});

console.log("\nDepartamento deducido del mensaje");

prueba("el correo del club suizo es de Turismo Deportivo", () => {
  const s = sugerirDepartamento(
    "Dear Pablo,\n\ngot a new request from FC Weinfelden-Bürglen\n\n12.03.-16.03.2027\n\n24 pax\n\nNatural Grass\n\nBungalows\n\nMSH: Mediterranean Sports Hub",
  );
  assert.equal(s?.departamento, "SPORTS");
});

prueba("el colegio de siempre es de Grupos", () => {
  const s = sugerirDepartamento(
    "Hola, somos del IES Ramón y Cajal y queremos el viaje de fin de curso para 48 alumnos y 4 profesores.",
  );
  assert.equal(s?.departamento, "GROUPS");
});

prueba("con señales mezcladas, escasas o ninguna, no decide por nadie", () => {
  assert.equal(sugerirDepartamento("Queremos un viaje a Salou en mayo."), null);
  assert.equal(sugerirDepartamento("el fc de la esquina"), null);
  assert.equal(sugerirDepartamento("Colegio con 24 pax, torneo de fútbol y alumnos"), null);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
