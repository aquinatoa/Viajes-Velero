/**
 * Borrar una solicitud entera: aquí, en el disco y en el CRM.
 *
 * Hasta ahora la app no sabía borrar nada. Una prueba que salía mal se quedaba
 * en la mesa de propuestas para siempre, y su oportunidad en Zoho también:
 * había que entrar al CRM y borrarla a mano, sabiendo cuál era. La captura que
 * mandó Anthony tenía once solicitudes de prueba seguidas, todas «IES RAMÓN Y
 * CAJAL 2027 · Salou», con sus once tratos detrás.
 *
 * Se borra la SOLICITUD, no la propuesta suelta. Una solicitud puede tener
 * varias versiones de propuesta y cada una varios envíos; borrar solo el último
 * envío dejaría el expediente a medias y el trato del CRM vivo, que es
 * exactamente el problema que se quiere resolver.
 *
 * El orden importa: primero el CRM y después la base. Si el CRM falla, aquí no
 * se ha tocado nada y se puede reintentar. Al revés, un fallo dejaría un trato
 * huérfano en Zoho sin nada en la app que dijera cuál era.
 */

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import type { AuthedUser } from "./auth";
import { eliminarTratoEnCrm } from "./zoho";

const prisma = new PrismaClient();

const STORAGE_ROOT = path.resolve(
  process.env.ORAVIA_STORAGE_DIR ?? path.join(process.cwd(), "storage"),
  "proposal-deliveries",
);

/** Lo que se ha llevado por delante el borrado, para contarlo y para el registro. */
export interface ResultadoDelBorrado {
  tripRequestId: string;
  titulo: string;
  propuestas: number;
  envios: number;
  referencias: string[];
  /** Qué pasó con el trato del CRM. `null` si esta solicitud no llegó a tener. */
  crm: "BORRADO" | "NO_ESTABA" | null;
  crmDealId: string | null;
}

export class SolicitudNoBorrable extends Error {}

/** Lo que hace falta saber de una solicitud para decidir si puede borrarse. */
type SolicitudParaBorrar = Awaited<ReturnType<typeof leerSolicitud>>;

/**
 * Lee la solicitud SOLO si este usuario puede verla.
 *
 * La visibilidad entra como filtro de Prisma, no como un `if` escrito aquí: la
 * regla de quién ve qué vive en `auth.ts` y en un solo sitio. Una solicitud que
 * el usuario no puede ver responde igual que una que no existe, a propósito: si
 * respondiera «no tienes permiso», la propia negativa confirmaría que existe.
 */
function leerSolicitud(tripRequestId: string, visibilidad: Record<string, unknown>) {
  return prisma.tripRequest.findFirst({
    where: { AND: [{ id: tripRequestId }, visibilidad] } as never,
    include: {
      proposals: { include: { deliveries: true } },
    },
  });
}

/** Todos los envíos de la solicitud, de todas sus versiones de propuesta. */
function enviosDe(solicitud: NonNullable<SolicitudParaBorrar>) {
  return solicitud.proposals.flatMap((propuesta) => propuesta.deliveries);
}

/**
 * ¿Esta propuesta llegó a salir de casa?
 *
 * Ojo con `sentAt`: una entrega `SIMULATED` TAMBIÉN lo graba. Simulado
 * significa que el PDF se generó y el correo no salió, porque todavía no hay
 * clave del buzón, y es justo el estado en el que se quedan todas las pruebas.
 * Mirando solo la fecha, ninguna prueba sería borrable y esto no serviría para
 * lo que se pidió.
 *
 * Lo que sí cuenta en una simulada es que alguien la haya abierto: el enlace
 * público se puede pasar a mano, y si lo han visto es que está fuera.
 */
function yaSalioAlColegio(envio: { status: string; sentAt: Date | null; viewCount: number }): boolean {
  if (envio.viewCount > 0) return true;
  if (envio.status === "SIMULATED") return false;
  return envio.status === "SENT" || envio.sentAt !== null;
}

/**
 * Por qué NO se puede borrar, o `null` si se puede.
 *
 * La regla protege lo que ya es real y deja pasar lo que solo existe aquí:
 *
 *   · Con el depósito cobrado no se borra nunca, ni siendo administrador. Eso
 *     ya es un viaje vendido y hay dinero de por medio.
 *   · Si salió al colegio o si el colegio eligió opción, solo un administrador
 *     global. Alguien de fuera tiene el PDF en su bandeja y la referencia en un
 *     hilo: borrarlo aquí no lo hace desaparecer de allí.
 *   · Lo demás —preparado y sin enviar— lo borra quien pueda verlo.
 */
