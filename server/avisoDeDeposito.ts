/**
 * El aviso al propietario cuando la oportunidad pasa a «Pendiente de depósito».
 *
 * Compromiso de la reunión con Oravia del 05/11/2026; Anthony aclaró el 06/11 qué es
 * el «propietario»: quien hace la propuesta (`TripRequest.ownerUserId`), no el
 * propietario que Zoho pone a todas las oportunidades.
 *
 * Cuándo sale: justo cuando se registra la opción elegida —el colegio la elige en su
 * página o alguien la apunta leyendo su correo—, que es el momento en que la app
 * mueve la fase a «Pendiente de depósito». Una opción ya elegida no se pisa, así que
 * el aviso sale UNA sola vez por entrega, sin necesidad de guardar una marca aparte.
 * Lo que se mueva a mano en Zoho no lo ve la app y no genera aviso.
 *
 * Cómo sale: desde el buzón del departamento, como el resto de correos de la app, y
 * respetando `MAIL_TEST_RECIPIENT` (mientras se prueba, no llega al propietario real).
 * NO se guarda como mensaje del hilo del colegio: es un aviso interno.
 *
 * No lanza nunca: que el aviso falle no puede impedir que el colegio elija opción.
 */

import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

import { canSend, loadMailSettings, mailboxFor } from "./mailConfig";

const prisma = new PrismaClient();

export interface DatosDelAviso {
  propietario: string | null;
  referencia: string;
  centro: string | null;
  opcion: number;
  alojamiento: string | null;
  total: string | null;
  /** Hasta cuándo, ya como texto: «15/12/2026». */
  depositoHasta: string;
  enlace: string | null;
  /** Quién lo apuntó, si no fue el propio colegio en su página. */
  apuntadoPor: string | null;
}

/** El correo, como texto plano. Pura: es lo que se prueba. */
export function componerAvisoDeDeposito(d: DatosDelAviso): { asunto: string; texto: string } {
  const quien = d.centro ? `«${d.centro}»` : "El colegio";
  const asunto = `Pendiente de depósito · ${d.referencia}${d.centro ? ` · ${d.centro}` : ""}`;
  const lineas = [
    `Hola${d.propietario ? ` ${d.propietario.split(" ")[0]}` : ""},`,
    "",
    `${d.centro ? `${quien} ha elegido` : "Han elegido"} la opción ${d.opcion} de la propuesta ${d.referencia}` +
      `${d.apuntadoPor ? ` (lo ha apuntado ${d.apuntadoPor} desde la app)` : ""}.`,
    ...(d.alojamiento ? [`Alojamiento: ${d.alojamiento}${d.total ? ` · total ${d.total}` : ""}.`] : []),
    "",
    `La oportunidad pasa a «Pendiente de depósito». El depósito vence el ${d.depositoHasta}.`,
    ...(d.enlace ? ["", `Propuesta: ${d.enlace}`] : []),
    "",
    "Aviso automático de la app: te llega porque la propuesta la hiciste tú.",
  ];
  return { asunto, texto: lineas.join("\n") };
}

const fechaEnEspanol = (fecha: Date) =>
  `${String(fecha.getDate()).padStart(2, "0")}/${String(fecha.getMonth() + 1).padStart(2, "0")}/${fecha.getFullYear()}`;

export type ResultadoDelAviso =
  | { enviado: true; a: string }
  | { enviado: false; motivo: string };

/** Avisa a quien hizo la propuesta. Devuelve qué pasó; nunca lanza. */
export async function avisarPendienteDeDeposito(
  deliveryId: string,
  opcion: number,
  apuntadoPor: string | null = null,
): Promise<ResultadoDelAviso> {
  try {
    const entrega = await prisma.proposalDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        proposal: {
          include: {
            tripRequest: true,
            accommodationOptions: { where: { optionNumber: opcion }, take: 1 },
          },
        },
      },
    });
    if (!entrega) return { enviado: false, motivo: "la entrega no existe" };
    const solicitud = entrega.proposal.tripRequest;
    if (!solicitud.ownerUserId) {
      console.info(`[aviso] ${entrega.reference}: sin propietario (nadie la cotizó con sesión): no se avisa.`);
      return { enviado: false, motivo: "la propuesta no tiene propietario" };
    }
    const propietario = await prisma.user.findUnique({ where: { id: solicitud.ownerUserId } });
    if (!propietario?.email || !propietario.isActive) {
      console.info(`[aviso] ${entrega.reference}: el propietario ya no está activo: no se avisa.`);
      return { enviado: false, motivo: "el propietario no está activo o no tiene correo" };
    }

    const settings = loadMailSettings();
    const box = mailboxFor(settings, solicitud.department);
    const hasta = entrega.depositDueAt ?? new Date();
    const alojamiento = entrega.proposal.accommodationOptions[0];
    const { asunto, texto } = componerAvisoDeDeposito({
      propietario: propietario.name ?? null,
      referencia: entrega.reference,
      centro: solicitud.centreName ?? solicitud.opportunityName ?? null,
      opcion,
      alojamiento: alojamiento?.accommodationNameSnapshot ?? null,
      total: alojamiento?.totalPvpText ?? null,
      depositoHasta: fechaEnEspanol(hasta),
      enlace: settings.publicBaseUrl ? `${settings.publicBaseUrl}/p/${entrega.publicToken}` : null,
      apuntadoPor,
    });

    // Mientras se prueba, a donde digan las pruebas y no al propietario real.
    const destino = settings.testRecipient || propietario.email;
    if (!canSend(box)) {
      console.info(`[aviso] ${entrega.reference}: simulado (sin clave de buzón). Habría ido a ${destino}.`);
      return { enviado: false, motivo: "sin clave de buzón: simulado" };
    }

    const transporte = nodemailer.createTransport({
      host: box.host,
      port: box.port,
      secure: box.secure,
      auth: { user: box.address, pass: box.appPassword },
    });
    await transporte.sendMail({
      from: { name: box.displayName, address: box.address },
      to: destino,
      subject: asunto,
      text: texto,
    });
    return { enviado: true, a: destino };
  } catch (error) {
    console.error("[aviso] no se pudo avisar del depósito", error);
    return { enviado: false, motivo: error instanceof Error ? error.message : "error desconocido" };
  }
}
