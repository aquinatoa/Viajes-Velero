/**
 * La ficha de un presupuesto: todo lo que hace falta para seguirlo.
 *
 * Existe porque seguir un viaje dentro de la oportunidad de Zoho «no va a ser
 * muy cómodo, porque aquí hay una información básica registrada» —palabras de
 * la reunión del 17/06—. En el trato caben un nombre, un importe y un texto; no
 * caben las tres opciones con su desglose, ni si el colegio abrió el enlace, ni
 * la conversación, ni cuánto queda para el depósito.
 *
 * La oportunidad y el presupuesto CONVIVEN, no compiten: la oportunidad es
 * donde vive el trato y el presupuesto es lo que la alimenta. Por eso la ficha
 * enseña siempre en qué fase está el trato y enlaza a él.
 *
 * Todo sale de NUESTRA base. Lo único que se le pregunta a Zoho es la fase, y
 * si no contesta la ficha se abre igual: un CRM lento no puede impedir que
 * alguien vea su presupuesto.
 */

import { PrismaClient } from "@prisma/client";
import { FASES, FASE_DE_HITO } from "./crmPipeline";
import { getZohoDealStage } from "./zoho";

const prisma = new PrismaClient();

/** Un paso del embudo, con lo que la app sabe de él. */
export interface PasoDelEmbudo {
  fase: string;
  /** Cuándo pasó, si pasó. */
  cuando: string | null;
  /** Lo que se sabe de ese paso, en una línea. */
  detalle: string | null;
  hecho: boolean;
  /** La fase en la que está el trato AHORA, según el CRM. */
  actual: boolean;
}

/**
 * El embudo con lo que ha pasado de verdad.
 *
 * Las fechas salen de la app, no del CRM: la app sabe cuándo salió el correo y
 * cuándo lo abrieron, y el CRM solo guarda en qué casilla está hoy. Cuando las
 * dos cosas no coinciden manda el CRM para «dónde está» y la app para «cuándo
 * pasó», que es lo que cada uno sabe de verdad.
 */
function embudoDe(
  delivery: {
    createdAt: Date;
    sentAt: Date | null;
    status: string;
    firstViewedAt: Date | null;
    viewCount: number;
    chosenOptionNumber: number | null;
    chosenAt: Date | null;
    depositDueAt: Date | null;
    depositPaidAt: Date | null;
  },
  faseEnElCrm: string | null,
): PasoDelEmbudo[] {
  const iso = (f: Date | null) => (f ? f.toISOString() : null);

  const hitos: { fase: string; cuando: string | null; detalle: string | null }[] = [
    {
      fase: FASE_DE_HITO.presupuesto_preparado,
      cuando: iso(delivery.createdAt),
      detalle: "El documento se generó",
    },
    {
      fase: FASE_DE_HITO.presupuesto_enviado,
      cuando: delivery.status === "SIMULATED" ? null : iso(delivery.sentAt),
      detalle:
        delivery.status === "SIMULATED"
          ? "Preparada, pendiente de la clave del buzón"
          : delivery.sentAt
            ? "La propuesta salió al colegio"
            : null,
    },
    {
      fase: FASE_DE_HITO.presupuesto_visto,
      cuando: iso(delivery.firstViewedAt),
      detalle: delivery.viewCount
        ? `Abierta ${delivery.viewCount} ${delivery.viewCount === 1 ? "vez" : "veces"}`
        : null,
    },
    {
      fase: FASE_DE_HITO.opcion_elegida,
      cuando: iso(delivery.chosenAt),
      detalle: delivery.chosenOptionNumber
        ? `Eligieron la opción ${delivery.chosenOptionNumber}`
        : null,
    },
    {
      fase: FASE_DE_HITO.deposito_cobrado,
      cuando: iso(delivery.depositPaidAt),
      detalle: delivery.depositPaidAt ? "Depósito cobrado" : null,
    },
  ];

  const normal = (v: string) => v.trim().toLowerCase();
  return hitos.map((h) => ({
    ...h,
    hecho: h.cuando !== null,
    actual: faseEnElCrm !== null && normal(faseEnElCrm) === normal(h.fase),
  }));
}

