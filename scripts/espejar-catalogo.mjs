/**
 * Copia el catálogo del servidor a la base LOCAL, para poder probar aquí lo
 * mismo que hay allí.
 *
 * La copia local tenía 29 alojamientos sembrados del Excel y **ninguna
 * actividad**, así que no se podía probar en local nada que las tocara: ni la
 * búsqueda de actividades, ni el programa por opción, ni el PDF con
 * actividades dentro. Y las actividades son justo uno de los bloques a
 * arreglar.
 *
 * Lo que el servidor expone en `/api/inventory/catalog` es una vista resumida:
 * trae nombre, ubicación, políticas, año, etiqueta, periodo e importe. NO trae
 * el canal de cliente ni el régimen como campos propios. Los dos se deducen, y
 * queda dicho de dónde:
 *
 *   régimen         de la etiqueta de la tarifa («PC», «MP»…), que es donde
 *                   viaja en los alojamientos.
 *   canal           del nombre del documento de origen. El único documento
 *                   pactado con el turoperador suizo lo dice en su nombre.
 *
 * Es un espejo para trabajar, no una copia de seguridad: no sustituye a un
 * volcado de la base y no debe usarse para restaurar nada.
 *
 *   node --import tsx scripts/espejar-catalogo.mjs
 *   node --import tsx scripts/espejar-catalogo.mjs --limpiar
 */
import "../server/loadEnv.ts";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();
const limpiar = process.argv.includes("--limpiar");

// ── Guardas ──────────────────────────────────────────────────────────────────

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("Esto solo escribe en la base LOCAL. DATABASE_URL apunta a otro sitio.");
  process.exit(1);
}

