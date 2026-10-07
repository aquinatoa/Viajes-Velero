/**
 * Lo contratado, en la tabla del trato: de la opción elegida a las filas de
 * «Servicios Contratados».
 *
 * El desglose de la opción está guardado como texto con un formato nuestro;
 * aquí se comprueba que se lee entero y que las filas salen como las teclean
 * ellos a mano (LA SALLE DONOSTIA 2027: alumnos en múltiple, profesores en
 * doble/individual, precio por persona y noche, noches en Cantidad).
 *
 * Cómo correrla:  npm run test:contratado
 * No toca Zoho ni la base de datos: son funciones puras.
 */
import assert from "node:assert/strict";

import {
  desgloseDeLaOpcion,
  elegirProveedor,
  filasDeLaOpcion,
  importeDesdeTexto,
  nombreCortoDelHotel,
  palabrasClave,
  regimenEnCrm,
} from "../server/serviciosContratados";

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

// Las tres opciones reales de ORV-2026-0006 (IES JAUME BALMES 2027), tal
// como están guardadas.
const PLANAS = "43,13 € x 48 alumnos + 43,13 € x 8 profesores (sin tarifa individual: mismo precio), por noche x 4 noches";
const SANTA_MONICA = "33,39 € x 48 alumnos + 60,11 € x 8 profesores (uso individual), por noche x 4 noches";
const SIESTA = "57,51 € x 48 alumnos + 57,51 € x 8 profesores (sin tarifa individual: mismo precio), por noche x 4 noches";

console.log("Importes y régimen");

prueba("los importes se leen con punto de miles y coma decimal", () => {
  assert.equal(importeDesdeTexto("9.661,12 €"), 9661.12);
  assert.equal(importeDesdeTexto("43,13 €"), 43.13);
  assert.equal(importeDesdeTexto("12.882,24 €"), 12882.24);
  assert.equal(importeDesdeTexto(""), null);
  assert.equal(importeDesdeTexto(null), null);
});

prueba("el régimen de la app se traduce a la lista del CRM", () => {
  assert.equal(regimenEnCrm("PC"), "Pensión Completa");
  assert.equal(regimenEnCrm("Pensión completa"), "Pensión Completa");
  assert.equal(regimenEnCrm("MP"), "Media Pensión");
  assert.equal(regimenEnCrm("AD"), "Alojamiento y Desayuno");
  assert.equal(regimenEnCrm("SA"), "Solo Alojamiento");
  assert.equal(regimenEnCrm(""), null);
  assert.equal(regimenEnCrm("lo que sea"), null);
});

console.log("El hotel, como lo nombran ellos");

prueba("el nombre corto quita estrellas, paréntesis y lo que sigue al guion largo", () => {
  assert.equal(nombreCortoDelHotel("Hotel Planas 3* (Salou)"), "Hotel Planas");
  assert.equal(nombreCortoDelHotel("Camping La Siesta 3* (Salou)"), "Camping La Siesta");
  assert.equal(nombreCortoDelHotel("Hotel Santa Mónica Playa 3* (Salou)"), "Hotel Santa Mónica Playa");
  assert.equal(nombreCortoDelHotel("4R Hotels 3* – Salou & Calafell (Salou Park Resort II / Playa Park)"), "4R Hotels");
  assert.equal(nombreCortoDelHotel(null), "");
});

prueba("las palabras clave dejan fuera «hotel», «camping» y artículos", () => {
  assert.deepEqual(palabrasClave("Hotel Planas"), ["planas"]);
  assert.deepEqual(palabrasClave("Camping La Siesta"), ["siesta"]);
  assert.deepEqual(palabrasClave("Hotel Santa Mónica Playa"), ["santa", "monica", "playa"]);
  assert.deepEqual(palabrasClave("4R Hotels"), ["4r"]);
});

prueba("el proveedor se elige solo cuando hay uno claro", () => {
  const c = (...nombres: string[]) => nombres.map((n, i) => ({ id: String(i), nombre: n }));
  assert.equal(elegirProveedor("Hotel Planas", c("HOTEL PLANAS"))?.nombre, "HOTEL PLANAS");
  assert.equal(elegirProveedor("Camping La Siesta", c("CAMPING LA SIESTA", "LA SIESTA BEACH CLUB"))?.nombre, "CAMPING LA SIESTA");
  assert.equal(elegirProveedor("Hotel Santa Mónica Playa", c("HOTEL SANTA MONICA PLAYA", "SANTA MONICA RESORT"))?.nombre, "HOTEL SANTA MONICA PLAYA");
  // Varios 4R: ninguno claro.
  assert.equal(elegirProveedor("4R Hotels", c("HOTEL 4R PLAYA PARK", "4R SALOU PARK RESORT I", "4* 4R HOTEL ROULETTE")), null);
  assert.equal(elegirProveedor("Hotel Planas", []), null);
});

