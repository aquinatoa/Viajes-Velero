/**
 * El trato del CRM se crea al ENVIAR la propuesta, no al prepararla.
 *
 * Ruth, 26/10/2026: «aunque no se ha realizado el envío del segundo grupo que
 * se ha creado con el mismo nombre también hemos recibido creación de
 * oportunidad en el Zoho... debería crearse solo lo que se envíe. Lo que no se
 * envía, NO.» Antes, «Revisar y enviar» creaba el trato al preparar el
 * documento, y una propuesta que nadie llegaba a enviar dejaba su oportunidad
 * en el CRM.
 *
 * Ahora:
 *   PREPARAR guarda en la propuesta los datos con los que se creará el trato
 *            (`crmPayloadJson`, columna que ya existía y no usaba nadie).
 *   ENVIAR   crea el trato con esos datos justo antes de que salga el correo.
 *            Vale igual desde la revisión y desde «Enviar propuesta» en la
 *            mesa. Si la solicitud ya tiene trato (una versión rehecha, un
 *            reintento), se reutiliza.
 */
import { PrismaClient } from "@prisma/client";
import { ensureTripRequestDealDb, upsertClientFromIntakeDb } from "./commercialDb";
import { createZohoOpportunity, type PayloadDeOportunidad } from "./zoho";

const prisma = new PrismaClient();

/** Guarda en la propuesta los datos del trato que se creará al enviar. */
export async function guardarDatosDelTrato(proposalId: string, datos: unknown): Promise<void> {
  if (!datos || typeof datos !== "object") return;
  await prisma.tripProposal.update({
    where: { id: proposalId },
    data: { crmPayloadJson: JSON.stringify(datos) },
  });
}

/**
 * Crea el trato de la solicitud de esta entrega si todavía no tiene. Devuelve
 * un texto para la auditoría si lo ha creado, o null si ya existía o no hay
 * datos (propuestas preparadas antes del cambio, que ya tenían su trato).
 */
export async function crearTratoAlEnviar(
  deliveryId: string,
  departamentoDelUsuario: "GROUPS" | "SPORTS" | null,
): Promise<string | null> {
  const entrega = await prisma.proposalDelivery.findUnique({
    where: { id: deliveryId },
    select: {
      department: true,
      proposal: {
        select: {
          crmPayloadJson: true,
          tripRequest: {
            select: { id: true, crmDealId: true, department: true, centreName: true, client: true },
          },
        },
      },
    },
  });
  const solicitud = entrega?.proposal?.tripRequest;
  if (!entrega || !solicitud) return null;
  if (solicitud.crmDealId) return null;

  const crudo = entrega.proposal.crmPayloadJson;
  if (!crudo) return null;
  let datos: PayloadDeOportunidad;
  try {
    datos = JSON.parse(crudo) as PayloadDeOportunidad;
  } catch {
    throw new Error("Los datos guardados para el trato del CRM no se pueden leer. Vuelve a preparar la propuesta.");
  }
  if (!datos?.contact?.email) {
    throw new Error("Faltan los datos de contacto para crear el trato del CRM. Vuelve a preparar la propuesta.");
  }

  // El departamento sale de la solicitud (lo eligió quien cotiza), no del
  // navegador: va al campo «Departamento» del trato.
  const departamento = (solicitud.department ?? entrega.department ?? departamentoDelUsuario ?? null) as
    | "GROUPS"
    | "SPORTS"
    | null;
  datos.opportunity = { ...(datos.opportunity ?? {}), department: departamento };

  const trato = await ensureTripRequestDealDb(solicitud.id, () => createZohoOpportunity(datos));
  if (trato.reused) return null;

  // La identidad que Zoho acaba de resolver se guarda en la ficha del cliente:
  // la próxima solicitud del mismo colegio se reconoce por su id.
  const resuelto = trato as { contactId?: string | null; accountId?: string | null };
  if (resuelto.contactId || resuelto.accountId) {
    try {
      await upsertClientFromIntakeDb({
        email: solicitud.client.email,
        firstName: solicitud.client.firstName,
        lastName: solicitud.client.lastName,
        clientType: "existing",
        centreName: solicitud.centreName ?? null,
        crmContactId: resuelto.contactId ?? null,
        crmAccountId: resuelto.accountId ?? null,
      });
    } catch {
      // No se corta el envío por esto: solo significa que la próxima vez
      // habrá que volver a buscar en Zoho.
    }
  }
  return datos.contact.email;
}
