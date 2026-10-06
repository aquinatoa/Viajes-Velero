/**
 * La revisión de actividades agrupada por proveedor.
 *
 * Anthony, 07/10/2026: con 130 tarjetas iguales «puede dar sensación de no
 * saber qué se está aprobando». Lo que se revisa es por proveedor, con sus
 * condiciones una vez y un botón que dice cuántas actividades aprueba.
 *
 * Cómo correrla:  npm run test:revision-proveedor
 */
import assert from "node:assert/strict";

import type { StagingActivity } from "../src/domain/documentImportTypes";
import {
  agruparPorProveedor,
  avisosDeTarifa,
  coincideConBusqueda,
  estadoAgregado,
  filaDeOrigen,
  progresoDeRevision,
  SIN_PROVEEDOR,
  textoDeAprobarProveedor,
} from "../src/domain/revisionPorProveedor";

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

let n = 0;
function actividad(
  nombre: string,
  proveedor: string | null,
  estado: string,
  condiciones: Array<[string, string, string?]> = [],
  tarifas = 1,
): StagingActivity {
  n += 1;
  return {
    id: `a${n}`,
    activityName: nombre,
    supplierName: proveedor,
    reviewStatus: estado as StagingActivity["reviewStatus"],
    rates: Array.from({ length: tarifas }, (_, i) => ({
      id: `a${n}r${i}`,
      currency: "EUR",
      rateUnit: "PER_PAX",
      salePvpAmount: 10 + i,
      rawText: `${nombre} · fila ${n + 1}`,
      requiresReview: true,
      reviewStatus: estado as StagingActivity["reviewStatus"],
    })),
    policies: condiciones.map(([tipo, texto, e], i) => ({
      id: `a${n}p${i}`,
      policyType: tipo as StagingActivity["policies"][number]["policyType"],
      policyText: texto,
      requiresReview: true,
      reviewStatus: (e ?? estado) as StagingActivity["reviewStatus"],
    })),
  };
}

const CANCEL: [string, string] = ["CANCELLATION", "Cancelación total: 45-16 días: 30%"];
const GRATIS: [string, string] = ["SPECIAL_NOTES", "Gratuidades: 1 profesor por cada 15"];

const salou = [
  actividad("Banana · Club Nàutic Salou", "Club Nàutic Salou", "PENDING", [GRATIS, CANCEL]),
  actividad("Kayak · Club Nàutic Salou", "Club Nàutic Salou", "APPROVED", [GRATIS, CANCEL], 2),
  actividad("Paddle surf XXL", "Club Nàutic Salou", "PENDING", [GRATIS, ["CANCELLATION", "cancelación total: 45-16 días: 30%  "]]),
];
const saltapark = [
  actividad("Paintball · Saltapark", "Saltapark", "APPROVED", [["PAYMENT", "Pago: 50% al reservar, 50% al final"]]),
];
const suelta = [actividad("Novedad 2027", null, "REJECTED")];
const TODAS = [...salou, ...saltapark, ...suelta];

console.log("Agrupar");

prueba("un grupo por proveedor, en el orden en que aparecen; sin proveedor va aparte", () => {
  const g = agruparPorProveedor(TODAS);
  assert.deepEqual(
    g.map((x) => x.proveedor),
    ["Club Nàutic Salou", "Saltapark", SIN_PROVEEDOR],
  );
});

prueba("cuenta actividades, tarifas y estados", () => {
  const [s] = agruparPorProveedor(TODAS);
  assert.equal(s.actividades.length, 3);
  assert.equal(s.tarifas, 4);
  assert.equal(s.aprobadas, 1);
  assert.equal(s.pendientes, 2);
  assert.equal(s.rechazadas, 0);
  assert.equal(s.idsActividades.length, 3);
  assert.equal(s.idsTarifas.length, 4);
  assert.equal(s.idsCondiciones.length, 6);
});

prueba("las condiciones repetidas se juntan: dos distintas, no seis; mayúsculas y espacios no cuentan", () => {
  const [s] = agruparPorProveedor(TODAS);
  assert.equal(s.condiciones.length, 2);
  const cancel = s.condiciones.find((c) => c.policyType === "CANCELLATION");
  assert.equal(cancel?.ids.length, 3);
});

