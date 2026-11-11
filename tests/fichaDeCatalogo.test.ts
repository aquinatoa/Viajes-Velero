/**
 * La ficha de un alojamiento del catálogo: reunir lo que es lo mismo, separar
 * por canal, decir para quién es y comparar.
 *
 * El caso que obliga a esto es real (10/11/2026): «Mediterrània MED1» salía
 * como DOS alojamientos —`CAMBRILS` con 12 tarifas del turoperador suizo y
 * `Cambrils` con 18 del general—, y los dos canales llaman distinto a lo mismo
 * («Campo natural» / «Aloj + Campo Natural / Fútbol Playa (1.30h)»).
 *
 * Cómo correrla:  npm run test:ficha
 */
import assert from "node:assert/strict";

import { CLIENTES_ESPECIALES } from "../src/domain/documentImportTypes";
import {
  agruparPorIdentidad,
  canalCompleto,
  canalEnPalabras,
  canalesDelGrupo,
  codigoDeCanal,
  coincideConUbicacion,
  comparativaDeCanales,
  incluyeDe,
  opcionesDeUbicacion,
  poblacionesDe,
  servicioComparable,
  SIN_UBICACION,
  vigenciaDe,
} from "../src/domain/fichaDeCatalogo";
import { etiquetaDePeriodo, rejillaDeAlojamiento, type TarifaDeCatalogo } from "../src/domain/rejillaDeTarifas";

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

// MED1 como está en la base: el suizo con fechas de todo el año y servicio corto…
const SUIZO: TarifaDeCatalogo[] = [];
for (const [regimen, ocupacion, servicio, importe] of [
  ["MP", "INDIVIDUAL", "Campo natural", 121],
  ["MP", "DOBLE", "Campo natural", 88],
  ["PC", "DOBLE", "Campo natural", 92],
  ["MP", "DOBLE", "Sin campo (acompañante)", 69],
] as const) {
  SUIZO.push(
    tarifa({
      clientSegment: "SWISS_TTOO",
      seasonName: "GENERAL",
      dateFrom: "2027-01-01",
      dateTo: "2027-12-31",
      boardType: regimen,
      occupancyLabel: ocupacion,
      includedService: servicio,
      amount: importe,
    }),
  );
}
// … y el general sin fechas, con el servicio largo y alojamiento y desayuno.
const GENERAL: TarifaDeCatalogo[] = [
  tarifa({ clientSegment: "GENERIC", boardType: "MP", occupancyLabel: "INDIVIDUAL", includedService: "Aloj + Campo Natural / Fútbol Playa (1.30h)", amount: 134 }),
  tarifa({ clientSegment: "GENERIC", boardType: "MP", occupancyLabel: "DOBLE", includedService: "Aloj + Campo Natural / Fútbol Playa (1.30h)", amount: 97 }),
  tarifa({ clientSegment: "GENERIC", boardType: "PC", occupancyLabel: "DOBLE", includedService: "Aloj + Campo Natural / Fútbol Playa (1.30h)", amount: 102 }),
  tarifa({ clientSegment: "GENERIC", boardType: "MP", occupancyLabel: "DOBLE", includedService: "Aloj sin campo", amount: 76 }),
  tarifa({ clientSegment: "GENERIC", boardType: "AD", occupancyLabel: "DOBLE", includedService: "Aloj sin campo", amount: 72 }),
];

const REGISTROS = [
  { id: "a-suizo", nombre: "Mediterrània MED1", lugar: "CAMBRILS", rates: SUIZO },
  { id: "a-general", nombre: "Mediterrània MED1", lugar: "Cambrils", rates: GENERAL },
  { id: "a-otro", nombre: "Hotel Ciudad de Jaca (Jaca)", lugar: "Jaca", rates: [tarifa({ clientSegment: null })] },
];
const agrupar = () => agruparPorIdentidad(REGISTROS, (r) => r.nombre, (r) => r.lugar);

console.log("\nEl canal en palabras");

