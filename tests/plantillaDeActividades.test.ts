/**
 * La plantilla de actividades de Oravia, leída sin IA.
 *
 * Es su hoja estándar («PLANTILLA REVISAT COTIZADOR ACTIVITATS»): una fila
 * por actividad y columnas fijas. La v2 del 07/10/2026 trae 130 filas; leerla
 * con el modelo eran 130 llamadas. Esto comprueba que el lector saca cada
 * dato de su celda, distingue actividades con el mismo nombre en proveedores
 * distintos, y no se traga una hoja que no sea la plantilla.
 *
 * Cómo correrla:  npm run test:plantilla
 * Escribe un Excel pequeño en el directorio temporal y lo lee.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import XLSXModule from "xlsx";

import {
  anoDeTemporada,
  detectarCabecera,
  leerPlantillaDeActividades,
  tamanoDeGrupo,
  unidadDeTarifa,
} from "../server/plantillaDeActividades";

const XLSX = XLSXModule as typeof import("xlsx");

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

const CABECERA = [
  "Proveedor / Centro", "Zona", "Categoría", "Actividad", "Grupo (pax)", "Edad", "Duración",
  "Unidad de tarifa", "Observaciones/Condiciones", "Gratuidades", "Ratio monitores", "Descuento",
  "Pago reserva (%)", "Pago final (%)", "Cancelación total (%)", "Reducción de plazas (%)",
  "Temporada / Validez", "Contacto (tel/email/web)", "Markup %", "Cost", "neto venta", "Margen (€)",
  "Margen s/ neto venta (%)",
];

function fila(valores: Partial<Record<string, unknown>>): unknown[] {
  return CABECERA.map((c) => valores[c] ?? "");
}

const carpeta = mkdtempSync(path.join(tmpdir(), "plantilla-"));

function escribirExcel(nombre: string, filas: unknown[][], hoja = "Tarifas"): string {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), hoja);
  const ruta = path.join(carpeta, nombre);
  XLSX.writeFile(libro, ruta);
  return ruta;
}

const PLANTILLA = escribirExcel("plantilla.xlsx", [
  CABECERA,
  fila({
    "Proveedor / Centro": "Club Nàutic Salou", Zona: "Salou · Puerto deportivo", Categoría: "Individual",
    Actividad: "Banana", "Grupo (pax)": "Hasta 10 pax", Duración: "15 min", "Unidad de tarifa": "pax/actividad",
    "Observaciones/Condiciones": "Centro náutico en el puerto de Salou.", Gratuidades: "1 profesor gratis por cada 15 alumnos.",
    "Pago reserva (%)": 30, "Pago final (%)": 70, "Cancelación total (%)": "45-16 días: 30%",
    "Temporada / Validez": "Temporada 2027 · sujeto a disponibilidad", "Contacto (tel/email/web)": "977 00 00 00",
    "Markup %": 0.25, Cost: 14.31, "neto venta": 18, "Margen (€)": 3.69,
  }),
  // La misma actividad, otro tamaño de grupo: es otra tarifa de la misma actividad.
  fila({
    "Proveedor / Centro": "Club Nàutic Salou", Zona: "Salou · Puerto deportivo", Categoría: "Individual",
    Actividad: "Banana", "Grupo (pax)": "De 10 a 25-30 pax", Duración: "15 min", "Unidad de tarifa": "pax/actividad",
    Gratuidades: "1 profesor gratis por cada 15 alumnos.", "Pago reserva (%)": 30, "Pago final (%)": 70,
    "Temporada / Validez": "Temporada 2027", Cost: 12, "neto venta": 15,
  }),
  // Mismo nombre en otro proveedor: NO es la misma actividad.
  fila({
    "Proveedor / Centro": "Water Sports Center Calella", Zona: "Calella", Categoría: "Náutica",
    Actividad: "Banana", "Grupo (pax)": "Mínimo 25 pax", Edad: "Desde 8 años", "Unidad de tarifa": "pax/actividad",
    "Temporada / Validez": "Curso escolar 2026-2027", Cost: 10, "neto venta": 12.5,
  }),
  fila({
    "Proveedor / Centro": "La Suite Games", Zona: "Salou", Categoría: "Escape room",
    Actividad: "Escape room · Winers", "Grupo (pax)": "Grupos de 8 pax", "Unidad de tarifa": "grupo de 8 pax",
    Cost: 80, "neto venta": 100,
  }),
  // Sin temporada: hereda el año de control. Sin coste: se carga igual.
  fila({
    "Proveedor / Centro": "Jumpland", Zona: "Reus", Categoría: "Indoor", Actividad: "Salto libre",
    "Unidad de tarifa": "pax", "neto venta": 9,
  }),
  // Fila sin actividad: se salta con aviso.
  fila({ "Proveedor / Centro": "Jumpland", "neto venta": 5 }),
]);

const OTRA_HOJA = escribirExcel("hotel.xlsx", [
  ["Hotel", "Temporada", "Régimen", "Doble", "Individual"],
  ["Hotel California Garden", "Baja", "MP", 42, 60],
]);

console.log("Reconocer la plantilla");

prueba("la hoja con Actividad, Proveedor y neto venta es la plantilla", () => {
  const c = detectarCabecera([CABECERA]);
  assert.ok(c);
  assert.equal(c.fila, 0);
  assert.equal(c.columnas.actividad, 3);
  assert.equal(c.columnas.venta, 20);
  assert.equal(c.columnas.coste, 19);
});

prueba("la cabecera puede no estar en la primera fila", () => {
  const c = detectarCabecera([["PLANTILLA 2027"], [], CABECERA]);
  assert.equal(c?.fila, 2);
});

prueba("una hoja de hotel no es la plantilla y devuelve null", () => {
  assert.equal(leerPlantillaDeActividades(OTRA_HOJA, "Hotel"), null);
});

prueba("un PDF o una ruta vacía tampoco", () => {
  assert.equal(leerPlantillaDeActividades("/tmp/tarifa.pdf", "x"), null);
  assert.equal(leerPlantillaDeActividades(null, "x"), null);
  assert.equal(leerPlantillaDeActividades(path.join(carpeta, "no-existe.xlsx"), "x"), null);
});

console.log("Las celdas pequeñas");

prueba("unidad de tarifa", () => {
  assert.equal(unidadDeTarifa("pax/actividad"), "PER_PAX");
  assert.equal(unidadDeTarifa("grupo de 8 pax"), "PER_GROUP");
  assert.equal(unidadDeTarifa("por hora"), "PER_HOUR");
  assert.equal(unidadDeTarifa(null), "PER_PAX");
});

prueba("tamaño de grupo", () => {
  assert.deepEqual(tamanoDeGrupo("Hasta 10 pax"), { minPax: null, maxPax: 10 });
  assert.deepEqual(tamanoDeGrupo("De 25 a 50 pax"), { minPax: 25, maxPax: 50 });
  assert.deepEqual(tamanoDeGrupo("De 10 a 25-30 pax"), { minPax: 10, maxPax: 30 });
  assert.deepEqual(tamanoDeGrupo("Mínimo 25 pax"), { minPax: 25, maxPax: null });
  assert.deepEqual(tamanoDeGrupo("Grupos de 8 pax"), { minPax: 8, maxPax: 8 });
  assert.deepEqual(tamanoDeGrupo("Mín. 8 - máx. 20 pax"), { minPax: 8, maxPax: 20 });
  assert.deepEqual(tamanoDeGrupo("Menos de 30 pax"), { minPax: null, maxPax: 29 });
  assert.deepEqual(tamanoDeGrupo(null), { minPax: null, maxPax: null });
});

prueba("año de la temporada", () => {
  assert.equal(anoDeTemporada("Temporada 2027 · sujeto a disponibilidad"), 2027);
  assert.equal(anoDeTemporada("Curso escolar 2026-2027"), 2027);
  assert.equal(anoDeTemporada("Del 01/05/2027 al 31/10/2027"), 2027);
  assert.equal(anoDeTemporada(null), null);
});

console.log("La lectura entera");

const r = leerPlantillaDeActividades(PLANTILLA, "Plantilla de prueba", 2027);

prueba("se lee como plantilla, sin IA y sin consumo", () => {
  assert.ok(r);
  assert.equal(r.mode, "plantilla");
  assert.equal(r.usage, null);
  assert.equal(r.confidence, 1);
  assert.equal(r.detectedAccommodations.length, 0);
  assert.equal(r.candidateRates.length, 0);
});

prueba("cuatro actividades: Banana es una por proveedor, no una sola", () => {
  const nombres = r!.detectedActivities.map((a) => a.activityName);
  assert.deepEqual(nombres, [
    "Banana · Club Nàutic Salou",
    "Banana · Water Sports Center Calella",
    "Escape room · Winers",
    "Salto libre",
  ]);
});

prueba("la actividad lleva proveedor, zona, tipo, duración y la descripción con el contacto", () => {
  const banana = r!.detectedActivities[0];
  assert.equal(banana.supplierName, "Club Nàutic Salou");
  assert.equal(banana.locationMain, "Salou · Puerto deportivo");
  assert.equal(banana.activityType, "Individual");
  assert.equal(banana.durationText, "15 min");
  assert.match(banana.descriptionText ?? "", /Centro náutico/);
  assert.match(banana.descriptionText ?? "", /Contacto: 977 00 00 00/);
});

prueba("cinco tarifas, una por fila con precio, cada una con su fila de origen", () => {
  assert.equal(r!.candidateActivityRates.length, 5);
  assert.deepEqual(
    r!.candidateActivityRates.map((t) => t.sourceRow),
    [2, 3, 4, 5, 6],
  );
  // Y la fila también en la cita, que es lo que se ve al revisar.
  assert.ok(r!.candidateActivityRates.every((t) => (t.rawText ?? "").length <= 60));
  assert.ok(r!.candidateActivityRates.every((t, i) => (t.rawText ?? "").endsWith(` · fila ${i + 2}`)));
});

prueba("Banana de Salou tiene dos tarifas: dos tamaños de grupo", () => {
  const suyas = r!.candidateActivityRates.filter((t) => t.activityName === "Banana · Club Nàutic Salou");
  assert.equal(suyas.length, 2);
  assert.deepEqual(
    suyas.map((t) => [t.salePvpAmount, t.costNetAmount, t.minPax, t.maxPax]),
    [
      [18, 14.31, null, 10],
      [15, 12, 10, 30],
    ],
  );
});

prueba("venta y coste salen de sus columnas; Markup y Margen no se cargan", () => {
  const t = r!.candidateActivityRates[0];
  assert.equal(t.salePvpAmount, 18);
  assert.equal(t.costNetAmount, 14.31);
  assert.equal(t.currency, "EUR");
  assert.equal(t.rateUnit, "PER_PAX");
  assert.equal(t.year, 2027);
  assert.equal(t.seasonName, "Temporada 2027 · sujeto a disponibilidad");
  assert.equal(t.ageLabel, "Hasta 10 pax");
  assert.equal(t.rawText, "Banana · Hasta 10 pax · 18 € · fila 2");
});

prueba("la variante junta grupo y edad; el año sale de «Curso escolar 2026-2027»", () => {
  const calella = r!.candidateActivityRates.find((t) => t.activityName === "Banana · Water Sports Center Calella");
  assert.equal(calella?.ageLabel, "Mínimo 25 pax · Desde 8 años");
  assert.equal(calella?.year, 2027);
  assert.equal(calella?.minPax, 25);
});

prueba("sin temporada, el año de control; sin coste, se carga igual", () => {
  const salto = r!.candidateActivityRates.find((t) => t.activityName === "Salto libre");
  assert.equal(salto?.year, 2027);
  assert.equal(salto?.salePvpAmount, 9);
  assert.equal(salto?.costNetAmount, null);
});

prueba("el escape room es por grupo", () => {
  const e = r!.candidateActivityRates.find((t) => t.activityName === "Escape room · Winers");
  assert.equal(e?.rateUnit, "PER_GROUP");
  assert.deepEqual([e?.minPax, e?.maxPax], [8, 8]);
});

prueba("las condiciones son de cada actividad y no se repiten por fila", () => {
  const deBanana = r!.candidatePolicies.filter((p) => p.activityName === "Banana · Club Nàutic Salou");
  assert.deepEqual(
    deBanana.map((p) => `${p.policyType}: ${p.policyText}`),
    [
      "SPECIAL_NOTES: Gratuidades: 1 profesor gratis por cada 15 alumnos.",
      "CANCELLATION: Cancelación total: 45-16 días: 30%",
      "PAYMENT: Pago: 30% al reservar, 70% al final",
    ],
  );
  // Ninguna condición general: todas tienen dueño.
  assert.equal(r!.candidatePolicies.filter((p) => !p.activityName).length, 0);
});

prueba("la fila sin actividad se salta y se avisa", () => {
  assert.equal(r!.warnings.length, 1);
  assert.match(r!.warnings[0], /Fila 7: sin nombre de actividad/);
});

prueba("el resumen dice qué se leyó y que no hubo IA", () => {
  assert.match(r!.documentSummary, /leída sin IA/);
  assert.match(r!.documentSummary, /5 fila\(s\) con precio de 4 actividad\(es\) y 4 proveedor\(es\)/);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
