/**
 * Cambios del cliente sobre un viaje ya propuesto.
 *
 * El caso que planteó Javier en la reunión del 17/06: *"este grupo que has
 * creado, mañana nos llega un mail y nos dicen: ahora, en vez de 48, seremos
 * 46. ¿Cómo gestionamos esto desde la aplicación?"*. Hasta ahora se rehacía a
 * mano, con el riesgo de equivocarse en los números.
 *
 * Dos gestos separados, como en el envío:
 * 1. `previewChange` lee el mensaje nuevo y dice QUÉ CAMBIARÍA. No toca nada.
 * 2. `applyChange` lo aplica: actualiza la solicitud y crea una VERSIÓN NUEVA
 *    de la propuesta.
 *
 * Por qué versión nueva y no editar la que hay: si la propuesta ya salió, el
 * colegio tiene un PDF con unos precios. Cambiar esos precios por debajo
 * dejaría dos verdades distintas con la misma referencia. Cada versión tiene
 * la suya.
 */

import { PrismaClient } from "@prisma/client";
import { searchAccommodationsDb } from "./searchDb";

const prisma = new PrismaClient();

/** Lo que cambia en un campo, para poder enseñarlo antes de aplicarlo. */
export interface CampoCambiado {
  campo: string;
  etiqueta: string;
  antes: string;
  ahora: string;
}

export interface OpcionRecalculada {
  optionNumber: number;
  accommodationName: string;
  precioAntes: number | null;
  precioAhora: number | null;
  totalAntes: number | null;
  totalAhora: number | null;
  aviso: string | null;
}

export interface VistaPreviaCambio {
  proposalId: string;
  hayCambios: boolean;
  campos: CampoCambiado[];
  opciones: OpcionRecalculada[];
  avisos: string[];
}

/** Número que aparece en un texto de importe ("6.528 €" → 6528). */
function importeDe(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const digitos = texto.replace(/[^\d]/g, "");
  return digitos ? Number(digitos) : null;
}

function noches(desde: Date | null, hasta: Date | null): number {
  if (!desde || !hasta) return 0;
  return Math.max(Math.round((hasta.getTime() - desde.getTime()) / 86_400_000), 0);
}

function fechaCorta(valor: Date | null): string {
  return valor ? valor.toISOString().slice(0, 10) : "sin fecha";
}

/**
 * Lo que el lector del front ha entendido del mensaje nuevo. El idioma se
 * interpreta allí, donde ya vive esa lógica; aquí se trabaja con datos y
 * precios. Todos los campos son opcionales: un correo que solo dice "seremos
 * 46" no debe borrar el destino ni las fechas.
 */
export interface DatosLeidos {
  participants?: number | null;
  teachers?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  regimeRequested?: string | null;
  destinationText?: string | null;
}