prueba("sin canal y GENERIC son lo mismo: «General»", () => {
  assert.equal(codigoDeCanal(null), "GENERIC");
  assert.equal(codigoDeCanal("  "), "GENERIC");
  const c = canalEnPalabras(null, CLIENTES_ESPECIALES);
  assert.equal(c.nombre, "General");
  assert.equal(c.esGeneral, true);
});

prueba("un cliente especial sale con su nombre y su detalle", () => {
  const c = canalEnPalabras("SWISS_TTOO", CLIENTES_ESPECIALES);
  assert.equal(c.nombre, "Turoperador suizo");
  assert.equal(canalCompleto(c), "Turoperador suizo (Destination · Travelclub)");
  assert.equal(c.esGeneral, false);
});

prueba("un código que no está en la lista sale tal cual, no se pierde", () => {
  assert.equal(canalEnPalabras("VIAJES_X", CLIENTES_ESPECIALES).nombre, "VIAJES_X");
});

console.log("\nReunir lo que es lo mismo");

prueba("«CAMBRILS» y «Cambrils» con el mismo nombre son un solo alojamiento", () => {
  const grupos = agrupar();
  assert.equal(grupos.length, 2);
  assert.equal(grupos[0].miembros.length, 2);
  assert.equal(grupos[0].lugar, "Cambrils", "se queda con el que no está en mayúsculas");
});

prueba("no junta lo que se llama distinto, aunque se parezca", () => {
  const grupos = agruparPorIdentidad(
    [
      { id: "1", nombre: "Bungalow", lugar: "Cambrils", rates: [] },
      { id: "2", nombre: "Villa Bonita / Aloha", lugar: "Cambrils", rates: [] },
    ],
    (r) => r.nombre,
    (r) => r.lugar,
  );
  assert.equal(grupos.length, 2);
});

console.log("\nSeparar por canal");

prueba("el general va primero y cada canal lleva sus tarifas", () => {
  const canales = canalesDelGrupo(agrupar()[0], CLIENTES_ESPECIALES);
  assert.deepEqual(canales.map((c) => c.canal.codigo), ["GENERIC", "SWISS_TTOO"]);
  assert.equal(canales[0].tarifas.length, 5);
  assert.equal(canales[1].tarifas.length, 4);
  assert.deepEqual(canales[1].miembroIds, ["a-suizo"]);
});

prueba("una tarifa sin canal cae en el general y se normaliza a GENERIC", () => {
  const canales = canalesDelGrupo(agrupar()[1], CLIENTES_ESPECIALES);
  assert.equal(canales.length, 1);
  assert.equal(canales[0].tarifas[0].clientSegment, "GENERIC");
});

prueba("sin tarifas no hay canales", () => {
  const g = agruparPorIdentidad([{ id: "x", nombre: "Arbitraje", lugar: "", rates: [] }], (r) => r.nombre, (r) => r.lugar)[0];
  assert.deepEqual(canalesDelGrupo(g, CLIENTES_ESPECIALES), []);
});

console.log("\nQué incluye y cuándo vale");

prueba("lo que incluye se dice una vez cada cosa", () => {
  assert.deepEqual(incluyeDe(SUIZO), ["Campo natural", "Sin campo (acompañante)"]);
});

prueba("de 1 de enero a 31 de diciembre es «Todo el año»", () => {
  assert.equal(vigenciaDe(SUIZO).texto, "Todo el año");
  assert.deepEqual(vigenciaDe(SUIZO).huecos, []);
  assert.equal(etiquetaDePeriodo(SUIZO[0]), "Todo el año", "la temporada «GENERAL» no se repite");
});

prueba("sin fechas también es todo el año, y no se inventan huecos", () => {
  const v = vigenciaDe(GENERAL);
  assert.equal(v.texto, "Todo el año");
  assert.deepEqual(v.huecos, []);
});