export function porQueNoSePuedeBorrar(
  solicitud: NonNullable<SolicitudParaBorrar>,
  usuario: AuthedUser,
): string | null {
  const envios = enviosDe(solicitud);

  if (envios.some((envio) => envio.depositPaidAt)) {
    return "Esta solicitud tiene el depósito cobrado: es un viaje vendido y no se borra.";
  }

  const salio = envios.some(yaSalioAlColegio);
  const eligieron = envios.some((envio) => envio.chosenOptionNumber !== null);

  if ((salio || eligieron) && usuario.role !== "ADMIN") {
    return eligieron
      ? "El colegio ya eligió una opción. Solo un administrador puede borrarla."
      : "Esta propuesta ya salió al colegio. Solo un administrador puede borrarla.";
  }

  return null;
}

/**
 * Lo que se va a borrar, para enseñarlo ANTES de pedir la confirmación.
 *
 * Trae también el motivo por el que NO se podría, si lo hay. Así la pantalla lo
 * dice antes de que nadie pulse, sin que la regla tenga que estar escrita otra
 * vez en el navegador: duplicada acabaría diciendo una cosa aquí y otra allí.
 */
export async function queSeVaABorrar(
  tripRequestId: string,
  usuario: AuthedUser,
  visibilidad: Record<string, unknown> = {},
) {
  const solicitud = await leerSolicitud(tripRequestId, visibilidad);
  if (!solicitud) return null;

  const envios = enviosDe(solicitud);
  return {
    motivoNoBorrable: porQueNoSePuedeBorrar(solicitud, usuario),
    tripRequestId: solicitud.id,
    titulo: solicitud.opportunityName ?? solicitud.destinationText ?? "Solicitud sin nombre",
    centreName: solicitud.centreName,
    propuestas: solicitud.proposals.length,
    envios: envios.length,
    referencias: envios.map((envio) => envio.reference),
    enviadaAlColegio: envios.some(yaSalioAlColegio),
    crmDealId: solicitud.crmDealId,
    crmDealUrl: solicitud.crmDealUrl,
  };
}

/** Quita del disco los PDF de una entrega. Que falte no es un fallo. */
function borrarPdfsDe(referencia: string): void {
  const carpeta = path.join(STORAGE_ROOT, referencia);
  try {
    fs.rmSync(carpeta, { recursive: true, force: true });
  } catch (error) {
    // El expediente se borra igual: un PDF suelto en disco no lo resucita, y
    // dejar la fila por culpa de un fichero bloqueado sería peor.
    console.error(`No se pudo borrar la carpeta ${carpeta}`, error);
  }
}

/**
 * Borra la solicitud entera. Devuelve lo que se ha llevado por delante.
 *
 * Lanza `SolicitudNoBorrable` si la regla no lo permite, y deja pasar el error
 * del CRM tal cual si Zoho falla: en ese caso aquí no se ha borrado nada.
 */
export async function borrarSolicitudDb(
  tripRequestId: string,
  usuario: AuthedUser,
  visibilidad: Record<string, unknown> = {},
): Promise<ResultadoDelBorrado | null> {
  const solicitud = await leerSolicitud(tripRequestId, visibilidad);
  if (!solicitud) return null;

  const impedimento = porQueNoSePuedeBorrar(solicitud, usuario);
  if (impedimento) throw new SolicitudNoBorrable(impedimento);

  const envios = enviosDe(solicitud);
  const referencias = envios.map((envio) => envio.reference);

  // 1. El CRM primero. Si esto falla, no se ha tocado nada de aquí.
  let crm: ResultadoDelBorrado["crm"] = null;
  if (solicitud.crmDealId) {
    crm = await eliminarTratoEnCrm(solicitud.crmDealId);
  }

  // 2. Los PDF del disco, antes de perder las referencias con las que se llaman.
  for (const referencia of referencias) borrarPdfsDe(referencia);

  // 3. El borrador que originó la solicitud apunta a ella por un id suelto, sin
  //    clave ajena: si no se limpia, queda señalando a una solicitud que ya no
  //    existe y el reintento del cierre se cree que ya está hecha.
  await prisma.requestDraft.updateMany({
    where: { tripRequestId: solicitud.id },
    data: { tripRequestId: null },
  });

  // 4. Y la solicitud. Las propuestas, sus opciones y sus envíos caen con ella:
  //    todas las relaciones son `onDelete: Cascade`.
  await prisma.tripRequest.delete({ where: { id: solicitud.id } });

  return {
    tripRequestId: solicitud.id,
    titulo: solicitud.opportunityName ?? solicitud.destinationText ?? "Solicitud sin nombre",
    propuestas: solicitud.proposals.length,
    envios: envios.length,
    referencias,
    crm,
    crmDealId: solicitud.crmDealId,
  };
}
