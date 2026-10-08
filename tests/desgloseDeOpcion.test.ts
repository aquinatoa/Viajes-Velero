/**
 * El desglose de una opción, leído del texto en que se guarda, y el precio
 * por persona para toda la estancia que sale de él (el que Javier quería ver
 * en grande en el PDF, 29/09/2026).
 *
 * Cómo correrla:  npm run test:desglose
 */
import assert from "node:assert/strict";

import { desgloseDeLaOpcion, importeDesdeTexto, precioPorEstancia } from "../src/domain/desgloseDeOpcion";

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

// Las opciones reales de ORV-2026-0006, tal como están guardadas.
const PLANAS = "43,13 € x 48 alumnos + 43,13 € x 8 profesores (sin tarifa individual: mismo precio), por noche x 4 noches";
const SANTA_MONICA = "33,39 € x 48 alumnos + 60,11 € x 8 profesores (uso individual), por noche x 4 noches";

prueba("los importes se leen con punto de miles y coma decimal", () => {
  assert.equal(importeDesdeTexto("9.661,12 €"), 9661.12);
  assert.equal(importeDesdeTexto("43,13 €"), 43.13);
  assert.equal(importeDesdeTexto(""), null);
  assert.equal(importeDesdeTexto(null), null);
});

prueba("alumnos y profesores al mismo precio", () => {
  assert.deepEqual(desgloseDeLaOpcion(PLANAS, "9.661,12 €"), {
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
});

prueba("sin profesores, y un texto que no es nuestro no se adivina", () => {
  assert.equal(desgloseDeLaOpcion("43,13 € x 48 alumnos, por noche x 4 noches", "8.280,96 €")?.profesores, null);
  assert.equal(desgloseDeLaOpcion("precio total 9.000 €", "9.000 €"), null);
  assert.equal(desgloseDeLaOpcion(null, null), null);
});

prueba("el precio por estancia es por noche × noches, por alumno y por profesor", () => {
  assert.deepEqual(precioPorEstancia(desgloseDeLaOpcion(PLANAS, "9.661,12 €")!), { alumno: 172.52, profesor: 172.52 });
  assert.deepEqual(precioPorEstancia(desgloseDeLaOpcion(SANTA_MONICA, "8.334,40 €")!), { alumno: 133.56, profesor: 240.44 });
  assert.deepEqual(precioPorEstancia(desgloseDeLaOpcion("43,13 € x 48 alumnos, por noche x 4 noches", "1 €")!), { alumno: 172.52, profesor: null });
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