prueba("el estado de una condición junta es el de todas, o «mezcla»", () => {
  const [s] = agruparPorProveedor(TODAS);
  // Banana PENDING, Kayak APPROVED, Paddle PENDING → mezcla.
  assert.equal(s.condiciones[0].estado, "MIXTO");
  const [p] = agruparPorProveedor(saltapark);
  assert.equal(p.condiciones[0].estado, "APPROVED");
});

prueba("estadoAgregado", () => {
  assert.equal(estadoAgregado([]), "PENDING");
  assert.equal(estadoAgregado(["PENDING", "NEEDS_CHANGES"]), "PENDING");
  assert.equal(estadoAgregado(["APPROVED", "APPROVED"]), "APPROVED");
  assert.equal(estadoAgregado(["REJECTED"]), "REJECTED");
  assert.equal(estadoAgregado(["APPROVED", "REJECTED"]), "MIXTO");
});

console.log("Progreso y textos");

prueba("el progreso cuenta decididas (aprobadas o rechazadas) y proveedores completos", () => {
  const p = progresoDeRevision(TODAS);
  assert.deepEqual(p, { total: 5, revisadas: 3, proveedores: 3, proveedoresCompletos: 2 });
});

prueba("el botón dice cuántas actividades aprueba y de quién", () => {
  const [s, p] = agruparPorProveedor(TODAS);
  assert.equal(textoDeAprobarProveedor(s), "Aprobar 2 actividades de Club Nàutic Salou y sus 2 condiciones");
  assert.equal(textoDeAprobarProveedor({ ...p, pendientes: 1 }), "Aprobar 1 actividad de Saltapark y su condición");
  assert.equal(
    textoDeAprobarProveedor({ ...p, pendientes: 3, condiciones: [] }),
    "Aprobar 3 actividades de Saltapark",
  );
});

prueba("los avisos de una tarifa: lo que no cuadra, en una frase", () => {
  const base = { id: "r", currency: "EUR", requiresReview: true, reviewStatus: "PENDING" as const };
  assert.deepEqual(avisosDeTarifa({ ...base, salePvpAmount: 18, costNetAmount: 14, rateUnit: "PER_PAX" }), []);
  assert.deepEqual(avisosDeTarifa({ ...base, salePvpAmount: 12, costNetAmount: 14, rateUnit: "PER_PAX" }), ["venta por debajo del coste"]);
  assert.deepEqual(avisosDeTarifa({ ...base, costNetAmount: 14, rateUnit: "PER_PAX" }), ["sin precio de venta"]);
  assert.deepEqual(avisosDeTarifa({ ...base, salePvpAmount: 0, rateUnit: "UNKNOWN" }), [
    "precio de venta a cero",
    "sin unidad (¿por persona, por grupo?)",
  ]);
  assert.deepEqual(avisosDeTarifa({ ...base, salePvpAmount: 9, rateUnit: "PER_PAX", minPax: 30, maxPax: 10 }), [
    "mínimo de grupo mayor que el máximo",
  ]);
});

prueba("el grupo cuenta sus tarifas con aviso", () => {
  const conAviso = actividad("Barata", "Saltapark", "PENDING");
  conAviso.rates[0].costNetAmount = 99;
  const [g] = agruparPorProveedor([conAviso, ...saltapark]);
  assert.equal(g.avisos, 1);
});

prueba("el buscador mira nombre, proveedor, tipo y zona, sin tildes ni mayúsculas", () => {
  const a = actividad("Kayak + banana", "Club Nàutic Cambrils", "PENDING");
  a.activityType = "Náutica";
  a.locationMain = "Cambrils";
  assert.equal(coincideConBusqueda(a, "KAYAK"), true);
  assert.equal(coincideConBusqueda(a, "nautic cambrils"), true);
  assert.equal(coincideConBusqueda(a, "nautica"), true);
  assert.equal(coincideConBusqueda(a, "saltapark"), false);
  assert.equal(coincideConBusqueda(a, "  "), true);
});

prueba("la fila del Excel sale de la cita, y si no la hay, nada", () => {
  assert.equal(filaDeOrigen("Banana · Hasta 10 pax · 18 € · fila 2"), 2);
  assert.equal(filaDeOrigen("Adulto · Periodo B · 44 €"), null);
  assert.equal(filaDeOrigen(null), null);
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
