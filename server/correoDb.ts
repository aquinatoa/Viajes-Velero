/**
 * Los correos del expediente, en la base.
 *
 * Es la pieza C1 del plan: guardar. Lo que entra por IMAP y lo que sale de la
 * app viven en la misma tabla, porque el hilo que ve quien cotiza es la
 * conversación entera y no tendría sentido partirla en dos sitios.
 *
 * Aquí NO se decide a qué viaje pertenece cada correo: eso vive en
 * `correoEmparejado.ts`, aparte, para poder comprobarlo sin base de datos.
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import { emparejar, type CorreoEntrante, type EnvioConocido } from "./correoEmparejado";

const prisma = new PrismaClient();

/** Los dos buzones. No es el departamento del viaje: es por dónde pasó. */
export type Buzon = "GROUPS" | "SPORTS";

/**
 * Deja anotado un correo que ha salido de la app.
 *
 * `testRecipient` existe porque mientras se prueba todo se redirige a una
 * dirección nuestra. Se guarda a dónde fue DE VERDAD, no a dónde iba: si no,
 * el hilo diría que le escribimos a un colegio al que nunca llegó nada.
 */
export async function guardarMensajeSaliente(
  delivery: { id: string; reference: string; subject: string; bodyText: string; recipientEmail: string; department?: string | null },
  remitente: string,
  testRecipient: string | undefined,
  messageId: string | null,
): Promise<void> {
  try {
    await prisma.correoMensaje.create({
      data: {
        buzon: delivery.department === "SPORTS" ? "SPORTS" : "GROUPS",
        direccion: "SALIENTE",
        messageId,
        de: remitente,
        para: testRecipient || delivery.recipientEmail,
        asunto: delivery.subject,
        cuerpo: delivery.bodyText,
        fecha: new Date(),
        deliveryId: delivery.id,
        // Lo que sale ya sabe de qué viaje es: no hay nada que adivinar.
        emparejadoPor: "MESSAGE_ID",
        visto: true,
      },
    });
  } catch (error) {
    // Anotar la conversación no puede tumbar un envío que ya ha salido. Lo
    // peor que pasa es que ese correo no aparezca en el hilo.
    console.error("No se pudo anotar el correo saliente", error);
  }
}

/**
 * Los envíos con los que se puede emparejar un correo que entra.
 *
 * Se traen todos los que siguen vivos, no solo los de un buzón: un colegio
 * puede responder desde otra dirección o a otro buzón, y limitarlo de más
 * dejaría sin emparejar correos que sí tienen dueño.
 */
export async function enviosParaEmparejar(): Promise<EnvioConocido[]> {
  const filas = await prisma.proposalDelivery.findMany({
    where: { status: { in: ["SENT", "SIMULATED"] } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      reference: true,
      messageId: true,
      recipientEmail: true,
      depositPaidAt: true,
    },
  });

  return filas.map((f) => ({
    id: f.id,
    reference: f.reference,
    messageId: f.messageId,
    recipientEmail: f.recipientEmail,
    // Con el depósito cobrado el viaje está cerrado: deja de competir por los
    // correos sueltos de ese colegio, que serán de su viaje siguiente.
    cerrado: f.depositPaidAt !== null,
  }));
}

/** ¿Ya tenemos este mensaje? Por Message-ID, y si no lo trae, por UID. */
export async function yaGuardado(
  messageId: string | null,
  buzon: Buzon,
  carpeta: string,
  uid: number | null,
  uidValidity: number | null,
): Promise<boolean> {
  if (messageId) {
    const porId = await prisma.correoMensaje.count({ where: { messageId } });
    if (porId > 0) return true;
  }
  if (uid === null) return false;
  const porUid = await prisma.correoMensaje.count({
    where: { buzon, carpeta, uid, uidValidity },
  });
  return porUid > 0;
}

export interface MensajeQueLlega extends CorreoEntrante {
  buzon: Buzon;
  carpeta: string;
  uid: number | null;
  uidValidity: number | null;
  para: string;
  fecha: Date;
}

/**
 * Guarda un correo que entra, emparejado si se ha podido.
 *
 * Devuelve cómo acabó, para poder contarlo: cuántos cayeron en su expediente y
 * cuántos quedan para que alguien los mire.
 */
export async function guardarMensajeEntrante(
  mensaje: MensajeQueLlega,
  envios: EnvioConocido[],
): Promise<{ guardado: boolean; emparejadoPor: string | null; reference: string | null }> {
  const repetido = await yaGuardado(
    mensaje.messageId ?? null,
    mensaje.buzon,
    mensaje.carpeta,
    mensaje.uid,
    mensaje.uidValidity,
  );
  if (repetido) return { guardado: false, emparejadoPor: null, reference: null };

  const pareja = emparejar(mensaje, envios);

  const data: Prisma.CorreoMensajeCreateInput = {
    buzon: mensaje.buzon,
    direccion: "ENTRANTE",
    uid: mensaje.uid,
    uidValidity: mensaje.uidValidity,
    carpeta: mensaje.carpeta,
    messageId: mensaje.messageId ?? null,
    inReplyTo: mensaje.inReplyTo ?? null,
    referencias: mensaje.referencias ?? null,
    de: mensaje.de,
    para: mensaje.para,
    asunto: mensaje.asunto,
    cuerpo: mensaje.cuerpo ?? "",
    fecha: mensaje.fecha,
    emparejadoPor: pareja?.emparejadoPor ?? null,
    ...(pareja ? { delivery: { connect: { id: pareja.deliveryId } } } : {}),
  };

  await prisma.correoMensaje.create({ data });

  return {
    guardado: true,
    emparejadoPor: pareja?.emparejadoPor ?? null,
    reference: pareja?.reference ?? null,
  };
}

/** El hilo de un expediente, en orden de conversación. */
export async function hiloDeLaEntrega(deliveryId: string) {
  return prisma.correoMensaje.findMany({
    where: { deliveryId },
    orderBy: { fecha: "asc" },
  });
}

/**
 * La bandeja general: lo que ha entrado, con lo no emparejado primero.
 *
 * Lo que no tiene expediente es lo único que obliga a alguien a hacer algo, así
 * que va arriba. Lo demás ya está en su hilo y se mira desde el viaje.
 */
export async function bandeja(opciones: { soloSinExpediente?: boolean; limite?: number } = {}) {
  return prisma.correoMensaje.findMany({
    where: {
      direccion: "ENTRANTE",
      ...(opciones.soloSinExpediente ? { deliveryId: null } : {}),
    },
    orderBy: [{ deliveryId: { sort: "asc", nulls: "first" } }, { fecha: "desc" }],
    take: opciones.limite ?? 200,
    include: {
      delivery: { select: { id: true, reference: true, recipientName: true } },
    },
  });
}