prueba("dos periodos con un tramo en medio: se dice el tramo sin tarifa", () => {
  const v = vigenciaDe([
    tarifa({ dateFrom: "2027-03-28", dateTo: "2027-04-29" }),
    tarifa({ dateFrom: "2027-09-27", dateTo: "2027-12-31" }),
  ]);
  assert.equal(v.texto, "28 mar → 29 abr · 27 sep → 31 dic");
  assert.deepEqual(v.huecos, ["30 abr → 26 sep"]);
});

prueba("periodos pegados se unen y no dejan hueco", () => {
  const v = vigenciaDe([
    tarifa({ dateFrom: "2027-01-01", dateTo: "2027-06-30" }),
    tarifa({ dateFrom: "2027-07-01", dateTo: "2027-12-31" }),
    tarifa({ dateFrom: "2027-03-01", dateTo: "2027-04-01" }),
  ]);
  assert.equal(v.texto, "Todo el año");
  assert.deepEqual(v.huecos, []);
});

prueba("con tarifas sin fechas mezcladas no se afirma ningún hueco", () => {
  const v = vigenciaDe([tarifa({ dateFrom: "2027-03-28", dateTo: "2027-04-29" }), tarifa({ dateFrom: "2027-09-27", dateTo: "2027-12-31" }), tarifa({})]);
  assert.deepEqual(v.huecos, []);
  assert.match(v.texto, /sin fechas/);
});

prueba("si los periodos son de dos años, las fechas llevan el año", () => {
  const v = vigenciaDe([tarifa({ dateFrom: "2027-10-01", dateTo: "2027-12-31" }), tarifa({ dateFrom: "2028-03-01", dateTo: "2028-04-30" })]);
  assert.equal(v.texto, "1 oct 2027 → 31 dic 2027 · 1 mar 2028 → 30 abr 2028");
  assert.deepEqual(v.huecos, [], "entre diciembre y marzo del año siguiente no se avisa");
});

console.log("\nComparar canales");

prueba("«Campo natural» y «Aloj + Campo Natural / Fútbol Playa» son el mismo servicio", () => {
  assert.equal(servicioComparable("Campo natural").clave, servicioComparable("Aloj + Campo Natural / Fútbol Playa (1.30h)").clave);
  assert.equal(servicioComparable("Sin campo (acompañante)").clave, servicioComparable("Aloj sin campo").clave);
  assert.equal(servicioComparable("Campo artificial").clave, servicioComparable("Aloj + Campo Artificial (1.30h)").clave);
  assert.equal(servicioComparable("Agua incluida").etiqueta, "Agua incluida", "lo que no reconoce lo deja como está");
});

prueba("las filas casan aunque los textos y los periodos estén escritos distinto", () => {
  const c = comparativaDeCanales(canalesDelGrupo(agrupar()[0], CLIENTES_ESPECIALES));
  const fila = c.filas.find((f) => f.concepto === "Media pensión · Doble · Campo natural")!;
  assert.deepEqual(fila.precios, { GENERIC: [97], SWISS_TTOO: [88] });
  assert.equal(fila.periodo, "Todo el año");
  assert.equal(fila.diferencia, -9.3, "el suizo es un 9,3 % más barato que el general");
  assert.deepEqual(fila.faltan, []);
});

prueba("lo que un canal tiene y el otro no se marca como que falta", () => {
  const c = comparativaDeCanales(canalesDelGrupo(agrupar()[0], CLIENTES_ESPECIALES));
  const ad = c.filas.find((f) => f.concepto.startsWith("Alojamiento y desayuno"))!;
  assert.deepEqual(ad.faltan, ["SWISS_TTOO"]);
  assert.equal(ad.diferencia, null);
  assert.ok(c.filasIncompletas >= 1);
});

prueba("con un solo canal no hay diferencia que calcular", () => {
  const c = comparativaDeCanales(canalesDelGrupo(agrupar()[1], CLIENTES_ESPECIALES));
  assert.equal(c.filas[0].diferencia, null);
});

