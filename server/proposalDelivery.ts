/**
 * Entrega de propuestas al cliente: preparar, enviar y seguir la vida de cada
 * envío. Es la pieza que hoy no existe y que obliga a copiar y pegar el
 * presupuesto en un correo a mano.
 *
 * Decisiones que vienen de la reunión con el cliente del 17/06:
 * - El correo sale del buzón del departamento (groups@ / sports@), porque es lo
 *   único que Zoho vincula a la oportunidad.
 * - La referencia (ORV-2026-0184) viaja en el asunto y en el PDF, para poder
 *   reconocer el hilo aunque Zoho lo cuelgue de la oportunidad equivocada.
 * - Aceptar una opción arranca un plazo de 40 días para el depósito.
 *
 * Sin credenciales de correo NO falla: deja la entrega en SIMULATED con su PDF
 * generado, para poder probar el circuito entero antes de que llegue la clave.
 */

import crypto from "node:crypto";
import { PrismaClient, type DeliveryStatus } from "@prisma/client";
import nodemailer from "nodemailer";
import { buildProposalPdf, type PdfOption } from "./proposalPdf";
import { canSend, loadMailSettings, mailboxFor, replyToFor } from "./mailConfig";

const prisma = new PrismaClient();

/** Días desde la aceptación hasta que vence el depósito (acuerdo de junio). */
export const DEPOSIT_DEADLINE_DAYS = 40;
/** Porcentaje del depósito. Igual que arriba: acordado, no inventado. */
export const DEPOSIT_PERCENT = 30;

/**
 * Referencia visible: ORV-2026-0184. El contador es por año natural y se
 * calcula sobre lo ya emitido; con el volumen de una agencia (cientos al año)
 * no compensa una tabla de secuencias.
 */
