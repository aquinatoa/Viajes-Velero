/**
 * Los colores del embudo, los mismos que Oravia ve en su CRM.
 *
 * «Por dónde va» se pintaba con nuestro azul para todo, y en Zoho cada fase
 * tiene el suyo: «Presupuesto Enviado» azul petróleo, «Pendiente de deposito»
 * naranja, «Oportunidad Ganada» verde. Dos pantallas que dicen lo mismo con
 * colores distintos obligan a traducir cada vez.
 *
 * Lo que se comprueba aquí es lo que hace que un color se pierda sin que nadie
 * sepa por qué: una tilde o un espacio de diferencia entre el nombre que guarda
 * la app y el que devuelve Zoho.
 *
 * Cómo correrla:  npm run test:colores
 * No necesita base de datos ni CRM: se le dan las fases a mano.
 */
import assert from "node:assert/strict";

import { clave, indexarColores } from "../server/coloresDelEmbudo";

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

/** El embudo real de Oravia, leído de su CRM el 25/09/2026. */
const EMBUDO = [
  { nombre: "Preparando Presupuesto", color: "#f5c72f" },
  { nombre: "Presupuesto Enviado", color: "#177ba0" },
  { nombre: "Seguimiento al Presupuesto", color: "#168aef" },
  { nombre: "Pendiente de deposito", color: "#f27e22" },
  { nombre: "Oportunidad Ganada", color: "#c4f0b3" },
  { nombre: "Oportunidad Perdida", color: "#eb4d4d" },
];

console.log("\nLos colores de su embudo");

prueba("cada fase se encuentra por su nombre", () => {
  const mapa = indexarColores(EMBUDO);
  assert.equal(mapa[clave("Presupuesto Enviado")], "#177ba0");
  assert.equal(mapa[clave("Pendiente de deposito")], "#f27e22");
  assert.equal(mapa[clave("Oportunidad Ganada")], "#c4f0b3");
});

prueba("una tilde de diferencia no pierde el color", () => {
  // Es lo que de verdad rompe esto: el nombre que guarda la app y el que
  // devuelve Zoho difieren en una tilde y la fase se queda sin color sin que
  // nadie sepa por qué.
  const mapa = indexarColores([{ nombre: "Pendiente de depósito", color: "#f27e22" }]);
  assert.equal(mapa[clave("Pendiente de deposito")], "#f27e22");
});

prueba("ni las mayúsculas ni los espacios de más", () => {
  const mapa = indexarColores([{ nombre: "  PRESUPUESTO enviado  ", color: "#177ba0" }]);
  assert.equal(mapa[clave("Presupuesto Enviado")], "#177ba0");
});

console.log("\nLo que no se inventa");

prueba("una fase sin color no entra en el mapa", () => {
  // Devolver un color «parecido» sería peor: alguien lo daría por bueno.
  const mapa = indexarColores([
    { nombre: "Preparando Presupuesto", color: null },
    { nombre: "Presupuesto Enviado", color: "#177ba0" },
  ]);
  assert.equal(mapa[clave("Preparando Presupuesto")], undefined);
  assert.equal(Object.keys(mapa).length, 1);
});

prueba("un embudo vacío da un mapa vacío, no un error", () => {
  assert.deepEqual(indexarColores([]), {});
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