console.log("\nLa rejilla dice el canal en palabras");

prueba("con el nombre del canal, «comun» dice «para Turoperador suizo» y no el código", () => {
  const r = rejillaDeAlojamiento(SUIZO, { nombreDelCanal: (c) => canalEnPalabras(c, CLIENTES_ESPECIALES).nombre })!;
  assert.ok(r.comun.includes("para Turoperador suizo"));
  assert.ok(!r.comun.some((x) => x.includes("SWISS_TTOO")));
  assert.deepEqual(r.filas, ["Todo el año"]);
});

prueba("sin ese dato se comporta como antes", () => {
  const r = rejillaDeAlojamiento(SUIZO)!;
  assert.ok(r.comun.includes("canal SWISS_TTOO"));
});

console.log("\nFiltrar por ubicación");

prueba("«Salou/Cambrils» son dos poblaciones; se ignoran mayúsculas, tildes y espacios", () => {
  assert.deepEqual(poblacionesDe("Salou/Cambrils").map((p) => p.clave), ["salou", "cambrils"]);
  assert.deepEqual(poblacionesDe("Vila-seca / Salou").map((p) => p.clave), ["vila-seca", "salou"]);
  assert.deepEqual(poblacionesDe("CAMBRILS").map((p) => p.nombre), ["Cambrils"]);
  assert.deepEqual(poblacionesDe("Benalmádena").map((p) => p.clave), ["benalmadena"]);
});

prueba("en una actividad, lo de detrás de « · » es el sitio y no la población", () => {
  assert.deepEqual(poblacionesDe("Altafulla · Parque de aventura").map((p) => p.nombre), ["Altafulla"]);
  assert.deepEqual(poblacionesDe("Calella / Santa Susanna · Centro náutico").map((p) => p.nombre), ["Calella", "Santa Susanna"]);
});

prueba("vacío o sin dato: ninguna población", () => {
  assert.deepEqual(poblacionesDe(""), []);
  assert.deepEqual(poblacionesDe(null), []);
  assert.deepEqual(poblacionesDe(undefined), []);
});

prueba("elegir «Salou» trae también «Salou / Calafell» y «Salou/Cambrils», pero no «Cambrils» a secas", () => {
  assert.equal(coincideConUbicacion(["Salou / Calafell"], "salou"), true);
  assert.equal(coincideConUbicacion(["Salou/Cambrils"], "salou"), true);
  assert.equal(coincideConUbicacion(["Cambrils"], "salou"), false);
  assert.equal(coincideConUbicacion(["CAMBRILS"], "cambrils"), true);
});

prueba("sin filtro pasa todo; «sin ubicación» solo pasa lo que no la trae", () => {
  assert.equal(coincideConUbicacion(["Salou"], ""), true);
  assert.equal(coincideConUbicacion([null], SIN_UBICACION), true);
  assert.equal(coincideConUbicacion([""], SIN_UBICACION), true);
  assert.equal(coincideConUbicacion(["Salou"], SIN_UBICACION), false);
});

prueba("la lista de opciones cuenta cada elemento una vez por población y aparte los sin ubicación", () => {
  const { poblaciones, sinUbicacion } = opcionesDeUbicacion([
    ["Salou / Calafell"],
    ["Salou/Cambrils"],
    ["CAMBRILS"],
    ["Cambrils"],
    [""],
    [null],
  ]);
  assert.deepEqual(
    poblaciones.map((p) => [p.nombre, p.cantidad]),
    [["Calafell", 1], ["Cambrils", 3], ["Salou", 2]],
  );
  assert.equal(sinUbicacion, 2);
});

prueba("un elemento con la misma población dicha dos veces cuenta una sola", () => {
  const { poblaciones } = opcionesDeUbicacion([["Cambrils", "CAMBRILS"]]);
  assert.deepEqual(poblaciones.map((p) => [p.nombre, p.cantidad]), [["Cambrils", 1]]);
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas`);
if (fallidas > 0) process.exit(1);