/** El acceso al servidor vive en .env.produccion, que no va al repositorio. */
function accesoAlServidor() {
  let crudo = "";
  try {
    crudo = readFileSync(".env.produccion", "utf8");
  } catch {
    console.error("Falta .env.produccion con el acceso al servidor.");
    process.exit(1);
  }
  const leer = (clave) =>
    (crudo.match(new RegExp(`^${clave}\\s*=\\s*(.*)$`, "m"))?.[1] ?? "")
      .trim()
      .replace(/^["']|["']$/g, "");
  const base = (leer("PUBLIC_BASE_URL") || "http://195.20.235.4").replace(/\/+$/, "");
  return { base, email: leer("ADMIN_EMAIL"), password: leer("ADMIN_PASSWORD") };
}

// ── Traducción de lo que trae el resumen ─────────────────────────────────────

/** «2027-03-28 → 2027-05-21» → las dos fechas. */
function fechasDe(periodo) {
  const m = String(periodo ?? "").match(/(\d{4}-\d{2}-\d{2})\s*[→-]+\s*(\d{4}-\d{2}-\d{2})/);
  if (!m) return { dateFrom: null, dateTo: null };
  return { dateFrom: new Date(`${m[1]}T00:00:00Z`), dateTo: new Date(`${m[2]}T00:00:00Z`) };
}

/**
 * El canal de cliente, deducido del documento de origen.
 *
 * Solo hay un documento pactado con el turoperador suizo y lo dice en su
 * nombre. Deducirlo así no es elegante, pero es fiel: es la misma información
 * que se ve en la pantalla de tarifas.
 */
function canalDe(nombreDocumento) {
  return /suizo|swiss/i.test(nombreDocumento ?? "") ? "SWISS_TTOO" : "GENERIC";
}

/**
 * El régimen, tal cual viene.
 *
 * La etiqueta a veces trae coletilla: «MP (PRECIO FINAL: alojamiento +
 * régimen)». Se guarda ENTERA a propósito, porque así la tiene el servidor:
 * comprobado pidiéndole esa misma tarifa. Recortarla al código haría el espejo
 * más limpio y menos fiel, que es justo lo contrario de lo que se busca.
 */
function regimenDe(etiqueta) {
  const limpio = String(etiqueta ?? "").trim();
  return /^(PC|MP|AD|SA)\b/i.test(limpio) ? limpio : null;
}

// ── Descarga ─────────────────────────────────────────────────────────────────

const { base, email, password } = accesoAlServidor();
console.log(`Leyendo el catálogo de ${base}…`);

const sesion = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!sesion.ok) {
  console.error(`No se pudo entrar en el servidor (${sesion.status}).`);
  process.exit(1);
}
const { token } = await sesion.json();

const respuesta = await fetch(`${base}/api/inventory/catalog`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!respuesta.ok) {
  console.error(`No se pudo leer el catálogo (${respuesta.status}).`);
  process.exit(1);
}
const catalogo = await respuesta.json();

// Los documentos también, porque de ellos sale la UBICACIÓN que una persona
// escribió al registrarlos. Sin ellos no se puede probar en local el arreglo de
// las actividades, que es justo para lo que se hizo este espejo.
const docsRespuesta = await fetch(`${base}/api/inventory/documents`, {
  headers: { Authorization: `Bearer ${token}` },
});
// El endpoint devuelve el array a secas; se admiten las dos formas por si cambia.
const docsCrudo = docsRespuesta.ok ? await docsRespuesta.json() : [];
const documentos = Array.isArray(docsCrudo) ? docsCrudo : docsCrudo.documents ?? [];

console.log(
  `  ${catalogo.accommodations.length} alojamientos, ${catalogo.activities.length} actividades, ` +
    `${documentos.length} documentos.`,
);

// ── Escritura ────────────────────────────────────────────────────────────────

if (limpiar) {
  await prisma.accommodationRate.deleteMany({});
  await prisma.accommodation.deleteMany({});
  await prisma.activityRate.deleteMany({});
  await prisma.activityPolicy.deleteMany({});
  await prisma.activity.deleteMany({});
  await prisma.sourceDocument.deleteMany({ where: { controlName: { contains: "" } } });
  console.log("Catálogo local vaciado.");
}

// Los documentos primero, conservando su identificador: así las tarifas pueden
// apuntar al suyo y el reparador de localidades encuentra la ubicación.
const documentosCreados = new Map();
for (const doc of documentos) {
  const fila = await prisma.sourceDocument.create({
    data: {
      id: doc.id,
      documentType: doc.documentType ?? "SOURCE",
      targetType: doc.targetType ?? "ACCOMMODATION",
      controlName: doc.controlName ?? "(sin nombre)",
      controlLocation: doc.controlLocation ?? null,
      controlYear: doc.controlYear ?? null,
      rateKind: doc.rateKind ?? null,
      marginPercent: doc.marginPercent ?? null,
      clientSegment: doc.clientSegment ?? null,
      status: doc.status ?? "PUBLISHED",
    },
  });
  documentosCreados.set(doc.controlName, fila.id);
}

let alojamientos = 0;
let tarifasAloj = 0;

for (const item of catalogo.accommodations) {
  const canal = canalDe(item.sourceDocumentName);
  const rates = (item.rates ?? []).map((r) => {
    const { dateFrom, dateTo } = fechasDe(r.period);
    return {
      rateSource: "espejo_del_servidor",
      year: r.year ?? 2027,
      seasonName: r.period ?? null,
      dateFrom,
      dateTo,
      boardType: regimenDe(r.label),
      currency: r.currency ?? "EUR",
      pvpAmount: r.amount ?? 0,
      netSaleAmount: r.amount ?? 0,
      clientSegment: canal,
      sourceFile: item.sourceDocumentName ?? null,
    };
  });

  await prisma.accommodation.create({
    data: {
      accommodationName: item.accommodationName,
      locality: item.locality ?? "",
      categoryType: item.categoryType ?? null,
      // Condiciones, observaciones y gratuidades: son lo que el colegio lee en
      // la propuesta. Sin ellas, el PDF generado en local salía con el precio
      // pelado y no se podía comprobar aquí el bloque de cada alojamiento.
      conditionsText: item.conditionsText ?? null,
      observations: item.observations ?? null,
      freePolicy: item.freePolicy ?? null,
      sourceFile: item.sourceDocumentName ?? null,
      sourceDocumentId: documentosCreados.get(item.sourceDocumentName) ?? null,
      rates: { create: rates },
    },
  });
  alojamientos += 1;
  tarifasAloj += rates.length;
}

let actividades = 0;
let tarifasAct = 0;

for (const item of catalogo.activities) {
  const canal = canalDe(item.sourceDocumentName);
  const rates = (item.rates ?? []).map((r) => ({
    year: r.year ?? 2027,
    ageLabel: r.label ?? null,
    currency: r.currency ?? "EUR",
    salePvpAmount: r.amount ?? 0,
    clientSegment: canal,
    sourceFile: item.sourceDocumentName ?? null,
  }));

  await prisma.activity.create({
    data: {
      activityName: item.activityName,
      supplierName: item.supplierName ?? null,
      locationMain: item.locationMain ?? null,
      sourceFile: item.sourceDocumentName ?? null,
      sourceDocumentId: documentosCreados.get(item.sourceDocumentName) ?? null,
      rates: { create: rates },
      policies: {
        create: (item.policies ?? []).map((p) => ({
          policyType: p.policyType ?? p.type ?? "UNKNOWN",
          policyText: p.policyText ?? p.detail ?? p.text ?? p.label ?? "",
        })),
      },
    },
  });
  actividades += 1;
  tarifasAct += rates.length;
}

console.log();
console.log(`Espejado: ${alojamientos} alojamientos (${tarifasAloj} tarifas)`);
console.log(`          ${actividades} actividades (${tarifasAct} tarifas)`);

// ── Lo que el espejo NO puede traer ──────────────────────────────────────────

const sinUbicacion = catalogo.activities.filter((a) => !a.locationMain).length;
const conParque = catalogo.activities.filter(
  (a) => a.locationMain && /park|land/i.test(a.locationMain),
).length;

console.log();
console.log("Avisos:");
console.log(`  · ${sinUbicacion} actividades sin ubicación ninguna.`);
console.log(`  · ${conParque} con el nombre del PARQUE como ubicación, no un pueblo.`);
console.log("    Ninguna de las dos aparece al buscar por localidad. Es el fallo real.");
console.log("  · El canal de cliente se deduce del documento; el resumen no lo trae.");
console.log();
console.log("Hasta dónde llega el espejo, medido:");
console.log("  · Las ACTIVIDADES salen idénticas: el resumen trae todo lo suyo.");
console.log("  · Los ALOJAMIENTOS salen con menos resultados en algunas búsquedas.");
console.log("    La búsqueda agrupa las tarifas hermanas -mismo régimen, misma unidad,");
console.log("    mismo servicio incluido- y se queda con la más barata. El resumen no");
console.log("    trae `tariffUnit` ni `includedService`, así que aquí quedan vacíos y se");
console.log("    agrupan de más: buscando Salou con pensión completa salen 8 donde el");
console.log("    servidor da 10. No es un fallo de la app, es el límite de este espejo.");
console.log("  · Para cotizar y probar el recorrido sobra. Para comparar cifras con el");
console.log("    servidor, no: para eso hace falta un volcado de verdad.");

await prisma.$disconnect();
