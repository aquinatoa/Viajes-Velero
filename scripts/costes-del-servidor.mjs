/**
 * Pone en las tarifas de la base LOCAL el coste que tienen en el servidor.
 *
 * El espejo (`espejar-catalogo.mjs`) se construía desde el resumen del
 * catálogo, que trae un solo importe, y lo guardaba como venta Y como coste:
 * en local todas las tarifas salían con margen 0 y el CRM recibía coste =
 * venta (13/10/2026). Volver a espejar con --limpiar borraría lo publicado en
 * local, así que esto solo rellena el coste de lo que ya hay.
 *
 * Aplica la misma regla que la migración `20261013120000_coste_desde_azul_marino`:
 * el coste es el del servidor y, si allí sigue en «neto azul marino» (documento
 * de venta, coste vacío, azul menor que la venta), se toma de ahí. Si el
 * servidor no sabe el coste, aquí queda vacío: mejor sin coste que inventado.
 *
 *   node --import tsx scripts/costes-del-servidor.mjs          (dice qué haría)
 *   node --import tsx scripts/costes-del-servidor.mjs --aplicar
 */
import "../server/loadEnv.ts";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();
const aplicar = process.argv.includes("--aplicar");

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("Esto solo escribe en la base LOCAL. DATABASE_URL apunta a otro sitio.");
  process.exit(1);
}

const crudo = readFileSync(".env.produccion", "utf8");
const leer = (clave) =>
  (crudo.match(new RegExp(`^${clave}\\s*=\\s*(.*)$`, "m"))?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
const base = (leer("PUBLIC_BASE_URL") || "http://195.20.235.4").replace(/\/+$/, "");

const sesion = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: leer("ADMIN_EMAIL"), password: leer("ADMIN_PASSWORD") }),
});
if (!sesion.ok) {
  console.error(`No se pudo entrar en el servidor (${sesion.status}).`);
  process.exit(1);
}
const { token } = await sesion.json();
const H = { Authorization: `Bearer ${token}` };

const docs = await (await fetch(`${base}/api/inventory/documents`, { headers: H })).json();
const lista = Array.isArray(docs) ? docs : docs.documents ?? [];

const dia = (v) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : "");
const cent = (v) => (v === null || v === undefined ? "" : String(Math.round(Number(v) * 100)));
const clave = (nombre, r) => [nombre, r.boardType ?? "", r.seasonName ?? "", dia(r.dateFrom), dia(r.dateTo), cent(r.pvpAmount)].join("|");

/** clave → costes distintos que da el servidor para esa clave. */
const costes = new Map();
for (const doc of lista.filter((d) => d.status === "PUBLISHED" && d.targetType !== "ACTIVITY")) {
  const pub = await (await fetch(`${base}/api/inventory/documents/${doc.id}/published`, { headers: H })).json();
  for (const a of pub.accommodations ?? []) {
    for (const r of a.rates ?? []) {
      let coste = r.netSaleAmount ?? null;
      const azul = r.netAzulmarinoAmount;
      if (coste === null && doc.rateKind === "SALE" && azul > 0 && r.pvpAmount !== null && azul < r.pvpAmount) coste = azul;
      const k = clave(a.accommodationName, r);
      if (!costes.has(k)) costes.set(k, new Set());
      costes.get(k).add(coste === null ? "" : cent(coste));
    }
  }
}

const locales = await prisma.accommodationRate.findMany({
  where: { rateSource: "espejo_del_servidor" },
  include: { accommodation: { select: { accommodationName: true } } },
});

let conCoste = 0;
let sinCoste = 0;
let sinPareja = 0;
let dudosas = 0;
const cambios = [];
for (const r of locales) {
  const encontrados = costes.get(clave(r.accommodation.accommodationName, r));
  if (!encontrados) {
    sinPareja += 1;
    cambios.push({ id: r.id, coste: null });
    continue;
  }
  if (encontrados.size !== 1) {
    dudosas += 1;
    cambios.push({ id: r.id, coste: null });
    continue;
  }
  const [c] = [...encontrados];
  if (c === "") sinCoste += 1;
  else conCoste += 1;
  cambios.push({ id: r.id, coste: c === "" ? null : Number(c) / 100 });
}

console.log(`${locales.length} tarifas locales del espejo:`);
console.log(`  ${conCoste} con coste del servidor`);
console.log(`  ${sinCoste} que el servidor no sabe lo que cuestan (quedan sin coste)`);
console.log(`  ${sinPareja} sin pareja en el servidor y ${dudosas} con costes distintos (quedan sin coste)`);

if (!aplicar) {
  console.log("\nNo se ha escrito nada. Para aplicarlo: --aplicar");
} else {
  for (const c of cambios) {
    await prisma.accommodationRate.update({
      where: { id: c.id },
      data: { netSaleAmount: c.coste, netAzulmarinoAmount: null },
    });
  }
  console.log(`\nAplicado a ${cambios.length} tarifas.`);
}
await prisma.$disconnect();
