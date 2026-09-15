/**
 * Siembra el catálogo local desde el maestro de hoteles, sin pasar por la IA.
 *
 * Para probar la búsqueda y la cotización hace falta catálogo, y volver a leer
 * los documentos con IA cuesta dinero y veinte minutos cada vez que se recrea la
 * base local. El Excel ya está normalizado —tiene la columna `neto venta`
 * calculada—, así que se puede volcar tal cual y de forma repetible.
 *
 * Esto NO sustituye a la lectura con IA ni prueba el módulo documental: es un
 * atajo para tener datos realistas con los que ejercitar lo que viene después.
 *
 *   node --import tsx scripts/sembrar-catalogo-local.mjs
 *   node --import tsx scripts/sembrar-catalogo-local.mjs --limpiar
 */
import "../server/loadEnv.ts";
import { PrismaClient } from "@prisma/client";
import XLSXModule from "xlsx";

const XLSX = XLSXModule;
const prisma = new PrismaClient();

const EXCEL = "Tarifas 26-27 Oravia/TARIFES REVISADES HOTELS 2027.xlsx";
const limpiar = process.argv.includes("--limpiar");

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("Esto solo se ejecuta contra la base LOCAL. DATABASE_URL apunta a otro sitio.");
  process.exit(1);
}

function texto(v) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}
function numero(v) {
  // Los importes vienen formateados de la hoja: " 30.46 € ". Se quita todo lo
  // que no sea cifra o separador antes de convertir.
  const limpio = String(v ?? "")
    .replace(/[^\d.,-]/g, "")
    .replace(/\.(?=\d{3})/g, "")
    .replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 ? n : null;
}
/**
 * La localidad, sacada del nombre del hotel como lo hace la IA en produccion.
 *
 * Hay dos formas en el maestro de Oravia:
 *   «Hotel Planas 3* (Salou)»                    -> el parentesis
 *   «4R Hotels 3* - Salou & Calafell (Salou Park Resort II / ...)»
 *                                                -> lo que hay tras el guion,
 *                                                   porque el parentesis lista
 *                                                   establecimientos, no sitios
 */
function localidadDe(nombre) {
  const trasGuion = nombre.match(/[–-]\s*([^(–-]+?)\s*\(/);
  if (trasGuion) {
    const posible = trasGuion[1].trim();
    // Un nombre de establecimiento suele llevar cifras o palabras de marca.
    if (posible && posible.length <= 30 && !/\d/.test(posible)) {
      return posible.replace(/\s*&\s*/g, " / ");
    }
  }
  const parentesis = nombre.match(/\(([^)]+)\)/);
  if (!parentesis) return "";
  const dentro = parentesis[1].trim();
  // «Salou Park Resort II / Playa Park / Miramar Calafell» son hoteles, no sitios.
  if (dentro.length > 30) return "";
  return dentro.split(",")[0].trim();
}
function categoriaDe(nombre) {
  const m = nombre.match(/(\d)\*/);
  return m ? `${m[1]}*` : null;
}
/** «28/03/2027–21/05/2027 · 3 noches o más» → las dos fechas. */
function fechasDe(periodo) {
  const m = periodo.match(/(\d{2})\/(\d{2})\/(\d{4})\s*[–-]\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return { dateFrom: null, dateTo: null, year: null };
  const desde = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const hasta = new Date(Date.UTC(+m[6], +m[5] - 1, +m[4]));
  return { dateFrom: desde, dateTo: hasta, year: +m[3] };
}
function minimoNoches(periodo) {
  const mas = periodo.match(/(\d+)\s*noches?\s*o\s*m[áa]s/i);
  if (mas) return +mas[1];
  const exacto = periodo.match(/·\s*(\d+)\s*noches?/i);
  return exacto ? +exacto[1] : null;
}

if (limpiar) {
  await prisma.accommodationRate.deleteMany({});
  await prisma.accommodation.deleteMany({});
  console.log("Catálogo de alojamientos vaciado.");
}

const libro = XLSX.readFile(EXCEL, { raw: false });
const filas = XLSX.utils.sheet_to_json(libro.Sheets["Tarifas"], { defval: "", raw: false });

const porHotel = new Map();
for (const fila of filas) {
  const nombre = texto(fila["Nombre de Hotel"]);
  if (!nombre) continue;

  const periodo = texto(fila["Periodo"]);
  const { dateFrom, dateTo, year } = fechasDe(periodo);
  // El precio de venta ya viene calculado en la hoja; el coste se guarda aparte
  // para que el comercial pueda ver el margen.
  const venta = numero(fila["neto venta"]);
  const coste = numero(fila["Cost"]);
  if (venta === null) continue;

  if (!porHotel.has(nombre)) {
    porHotel.set(nombre, {
      accommodationName: nombre,
      locality: localidadDe(nombre),
      categoryType: categoriaDe(nombre),
      accommodationType: texto(fila["Tipo de alojamiento"]) || null,
      observations: texto(fila["Observaciones/Condiciones"]) || null,
      conditionsText: texto(fila["Suplementos"]) || null,
      freePolicy: texto(fila["Descuento"]) || null,
      sourceFile: EXCEL,
      rates: [],
    });
  }

  porHotel.get(nombre).rates.push({
    rateSource: "sembrado_local",
    year: year ?? 2027,
    seasonName: texto(fila["Temporada"]) || periodo || null,
    dateFrom,
    dateTo,
    minNights: minimoNoches(periodo),
    boardType: texto(fila["Régimen (MP o PC)"]) || null,
    tariffUnit: texto(fila["Unidad de tarifa"]) || null,
    occupancyLabel: texto(fila["Habitación (Múltiples/Dobles/Individual)"]) || null,
    currency: "EUR",
    pvpAmount: venta,
    netSaleAmount: venta,
    // Igual que en producción: se publicó como «cualquier cliente».
    clientSegment: "GENERIC",
    sourceFile: EXCEL,
    sourceSheet: "Tarifas",
  });
}

let hoteles = 0;
let tarifas = 0;
for (const hotel of porHotel.values()) {
  const { rates, ...datos } = hotel;
  await prisma.accommodation.create({ data: { ...datos, rates: { create: rates } } });
  hoteles += 1;
  tarifas += rates.length;
}

console.log(`Sembrados ${hoteles} alojamientos y ${tarifas} tarifas desde el Excel.`);

const porLocalidad = new Map();
for (const hotel of porHotel.values()) {
  const clave = hotel.locality || "(sin localidad)";
  porLocalidad.set(clave, (porLocalidad.get(clave) ?? 0) + 1);
}
console.log("\nPor localidad:");
for (const [loc, n] of [...porLocalidad].sort((a, b) => b[1] - a[1])) {
  console.log(`   ${String(n).padStart(3)} · ${loc}`);
}

await prisma.$disconnect();
