/**
 * Las líneas de una actividad: tarifa × cantidad, con un primer esbozo por
 * edad del grupo. Anthony, 08/10/2026: «no todos son adultos, no todos son
 * discapacitados».
 *
 * Cómo correrla:  npm run test:lineas
 */
import assert from "node:assert/strict";

import {
  edadDeEtiqueta,
  lineasPorDefecto,
  porAlumno,
  resumenDeLineas,
  totalDeLineas,
  tramoDelGrupo,
} from "../src/domain/lineasDeActividad";

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

// Las tarifas reales de «1 día Caribe Aquatic Park» (publicadas en local).
const t = (id: string, ageLabel: string, precio: number) => ({ id, ageLabel, salePvpAmount: precio });
const CARIBE = [
  t("disc-b", "Pax con Discapacidad · Entrada · Periodo B", 12),
  t("adu-b", "Adulto (18-59) · Entrada · Periodo B", 23),
  t("adu-c", "Adulto (18-59) · Entrada · Periodo C", 28),
  t("adu-plus-b", "Adulto · Entrada + Ticket Plus · Periodo B", 45),
  t("jov-b", "Joven/Secundaria/Uni (12-17) · Entrada · Periodo B", 17),
  t("jov-c", "Joven/Secundaria/Uni (12-17) · Entrada · Periodo C", 25),
  t("jov-plus-b", "Joven/Secundaria/Uni · Entrada + Ticket Plus · Periodo B", 32),
  t("jun-b", "Júnior/Primaria (4-11) · Entrada · Periodo B", 15),
  t("sen-b", "Sénior (desde 60) · Entrada · Periodo B", 17),
];

console.log("Edades");

prueba("la edad se lee de la etiqueta de la tarifa", () => {
  assert.deepEqual(edadDeEtiqueta("Joven/Secundaria/Uni (12-17) · Entrada · Periodo B"), { min: 12, max: 17 });
  assert.deepEqual(edadDeEtiqueta("Sénior (desde 60) · Entrada"), { min: 60, max: null });
  assert.deepEqual(edadDeEtiqueta("Adulto (18-59)"), { min: 18, max: 59 });
  assert.equal(edadDeEtiqueta("Pax con Discapacidad · Entrada"), null);
  assert.equal(edadDeEtiqueta(null), null);
});

prueba("la edad del grupo se lee de lo que dijo el colegio", () => {
  assert.deepEqual(tramoDelGrupo("14-15"), { min: 14, max: 15 });
  assert.deepEqual(tramoDelGrupo("de 15 a 17 años"), { min: 15, max: 17 });
  assert.deepEqual(tramoDelGrupo("", "15 años"), { min: 15, max: 15 });
  assert.equal(tramoDelGrupo("", ""), null);
});

console.log("El esbozo por defecto");

prueba("3º de ESO (14-15): alumnos en Joven · Entrada · Periodo B, profesores en Adulto · Entrada · Periodo B", () => {
  const lineas = lineasPorDefecto(CARIBE, 25, 2, { min: 14, max: 15 });
  assert.deepEqual(
    lineas.map((l) => [l.rateId, l.cantidad, l.precio]),
    [
      ["jov-b", 25, 17],
      ["adu-b", 2, 23],
    ],
  );
  assert.equal(totalDeLineas(lineas), 25 * 17 + 2 * 23);
  assert.equal(porAlumno(lineas, 25), Math.round(((25 * 17 + 2 * 23) / 25) * 100) / 100);
});

prueba("primaria (8-10) va a Júnior; nunca a «Pax con Discapacidad» aunque sea la más barata", () => {
  const lineas = lineasPorDefecto(CARIBE, 30, 3, { min: 8, max: 10 });
  assert.equal(lineas[0].rateId, "jun-b");
  assert.ok(lineas.every((l) => l.rateId !== "disc-b"));
});

prueba("sin edad del grupo: la básica más barata que no sea especial ni de adulto", () => {
  const lineas = lineasPorDefecto(CARIBE, 20, 0, null);
  assert.equal(lineas.length, 1);
  assert.equal(lineas[0].rateId, "jun-b");
});

prueba("una actividad de tarifa única: una línea con todos", () => {
  const lineas = lineasPorDefecto([t("u", "", 40)], 20, 2, { min: 14, max: 15 });
  assert.deepEqual(lineas.map((l) => [l.rateId, l.cantidad]), [["u", 22]]);
  assert.equal(lineas[0].etiqueta, "Tarifa única");
});

prueba("sin tarifas con precio no hay líneas", () => {
  assert.deepEqual(lineasPorDefecto([t("x", "Adulto", 0)], 20, 2, null), []);
});

prueba("el resumen dice cada línea y el total", () => {
  const lineas = lineasPorDefecto(CARIBE, 25, 2, { min: 14, max: 15 });
  assert.equal(
    resumenDeLineas(lineas),
    "25 × 17,00 € Joven/Secundaria/Uni (12-17) · Entrada · Periodo B + 2 × 23,00 € Adulto (18-59) · Entrada · Periodo B = 471,00 €",
  );
  assert.equal(resumenDeLineas([]), "");
  assert.equal(resumenDeLineas([{ rateId: "a", etiqueta: "x", precio: 5, cantidad: 0 }]), "");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