/** Qué cambiaría si aplicásemos este mensaje. No modifica nada. */
export async function previewChange(
  proposalId: string,
  leido: DatosLeidos,
): Promise<VistaPreviaCambio> {
  const proposal = await prisma.tripProposal.findUnique({
    where: { id: proposalId },
    include: {
      accommodationOptions: { orderBy: { optionNumber: "asc" } },
      tripRequest: true,
    },
  });
  if (!proposal) throw new Error("La propuesta no existe.");

  const solicitud = proposal.tripRequest;

  // Solo se tienen en cuenta los datos que el mensaje trae de verdad: un correo
  // que solo dice "seremos 46" no debe borrar el destino ni las fechas.
  const campos: CampoCambiado[] = [];
  const nuevoParticipantes = leido.participants ?? solicitud.participants;
  const nuevoTeachers = leido.teachers ?? solicitud.teachers;
  const nuevaDesde = leido.dateFrom ? new Date(leido.dateFrom) : solicitud.dateFrom;
  const nuevaHasta = leido.dateTo ? new Date(leido.dateTo) : solicitud.dateTo;
  const nuevoRegimen = leido.regimeRequested || solicitud.regimeRequested;

  if (nuevoParticipantes !== solicitud.participants) {
    campos.push({
      campo: "participants",
      etiqueta: "Alumnos",
      antes: String(solicitud.participants ?? "sin dato"),
      ahora: String(nuevoParticipantes ?? "sin dato"),
    });
  }
  if (nuevoTeachers !== solicitud.teachers) {
    campos.push({
      campo: "teachers",
      etiqueta: "Profesores",
      antes: String(solicitud.teachers ?? "sin dato"),
      ahora: String(nuevoTeachers ?? "sin dato"),
    });
  }
  if (fechaCorta(nuevaDesde) !== fechaCorta(solicitud.dateFrom)) {
    campos.push({ campo: "dateFrom", etiqueta: "Desde", antes: fechaCorta(solicitud.dateFrom), ahora: fechaCorta(nuevaDesde) });
  }
  if (fechaCorta(nuevaHasta) !== fechaCorta(solicitud.dateTo)) {
    campos.push({ campo: "dateTo", etiqueta: "Hasta", antes: fechaCorta(solicitud.dateTo), ahora: fechaCorta(nuevaHasta) });
  }
  if (nuevoRegimen !== solicitud.regimeRequested) {
    campos.push({
      campo: "regimeRequested",
      etiqueta: "Régimen",
      antes: solicitud.regimeRequested || "sin dato",
      ahora: nuevoRegimen || "sin dato",
    });
  }

  const avisos: string[] = [];
  const opciones: OpcionRecalculada[] = [];

  if (campos.length > 0) {
    // Se vuelven a consultar las tarifas con los datos nuevos: el precio por
    // alumno depende de las noches y del número de participantes.
    const busqueda = await searchAccommodationsDb({
      destinationText: leido.destinationText || solicitud.destinationText || "",
      dateFrom: nuevaDesde ? fechaCorta(nuevaDesde) : undefined,
      dateTo: nuevaHasta ? fechaCorta(nuevaHasta) : undefined,
      participants: nuevoParticipantes,
      boardType: nuevoRegimen ?? undefined,
    });

    const nochesNuevas = noches(nuevaDesde, nuevaHasta);

    for (const opcion of proposal.accommodationOptions) {
      const encontrado = busqueda.matches.find((m) => m.accommodation.id === opcion.accommodationId);
      // `totalPvpText` guarda el TOTAL del grupo (precio unitario × alumnos ×
      // noches). El precio por alumno se obtiene dividiendo, no al revés.
      const totalAntes = importeDe(opcion.totalPvpText);
      const precioAntes =
        totalAntes !== null && opcion.participants
          ? Math.round((totalAntes / opcion.participants) * 100) / 100
          : null;

      if (!encontrado) {
        opciones.push({
          optionNumber: opcion.optionNumber,
          accommodationName: opcion.accommodationNameSnapshot ?? "Alojamiento",
          precioAntes,
          precioAhora: null,
          totalAntes,
          totalAhora: null,
          aviso: "Ya no hay tarifa para las fechas nuevas: hay que elegir otro hotel.",
        });
        avisos.push(`${opcion.accommodationNameSnapshot ?? "Una opción"} se queda sin tarifa con los datos nuevos.`);
        continue;
      }

      const unidad = encontrado.rate.pvpAmount || encontrado.rate.netSaleAmount || 0;
      const precioAhora = Math.round(unidad * Math.max(nochesNuevas, 1) * 100) / 100;
      const totalAhora = nuevoParticipantes
        ? Math.round(precioAhora * nuevoParticipantes * 100) / 100
        : null;

      opciones.push({
        optionNumber: opcion.optionNumber,
        accommodationName: opcion.accommodationNameSnapshot ?? "Alojamiento",
        precioAntes,
        precioAhora,
        totalAntes,
        totalAhora,
        aviso: null,
      });
    }
  }

  return {
    proposalId,
    hayCambios: campos.length > 0,
    campos,
    opciones,
    avisos,
  };
}

export interface ResultadoCambio {
  proposalId: string;
  versionNumber: number;
  cambios: number;
}

