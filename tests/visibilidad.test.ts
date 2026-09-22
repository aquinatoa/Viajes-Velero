/**
 * Quién ve qué: propuestas, solicitudes y borradores.
 *
 * Es la regla que más fácil se rompe sin que nadie lo note, porque romperla
 * hacia el lado permisivo no da error: simplemente alguien ve lo que no debe.
 * Ya pasó una vez, y lo reportó Oravia: tres de sus ocho usuarios son
 * cotizadores y veían las propuestas del otro departamento.
 *
 * Los borradores tienen a propósito una regla MÁS ABIERTA que las propuestas.
 * Lo pidió Ruth: «todos los borradores deben ser editables por otros usuarios
 * si fuera necesario». Un borrador no es trabajo terminado de nadie.
 *
 * Cómo correrla:  npm run test:visibilidad
 * No necesita base de datos: la regla es una función pura.
 */
import assert from "node:assert/strict";

import {
  deliveryVisibilityWhere,
  draftVisibilityWhere,
  tripRequestVisibilityWhere,
} from "../server/auth";
import { agruparSuplementos } from "../server/documentImportDb";

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

// Los perfiles reales de Oravia, con sus departamentos.
const admin = { id: "u-admin", role: "ADMIN", department: null } as never;
const jefaGroups = { id: "u-rpujol", role: "DEPT_ADMIN", department: "GROUPS" } as never;
const cotizadoraGroups = { id: "u-groups", role: "QUOTER", department: "GROUPS" } as never;
const cotizadorSports = { id: "u-sports", role: "QUOTER", department: "SPORTS" } as never;
const cotizadorSinDepto = { id: "u-suelto", role: "QUOTER", department: null } as never;

// ── Propuestas enviadas ───────────────────────────────────────────────────────

console.log("\nLas propuestas de la pantalla de inicio");

prueba("un administrador global lo ve todo", () => {
  assert.deepEqual(deliveryVisibilityWhere(admin), {});
});

prueba("un cotizador solo ve las suyas", () => {
  // Es lo que se rompió: la pantalla tenía su propia regla y solo filtraba a
  // los administradores de departamento.
  assert.deepEqual(deliveryVisibilityWhere(cotizadoraGroups), {
    proposal: { tripRequest: { ownerUserId: "u-groups" } },
  });
});

prueba("una jefa de departamento ve las suyas y las que no tienen departamento", () => {
  // Sin la segunda condición, una solicitud creada por un administrador global
  // -que no tiene departamento, luego la solicitud tampoco- se volvía invisible
  // para el departamento que en realidad la lleva. Desaparecer no es filtrar.
  assert.deepEqual(deliveryVisibilityWhere(jefaGroups), {
    OR: [{ department: "GROUPS" }, { department: null }],
  });
});

// ── Solicitudes ───────────────────────────────────────────────────────────────

console.log("\nLas solicitudes");

prueba("un cotizador solo ve las que creó él", () => {
  assert.deepEqual(tripRequestVisibilityWhere(cotizadorSports), { ownerUserId: "u-sports" });
});

prueba("una jefa de departamento, las de su departamento", () => {
  assert.deepEqual(tripRequestVisibilityWhere(jefaGroups), {
    OR: [{ department: "GROUPS" }, { department: null }],
  });
});

// ── Borradores ────────────────────────────────────────────────────────────────

console.log("\nLos borradores, que son de todos");

prueba("un cotizador SÍ ve los de su departamento", () => {
  // Aquí la regla es distinta a la de las propuestas, y es lo que pidió Ruth:
  // si quien empezó el borrador está de vacaciones, su compañera tiene que
  // poder continuarlo.
  assert.deepEqual(draftVisibilityWhere(cotizadoraGroups), {
    OR: [{ department: "GROUPS" }, { ownerUserId: "u-groups" }],
  });
});

prueba("pero no los del otro departamento", () => {
  const regla = draftVisibilityWhere(cotizadorSports) as { OR: { department?: string }[] };
  assert.equal(regla.OR[0].department, "SPORTS");
  assert.notEqual(regla.OR[0].department, "GROUPS");
});

