/**
 * Quién ve qué en la pantalla de Viajes (los tratos del CRM).
 *
 * Javier, 06/10/2026: «Ruth y Ricard con sus usuarios veían todas las
 * oportunidades». Propuestas y solicitudes ya se filtraban; Viajes no. Esta es
 * la regla que lo arregla, y como las demás de visibilidad se rompe hacia el
 * lado permisivo sin dar error: por eso tiene prueba.
 *
 * Cómo correrla:  npm run test:viajes
 * No necesita base de datos ni Zoho: la regla es una función pura.
 */
import assert from "node:assert/strict";

import {
  departamentoDesdeCrm,
  tratosVisiblesPara,
  veTodosLosDepartamentos,
} from "../server/tratosPorDepartamento";

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

const grupos = { id: "g", department: "GROUPS" as const };
const sports = { id: "s", department: "SPORTS" as const };
const sinDepartamento = { id: "n", department: null };
const familiar = { id: "f", department: "OTRO" as const };
const todos = [grupos, sports, sinDepartamento, familiar];
const ids = (lista: { id: string }[]) => lista.map((t) => t.id);

console.log("El departamento, tal como lo escriben en Zoho");

prueba("«Grupos» y «Turismo Deportivo» son los dos valores que escribimos nosotros", () => {
  assert.equal(departamentoDesdeCrm("Grupos"), "GROUPS");
  assert.equal(departamentoDesdeCrm("Turismo Deportivo"), "SPORTS");
});

prueba("se lee con manga ancha: mayúsculas, tildes y espacios", () => {
  assert.equal(departamentoDesdeCrm("  GRUPOS "), "GROUPS");
  assert.equal(departamentoDesdeCrm("turismo deportívo"), "SPORTS");
  assert.equal(departamentoDesdeCrm("Sports"), "SPORTS");
});

prueba("vacío, nulo o «-None-» = sin departamento", () => {
  assert.equal(departamentoDesdeCrm(""), null);
  assert.equal(departamentoDesdeCrm(null), null);
  assert.equal(departamentoDesdeCrm(undefined), null);
  assert.equal(departamentoDesdeCrm("-None-"), null);
});

prueba("los otros tres departamentos de su CRM son OTRO, no «sin departamento»", () => {
  assert.equal(departamentoDesdeCrm("Agencia de Viajes"), "OTRO");
  assert.equal(departamentoDesdeCrm("Congresos y Eventos"), "OTRO");
  assert.equal(departamentoDesdeCrm("Turismo Familiar"), "OTRO");
});

console.log("Quién ve qué");

prueba("un administrador global ve los dos departamentos", () => {
  const javier = { role: "ADMIN" as const, department: null };
  assert.equal(veTodosLosDepartamentos(javier), true);
  assert.deepEqual(ids(tratosVisiblesPara(javier, todos)), ["g", "s", "n", "f"]);
});

prueba("Ruth (admin de Grupos) ve Grupos y los sin departamento; ni Sports ni Familiar", () => {
  const ruth = { role: "DEPT_ADMIN" as const, department: "GROUPS" as const };
  assert.equal(veTodosLosDepartamentos(ruth), false);
  assert.deepEqual(ids(tratosVisiblesPara(ruth, todos)), ["g", "n"]);
});

prueba("Ricard (admin de Sports) ve Sports y los sin departamento, no Grupos", () => {
  const ricard = { role: "DEPT_ADMIN" as const, department: "SPORTS" as const };
  assert.deepEqual(ids(tratosVisiblesPara(ricard, todos)), ["s", "n"]);
});

prueba("un cotizador se rige por su departamento, igual que su administrador", () => {
  const cotizador = { role: "QUOTER" as const, department: "SPORTS" as const };
  assert.deepEqual(ids(tratosVisiblesPara(cotizador, todos)), ["s", "n"]);
});

prueba("quien no tiene departamento no pierde tratos: no se sabe cuáles esconderle", () => {
  const sinDept = { role: "QUOTER" as const, department: null };
  assert.deepEqual(ids(tratosVisiblesPara(sinDept, todos)), ["g", "s", "n", "f"]);
});

prueba("el orden en que llegan de Zoho se respeta", () => {
  const ruth = { role: "DEPT_ADMIN" as const, department: "GROUPS" as const };
  const alReves = [sinDepartamento, sports, grupos];
  assert.deepEqual(ids(tratosVisiblesPara(ruth, alReves)), ["n", "g"]);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
