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
  debePartirPorRegimen,
  partesDePeriodo,
  tonoDeRegimen,
  tonoDeTemporada,
} from "../src/domain/presentacionDeTarifas";
import {
  etiquetaDePeriodo,
  fechaCorta,
  rejillaDeActividad,
  rejillaDeAlojamiento,
  unidadEnPalabras,
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

prueba("los tramos por noches del 4R van en su columna, no en la misma celda", () => {
  const periodo = { seasonName: "T. Baja", dateFrom: "2027-03-12", dateTo: "2027-05-28", occupancyLabel: "Múltiple" };
  const r = rejillaDeAlojamiento([
    tarifa({ ...periodo, boardType: "MP", minNights: 1, amount: 36.29 }),
    tarifa({ ...periodo, boardType: "MP", minNights: 3, amount: 33.26 }),
    tarifa({ ...periodo, boardType: "MP", minNights: 4, amount: 30.24 }),
    tarifa({ ...periodo, boardType: "PC", minNights: 1, amount: 40.61 }),
  ])!;
  assert.equal(r.celdasAmbiguas, 0, "ya no hay celdas con varios precios");
  const mp = r.grupos.find((g) => g.nombre === "Media pensión");
  assert.deepEqual(mp?.columnas, ["desde 1 noche", "desde 3 noches", "desde 4 noches"]);
});

prueba("la ocupación que viene en mayúsculas («DOBLE») se lee en minúsculas", () => {
  const r = rejillaDeAlojamiento([
    tarifa({ boardType: "MP", occupancyLabel: "DOBLE", amount: 88 }),
    tarifa({ boardType: "MP", occupancyLabel: "INDIVIDUAL", amount: 121 }),
  ])!;
  assert.deepEqual(r.grupos[0].columnas, ["Doble", "Individual"]);
  assert.deepEqual(r.celda("Todo el año", "", "Doble")!.importes, [88]);
});

prueba("sin tarifas no hay rejilla", () => {
  assert.equal(rejillaDeAlojamiento([]), null);
  assert.equal(rejillaDeActividad([]), null);
});

console.log("\nLa ficha del alojamiento, más limpia (11/11/2026)");

prueba("la fecha escrita en el nombre de la temporada no sale dos veces", () => {
  // Apartamentos Áncora: «T. Baja · 15/03/2027–31/05/2027» y además dateFrom/dateTo.
  const t = tarifa({ seasonName: "T. Baja · 15/03/2027–31/05/2027", dateFrom: "2027-03-15", dateTo: "2027-05-31" });
  assert.equal(etiquetaDePeriodo(t), "T. Baja · 15 mar → 31 may");
});

prueba("si no hay fechas de verdad, lo escrito en la temporada se respeta", () => {
  const t = tarifa({ seasonName: "T. Baja · 15/03/2027–31/05/2027" });
  assert.equal(etiquetaDePeriodo(t), "T. Baja · 15/03/2027–31/05/2027");
});

prueba("lo que no son fechas numéricas no se toca: «Excepto Semana Santa y puentes»", () => {
  const t = tarifa({
    seasonName: "T. baja · ABRIL / MAYO / OCTUBRE (Excepto Semana Santa y puentes)",
    dateFrom: "2027-04-01",
    dateTo: "2027-05-31",
  });
  assert.equal(etiquetaDePeriodo(t), "T. baja · ABRIL / MAYO / OCTUBRE (Excepto Semana Santa y puentes) · 1 abr → 31 may");
});

prueba("la unidad se dice en palabras, sea como sea que venga escrita", () => {
  for (const u of ["pax/noche", "por pax y noche", "PER_PAX_NIGHT", "PPPN"]) {
    assert.equal(unidadEnPalabras(u), "por persona y noche", u);
  }
  assert.equal(unidadEnPalabras("PER_PAX_DAY"), "por persona y día");
  assert.equal(unidadEnPalabras("pax/día"), "por persona y día");
  assert.equal(unidadEnPalabras("apartamento/noche"), "por apartamento y noche");
  assert.equal(
    unidadEnPalabras("pax/noche (según ocupación del apartamento)"),
    "por persona y noche (según ocupación del apartamento)",
  );
});

prueba("una unidad que no reconozco sale tal cual, y vacía sale vacía", () => {
  assert.equal(unidadEnPalabras("por grupo"), "por grupo");
  assert.equal(unidadEnPalabras(""), "");
  assert.equal(unidadEnPalabras(null), "");
  assert.equal(unidadEnPalabras(undefined), "");
});

prueba("«comun» dice «Precio por persona y noche» aunque cada tarifa lo escriba distinto", () => {
  const r = rejillaDeAlojamiento([
    tarifa({ boardType: "AD", tariffUnit: "pax/noche", dateFrom: "2027-03-15", dateTo: "2027-05-31" }),
    tarifa({ boardType: "AD", tariffUnit: "PER_PAX_NIGHT", dateFrom: "2027-09-12", dateTo: "2027-10-30" }),
  ])!;
  assert.ok(r.comun.includes("Precio por persona y noche"));
  assert.equal(r.grupos[0].columnas.length, 1, "no se parten en columnas por escribirse distinto");
});

console.log("\nTablas que se leen sin desplazarse y con color (11/11/2026)");

// El Camping Platja Cambrils: cada fila ya dice su estancia en la etiqueta.
const ESTANCIAS = [
  { s: "T. baja · ABRIL / MAYO (Excepto Semana Santa) · Estancia de 1 noche", noches: 1 },
  { s: "T. baja · ABRIL / MAYO (Excepto Semana Santa) · Estancia de 2 o 3 noches", noches: 2 },
  { s: "T. baja · ABRIL / MAYO (Excepto Semana Santa) · Estancia de 4 noches o más (dto. 10%)", noches: 4 },
];
const CAMPING: TarifaDeCatalogo[] = [];
for (const e of ESTANCIAS) {
  for (const boardType of ["MP", "PC"]) {
    for (const occupancyLabel of ["Oasis o Premium 5 pax.", "New Mediterrani"]) {
      CAMPING.push(tarifa({ seasonName: e.s, minNights: e.noches, boardType, occupancyLabel, amount: CAMPING.length + 30 }));
    }
  }
}

prueba("si cada fila ya dice su estancia, las noches mínimas NO se repiten como columna", () => {
  const r = rejillaDeAlojamiento(CAMPING)!;
  assert.deepEqual(r.grupos.map((g) => g.columnas.length), [2, 2], "4 columnas, no 12");
  assert.equal(r.celdasAmbiguas, 0);
  assert.equal(r.filas.length, 3);
});

prueba("si una misma fila tiene tramos de estancia distintos, las noches SÍ son columna", () => {
  const r = rejillaDeAlojamiento([
    tarifa({ boardType: "AD", minNights: 1, amount: 50, dateFrom: "2027-04-01", dateTo: "2027-05-31" }),
    tarifa({ boardType: "AD", minNights: 3, amount: 45, dateFrom: "2027-04-01", dateTo: "2027-05-31" }),
    tarifa({ boardType: "AD", minNights: 4, amount: 40, dateFrom: "2027-04-01", dateTo: "2027-05-31" }),
  ])!;
  assert.deepEqual(r.grupos[0].columnas, ["desde 1 noche", "desde 3 noches", "desde 4 noches"]);
  assert.equal(r.celdasAmbiguas, 0);
});

prueba("cada régimen tiene su tono, con el nombre largo o con el código", () => {
  assert.equal(tonoDeRegimen("Media pensión"), "mp");
  assert.equal(tonoDeRegimen("MP"), "mp");
  assert.equal(tonoDeRegimen("Pensión completa"), "pc");
  assert.equal(tonoDeRegimen("Alojamiento y desayuno"), "ad");
  assert.equal(tonoDeRegimen("Solo alojamiento"), "sa");
  assert.equal(tonoDeRegimen("Doble"), "", "lo que no es un régimen no lleva tono");
  assert.equal(tonoDeRegimen(null), "");
});

prueba("cada temporada tiene su tono; lo que no es temporada, no", () => {
  assert.equal(tonoDeTemporada("T. baja"), "baja");
  assert.equal(tonoDeTemporada("T. Media"), "media");
  assert.equal(tonoDeTemporada("Temporada alta"), "alta");
  assert.equal(tonoDeTemporada("15 mar → 31 may"), "");
  assert.equal(tonoDeTemporada("Estancia de 2 o 3 noches"), "");
});

prueba("la etiqueta larga de una fila se parte en temporada, matiz y lo que la identifica", () => {
  const p = partesDePeriodo("T. baja · ABRIL / MAYO / OCTUBRE (Excepto Semana Santa y puentes) · Estancia de 2 o 3 noches");
  assert.equal(p.temporada, "T. baja");
  assert.equal(p.tono, "baja");
  assert.equal(p.detalle, "ABRIL / MAYO / OCTUBRE (Excepto Semana Santa y puentes)");
  assert.equal(p.principal, "Estancia de 2 o 3 noches");
});

prueba("con temporada y fechas, las fechas son lo principal y no hay matiz", () => {
  const p = partesDePeriodo("T. Alta · 12 jun → 25 jun");
  assert.deepEqual([p.temporada, p.principal, p.detalle], ["T. Alta", "12 jun → 25 jun", null]);
});

prueba("sin temporada, la etiqueta entera es lo principal", () => {
  assert.deepEqual(partesDePeriodo("Todo el año"), { temporada: null, tono: "", principal: "Todo el año", detalle: null });
  assert.equal(partesDePeriodo("28 mar → 21 may").principal, "28 mar → 21 may");
});

prueba("muchos regímenes y columnas se reparten en una tabla por régimen; pocos, no", () => {
  const grupo = (nombre: string, n: number) => ({ nombre, columnas: Array.from({ length: n }, (_, i) => `c${i}`) });
  assert.equal(debePartirPorRegimen({ grupos: [grupo("Alojamiento y desayuno", 6), grupo("Media pensión", 6), grupo("Pensión completa", 6)] }), true);
  assert.equal(debePartirPorRegimen({ grupos: [grupo("Media pensión", 3), grupo("Pensión completa", 3)] }), false);
  assert.equal(debePartirPorRegimen({ grupos: [grupo("", 12)] }), false, "un solo grupo no se parte");
  assert.equal(debePartirPorRegimen({ grupos: [grupo("Media pensión", 9), grupo("", 2)] }), false, "sin nombre no hay título que poner");
});

prueba("las columnas van en el mismo orden en todos los regímenes (Múltiple, Doble, Individual)", () => {
  // California Garden: en MP los datos llegan Doble-Múltiple-Individual y en PC, Múltiple-Doble-Individual.
  const t = (boardType: string, occupancyLabel: string) =>
    tarifa({ boardType, occupancyLabel, dateFrom: "2027-03-28", dateTo: "2027-05-21" });
  const r = rejillaDeAlojamiento([
    t("MP", "Doble"), t("MP", "Múltiple"), t("MP", "Individual"),
    t("PC", "Múltiple"), t("PC", "Doble"), t("PC", "Individual"),
  ])!;
  assert.deepEqual(r.grupos.map((g) => g.columnas), [
    ["Múltiple", "Doble", "Individual"],
    ["Múltiple", "Doble", "Individual"],
  ]);
});

prueba("un régimen que no tiene una ocupación no la inventa: solo lista las suyas", () => {
  const t = (boardType: string, occupancyLabel: string) =>
    tarifa({ boardType, occupancyLabel, dateFrom: "2027-03-28", dateTo: "2027-05-21" });
  const r = rejillaDeAlojamiento([t("MP", "Doble"), t("MP", "Individual"), t("PC", "Doble")])!;
  assert.deepEqual(r.grupos.map((g) => g.columnas), [["Doble", "Individual"], ["Doble"]]);
});

prueba("por persona y por apartamento en el mismo alojamiento NO se mezclan en una celda", () => {
  const r = rejillaDeAlojamiento([
    tarifa({ boardType: "AD", tariffUnit: "pax/noche", amount: 30, dateFrom: "2027-03-15", dateTo: "2027-05-31" }),
    tarifa({ boardType: "AD", tariffUnit: "apartamento/noche", amount: 120, dateFrom: "2027-03-15", dateTo: "2027-05-31" }),
  ])!;
  assert.equal(r.celdasAmbiguas, 0);
  assert.deepEqual(r.grupos[0].columnas, ["por persona y noche", "por apartamento y noche"]);
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
