/**
 * Pone cada trato de Zoho en la fase que le toca según lo que dice la app.
 *
 * Los tratos creados hasta ahora nacieron con la fase «Nueva», que no existe en
 * el embudo de Oravia, y no se movían nunca más. El código nuevo ya los coloca
 * bien a medida que pasan cosas, pero un trato cuya propuesta se envió la
 * semana pasada no va a recibir ningún aviso nuevo: se queda ahí.
 *
 * Esto lo arregla de una vez, mirando el estado real de cada entrega:
 *
 *   depósito cobrado      → Oportunidad Ganada
 *   opción elegida        → Pendiente de deposito
 *   la abrió el colegio   → Seguimiento al Presupuesto
 *   enviada               → Presupuesto Enviado
 *   preparada, sin enviar → Preparando Presupuesto
 *
 * Respeta las dos reglas de siempre: no mueve hacia atrás y no toca lo que una
 * persona aparcó en «Oportunidad Perdida» o «Lista de Espera».
 *
 *   node --import tsx scripts/alinear-fases-crm.mjs            (ensayo en seco)
 *   node --import tsx scripts/alinear-fases-crm.mjs --aplicar
 */
import "../server/loadEnv.ts";
import { PrismaClient } from "@prisma/client";
import { decidirFase, FASE_DE_HITO } from "../server/crmPipeline.ts";
import { getZohoDealStage, updateZohoDeal } from "../server/zoho.ts";

const prisma = new PrismaClient();
const aplicar = process.argv.includes("--aplicar");

/** En qué punto está esta solicitud, según lo que la app sabe de verdad. */
function hitoDe(entrega) {
  if (!entrega) return "presupuesto_preparado";
  if (entrega.depositPaidAt) return "deposito_cobrado";
  if (entrega.chosenOptionNumber) return "opcion_elegida";
  if (entrega.firstViewedAt) return "presupuesto_visto";
  if (entrega.status === "SENT") return "presupuesto_enviado";
  return "presupuesto_preparado";
}

const solicitudes = await prisma.tripRequest.findMany({
  where: { crmDealId: { not: null } },
  select: {
    id: true,
    crmDealId: true,
    opportunityName: true,
    destinationText: true,
    proposals: {
      orderBy: { versionNumber: "desc" },
      take: 1,
      select: {
        deliveries: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            reference: true,
            status: true,
            firstViewedAt: true,
            chosenOptionNumber: true,
            depositPaidAt: true,
          },
        },
      },
    },
  },
});

console.log(
  `${solicitudes.length} solicitud(es) con trato en Zoho.` +
    (aplicar ? " Se van a aplicar los cambios.\n" : " ENSAYO EN SECO: no se escribe nada.\n"),
);

let movidos = 0;
let quietos = 0;
let fallos = 0;

for (const solicitud of solicitudes) {
  const entrega = solicitud.proposals[0]?.deliveries[0] ?? null;
  const hito = hitoDe(entrega);
  const destino = FASE_DE_HITO[hito];
  const nombre = solicitud.opportunityName || solicitud.destinationText || solicitud.id;
  const etiqueta = `${nombre}${entrega ? ` · ${entrega.reference}` : ""}`;

  let actual;
  try {
    actual = await getZohoDealStage(solicitud.crmDealId);
  } catch (error) {
    fallos += 1;
    console.log(`  ?  ${etiqueta}: no se pudo leer el trato (${error.message})`);
    continue;
  }

  const decision = decidirFase(actual, destino);

  if (!decision.mover) {
    quietos += 1;
    console.log(`  ·  ${etiqueta}: se queda en «${actual}» (${decision.motivo})`);
    continue;
  }

  console.log(`  →  ${etiqueta}: «${actual || "sin fase"}» → «${destino}» (${hito})`);

  if (!aplicar) {
    movidos += 1;
    continue;
  }

  try {
    await updateZohoDeal({ dealId: solicitud.crmDealId, stage: destino });
    movidos += 1;
  } catch (error) {
    fallos += 1;
    console.log(`     no se pudo escribir: ${error.message}`);
  }
}

console.log(
  `\n${movidos} ${aplicar ? "movido(s)" : "se moverían"}, ${quietos} sin tocar, ${fallos} con error.`,
);
if (!aplicar && movidos > 0) {
  console.log("Para aplicarlo de verdad: añade --aplicar");
}

await prisma.$disconnect();