prueba("sin departamento, solo los suyos", () => {
  // Es lo único que se puede decir de él con certeza.
  assert.deepEqual(draftVisibilityWhere(cotizadorSinDepto), { ownerUserId: "u-suelto" });
});

prueba("un administrador global ve todos los borradores", () => {
  assert.deepEqual(draftVisibilityWhere(admin), {});
});

// ── La diferencia entre las dos reglas, dicha a propósito ─────────────────────

console.log("\nLa diferencia entre propuestas y borradores es intencionada");

prueba("un cotizador ve MÁS borradores que propuestas", () => {
  const propuestas = JSON.stringify(deliveryVisibilityWhere(cotizadoraGroups));
  const borradores = JSON.stringify(draftVisibilityWhere(cotizadoraGroups));
  assert.notEqual(propuestas, borradores);
  assert.match(borradores, /GROUPS/);
  assert.ok(!/GROUPS/.test(propuestas));
});
// ── Suplementos repetidos ─────────────────────────────────────────────────────
//
// El maestro de hoteles es una hoja con una fila por tarifa, y las condiciones
// del hotel están escritas EN CADA FILA. Un hotel con seis temporadas, dos
// regímenes y tres ocupaciones repite sus suplementos treinta y seis veces, y
// alguien tenía que aprobarlos o descartarlos de uno en uno.

console.log("\nSuplementos repetidos del mismo documento");

const unSuplemento = (extra: Record<string, unknown> = {}) => ({
  accommodationName: "Hotel Planas 3*",
  adjustmentType: "SUPLEMENTO",
  concept: "Individual",
  amountType: "PORCENTAJE",
  amount: 75,
  appliesPer: "estancia",
  conditionText: "sobre múltiple",
  rawText: "Individual +75% s/múltiple",
  ...extra,
});

prueba("treinta y seis filas iguales son un suplemento", () => {
  const leidos = Array.from({ length: 36 }, () => unSuplemento());
  const { filas, agrupados } = agruparSuplementos(leidos);
  assert.equal(filas.length, 1);
  assert.equal(agrupados, 35);
});

prueba("y se dice en cuántas filas venía", () => {
  // La cuenta es información: un suplemento que sale en las 36 filas es del
  // hotel; uno que sale en 2 puede ser de una temporada concreta.
  const { filas } = agruparSuplementos(Array.from({ length: 36 }, () => unSuplemento()));
  assert.match(filas[0].rawText ?? "", /repetido en 36 filas/);
});

prueba("uno que aparece una sola vez se queda como estaba", () => {
  const { filas, agrupados } = agruparSuplementos([unSuplemento()]);
  assert.equal(agrupados, 0);
  assert.equal(filas[0].rawText, "Individual +75% s/múltiple");
});

prueba("dos importes distintos son DOS suplementos", () => {
  const { filas } = agruparSuplementos([unSuplemento(), unSuplemento({ amount: 50 })]);
  assert.equal(filas.length, 2);
});

prueba("el mismo suplemento en dos hoteles no se mezcla", () => {
  const { filas } = agruparSuplementos([
    unSuplemento(),
    unSuplemento({ accommodationName: "Hotel Eurosalou 3*" }),
  ]);
  assert.equal(filas.length, 2);
});

prueba("las tildes y las mayúsculas no crean duplicados falsos", () => {
  // La misma frase escrita dos veces en un Excel no siempre sale igual.
  const { filas } = agruparSuplementos([
    unSuplemento({ conditionText: "sobre múltiple" }),
    unSuplemento({ conditionText: "Sobre  Multiple " }),
  ]);
  assert.equal(filas.length, 1);
});

prueba("una condición distinta sí es otro suplemento", () => {
  const { filas } = agruparSuplementos([
    unSuplemento(),
    unSuplemento({ conditionText: "solo en temporada alta" }),
  ]);
  assert.equal(filas.length, 2);
});

prueba("sin suplementos no se inventa ninguno", () => {
  const { filas, agrupados } = agruparSuplementos([]);
  assert.equal(filas.length, 0);
  assert.equal(agrupados, 0);
});

console.log(`
${pasadas} pasadas, ${fallidas} fallidas
`);
process.exit(fallidas > 0 ? 1 : 0);
