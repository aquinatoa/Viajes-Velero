/**
 * Escribir al colegio desde la propuesta. Pieza C5.
 *
 * Lo pidió Ruth en la reunión del 17/06 con estas palabras: «también podría
 * haber la opción de poder enviar el mail desde aquí. Si yo entro a esta
 * oportunidad, que ponga enviar email al contacto de la oportunidad». La
 * respuesta fue «ese es el objetivo».
 *
 * Dos cosas que este módulo hace y que no son adorno:
 *
 *   Engancha el mensaje al hilo. Pone `In-Reply-To` y `References` apuntando al
 *   último correo de la conversación, para que en la bandeja del colegio salga
 *   dentro del hilo de su presupuesto y no como un correo suelto.
 *
 *   Deja la referencia en el asunto. Es la segunda vía de emparejamiento
 *   cuando la respuesta llega sin cabeceras de hilo, y es gratis ponerla.
 */

import nodemailer from "nodemailer";
import { PrismaClient } from "@prisma/client";
import { canSend, loadMailSettings, mailboxFor } from "./mailConfig";

const prisma = new PrismaClient();

export interface RespuestaAlContacto {
  enviado: boolean;
  simulado: boolean;
  messageId: string | null;
  motivo?: string;
}

/**
 * El último mensaje de la conversación, para colgar de él la respuesta.
 *
 * Se prefiere lo último que haya llegado: responder al mensaje más reciente es
 * lo que hace cualquier cliente de correo y lo que mantiene el hilo entero.
 */
async function ultimoDelHilo(deliveryId: string): Promise<{ messageId: string | null; referencias: string | null }> {
  const mensaje = await prisma.correoMensaje.findFirst({
    where: { deliveryId, messageId: { not: null } },
    orderBy: { fecha: "desc" },
    select: { messageId: true, referencias: true },
  });
  return { messageId: mensaje?.messageId ?? null, referencias: mensaje?.referencias ?? null };
}

/**
 * Manda un correo al contacto de una propuesta y lo anota en su hilo.
 *
 * Sin credenciales de buzón NO falla: guarda el mensaje como simulado, igual
 * que hace el envío de la propuesta. Así el circuito se puede probar entero
 * antes de que el correo esté resuelto.
 */
export async function escribirAlContacto(
  deliveryId: string,
  texto: string,
  asuntoPedido?: string,
): Promise<RespuestaAlContacto> {
  const cuerpo = String(texto ?? "").trim();
  if (!cuerpo) return { enviado: false, simulado: false, messageId: null, motivo: "El mensaje está vacío." };

  const delivery = await prisma.proposalDelivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) return { enviado: false, simulado: false, messageId: null, motivo: "Esa propuesta no existe." };

  const settings = loadMailSettings();
  const box = mailboxFor(settings, delivery.department);

  // El asunto lleva SIEMPRE la referencia: es la red de seguridad para
  // reconocer la respuesta si llega sin cabeceras de hilo.
  const pedido = String(asuntoPedido ?? "").trim();
  const asunto = pedido
    ? pedido.includes(delivery.reference) ? pedido : `${pedido} · ${delivery.reference}`
    : `RE: ${delivery.subject}`;

  const hilo = await ultimoDelHilo(deliveryId);
  const destinatario = settings.testRecipient || delivery.recipientEmail;

  // Sin clave del buzón se anota igual y se marca simulado, como en el envío
  // de la propuesta: el circuito se prueba entero sin mandar nada.
  if (!canSend(box)) {
    await anotar(delivery, box.address || "(sin buzón)", destinatario, asunto, cuerpo, null);
    return { enviado: false, simulado: true, messageId: null };
  }

  const transporter = nodemailer.createTransport({
    host: box.host,
    port: box.port,
    secure: box.secure,
    auth: { user: box.address, pass: box.appPassword },
  });

  try {
    const salida = await transporter.sendMail({
      from: { name: box.displayName, address: box.address },
      to: destinatario,
      replyTo: delivery.replyToEmail ?? box.address,
      subject: asunto,
      text: cuerpo,
      // Lo que hace que el colegio lo vea DENTRO de su hilo y no suelto.
      ...(hilo.messageId ? { inReplyTo: hilo.messageId } : {}),
      ...(hilo.messageId
        ? { references: [hilo.referencias, hilo.messageId].filter(Boolean).join(" ") }
        : {}),
    });

    const messageId = salida?.messageId ?? null;
    await anotar(delivery, box.address, destinatario, asunto, cuerpo, messageId);
    return { enviado: true, simulado: false, messageId };
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "Error desconocido al enviar.";
    // Lo que no sale NO se anota como enviado: el hilo diría que el colegio
    // recibió algo que nunca le llegó, y alguien esperaría una respuesta.
    return { enviado: false, simulado: false, messageId: null, motivo };
  } finally {
    transporter.close();
  }
}

/** Deja el mensaje en el hilo del expediente. */
async function anotar(
  delivery: { id: string; department: string | null; recipientEmail: string },
  de: string,
  para: string,
  asunto: string,
  cuerpo: string,
  messageId: string | null,
): Promise<void> {
  try {
    await prisma.correoMensaje.create({
      data: {
        buzon: delivery.department === "SPORTS" ? "SPORTS" : "GROUPS",
        direccion: "SALIENTE",
        messageId,
        de,
        para,
        asunto,
        cuerpo,
        fecha: new Date(),
        deliveryId: delivery.id,
        emparejadoPor: "MESSAGE_ID",
        visto: true,
      },
    });
  } catch (error) {
    // Igual que en el envío de la propuesta: anotar no puede tumbar un correo
    // que ya ha salido. Lo peor es que falte una línea en el hilo.
    console.error("No se pudo anotar el correo saliente", error);
  }
}
