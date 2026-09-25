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
import { marcarHito, type Hito } from "./crmPipeline";
import { borrarBorradorDeSolicitudDb } from "./draftsDb";
import { guardarMensajeSaliente } from "./correoDb";

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
      // Las actividades también: van DEBAJO de su alojamiento en el PDF y
      // entran en el total de cada opción. Antes no se cargaban siquiera.
      activityOptions: { orderBy: [{ optionNumber: "asc" }, { displayOrder: "asc" }] },
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
    totalAmount: importeDe(option.totalPvpText),
    priceBreakdownText: option.priceBreakdownText,
    conditionsText: option.conditionsText,
    observationsText: option.observationsText,
    freePolicyText: option.freePolicyText,
    // Cada opción se lleva SUS actividades: el colegio elige una opción entera,
    // no un hotel por un lado y unas excursiones por otro.
    // NO se filtra por `isSelected`. Ese campo significa «el colegio eligió
    // esta opción» y se pone al aprobar, así que al generar el documento vale
    // false en todas: filtrando por él, el PDF salía SIEMPRE sin actividades
    // aunque se hubieran elegido. Las que están guardadas en una opción ya son
    // las que eligió quien cotiza.
    activities: proposal.activityOptions
      .filter((actividad) => actividad.optionNumber === option.optionNumber)
      .map((actividad) => ({
        name: actividad.activityNameSnapshot,
        provider: actividad.providerSnapshot,
        duration: actividad.durationSnapshot,
        priceText: actividad.pvpSnapshot,
        amount: importeDe(actividad.pvpSnapshot),
        description: actividad.descriptionSnapshot,
      })),
  }));

  const tripTitle = request.opportunityName ?? request.destinationText ?? "vuestro viaje";

  const pdfPath = await buildProposalPdf({
    reference,
    department: request.department,
    clientName: client.fullName,
    // El nombre de la oportunidad YA es el título del viaje. Pasarlo tambien
    // como centro lo imprimia dos veces seguidas, una debajo de la otra. Bajo
    // el titulo va para quien es la propuesta, que es la persona que escribio.
    centreName: null,
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

  // De qué solicitud viene, para poder cerrar su borrador al final.
  const solicitudId = await solicitudDeLaEntrega(delivery.id);

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
    // A propósito NO se mueve la fase del trato: el correo no ha salido de
    // aquí. Poner «Presupuesto Enviado» sería mentirle al CRM.
    console.info(
      `[crm] ${delivery.reference}: simulada, sin clave de buzón. La fase del trato se queda como está.`,
    );
    // El borrador SÍ se cierra: el documento está hecho y la solicitud montada,
    // así que ya no es trabajo a medias aunque el correo no haya salido.
    await cerrarBorradorDe(solicitudId);
    return { ...base, status: updated.status, simulated: true };
  }

  const transporter = nodemailer.createTransport({
    host: box.host,
    port: box.port,
    secure: box.secure,
    auth: { user: box.address, pass: box.appPassword },
  });

  let messageId: string | null = null;
  try {
    const salida = await transporter.sendMail({
      from: { name: box.displayName, address: box.address },
      to: settings.testRecipient || delivery.recipientEmail,
      replyTo: delivery.replyToEmail ?? box.address,
      subject: delivery.subject,
      text: delivery.bodyText,
      attachments: delivery.pdfPath
        ? [{ filename: `Propuesta-${delivery.reference}.pdf`, path: delivery.pdfPath }]
        : [],
    });
    // El Message-ID es lo que permite reconocer la respuesta del colegio: su
    // cliente de correo lo devuelve en `In-Reply-To`. Se guarda porque el
    // subdireccionamiento —`groups+ORV-2026-0184@…`— NO funciona en su
    // servidor: probado el 25/09/2026, el correo se acepta y desaparece.
    messageId = salida?.messageId ?? null;
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
    data: { status: "SENT", sentAt: new Date(), failureReason: null, messageId },
  });

  // Lo que sale también es parte de la conversación: sin esto, el hilo del
  // expediente empezaría por la respuesta del colegio y no se entendería.
  await guardarMensajeSaliente(delivery, box.address, settings.testRecipient, messageId);

  await cerrarBorradorDe(solicitudId);

  await reflejarEnElCrm(
    delivery.id,
    "presupuesto_enviado",
    `Propuesta ${delivery.reference} enviada a ${delivery.recipientEmail}.`,
  );

  return { ...base, status: updated.status, simulated: false };
}

/**
 * El número que hay dentro de un importe ya formateado.
 *
 * Los totales se guardan como texto —«8.294,40 €», «52 €»— porque es lo que se
 * enseña. Para poder SUMARLOS en el resumen del viaje hay que recuperarlos, y
 * hay que hacerlo con el formato español: el punto separa miles y la coma los
 * céntimos, justo al revés que en inglés. Confundirlos convertiría 8.294,40 en
 * ocho euros con veintinueve.
 */
