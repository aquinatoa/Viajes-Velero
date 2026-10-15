/**
 * Los periodos de una tarifa de actividad: varios al año, como los hoteles
 * (Ruth y Javier, reunión del 08/10/2026, el Tuna Tour de Balfegó).
 *
 * Cómo correrla:  npm run test:periodos
 */
import assert from "node:assert/strict";

import { leerPeriodos, textoDelPeriodo, valeParaElViaje } from "../src/domain/periodosDeActividad";

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

console.log("Leer la columna «Temporada / Validez»");

prueba("un rango con fechas completas (3 filas de la plantilla v2)", () => {
  assert.deepEqual(leerPeriodos("Del 01/05/2027 al 31/10/2027", 2027), [{ desde: "2027-05-01", hasta: "2027-10-31" }]);
});

prueba("dos rangos en la misma celda son dos periodos", () => {
  assert.deepEqual(leerPeriodos("01/04/2027 - 05/06/2027; 01/09/2027 - 15/10/2027", 2027), [
    { desde: "2027-04-01", hasta: "2027-06-05" },
    { desde: "2027-09-01", hasta: "2027-10-15" },
  ]);
});

prueba("«2027 (excepto julio y agosto)» son dos periodos (21 filas de la plantilla v2)", () => {
  assert.deepEqual(leerPeriodos("2027 (excepto julio y agosto)", 2027), [
    { desde: "2027-01-01", hasta: "2027-06-30" },
    { desde: "2027-09-01", hasta: "2027-12-31" },
  ]);
});

prueba("«excepto agosto» es uno a cada lado; un mes en un extremo deja uno solo", () => {
  assert.equal(leerPeriodos("2027 excepto agosto", 2027).length, 2);
  assert.deepEqual(leerPeriodos("Todo 2027 excepto diciembre", 2027), [{ desde: "2027-01-01", hasta: "2027-11-30" }]);
});

prueba("lo que no es una fecha no se adivina: todo el año", () => {
  for (const texto of [
    "Temporada 2027 · sujeto a disponibilidad y a posibles cambios de licencias y concesiones",
    "Curso escolar 2026-2027",
    "Tarifa solicitada para 2027 (pendiente de confirmar)",
    "de septiembre a mediados de octubre",
    "2027",
    "",
    null,
  ]) {
    assert.deepEqual(leerPeriodos(texto, 2027), [], String(texto));
  }
});

prueba("una fecha imposible o al revés no se cuela", () => {
  assert.deepEqual(leerPeriodos("Del 31/02/2027 al 31/10/2027", 2027), []);
  assert.deepEqual(leerPeriodos("Del 31/10/2027 al 01/05/2027", 2027), []);
});

console.log("¿Vale para el viaje?");

const educa1 = { dateFrom: "2027-04-01", dateTo: "2027-06-05" };
const educa2 = { dateFrom: "2027-09-01", dateTo: "2027-10-15" };
const experience = { dateFrom: "2027-06-06", dateTo: "2027-08-31" };

prueba("el Tuna Tour Educa vale en mayo y en octubre, no en julio", () => {
  assert.equal(valeParaElViaje(educa1, "2027-05-10", "2027-05-14"), true);
  assert.equal(valeParaElViaje(educa2, "2027-10-04", "2027-10-08"), true);
  assert.equal(valeParaElViaje(educa1, "2027-07-05", "2027-07-09"), false);
  assert.equal(valeParaElViaje(educa2, "2027-07-05", "2027-07-09"), false);
  assert.equal(valeParaElViaje(experience, "2027-07-05", "2027-07-09"), true);
});

prueba("basta con que un día del viaje caiga dentro (5 a 10 de junio)", () => {
  assert.equal(valeParaElViaje(educa1, "2027-06-05", "2027-06-10"), true);
  assert.equal(valeParaElViaje(experience, "2027-06-05", "2027-06-10"), true);
});

prueba("sin fechas en la tarifa o en el viaje, vale: no se descarta lo que no se sabe", () => {
  assert.equal(valeParaElViaje({}, "2027-07-05", "2027-07-09"), true);
  assert.equal(valeParaElViaje(educa1, null, null), true);
  assert.equal(valeParaElViaje({ dateFrom: new Date("2027-04-01T00:00:00Z"), dateTo: new Date("2027-06-05T00:00:00Z") }, "2027-05-01", null), true);
});

console.log("En palabras");

prueba("el periodo se dice corto", () => {
  assert.equal(textoDelPeriodo("2027-04-01", "2027-06-05"), "del 1 abr al 5 jun 2027");
  assert.equal(textoDelPeriodo("2026-09-01", "2027-06-30"), "del 1 sep 2026 al 30 jun 2027");
  assert.equal(textoDelPeriodo(null, null), "todo el año");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
