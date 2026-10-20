/**
 * Qué días vale una tarifa, con los nombres de temporada reales del catálogo
 * (20/10/2026: «si el archivo lo tiene, se tiene que emplear»).
 *
 * Cómo correrla:  npm run test:fechas-tarifa
 */
import assert from "node:assert/strict";

import { coberturaDeTarifa } from "../src/domain/fechasDeTarifa";

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

prueba("Canada Palace: los tres tramos del nombre, no solo el guardado", () => {
  const c = coberturaDeTarifa({
    seasonName: "T. Media (T2: 12/03-24/03 · 05/06-18/06 · 06/09-25/09)",
    dateFrom: "2027-03-12",
    dateTo: "2027-03-24",
  });
  assert.equal(c.vale("2027-03-15"), true);
  assert.equal(c.vale("2027-06-07"), true);
  assert.equal(c.vale("2027-09-10"), true);
  assert.equal(c.vale("2027-06-20"), false);
  assert.equal(c.origen, "nombre");
});

prueba("Cesar Augustus: días sueltos con su mes", () => {
  const c = coberturaDeTarifa({ seasonName: "T. Alta · 9, 10, 14, 15, 16 y 17/06" });
  assert.equal(c.vale("2027-06-09"), true);
  assert.equal(c.vale("2027-06-17"), true);
  assert.equal(c.vale("2027-06-11"), false);
  const b = coberturaDeTarifa({ seasonName: "T. Baja · 29/03 · 4, 5, 9, 11, 12, 16, 18, 25 y 26/04 · 2, 3, 9, 17, 23, 24 y 30/05" });
  assert.equal(b.vale("2027-03-29"), true);
  assert.equal(b.vale("2027-04-26"), true);
  assert.equal(b.vale("2027-05-30"), true);
  assert.equal(b.vale("2027-06-05"), false);
});

prueba("Camping Platja: meses, y «excepto» se marca para confirmar", () => {
  const c = coberturaDeTarifa({ seasonName: "T. alta – JUNIO / SEPTIEMBRE (Excepto San Juan y puentes)" });
  assert.equal(c.vale("2027-06-10"), true);
  assert.equal(c.vale("2027-05-10"), false);
  assert.equal(c.conExcepciones, true);
  const b = coberturaDeTarifa({ seasonName: "T. baja – ABRIL / MAYO / OCTUBRE (Excepto Semana Santa y puentes)" });
  // «Excepto Semana Santa» no convierte la tarifa en una de Semana Santa.
  assert.equal(b.vale("2027-04-10"), true);
  assert.equal(b.vale("2027-03-24"), false);
});

prueba("Viella: meses con año y Semana Santa (2027: del 21 al 29 de marzo)", () => {
  const c = coberturaDeTarifa({ seasonName: "Febrero 2027 · Semana Santa" });
  assert.equal(c.vale("2027-02-10"), true);
  assert.equal(c.vale("2027-03-25"), true);
  assert.equal(c.vale("2027-03-10"), false);
});

prueba("L'Orri: «8–31 ene · 1–18 mar · sep–dic» y «1–7 ene · feb · 19 mar–31 ago»", () => {
  const baja = coberturaDeTarifa({ seasonName: "8–31 ene · 1–18 mar · sep–dic 2027" });
  assert.equal(baja.vale("2027-01-20"), true);
  assert.equal(baja.vale("2027-03-10"), true);
  assert.equal(baja.vale("2027-10-01"), true);
  assert.equal(baja.vale("2027-06-01"), false);
  const alta = coberturaDeTarifa({ seasonName: "1–7 ene · feb · 19 mar–31 ago 2027" });
  assert.equal(alta.vale("2027-02-14"), true);
  assert.equal(alta.vale("2027-06-01"), true);
  assert.equal(alta.vale("2027-01-20"), false);
});

prueba("Jaca: por el día de la semana en que empieza la noche", () => {
  const semana = coberturaDeTarifa({ seasonName: "Única (2026–27) · Domingo a Jueves" });
  const finde = coberturaDeTarifa({ seasonName: "Única (2026–27) · Viernes a Sábado" });
  // 12/03/2027 es viernes; 14/03/2027, domingo.
  assert.equal(semana.vale("2027-03-12"), false);
  assert.equal(finde.vale("2027-03-12"), true);
  assert.equal(semana.vale("2027-03-14"), true);
  assert.ok(finde.dias < 365);
});

prueba("Albergue de Jaca: «Curso 26/27» no es una fecha", () => {
  const c = coberturaDeTarifa({ seasonName: "Única · Curso 26/27 · +14 años · Domingo a Jueves" });
  assert.equal(c.vale("2027-03-14"), true);
  assert.equal(c.vale("2027-03-12"), false);
});

prueba("Terra Àurea: con años y una excepción", () => {
  const c = coberturaDeTarifa({ seasonName: "Única (grupos)", dateFrom: "2026-09-30", dateTo: "2027-05-30" });
  assert.equal(c.vale("2027-04-10"), true);
  assert.equal(c.vale("2027-06-05"), false);
  assert.equal(c.origen, "fechas");
});

prueba("Sin fechas en ningún sitio: no se sabe", () => {
  const c = coberturaDeTarifa({ seasonName: "T. Baja — Período A (calendario oficial PortAventura 2027)" });
  assert.equal(c.vale("2027-06-05"), null);
  assert.equal(c.origen, "sin fechas");
});

prueba("Semana Santa es más específica que la temporada larga", () => {
  const santa = coberturaDeTarifa({ seasonName: "T. Alta (T4: 25/03-28/03 · 19/06-24/06 · 01/07-30/07)" });
  const baja = coberturaDeTarifa({ seasonName: "T. Baja", dateFrom: "2027-03-12", dateTo: "2027-05-28" });
  assert.ok(santa.dias < baja.dias);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
