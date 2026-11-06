/**
 * La gratuidad de un hotel, leída de su texto (06/11/2026): «1 gratuidad cada 25
 * de pago (hab. múltiple)», «1 gratuidad en base doble por cada 25 de pago»…
 *
 * Cómo correrla:  npm run test:gratuidad-hotel
 */
import assert from "node:assert/strict";

import { gratuidadDeHotel, profesoresEnGratuidad } from "../src/domain/gratuidadDeHotel";

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

console.log("\nLeer la gratuidad");

prueba("«1 gratuidad cada 25 de pago (hab. múltiple).» es 1 por cada 25, en múltiple", () => {
  const g = gratuidadDeHotel("1 gratuidad cada 25 de pago (hab. múltiple).");
  assert.deepEqual(g, { gratis: 1, cada: 25, texto: "1 gratuidad cada 25 de pago (hab. múltiple)", enHabitacion: "multiple" });
});

prueba("«1 gratuidad en base doble por cada 25 de pago» es 1 por cada 25, en doble", () => {
  const g = gratuidadDeHotel("1 gratuidad en base doble por cada 25 de pago");
  assert.equal(g?.gratis, 1);
  assert.equal(g?.cada, 25);
  assert.equal(g?.enHabitacion, "doble");
});

prueba("«2 gratis por cada 10 alumnos» y «1 profesor gratis por cada 15 alumnos de pago»", () => {
  assert.equal(gratuidadDeHotel("2 gratis por cada 10 alumnos")?.gratis, 2);
  assert.equal(gratuidadDeHotel("2 gratis por cada 10 alumnos")?.cada, 10);
  const p = gratuidadDeHotel("1 profesor gratis por cada 15 alumnos de pago");
  assert.deepEqual([p?.gratis, p?.cada], [1, 15]);
});

prueba("si hay varias frases, lee la que trae la gratuidad", () => {
  const g = gratuidadDeHotel("Niños hasta 3 años gratis. | 1 gratuidad cada 20 de pago");
  assert.deepEqual([g?.gratis, g?.cada], [1, 20]);
});

prueba("lo que no dice «N por cada M» no es una gratuidad que se pueda contar: null", () => {
  assert.equal(gratuidadDeHotel("Gratuidades: consultar"), null);
  assert.equal(gratuidadDeHotel("Profesores gratis"), null);
  assert.equal(gratuidadDeHotel(""), null);
  assert.equal(gratuidadDeHotel(null), null);
  assert.equal(gratuidadDeHotel(undefined), null);
});

console.log("\nCuántos profesores caben");

prueba("con 50 alumnos y 1 por cada 25, caben 2; con 40, 1; con 24, ninguno", () => {
  const g = gratuidadDeHotel("1 gratuidad cada 25 de pago");
  assert.equal(profesoresEnGratuidad(g, 50, 5), 2);
  assert.equal(profesoresEnGratuidad(g, 40, 5), 1);
  assert.equal(profesoresEnGratuidad(g, 24, 5), 0);
});

prueba("no pasa del número de profesores que van, y sin gratuidad o sin grupo es cero", () => {
  const g = gratuidadDeHotel("2 gratis por cada 10 alumnos");
  assert.equal(profesoresEnGratuidad(g, 100, 3), 3, "salen 20 plazas pero solo van 3 profesores");
  assert.equal(profesoresEnGratuidad(null, 100, 3), 0);
  assert.equal(profesoresEnGratuidad(g, 0, 3), 0);
  assert.equal(profesoresEnGratuidad(g, 100, 0), 0);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
