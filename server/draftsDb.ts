/**
 * Borradores de solicitud, en la base de datos.
 *
 * Antes vivían en el navegador de cada persona bajo UNA sola clave. Eso tenía
 * tres consecuencias que Ruth reportó como dos puntos distintos:
 *
 *   · empezar otra solicitud pisaba la anterior, así que solo había un borrador
 *   · no se podía volver a uno que ya existía
 *   · nadie podía continuar el de un compañero
 *
 * Aquí ya son filas: se listan, se retoman y se comparten según el mismo
 * criterio de departamento que las propuestas.
 *
 * El contenido va en JSON a propósito. Es lo que la persona lleva escrito en el
 * lienzo —mensajes pegados, campos corregidos a mano, hoteles marcados— y
 * cambia cada vez que cambia esa pantalla. Darle columnas obligaría a migrar la
 * base por cada ajuste de interfaz, y un borrador a medias no es un dato con el
 * que haya que razonar: es un apunte para seguir donde se dejó.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Pasados estos minutos, quien lo tenía abierto ya no lo tiene. */
const MINUTOS_DE_RESERVA = 30;

export interface BorradorGuardado {
  id: string;
  title: string;
  ownerUserId: string | null;
  department: string | null;
  payload: unknown;
  tripRequestId: string | null;
  lockedByUserId: string | null;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BorradorEnLista {
  id: string;
  title: string;
  ownerUserId: string | null;
  department: string | null;
  tripRequestId: string | null;
  /** Quién lo tiene abierto AHORA, si alguien lo tiene. */
  lockedByUserId: string | null;
  updatedAt: string;
}

function esReservaViva(lockedAt: Date | null): boolean {
  if (!lockedAt) return false;
  return Date.now() - lockedAt.getTime() < MINUTOS_DE_RESERVA * 60_000;
}

function aLista(row: {
  id: string;
  title: string;
  ownerUserId: string | null;
  department: string | null;
  tripRequestId: string | null;
  lockedByUserId: string | null;
  lockedAt: Date | null;
  updatedAt: Date;
}): BorradorEnLista {
  return {
    id: row.id,
    title: row.title,
    ownerUserId: row.ownerUserId,
    department: row.department,
    tripRequestId: row.tripRequestId,
    // Una reserva caducada es como si no estuviera: quien cerró el portátil el
    // viernes no puede dejar un borrador bloqueado hasta el lunes.
    lockedByUserId: esReservaViva(row.lockedAt) ? row.lockedByUserId : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Los borradores que este usuario puede ver.
 *
 * `where` llega resuelto del módulo de acceso, igual que en las propuestas:
 * quién ve qué se decide en un solo sitio.
 */
export async function listarBorradoresDb(where: Record<string, unknown> = {}) {
  const rows = await prisma.requestDraft.findMany({
    where: where as never,
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      ownerUserId: true,
      department: true,
      tripRequestId: true,
      lockedByUserId: true,
      lockedAt: true,
      updatedAt: true,
    },
  });
  return rows.map(aLista);
}

export async function leerBorradorDb(id: string): Promise<BorradorGuardado | null> {
  const row = await prisma.requestDraft.findUnique({ where: { id } });
  if (!row) return null;
  let payload: unknown = null;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    // Un borrador ilegible no debe tumbar la pantalla: se devuelve vacío y
    // quien lo abra empezará de nuevo, que es mejor que un error genérico.
    payload = null;
  }
  return {
    id: row.id,
    title: row.title,
    ownerUserId: row.ownerUserId,
    department: row.department,
    payload,
    tripRequestId: row.tripRequestId,
    lockedByUserId: esReservaViva(row.lockedAt) ? row.lockedByUserId : null,
    lockedAt: row.lockedAt ? row.lockedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface GuardarBorradorInput {
  /** Con id se actualiza ese borrador; sin id se crea uno. */
  id?: string | null;
  title: string;
  payload: unknown;
  tripRequestId?: string | null;
  ownerUserId?: string | null;
  department?: string | null;
  /** Quién está escribiendo. Renueva la reserva mientras trabaja. */
  userId?: string | null;
}

export async function guardarBorradorDb(input: GuardarBorradorInput) {
  const datos = {
    title: input.title.slice(0, 200),
    payload: JSON.stringify(input.payload ?? {}),
    tripRequestId: input.tripRequestId ?? null,
    lockedByUserId: input.userId ?? null,
    lockedAt: new Date(),
  };

  if (input.id) {
    const existe = await prisma.requestDraft.findUnique({
      where: { id: input.id },
      select: { id: true },
    });
    if (existe) {
      const row = await prisma.requestDraft.update({ where: { id: input.id }, data: datos });
      return aLista({ ...row });
    }
  }

  // Sin id, pero con una solicitud ya creada: es la MISMA solicitud, vista
  // desde una pestaña que no recuerda su borrador. Se continúa el que ya hay.
  //
  // Sin esto, cada recarga estrenaba fila: la pantalla llegó a listar cinco
  // «IES Jaume Balmes · Salou · 2027-05-18» idénticas, las cinco de la misma
  // solicitud y todas presentadas como trabajo a medias distinto.
  if (input.tripRequestId) {
    const hermano = await prisma.requestDraft.findFirst({
      where: { tripRequestId: input.tripRequestId },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (hermano) {
      const row = await prisma.requestDraft.update({ where: { id: hermano.id }, data: datos });
      return aLista({ ...row });
    }
  }

  const row = await prisma.requestDraft.create({
    data: {
      ...datos,
      // El dueño y el departamento se fijan al crearlo y no se tocan después:
      // que otro lo continúe no lo convierte en suyo.
      ownerUserId: input.ownerUserId ?? null,
      department: (input.department ?? null) as never,
    },
  });
  return aLista({ ...row });
}

/**
 * Quita el borrador de una solicitud que ya está enviada.
 *
 * Un borrador es trabajo a medias. Cuando la propuesta sale, deja de serlo, y
 * seguir listándolo hace que la pantalla de nueva solicitud ofrezca continuar
 * cosas que ya están hechas. Era el caso de las cinco de la captura: las cinco
 * apuntaban a una solicitud que existía desde hacía una hora.
 */
export async function borrarBorradorDeSolicitudDb(tripRequestId: string): Promise<number> {
  const { count } = await prisma.requestDraft.deleteMany({ where: { tripRequestId } });
  return count;
}

export async function borrarBorradorDb(id: string): Promise<boolean> {
  try {
    await prisma.requestDraft.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

/**
 * Tomar un borrador que otra persona tenía abierto.
 *
 * No hay cerrojo duro a propósito: si alguien se va de vacaciones con un
 * borrador abierto, su compañera tiene que poder seguirlo. Lo que sí hay es el
 * aviso de quién lo tenía, para que sea una decisión y no una sorpresa.
 */
export async function tomarBorradorDb(id: string, userId: string | null) {
  const row = await prisma.requestDraft.update({
    where: { id },
    data: { lockedByUserId: userId, lockedAt: new Date() },
  });
  return aLista({ ...row });
}
