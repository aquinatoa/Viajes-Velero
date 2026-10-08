/**
 * El rango de fechas de Viajes: por defecto el año que viene (Javier: «del
 * 01-01-2027 a 31-12-2027»), editable, y el calendario abre donde hay viajes.
 *
 * Cómo correrla:  npm run test:rango
 */
import assert from "node:assert/strict";

import { etiquetaDeRango, mesInicialDelCalendario, rangoPorDefecto, rangoValido } from "../src/domain/rangoDeViajes";

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

const HOY = new Date(2026, 9, 8); // 08/10/2026

prueba("por defecto, el año que viene entero (lo que pidió Javier en 2026)", () => {
  assert.deepEqual(rangoPorDefecto(HOY), { desde: "2027-01-01", hasta: "2027-12-31" });
});

prueba("un rango válido: fechas reales y en orden", () => {
  assert.equal(rangoValido({ desde: "2027-01-01", hasta: "2027-12-31" }), true);
  assert.equal(rangoValido({ desde: "2027-06-01", hasta: "2027-06-01" }), true);
});

prueba("no valen: al revés, fechas que no existen, formato raro o vacío", () => {
  assert.equal(rangoValido({ desde: "2027-12-31", hasta: "2027-01-01" }), false);
  assert.equal(rangoValido({ desde: "2027-02-30", hasta: "2027-03-01" }), false);
  assert.equal(rangoValido({ desde: "01/01/2027", hasta: "2027-12-31" }), false);
  assert.equal(rangoValido({ desde: "", hasta: "" }), false);
  assert.equal(rangoValido(null), false);
});

prueba("la etiqueta dice «todo 2027» si es el año entero y las dos fechas si no", () => {
  assert.equal(etiquetaDeRango({ desde: "2027-01-01", hasta: "2027-12-31" }), "todo 2027");
  assert.equal(etiquetaDeRango({ desde: "2027-03-01", hasta: "2027-06-30" }), "del 1 mar 2027 al 30 jun 2027");
});

prueba("el calendario abre en el primer mes del rango si hoy cae fuera", () => {
  const m = mesInicialDelCalendario({ desde: "2027-01-01", hasta: "2027-12-31" }, HOY);
  assert.deepEqual([m.getFullYear(), m.getMonth()], [2027, 0]);
});

prueba("y en el mes de hoy si hoy cae dentro", () => {
  const m = mesInicialDelCalendario({ desde: "2026-09-01", hasta: "2027-08-31" }, HOY);
  assert.deepEqual([m.getFullYear(), m.getMonth()], [2026, 9]);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
