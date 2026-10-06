/**
 * Las tarifas publicadas, en forma de tabla y no de lista.
 *
 * El caso que obliga a esto: el catálogo enseñaba las 30 tarifas del Hotel
 * California Garden como treinta líneas «2027 · PC · 2027-03-28 → 2027-05-21 ·
 * 35,32 €», con pares idénticos a distinto precio. Son 5 periodos × 2
 * regímenes × 3 ocupaciones: una tabla de cinco filas.
 *
 * Cómo correrla:  npm run test:rejilla
 */
import assert from "node:assert/strict";

import {
  etiquetaDePeriodo,
  fechaCorta,
  rejillaDeActividad,
  rejillaDeAlojamiento,
  type TarifaDeCatalogo,
} from "../src/domain/rejillaDeTarifas";

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

let n = 0;
const tarifa = (extra: Partial<TarifaDeCatalogo>): TarifaDeCatalogo => ({
  id: `t${++n}`,
  year: 2027,
  currency: "EUR",
  amount: 10,
  ...extra,
});

// El California Garden como lo lee la hoja: 2 periodos × 2 regímenes × 3 ocupaciones.
const PERIODOS = [
  { seasonName: "T. Baja", dateFrom: "2027-03-28", dateTo: "2027-05-21" },
  { seasonName: "T. Media", dateFrom: "2027-06-05", dateTo: "2027-06-11" },
];
const CALIFORNIA: TarifaDeCatalogo[] = [];
for (const p of PERIODOS) {
  for (const boardType of ["MP", "PC"]) {
    for (const occupancyLabel of ["Múltiple", "Doble", "Individual"]) {
      CALIFORNIA.push(tarifa({ ...p, boardType, occupancyLabel, includedService: "Agua incluida", clientSegment: "GENERIC", amount: CALIFORNIA.length + 30 }));
    }
  }
}

console.log("\nFechas y periodos");

prueba("la fecha ISO se acorta a «28 mar»", () => {
  assert.equal(fechaCorta("2027-03-28"), "28 mar");
  assert.equal(fechaCorta("2027-12-01"), "1 dic");
  assert.equal(fechaCorta(null), null);
});

prueba("el periodo lleva la temporada y las fechas; un rango ISO como temporada no se repite", () => {
  assert.equal(etiquetaDePeriodo(tarifa({ seasonName: "T. Baja", dateFrom: "2027-03-28", dateTo: "2027-05-21" })), "T. Baja · 28 mar → 21 may");
  assert.equal(etiquetaDePeriodo(tarifa({ seasonName: "2027-03-28 → 2027-05-21", dateFrom: "2027-03-28", dateTo: "2027-05-21" })), "28 mar → 21 may");
  assert.equal(etiquetaDePeriodo(tarifa({})), "Todo el año");
});

console.log("\nEl hotel: periodos en filas, régimen × ocupación en columnas");

prueba("12 tarifas son 2 filas, 2 grupos de régimen y 3 columnas de ocupación", () => {
  const r = rejillaDeAlojamiento(CALIFORNIA)!;
  assert.deepEqual(r.filas, ["T. Baja · 28 mar → 21 may", "T. Media · 5 jun → 11 jun"]);
  assert.deepEqual(r.grupos.map((g) => g.nombre), ["Media pensión", "Pensión completa"]);
  assert.deepEqual(r.grupos[0].columnas, ["Múltiple", "Doble", "Individual"]);
  assert.equal(r.celdasAmbiguas, 0);
  assert.equal(r.year, 2027);
});

prueba("cada celda tiene su precio", () => {
  const r = rejillaDeAlojamiento(CALIFORNIA)!;
  const c = r.celda("T. Media · 5 jun → 11 jun", "Pensión completa", "Doble")!;
  assert.deepEqual(c.importes, [CALIFORNIA.find((t) => t.seasonName === "T. Media" && t.boardType === "PC" && t.occupancyLabel === "Doble")!.amount]);
  assert.equal(r.celda("T. Baja · 28 mar → 21 may", "Pensión completa", "Suite"), null);
});

prueba("lo que es igual en todas no ocupa columna: va a «comun»", () => {
  const r = rejillaDeAlojamiento(CALIFORNIA)!;
  assert.deepEqual(r.comun, ["Agua incluida"]);
});

prueba("sin la ocupación, tres precios caen en la misma celda y se avisa", () => {
  // Lo que pasa en el espejo local, que se construye desde la vista resumida.
  const sinOcupacion = CALIFORNIA.map((t) => ({ ...t, occupancyLabel: null, includedService: null }));
  const r = rejillaDeAlojamiento(sinOcupacion)!;
  assert.deepEqual(r.grupos.map((g) => g.columnas), [["Precio"], ["Precio"]]);
  const c = r.celda("T. Baja · 28 mar → 21 may", "Media pensión", "Precio")!;
  assert.equal(c.importes.length, 3);
  assert.equal(r.celdasAmbiguas, 4);
});

prueba("con un solo régimen no hay grupo, y el régimen se dice en «comun»", () => {
  const soloMp = CALIFORNIA.filter((t) => t.boardType === "MP");
  const r = rejillaDeAlojamiento(soloMp)!;
  assert.deepEqual(r.grupos.map((g) => g.nombre), [""]);
  assert.ok(r.comun.includes("Media pensión"));
});

console.log("\nLa actividad: la etiqueta se parte por « · »");

prueba("«Júnior/Primaria · Entrada · Periodo A» → fila, grupo y columna", () => {
  const r = rejillaDeActividad([
    tarifa({ ageLabel: "Júnior/Primaria · Entrada · Periodo A", amount: 19 }),
    tarifa({ ageLabel: "Júnior/Primaria · Entrada · Periodo B", amount: 25 }),
    tarifa({ ageLabel: "Adulto · Entrada · Periodo A", amount: 32 }),
    tarifa({ ageLabel: "Adulto · Entrada + Ticket Plus · Periodo A", amount: 44 }),
  ])!;
  assert.deepEqual(r.filas, ["Júnior/Primaria", "Adulto"]);
  assert.deepEqual(r.grupos.map((g) => g.nombre), ["Entrada", "Entrada + Ticket Plus"]);
  assert.deepEqual(r.grupos[0].columnas, ["Periodo A", "Periodo B"]);
  assert.deepEqual(r.celda("Adulto", "Entrada + Ticket Plus", "Periodo A")!.importes, [44]);
});

prueba("una actividad con etiqueta simple es una tabla de una columna", () => {
  const r = rejillaDeActividad([tarifa({ ageLabel: "Por equipo", amount: 120 }), tarifa({ ageLabel: "Por persona", amount: 8 })])!;
  assert.deepEqual(r.filas, ["Por equipo", "Por persona"]);
  assert.deepEqual(r.grupos, [{ nombre: "", columnas: ["Precio"] }]);
});

prueba("sin tarifas no hay rejilla", () => {
  assert.equal(rejillaDeAlojamiento([]), null);
  assert.equal(rejillaDeActividad([]), null);
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
