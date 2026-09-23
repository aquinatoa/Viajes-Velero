/**
 * Rellena en la base LOCAL las condiciones, observaciones y gratuidades de los
 * alojamientos, leyéndolas del Excel real de tarifas.
 *
 * Por qué hace falta: `espejar-catalogo.mjs` copia el catálogo del servidor a
 * través de `/api/inventory/catalog`, y ese resumen no traía estos tres campos
 * (ya se han añadido, pero el servidor no los devolverá hasta que se despliegue).
 * Mientras tanto la copia local tenía los 34 alojamientos con las condiciones
 * VACÍAS, así que el PDF generado aquí salía con el precio pelado y no había
 * forma de comprobar el bloque de cada alojamiento: ni las gratuidades, ni los
 * suplementos, ni la política de cancelación.
 *
 * La fuente es el mismo documento que Oravia usa para cargar el inventario, y
 * el texto se guarda con la MISMA forma que le da el importador —«[TIPO] texto»
 * unido por « | »— para que el documento se pruebe contra lo que de verdad hay
 * en el servidor, no contra una versión bonita inventada aquí.
 *
 * Es una muleta para poder probar en local. Cuando el servidor lleve el cambio
 * del catálogo, `espejar-catalogo.mjs` traerá los campos y este script sobra.
 *
 *   node --import tsx scripts/completar-condiciones-del-espejo.mjs
 */
import "../server/loadEnv.ts";
import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

const prisma = new PrismaClient();

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("Esto solo escribe en la base LOCAL. DATABASE_URL apunta a otro sitio.");
  process.exit(1);
}

const FUENTE = "Tarifas 26-27 Oravia/TARIFES REVISADES HOTELS 2027.xlsx";

/** Columna del Excel → etiqueta con la que el importador guarda la condición. */
const CONDICIONES = [
  ["Suplementos", "SUPLEMENTO"],
  ["Tasa turística condiciones", "TASA"],
  ["Bebidas incluidas (Sí/No)", "BEBIDAS"],
  ["Depósitos", "DEPOSITO"],
  ["Release (%)", "RELEASE"],
  ["Edad", "EDAD"],
  ["Ocupación (nº)", "OCUPACION"],
  ["Mínimo plazas a pagar", "MINIMO"],
  ["Ratio monitores", "RATIO"],
  ["Cancelación <30 (%)", "CANCELACION"],
  ["Modificaciones", "MODIFICACION"],
];

/** Compara nombres de hotel sin que una tilde o un asterisco los separe. */
const comparable = (nombre) =>
  String(nombre ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const libro = XLSX.readFile(FUENTE);
const filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { defval: "" });

// Un hotel aparece una vez por tarifa; las condiciones son las mismas en todas,
// así que vale la primera fila que traiga algo.
const delExcel = new Map();
for (const fila of filas) {
  const nombre = String(fila["Nombre de Hotel"] ?? "").trim();
  if (!nombre) continue;

  const clave = comparable(nombre);
  if (delExcel.has(clave)) continue;

  const trozos = [];
  for (const [columna, etiqueta] of CONDICIONES) {
    const valor = String(fila[columna] ?? "").trim();
    if (valor) trozos.push(`[${etiqueta}] ${valor}`);
  }

  delExcel.set(clave, {
    nombre,
    conditionsText: trozos.join(" | ") || null,
    observations: String(fila["Observaciones/Condiciones"] ?? "").trim() || null,
    freePolicy: String(fila["Descuento"] ?? "").trim() || null,
  });
}

console.log(`${delExcel.size} hoteles con condiciones en «${FUENTE}».`);

const alojamientos = await prisma.accommodation.findMany({
  select: { id: true, accommodationName: true },
});

let rellenados = 0;
const sinPareja = [];

for (const alojamiento of alojamientos) {
  const clave = comparable(alojamiento.accommodationName);
  // Exacto primero; si no, el que empiece igual: en el catálogo hay nombres
  // recortados respecto al Excel, y al revés.
  const dato =
    delExcel.get(clave) ??
    [...delExcel.entries()].find(([k]) => k.startsWith(clave) || clave.startsWith(k))?.[1];

  if (!dato) {
    sinPareja.push(alojamiento.accommodationName);
    continue;
  }

  await prisma.accommodation.update({
    where: { id: alojamiento.id },
    data: {
      conditionsText: dato.conditionsText,
      observations: dato.observations,
      freePolicy: dato.freePolicy,
    },
  });
  rellenados += 1;
}

console.log();
console.log(`Rellenados: ${rellenados} de ${alojamientos.length} alojamientos.`);
if (sinPareja.length > 0) {
  console.log(`Sin pareja en el Excel (${sinPareja.length}):`);
  for (const nombre of sinPareja) console.log(`  · ${nombre}`);
}

await prisma.$disconnect();