/** Todo lo que enseña la ficha. */
export async function fichaDeLaPropuesta(deliveryId: string, visibilidad: Record<string, unknown> = {}) {
  const delivery = await prisma.proposalDelivery.findFirst({
    where: { AND: [{ id: deliveryId }, visibilidad] } as never,
    include: {
      proposal: {
        include: {
          tripRequest: { include: { client: true } },
          accommodationOptions: { orderBy: { optionNumber: "asc" } },
          activityOptions: { orderBy: [{ optionNumber: "asc" }, { displayOrder: "asc" }] },
        },
      },
      mensajes: { orderBy: { fecha: "asc" } },
    },
  });
  if (!delivery) return null;

  const solicitud = delivery.proposal.tripRequest;

  // La fase real del trato. Si el CRM no contesta, la ficha se abre igual: un
  // CRM lento no puede dejar a nadie sin ver su presupuesto.
  let faseEnElCrm: string | null = null;
  let crmRespondio = true;
  if (solicitud.crmDealId) {
    try {
      faseEnElCrm = (await getZohoDealStage(solicitud.crmDealId)) || null;
    } catch {
      crmRespondio = false;
    }
  }

  return {
    id: delivery.id,
    reference: delivery.reference,
    estado: delivery.status,
    department: delivery.department,

    viaje: {
      nombre: solicitud.opportunityName ?? solicitud.destinationText ?? "Viaje sin nombre",
      centro: solicitud.centreName ?? delivery.recipientName ?? solicitud.client?.fullName ?? null,
      destino: solicitud.destinationText,
      dateFrom: solicitud.dateFrom?.toISOString() ?? null,
      dateTo: solicitud.dateTo?.toISOString() ?? null,
      participants: solicitud.participants,
      teachers: solicitud.teachers,
      idioma: solicitud.language,
    },

    contacto: {
      nombre: delivery.recipientName,
      email: delivery.recipientEmail,
    },

    crm: {
      dealId: solicitud.crmDealId,
      dealUrl: solicitud.crmDealUrl,
      fase: faseEnElCrm,
      respondio: crmRespondio,
    },

    embudo: embudoDe(delivery, faseEnElCrm),
    fases: FASES,

    opciones: delivery.proposal.accommodationOptions.map((o) => ({
      optionNumber: o.optionNumber,
      alojamiento: o.accommodationNameSnapshot,
      regimen: o.boardType,
      noches: o.nights,
      totalPvpText: o.totalPvpText,
      desglose: o.priceBreakdownText,
      gratuidades: o.freePolicyText,
      condiciones: o.conditionsText,
      observaciones: o.observationsText,
      elegida: o.optionNumber === delivery.chosenOptionNumber,
      actividades: delivery.proposal.activityOptions
        .filter((a) => a.optionNumber === o.optionNumber)
        .map((a) => ({
          nombre: a.activityNameSnapshot,
          proveedor: a.providerSnapshot,
          duracion: a.durationSnapshot,
          precio: a.pvpSnapshot,
        })),
    })),

    elegida: delivery.chosenOptionNumber,
    chosenAt: delivery.chosenAt?.toISOString() ?? null,
    depositDueAt: delivery.depositDueAt?.toISOString() ?? null,
    depositPaidAt: delivery.depositPaidAt?.toISOString() ?? null,

    correo: {
      total: delivery.mensajes.length,
      entrantes: delivery.mensajes.filter((m) => m.direccion === "ENTRANTE").length,
      ultimo: delivery.mensajes.at(-1)?.fecha.toISOString() ?? null,
    },

    pdf: delivery.pdfPath ? `/api/deliveries/${delivery.id}/pdf` : null,
    publicToken: delivery.publicToken,
  };
}
