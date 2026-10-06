/**
 * Saca de producción la referencia para evaluar lecturas: por cada documento
 * PUBLICADO, el texto extraído tal como lo vio el modelo y las tarifas que
 * acabaron en el catálogo tras revisión humana.
 *
 *   node scripts/lectura/exportar-referencia.mjs
 *
 * Escribe `tests/fixtures/lectura/<id>.json` y un `indice.json`. Esa carpeta
 * está en .gitignore a propósito: son las tarifas reales de Oravia y no van al
 * repositorio. Se regenera cuando haga falta con este mismo script.
 *
 * Solo lee: entra con el administrador de `.env.produccion` y usa las rutas
 * GET de la API. No toca nada en el servidor.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const destino = path.join(raiz, "tests", "fixtures", "lectura");

function leerEnv(fichero) {
  const ruta = path.join(raiz, fichero);
  if (!fs.existsSync(ruta)) return {};
  const v = {};
  for (const linea of fs.readFileSync(ruta, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let valor = m[2].trim();
    while (valor.length >= 2 && valor.startsWith('"') && valor.endsWith('"')) valor = valor.slice(1, -1);
    v[m[1]] = valor;
  }
  return v;
}

const prod = leerEnv(".env.produccion");
const base = (prod.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
if (!base || !prod.ADMIN_EMAIL || !prod.ADMIN_PASSWORD) {
  console.error("Faltan PUBLIC_BASE_URL, ADMIN_EMAIL o ADMIN_PASSWORD en .env.produccion");
  process.exit(1);
}

async function json(ruta, init) {
  const r = await fetch(base + ruta, init);
  if (!r.ok) throw new Error(`${ruta} -> HTTP ${r.status}`);
  return r.json();
}

const login = await json("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: prod.ADMIN_EMAIL, password: prod.ADMIN_PASSWORD }),
});
const cab = { Authorization: `Bearer ${login.token}` };

const catalogo = await json("/api/inventory/catalog", { headers: cab });
const documentos = await json("/api/inventory/documents", { headers: cab });
const lista = Array.isArray(documentos) ? documentos : documentos.documents ?? documentos.data ?? [];

fs.mkdirSync(destino, { recursive: true });
const indice = [];

for (const d of lista) {
  if (d.status !== "PUBLISHED") continue;
  const detalle = await json(`/api/inventory/documents/${d.id}`, { headers: cab });
  const extraccion = (detalle.extractions ?? []).find(
    (e) => (e.extractionMethod === "TEXT" || e.extractionMethod === "OCR") && (e.rawText ?? "").trim(),
  );
  if (!extraccion) {
    console.log(`  (sin texto extraído) ${d.controlName ?? d.originalFileName}`);
    continue;
  }

  const referencia = [];
  for (const a of catalogo.accommodations ?? []) {
    if (a.sourceDocumentId !== d.id) continue;
    for (const r of a.rates ?? []) {
      if (typeof r.amount !== "number") continue;
      referencia.push({ producto: a.accommodationName, tipo: "ACCOMMODATION", etiqueta: r.label ?? null, periodo: r.period ?? null, importe: r.amount });
    }
  }
  for (const a of catalogo.activities ?? []) {
    if (a.sourceDocumentId !== d.id) continue;
    for (const r of a.rates ?? []) {
      if (typeof r.amount !== "number") continue;
      referencia.push({ producto: a.activityName, tipo: "ACTIVITY", etiqueta: r.label ?? null, periodo: r.period ?? null, importe: r.amount });
    }
  }

  const fixture = {
    id: d.id,
    nombre: detalle.controlName ?? detalle.originalFileName,
    originalFileName: detalle.originalFileName,
    fileMimeType: detalle.fileMimeType,
    targetType: detalle.targetType,
    context: {
      targetType: detalle.targetType,
      controlName: detalle.controlName,
      controlLocation: detalle.controlLocation,
      controlYear: detalle.controlYear,
      controlCategory: detalle.controlCategory,
    },
    texto: extraccion.rawText,
    referencia,
    exportadoEn: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(destino, `${d.id}.json`), JSON.stringify(fixture, null, 2), "utf8");
  indice.push({ id: d.id, nombre: fixture.nombre, fichero: detalle.originalFileName, mime: detalle.fileMimeType, tarifas: referencia.length, caracteres: fixture.texto.length });
  console.log(`  ${fixture.nombre}: ${referencia.length} tarifas de referencia, ${fixture.texto.length} caracteres`);
}

fs.writeFileSync(path.join(destino, "indice.json"), JSON.stringify(indice, null, 2), "utf8");
console.log(`\n${indice.length} documento(s) en ${path.relative(raiz, destino)}`);
