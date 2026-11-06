/**
 * Las «Notas» de una propuesta (reunión con Oravia, 05/11/2026).
 *
 * Cómo correrla:  npm run test:notas
 */
import assert from "node:assert/strict";

import { MAX_NOTAS, limpiarNotas, notasGuardadas } from "../src/domain/notasDeLaPropuesta";

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

console.log("\nLimpiar lo que se escribe");

prueba("quita los espacios de las puntas y los retornos de Windows", () => {
  assert.equal(limpiarNotas("  Pago a 30 días \r\nHorario: 9:00  \r\n"), "Pago a 30 días\nHorario: 9:00");
});

prueba("deja como mucho una línea en blanco entre párrafos", () => {
  assert.equal(limpiarNotas("A\n\n\n\n\nB"), "A\n\nB");
});

prueba("lo que no es texto, o está vacío, son unas notas vacías", () => {
  for (const malo of [null, undefined, 42, {}, [], "", "   \n  "]) assert.equal(limpiarNotas(malo), "");
});

prueba("se corta en el máximo, sin dejar un espacio al final", () => {
  const larga = limpiarNotas("a ".repeat(MAX_NOTAS));
  assert.ok(larga.length <= MAX_NOTAS);
  assert.equal(larga, larga.trim());
});

console.log("\nLeerlas de lo que guarda la propuesta");

prueba("salen de `stayJson`, donde viajan con el resto del estado del lienzo", () => {
  assert.equal(notasGuardadas(JSON.stringify({ canal: "GENERIC", notas: "Pago a 30 días" })), "Pago a 30 días");
});

prueba("una propuesta de antes, sin notas, o con un JSON roto, no da error: notas vacías", () => {
  assert.equal(notasGuardadas(null), "");
  assert.equal(notasGuardadas(undefined), "");
  assert.equal(notasGuardadas("no es json"), "");
  assert.equal(notasGuardadas(JSON.stringify({ composicion: {} })), "");
  assert.equal(notasGuardadas(JSON.stringify(null)), "");
});

prueba("lo que hay en `stayJson` se vuelve a limpiar al leerlo", () => {
  assert.equal(notasGuardadas(JSON.stringify({ notas: "  A\r\n\r\n\r\n\r\nB  " })), "A\n\nB");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