async function nextReference(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ORV-${year}-`;
  const last = await prisma.proposalDelivery.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
    select: { reference: true },
  });
  const lastNumber = last ? Number(last.reference.slice(prefix.length)) : 0;
  return `${prefix}${String(lastNumber + 1).padStart(4, "0")}`;
}

/** Token del enlace público. Largo de verdad: es lo único que protege la página. */
function newPublicToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function formatDate(value?: Date | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(value);
}

interface PreparedContent {
  subject: string;
  bodyText: string;
}

/**
 * Texto del correo. Corto a propósito: el documento es el PDF, el correo solo
 * tiene que dar contexto y decir qué hacer a continuación.
 */
function composeMessage(input: {
  reference: string;
  tripTitle: string;
  recipientName?: string | null;
  optionCount: number;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  publicUrl?: string | null;
  signature: string;
}): PreparedContent {
  const saludo = input.recipientName ? `Hola ${input.recipientName},` : "Hola,";
  const fechas = input.dateFrom || input.dateTo
    ? ` para las fechas del ${formatDate(input.dateFrom)} al ${formatDate(input.dateTo)}`
    : "";

  const lineas = [
    saludo,
    "",
    `Os adjuntamos la propuesta para ${input.tripTitle}${fechas}, con ${input.optionCount} opciones para que elijáis la que mejor os encaje.`,
    "",
    input.publicUrl
      ? `Podéis verlas y aceptar la que prefiráis aquí: ${input.publicUrl}`
      : "Respondiendo a este correo nos decís cuál preferís y seguimos adelante.",
    "",
    `Cualquier duda, responded a este mismo correo indicando la referencia ${input.reference}.`,
    "",
    "Un saludo,",
    input.signature,
  ];

  return {
    subject: `Propuesta ${input.reference} · ${input.tripTitle}`,
    bodyText: lineas.join("\n"),
  };
}

export interface PrepareDeliveryInput {
  proposalId: string;
  recipientEmail?: string;
  recipientName?: string;
  sentByUserId?: string;
}

export interface DeliveryResult {
  id: string;
  reference: string;
  status: DeliveryStatus;
  recipientEmail: string;
  subject: string;
  pdfPath: string | null;
  publicUrl: string | null;
  simulated: boolean;
  failureReason?: string | null;
}

/**
 * Prepara la entrega: reúne los datos, numera, genera el PDF y la deja lista
 * para enviar. No envía nada todavía, para poder revisar antes de que salga.
 *
 * **Preparar dos veces no numera dos veces.** Si la propuesta ya tiene un
 * borrador (o un intento fallido), se reaprovecha: misma referencia y mismo
 * enlace público, con el PDF y el texto regenerados por si algo cambió. El
 * cierre del lienzo se reintenta cuando falla a mitad, y sin esto cada
 * reintento quemaba un número de referencia y dejaba otro borrador colgando.
 */
export async function prepareDelivery(input: PrepareDeliveryInput): Promise<DeliveryResult> {
  const proposal = await prisma.tripProposal.findUnique({
    where: { id: input.proposalId },
    include: {
      accommodationOptions: { orderBy: { optionNumber: "asc" } },
      tripRequest: { include: { client: true } },
    },
  });
  if (!proposal) throw new Error("La propuesta no existe.");

  const request = proposal.tripRequest;
  const client = request.client;
  const recipientEmail = input.recipientEmail?.trim() || client.email;
  if (!recipientEmail) throw new Error("La propuesta no tiene destinatario: falta el correo del cliente.");

  const settings = loadMailSettings();
  const box = mailboxFor(settings, request.department);

  // Un borrador previo de esta misma propuesta manda: conserva su número y su
  // enlace. Lo que ya salió (SENT/SIMULATED) no se toca.
  const previous = await prisma.proposalDelivery.findFirst({
    where: { proposalId: proposal.id, status: { in: ["DRAFT", "FAILED"] } },
    orderBy: { createdAt: "asc" },
  });

  const reference = previous?.reference ?? (await nextReference());
  const publicToken = previous?.publicToken ?? newPublicToken();
  const publicUrl = settings.publicBaseUrl ? `${settings.publicBaseUrl}/p/${publicToken}` : null;

  const options: PdfOption[] = proposal.accommodationOptions.map((option) => ({
    optionNumber: option.optionNumber,
    accommodationName: option.accommodationNameSnapshot ?? "Alojamiento",
    boardType: option.boardType,
    nights: option.nights,
    participants: option.participants,
    teachers: option.teachers,
    totalPvpText: option.totalPvpText,
    priceBreakdownText: option.priceBreakdownText,
    conditionsText: option.conditionsText,
    observationsText: option.observationsText,
  }));

  const tripTitle = request.opportunityName ?? request.destinationText ?? "vuestro viaje";

  const pdfPath = await buildProposalPdf({
    reference,
    department: request.department,
    clientName: client.fullName,
    centreName: request.opportunityName,
    tripTitle,
    destination: request.destinationText,
    dateFrom: request.dateFrom,
    dateTo: request.dateTo,
    participants: request.participants,
    teachers: request.teachers,
    options,
    publicUrl,
    preparedBy: box.displayName,
  });

  const { subject, bodyText } = composeMessage({
    reference,
    tripTitle,
    recipientName: input.recipientName ?? client.firstName,
    optionCount: options.length,
    dateFrom: request.dateFrom,
    dateTo: request.dateTo,
    publicUrl,
    signature: box.displayName,
  });

  const content = {
    department: request.department,
    recipientEmail,
    recipientName: input.recipientName ?? client.fullName,
    replyToEmail: replyToFor(settings, box, reference) || null,
    subject,
    bodyText,
    pdfPath,
    status: "DRAFT" as const,
    failureReason: null,
    sentByUserId: input.sentByUserId ?? null,
  };

  const delivery = previous
    ? await prisma.proposalDelivery.update({ where: { id: previous.id }, data: content })
    : await prisma.proposalDelivery.create({
        data: { ...content, proposalId: proposal.id, reference, publicToken },
      });

  return {
    id: delivery.id,
    reference,
    status: delivery.status,
    recipientEmail,
    subject,
    pdfPath,
    publicUrl,
    simulated: !canSend(box),
  };
}

/**
 * Envía una entrega ya preparada. Si el buzón del departamento no tiene clave,
 * la marca como SIMULATED en vez de fallar: el circuito se puede probar entero
 * sin credenciales, y encenderlo consiste en rellenar el `.env`.
 */
export async function sendDelivery(deliveryId: string): Promise<DeliveryResult> {
  const delivery = await prisma.proposalDelivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) throw new Error("La entrega no existe.");
  if (delivery.status === "SENT") throw new Error("Esta propuesta ya se envió.");

  const settings = loadMailSettings();
  const box = mailboxFor(settings, delivery.department);
  const publicUrl = settings.publicBaseUrl ? `${settings.publicBaseUrl}/p/${delivery.publicToken}` : null;

  const base = {
    id: delivery.id,
    reference: delivery.reference,
    recipientEmail: delivery.recipientEmail,
    subject: delivery.subject,
    pdfPath: delivery.pdfPath,
    publicUrl,
  };

  if (!canSend(box)) {
    const updated = await prisma.proposalDelivery.update({
      where: { id: delivery.id },
      data: { status: "SIMULATED", sentAt: new Date() },
    });
    return { ...base, status: updated.status, simulated: true };
  }

  const transporter = nodemailer.createTransport({
    host: box.host,
    port: box.port,
    secure: box.secure,
    auth: { user: box.address, pass: box.appPassword },
  });

  try {
    await transporter.sendMail({
      from: { name: box.displayName, address: box.address },
      to: settings.testRecipient || delivery.recipientEmail,
      replyTo: delivery.replyToEmail ?? box.address,
      subject: delivery.subject,
      text: delivery.bodyText,
      attachments: delivery.pdfPath
        ? [{ filename: `Propuesta-${delivery.reference}.pdf`, path: delivery.pdfPath }]
        : [],
    });
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : "Error desconocido al enviar.";
    const updated = await prisma.proposalDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", failureReason },
    });
    return { ...base, status: updated.status, simulated: false, failureReason };
  }

  const updated = await prisma.proposalDelivery.update({
    where: { id: delivery.id },
    data: { status: "SENT", sentAt: new Date(), failureReason: null },
  });
  return { ...base, status: updated.status, simulated: false };
}

/** Prepara y envía de una vez: es lo que hace el botón "Enviar propuesta". */
export async function prepareAndSend(input: PrepareDeliveryInput): Promise<DeliveryResult> {
  const prepared = await prepareDelivery(input);
  return sendDelivery(prepared.id);
}

/** Lo que ve el colegio al abrir su enlace. Registra la visita de paso. */
export async function readPublicProposal(token: string) {
  const delivery = await prisma.proposalDelivery.findUnique({
    where: { publicToken: token },
    include: {
      proposal: {
        include: {
          accommodationOptions: { orderBy: { optionNumber: "asc" } },
          tripRequest: { include: { client: true } },
        },
      },
    },
  });
  if (!delivery) return null;

  const now = new Date();
  await prisma.proposalDelivery.update({
    where: { id: delivery.id },
    data: {
      viewCount: { increment: 1 },
      lastViewedAt: now,
      firstViewedAt: delivery.firstViewedAt ?? now,
    },
  });

  return delivery;
}

/**
 * El colegio acepta una opción. Aquí arranca el reloj del depósito, que es lo
 * que después persigue la pantalla de inicio.
 */
export async function chooseOption(token: string, optionNumber: number) {
  const delivery = await prisma.proposalDelivery.findUnique({ where: { publicToken: token } });
  if (!delivery) return null;
  if (delivery.chosenOptionNumber) return delivery; // ya eligieron: no se pisa

  const chosenAt = new Date();
  const depositDueAt = new Date(chosenAt);
  depositDueAt.setDate(depositDueAt.getDate() + DEPOSIT_DEADLINE_DAYS);

  return prisma.proposalDelivery.update({
    where: { id: delivery.id },
    data: { chosenOptionNumber: optionNumber, chosenAt, depositDueAt },
  });
}

/** Una entrega concreta: la usa la descarga del documento. */
export async function getDelivery(id: string) {
  return prisma.proposalDelivery.findUnique({ where: { id } });
}

/** Las entregas vivas, para la pantalla de inicio. */
export async function listDeliveries(filter?: { department?: string | null }) {
  return prisma.proposalDelivery.findMany({
    where: filter?.department ? { department: filter.department as never } : {},
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    include: { proposal: { include: { tripRequest: true } } },
  });
}