console.log("El desglose");

prueba("alumnos y profesores al mismo precio (sin tarifa individual)", () => {
  const d = desgloseDeLaOpcion(PLANAS, "9.661,12 €");
  assert.deepEqual(d, {
    alumnos: { pax: 48, precio: 43.13 },
    profesores: { pax: 8, precio: 43.13, individual: false },
    noches: 4,
    total: 9661.12,
  });
});

prueba("profesores en individual, a su precio", () => {
  const d = desgloseDeLaOpcion(SANTA_MONICA, "8.334,40 €");
  assert.equal(d?.profesores?.precio, 60.11);
  assert.equal(d?.profesores?.individual, true);
  assert.equal(d?.total, 8334.4);
});

prueba("sin profesores", () => {
  const d = desgloseDeLaOpcion("43,13 € x 48 alumnos, por noche x 4 noches", "8.280,96 €");
  assert.equal(d?.profesores, null);
  assert.equal(d?.alumnos.pax, 48);
});

prueba("un texto que no es nuestro no se adivina: null", () => {
  assert.equal(desgloseDeLaOpcion("precio total 9.000 €", "9.000 €"), null);
  assert.equal(desgloseDeLaOpcion(null, null), null);
});

console.log("Las filas");

const opcion = (priceBreakdownText: string, totalPvpText: string, boardType = "PC") => ({
  accommodationNameSnapshot: "Camping La Siesta 3* (Salou)",
  boardType,
  dateFrom: new Date("2027-05-12T00:00:00Z"),
  dateTo: new Date("2027-05-16T00:00:00Z"),
  priceBreakdownText,
  totalPvpText,
});

prueba("dos filas: alumnos en múltiple y profesores en múltiple (mismo precio)", () => {
  const r = filasDeLaOpcion(opcion(SIESTA, "12.882,24 €"));
  assert.ok(r);
  assert.equal(r.total, 12882.24);
  assert.deepEqual(
    r.filas.map((f) => [f.comentario, f.pax, f.precio, f.noches, f.producto, f.proveedor, f.regimen, f.fechaEntrada, f.fechaSalida]),
    [
      ["ALUMNOS EN MÚLTIPLE - PC", 48, 57.51, 4, "Habitación Múltiple - Camping La Siesta - PC", "Camping La Siesta", "Pensión Completa", "2027-05-12", "2027-05-16"],
      ["PROFESORES EN MÚLTIPLE - PC", 8, 57.51, 4, "Habitación Múltiple - Camping La Siesta - PC", "Camping La Siesta", "Pensión Completa", "2027-05-12", "2027-05-16"],
    ],
  );
});

prueba("profesores con tarifa individual van a «Habitación Individual»", () => {
  const r = filasDeLaOpcion(opcion(SANTA_MONICA, "8.334,40 €"));
  assert.equal(r?.filas[1].comentario, "PROFESORES EN INDIVIDUAL - PC");
  assert.equal(r?.filas[1].producto, "Habitación Individual - Camping La Siesta - PC");
  assert.equal(r?.filas[1].precio, 60.11);
});

prueba("la suma de las filas cuadra con el total de la opción", () => {
  const r = filasDeLaOpcion(opcion(SIESTA, "12.882,24 €"))!;
  const suma = r.filas.reduce((n, f) => n + f.pax * f.precio * f.noches, 0);
  assert.equal(Math.round(suma * 100) / 100, r.total);
});

prueba("sin régimen conocido, el producto no lleva sufijo y el régimen va vacío", () => {
  const r = filasDeLaOpcion(opcion(SIESTA, "12.882,24 €", ""))!;
  assert.equal(r.filas[0].producto, "Habitación Múltiple - Camping La Siesta");
  assert.equal(r.filas[0].regimen, null);
  assert.equal(r.filas[0].comentario, "ALUMNOS EN MÚLTIPLE");
});

prueba("en el producto, el hotel va sin «Hotel» delante, como los suyos", () => {
  const r = filasDeLaOpcion({ ...opcion(PLANAS, "9.661,12 €"), accommodationNameSnapshot: "Hotel Planas 3* (Salou)" })!;
  assert.equal(r.filas[0].producto, "Habitación Múltiple - Planas - PC");
  assert.equal(r.filas[0].proveedor, "Hotel Planas");
});

prueba("sin hotel o sin desglose legible, no hay filas", () => {
  assert.equal(filasDeLaOpcion({ ...opcion(SIESTA, "1 €"), accommodationNameSnapshot: "" }), null);
  assert.equal(filasDeLaOpcion(opcion("lo que sea", "1 €")), null);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
