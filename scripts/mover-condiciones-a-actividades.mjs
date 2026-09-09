/**
 * Recoloca las condiciones de un documento de SOLO actividades.
 *
 * Para documentos publicados antes de que existiera `ActivityPolicy`. Entonces
 * las condiciones generales iban a un alojamiento inventado con el nombre del
 * documento, y en el catálogo aparecía un «hotel» con cero tarifas: en
 * producción, «PortAventura · Entradas grupos parques 2027» con las quince
 * condiciones colgando, incluidas las gratuidades, que cambian el precio de un
 * presupuesto.
 *
 * Copia esas condiciones a cada actividad —en staging y en lo publicado— y
 * retira el alojamiento falso. No vuelve a llamar a la IA: los datos ya están
 * leídos y son correctos; lo único que estaba mal era de quién colgaban.
 *
 *   node scripts/mover-condiciones-a-actividades.mjs <idDocumento>
 *   node scripts/mover-condiciones-a-actividades.mjs <idDocumento> --aplicar
 *
 * Sin `--aplicar` solo dice lo que haría.
 */
import "../server/loadEnv.ts";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const documentId = process.argv[2];
const aplicar = process.argv.includes("--aplicar");

if (!documentId) {
  console.error("Falta el id del documento.\n  node scripts/mover-condiciones-a-actividades.mjs <idDocumento> [--aplicar]");
  process.exit(1);
}

function abortar(mensaje) {
  console.error(`\n${mensaje}`);
  process.exit(1);
}

const documento = await prisma.sourceDocument.findUnique({
  where: { id: documentId },
  select: { id: true, controlName: true, targetType: true, status: true, controlLocation: true },
});
if (!documento) abortar(`No existe el documento ${documentId}.`);

console.log(`Documento: «${documento.controlName}» · ${documento.targetType} · ${documento.status}`);

const ubicacion = (documento.controlLocation ?? "").trim();
const sinUbicacion = await prisma.activity.count({
  where: { sourceDocumentId: documentId, OR: [{ locationMain: null }, { locationMain: "" }] },
});
if (sinUbicacion > 0) {
  console.log(
    ubicacion
      ? `Actividades sin ubicación: ${sinUbicacion} — se les pondrá «${ubicacion}»`
      : `Actividades sin ubicación: ${sinUbicacion} — y el documento tampoco la tiene. Ponla en la ficha antes de seguir: sin ella no aparecen al cotizar.`,
  );
}

const alojamientos = await prisma.stagingAccommodation.findMany({
  where: { sourceDocumentId: documentId },
  include: { rates: true, policies: true },
});
const actividades = await prisma.stagingActivity.findMany({
  where: { sourceDocumentId: documentId },
  include: { policies: true },
});

if (actividades.length === 0) {
  abortar("El documento no tiene actividades. Este script solo sirve para documentos de actividades.");
}

// Solo el alojamiento que es en realidad el documento: sin tarifas propias.
const falsos = alojamientos.filter((a) => a.rates.length === 0);
const conTarifas = alojamientos.filter((a) => a.rates.length > 0);

if (conTarifas.length > 0) {
  abortar(
    `Hay ${conTarifas.length} alojamiento(s) CON tarifas propias. Este documento no es solo de actividades y hay que mirarlo a mano.`,
  );
}
// Puede no haber nada que recolocar y aun así faltar la ubicación: son dos
// arreglos independientes y el script hace el que haga falta.
if (falsos.length === 0 && sinUbicacion === 0) {
  console.log("\nNada que recolocar y ninguna actividad sin ubicación: no hay nada que hacer.");
  await prisma.$disconnect();
  process.exit(0);
}
if (falsos.length === 0) {
  console.log("\nNingún alojamiento sin tarifas: solo hay que reparar la ubicación.");
}

const condiciones = falsos.flatMap((a) => a.policies);
const yaTienen = actividades.filter((a) => a.policies.length > 0).length;

console.log(`\nAlojamiento(s) a retirar: ${falsos.map((a) => `«${a.accommodationName}»`).join(", ")}`);
console.log(`Condiciones a recolocar : ${condiciones.length}`);
console.log(`Actividades destino     : ${actividades.length}${yaTienen > 0 ? ` (${yaTienen} ya tienen condiciones)` : ""}`);
for (const c of condiciones) {
  console.log(`   [${c.policyType}] ${String(c.policyText).slice(0, 90)}`);
}

const publicadas = await prisma.activity.findMany({
  where: { sourceDocumentId: documentId },
  select: { id: true, activityName: true },
});
const alojPublicados = await prisma.accommodation.findMany({
  where: { sourceDocumentId: documentId },
  include: { rates: { select: { id: true } } },
});
const alojPublicadosFalsos = alojPublicados.filter((a) => a.rates.length === 0);

console.log(`\nEn el catálogo: ${publicadas.length} actividad(es) publicada(s), ${alojPublicadosFalsos.length} alojamiento(s) falso(s) a borrar`);

if (!aplicar) {
  console.log("\n(ensayo — no se ha tocado nada. Repite con --aplicar)");
  await prisma.$disconnect();
  process.exit(0);
}

await prisma.$transaction(async (tx) => {
  // 1 · staging: cada actividad se queda con las condiciones, si no las tiene ya.
  for (const actividad of actividades) {
    if (actividad.policies.length > 0) continue;
    await tx.stagingActivityPolicy.createMany({
      data: condiciones.map((c) => ({
        stagingActivityId: actividad.id,
        policyType: c.policyType,
        policyText: c.policyText,
        structuredJson: c.structuredJson ?? undefined,
        confidenceScore: c.confidenceScore,
        requiresReview: false,
        // Se dan por revisadas: son las mismas que ya se aprobaron en el
        // alojamiento falso, no hay nada nuevo que mirar.
        reviewStatus: c.reviewStatus,
      })),
    });
  }

  // 2 · catálogo: lo mismo sobre lo ya publicado.
  const aprobadas = condiciones.filter((c) => c.reviewStatus === "APPROVED");
  for (const actividad of publicadas) {
    const tiene = await tx.activityPolicy.count({ where: { activityId: actividad.id } });
    if (tiene > 0) continue;
    await tx.activityPolicy.createMany({
      data: aprobadas.map((c) => ({
        activityId: actividad.id,
        policyType: c.policyType,
        policyText: c.policyText,
        sourceDocumentId: documentId,
        sourceStagingId: c.id,
      })),
    });
  }

  // 3 · ubicación: sin ella la actividad es inencontrable al cotizar, porque la
  // búsqueda puntúa por ubicación y sin coincidencia no pasa el umbral.
  if (ubicacion) {
    await tx.activity.updateMany({
      where: { sourceDocumentId: documentId, OR: [{ locationMain: null }, { locationMain: "" }] },
      data: { locationMain: ubicacion },
    });
  }

  // 4 · fuera el alojamiento que no existe, del catálogo y del staging.
  for (const a of alojPublicadosFalsos) {
    await tx.accommodation.delete({ where: { id: a.id } });
  }
  for (const a of falsos) {
    await tx.stagingAccommodation.delete({ where: { id: a.id } });
  }
});

const comprobacion = await prisma.activity.findMany({
  where: { sourceDocumentId: documentId },
  include: { policies: { select: { id: true } } },
});
console.log("\nHecho:");
for (const a of comprobacion) {
  console.log(`   ${String(a.policies.length).padStart(3)} condiciones · ${a.activityName}`);
}
const quedan = await prisma.accommodation.count({ where: { sourceDocumentId: documentId } });
console.log(`   alojamientos del documento en el catálogo: ${quedan}`);

await prisma.$disconnect();
