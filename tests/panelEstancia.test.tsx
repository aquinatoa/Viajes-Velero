/**
 * El panel de la estancia: la pensión de cada noche y, para profesores y
 * chófer, la habitación y la pensión de cada grupo.
 *
 * Los alumnos que van en otra tarifa NO se piden aquí (06/11/2026): dependen de
 * las tarifas de cada hotel y se asignan en su tabla de tarifas, como las
 * entradas de una actividad. Esta prueba fija que el panel no los pide.
 *
 * Cómo correrla:  npm run test:panel-estancia
 */
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as { React?: unknown }).React = React;

import { PanelEstancia } from "../src/components/request/PanelEstancia";
import { COMPOSICION_POR_DEFECTO, type ComposicionDeLaEstancia } from "../src/domain/estancia";

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

const panel = (composicion: ComposicionDeLaEstancia, profesores = 3) =>
  renderToStaticMarkup(
    <PanelEstancia
      composicion={composicion}
      onCambiar={() => undefined}
      fechaEntrada="2027-03-23"
      noches={3}
      profesores={profesores}
      regimenPedido="MP"
    />,
  );

console.log("\nEl panel de la estancia");

prueba("pide la pensión de cada noche y la habitación de profesores y chófer", () => {
  const h = panel(COMPOSICION_POR_DEFECTO);
  assert.match(h, /Pensión por noche/);
  assert.match(h, /Profesores \(3\)/);
  assert.match(h, /Chófer/);
  assert.match(h, /\+ Otra habitación para profesores/);
});

prueba("NO pide bloques de alumnos: se asignan a cada tarifa en el detalle del hotel", () => {
  const h = panel(COMPOSICION_POR_DEFECTO);
  assert.doesNotMatch(h, /Alumnos \(/);
  assert.doesNotMatch(h, /\+ Otro bloque de alumnos/);
  assert.match(h, /se\s+asignan en la tabla de tarifas del detalle de cada hotel/);
});

prueba("con dos profesores en otra habitación, enseña su grupo", () => {
  const h = panel({ ...COMPOSICION_POR_DEFECTO, profesoresOtros: [{ cantidad: 2, habitacion: "DOBLE", regimen: "PC" }] });
  assert.match(h, /Profesores · otra habitación/);
  assert.match(h, /<input[^>]*value="2"/);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
