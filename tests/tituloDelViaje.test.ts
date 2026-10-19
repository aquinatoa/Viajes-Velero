/**
 * El nombre del viaje en el envío (Ruth, 19/10/2026: la propuesta de «AMA
 * GUADALUPEKOA 2027» salió como «2027»).
 *
 * Cómo correrla:  npm run test:titulo
 */
import assert from "node:assert/strict";

import { esNombreVacio, nombreAutomatico, siguientesNombre, tituloDelViaje } from "../src/domain/tituloDelViaje";

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

prueba("el caso de Ruth: nombre «2027» y el grupo en Centro → el título es el grupo", () => {
  assert.equal(
    tituloDelViaje({ opportunityName: "2027", centreName: "AMA GUADALUPEKOA 2027", destinationText: "Salou", dateFrom: "2027-03-23" }),
    "AMA GUADALUPEKOA 2027",
  );
});

prueba("con un nombre de verdad, manda el nombre", () => {
  assert.equal(tituloDelViaje({ opportunityName: "IES JAUME BALMES 2027", centreName: "Otro" }), "IES JAUME BALMES 2027");
});

prueba("sin nombre ni centro, el destino; y si no, «vuestro viaje»", () => {
  assert.equal(tituloDelViaje({ opportunityName: "", destinationText: "Salou" }), "Salou");
  assert.equal(tituloDelViaje({}), "vuestro viaje");
});

prueba("el automático es CENTRO AÑO, sin repetir el año", () => {
  assert.equal(nombreAutomatico("Ies Jaume Balmes", 2027), "IES JAUME BALMES 2027");
  assert.equal(nombreAutomatico("AMA GUADALUPEKOA 2027", 2027), "AMA GUADALUPEKOA 2027");
  assert.equal(nombreAutomatico("", 2027), "2027");
});

prueba("solo un año, o nada, no es un nombre", () => {
  assert.equal(esNombreVacio("2027"), true);
  assert.equal(esNombreVacio("  "), true);
  assert.equal(esNombreVacio("IES X 2027"), false);
});

prueba("al escribir el centro, el nombre lo sigue si era el automático", () => {
  assert.equal(siguientesNombre("2027", "", "AMA GUADALUPEKOA", "2027"), "AMA GUADALUPEKOA 2027");
  assert.equal(siguientesNombre("IES A 2027", "IES A", "IES B", "2027"), "IES B 2027");
});

prueba("si lo escribiste a mano, no se toca", () => {
  assert.equal(siguientesNombre("Viaje de fin de curso", "IES A", "IES B", "2027"), "Viaje de fin de curso");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