/**
 * Aplica el cambio: actualiza la solicitud y crea una versión nueva de la
 * propuesta con los mismos hoteles y actividades, recalculados.
 */
export async function applyChange(
  proposalId: string,
  leido: DatosLeidos,
  mensaje: string,
): Promise<ResultadoCambio> {
  const vista = await previewChange(proposalId, leido);
  if (!vista.hayCambios) throw new Error("Ese mensaje no cambia nada de la solicitud.");

  const proposal = await prisma.tripProposal.findUnique({
    where: { id: proposalId },
    include: {
      accommodationOptions: { orderBy: { optionNumber: "asc" } },
      activityOptions: true,
      tripRequest: true,
    },
  });
  if (!proposal) throw new Error("La propuesta no existe.");

  const cambio = Object.fromEntries(vista.campos.map((c) => [c.campo, c.ahora]));
  const datos: Record<string, unknown> = {};
  if (cambio.participants) datos.participants = Number(cambio.participants) || null;
  if (cambio.teachers) datos.teachers = Number(cambio.teachers) || null;
  if (cambio.dateFrom) datos.dateFrom = new Date(cambio.dateFrom);
  if (cambio.dateTo) datos.dateTo = new Date(cambio.dateTo);
  if (cambio.regimeRequested) datos.regimeRequested = cambio.regimeRequested;

  // El mensaje nuevo se guarda con el original: el historial de la solicitud es
  // la conversación entera, no la última foto.
  datos.originalMessage = `${proposal.tripRequest.originalMessage}\n\n--- Cambio del cliente ---\n${mensaje}`;

  await prisma.tripRequest.update({ where: { id: proposal.tripRequestId }, data: datos });

  const ultima = await prisma.tripProposal.findFirst({
    where: { tripRequestId: proposal.tripRequestId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const versionNumber = (ultima?.versionNumber ?? proposal.versionNumber) + 1;

  const participantes = Number(cambio.participants) || proposal.tripRequest.participants;

  const nueva = await prisma.tripProposal.create({
    data: {
      tripRequestId: proposal.tripRequestId,
      versionNumber,
      proposalStatus: "READY_FOR_APPROVAL",
      summaryText: `Versión ${versionNumber} tras el cambio del cliente.`,
      accommodationOptions: {
        create: proposal.accommodationOptions.map((opcion) => {
          const recalculada = vista.opciones.find((o) => o.optionNumber === opcion.optionNumber);
          return {
            accommodationId: opcion.accommodationId,
            optionNumber: opcion.optionNumber,
            accommodationNameSnapshot: opcion.accommodationNameSnapshot,
            boardType: opcion.boardType,
            dateFrom: (datos.dateFrom as Date) ?? opcion.dateFrom,
            dateTo: (datos.dateTo as Date) ?? opcion.dateTo,
            nights: noches((datos.dateFrom as Date) ?? opcion.dateFrom, (datos.dateTo as Date) ?? opcion.dateTo),
            participants: participantes,
            teachers: Number(cambio.teachers) || opcion.teachers,
            totalPvpText:
              recalculada?.totalAhora != null
                ? `${recalculada.totalAhora.toLocaleString("es-ES")} €`
                : opcion.totalPvpText,
            priceBreakdownText: opcion.priceBreakdownText,
            conditionsText: opcion.conditionsText,
            observationsText: opcion.observationsText,
            isSelected: opcion.isSelected,
          };
        }),
      },
      activityOptions: {
        create: proposal.activityOptions.map((actividad) => ({
          activityId: actividad.activityId,
          optionNumber: actividad.optionNumber,
          displayOrder: actividad.displayOrder,
          activityNameSnapshot: actividad.activityNameSnapshot,
          providerSnapshot: actividad.providerSnapshot,
          durationSnapshot: actividad.durationSnapshot,
          pvpSnapshot: actividad.pvpSnapshot,
          descriptionSnapshot: actividad.descriptionSnapshot,
          isSelected: actividad.isSelected,
        })),
      },
    },
  });

  return { proposalId: nueva.id, versionNumber, cambios: vista.campos.length };
}