function importeDe(texto?: string | null): number | null {
  if (!texto) return null;
  const limpio = String(texto)
    .replace(/[^\d.,-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * El trato de Zoho al que pertenece una entrega.
 *
 * La entrega cuelga de la propuesta, la propuesta de la solicitud, y es la
 * solicitud la que guarda el trato: una solicitud, un trato, aunque la
 * propuesta cambie de versión.
 */
async function tratoDeLaEntrega(deliveryId: string): Promise<string | null> {
  const fila = await prisma.proposalDelivery.findUnique({
    where: { id: deliveryId },
    select: { proposal: { select: { tripRequest: { select: { crmDealId: true } } } } },
  });
  return fila?.proposal?.tripRequest?.crmDealId ?? null;
}

/**
 * Refleja en el CRM lo que acaba de pasar, sin dejar que lo estropee.
 *
 * Deliberadamente no se espera el resultado ni se propaga el fallo: enviar una
 * propuesta o atender al colegio en su página no puede depender de que Zoho
 * conteste.
 */
async function reflejarEnElCrm(deliveryId: string, hito: Hito, nota?: string): Promise<void> {
  try {
    const dealId = await tratoDeLaEntrega(deliveryId);
    await marcarHito(dealId, hito, nota);
  } catch (error) {
    console.error("[crm] no se pudo reflejar el hito", hito, error);
  }
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
  const esLaPrimeraVez = !delivery.firstViewedAt;

  await prisma.proposalDelivery.update({
    where: { id: delivery.id },
    data: {
      viewCount: { increment: 1 },
      lastViewedAt: now,
      firstViewedAt: delivery.firstViewedAt ?? now,
    },
  });

  // Solo la primera vez. Un colegio que vuelve a mirar la propuesta cinco veces
  // no cambia nada en el CRM, y no hay por qué escribir cinco notas.
  if (esLaPrimeraVez) {
    await reflejarEnElCrm(
      delivery.id,
      "presupuesto_visto",
      `El colegio abrió la propuesta ${delivery.reference}.`,
    );
  }

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

  const elegida = await prisma.proposalDelivery.update({
    where: { id: delivery.id },
    data: { chosenOptionNumber: optionNumber, chosenAt, depositDueAt },
  });

  await reflejarEnElCrm(
    delivery.id,
    "opcion_elegida",
    `El colegio eligió la opción ${optionNumber}. Depósito hasta el ${depositDueAt
      .toISOString()
      .slice(0, 10)}.`,
  );

  return elegida;
}

/**
 * El depósito ha entrado: el viaje está vendido.
 *
 * Todavía no hay pantalla que lo registre —la de inicio solo lee
 * `depositPaidAt`—, así que esto está aquí esperando a que exista, y para que
 * quien la construya no tenga que acordarse de tocar el CRM.
 */
export async function marcarDepositoCobrado(deliveryId: string, cuando = new Date()) {
  const actualizada = await prisma.proposalDelivery.update({
    where: { id: deliveryId },
    data: { depositPaidAt: cuando },
  });

  await reflejarEnElCrm(
    deliveryId,
    "deposito_cobrado",
    `Depósito cobrado de la propuesta ${actualizada.reference}.`,
  );

  return actualizada;
}

/** Una entrega concreta: la usa la descarga del documento. */
export async function getDelivery(id: string) {
  return prisma.proposalDelivery.findUnique({ where: { id } });
}

/**
 * Cerrar el borrador de una solicitud cuya propuesta ya está hecha.
 *
 * Un borrador es trabajo a medias. En cuanto la propuesta sale, deja de serlo,
 * y seguir listándolo hace que la pantalla de nueva solicitud ofrezca continuar
 * cosas ya terminadas. Pasó: llegó a haber cinco «IES Jaume Balmes · Salou ·
 * 2027-05-18» seguidas, las cinco de la misma solicitud, que existía desde
 * hacía una hora.
 *
 * Que falle no puede tumbar el envío: la propuesta ya salió, y lo peor que
 * ocurre es que quede un borrador de más.
 */
async function cerrarBorradorDe(tripRequestId: string | null): Promise<void> {
  if (!tripRequestId) return;
  try {
    await borrarBorradorDeSolicitudDb(tripRequestId);
  } catch (error) {
    console.error("No se pudo cerrar el borrador de la solicitud", error);
  }
}

/** De qué solicitud nace una entrega. Hace falta para cerrar su borrador. */
async function solicitudDeLaEntrega(deliveryId: string): Promise<string | null> {
  const fila = await prisma.proposalDelivery.findUnique({
    where: { id: deliveryId },
    select: { proposal: { select: { tripRequestId: true } } },
  });
  return fila?.proposal?.tripRequestId ?? null;
}

/**
 * Las entregas vivas, para la pantalla de inicio.
 *
 * El filtro llega ya resuelto desde `deliveryVisibilityWhere`: quién ve qué lo
 * decide el módulo de acceso, no esta consulta. Antes la regla estaba escrita a
 * mano en el endpoint y solo cubría a los administradores de departamento.
 */
export async function listDeliveries(where: Record<string, unknown> = {}) {
  return prisma.proposalDelivery.findMany({
    where: where as never,
    orderBy: [{ createdAt: "desc" }],
    take: 200,
    include: { proposal: { include: { tripRequest: true } } },
  });
}
