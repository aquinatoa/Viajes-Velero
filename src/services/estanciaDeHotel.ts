import {
  gruposDeAlumnosPorTarifa,
  gruposDeChoferPorTarifa,
  gruposDeProfesoresPorTarifa,
  precioDeLaEstancia,
  type ComposicionDeLaEstancia,
  type ResultadoDeLaEstancia,
  type TarifaDeHotel,
} from "../domain/estancia";
import type { AccommodationRate, AccommodationSearchMatch } from "../domain/types";
import { applyDefaultMarkup } from "./pricing";

/**
 * La estancia aplicada a un hotel de la búsqueda (ver `domain/estancia.ts`).
 *
 * El precio de cada tarifa es el mismo que va al presupuesto: el PVP, o el
 * neto con el margen si el documento solo trae neto.
 */
function precioDe(t: Pick<AccommodationRate, "pvpAmount" | "netSaleAmount">): number {
  return t.pvpAmount || (t.netSaleAmount ? applyDefaultMarkup(t.netSaleAmount) : 0);
}

function comoTarifa(t: AccommodationRate): TarifaDeHotel {
  return {
    id: t.id,
    boardType: t.boardType,
    occupancyLabel: t.occupancyLabel,
    unitName: t.unitName || null,
    includedService: t.includedService || null,
    seasonName: t.seasonName || null,
    dateFrom: t.dateFrom || null,
    dateTo: t.dateTo || null,
    minNights: t.minNights || null,
    precio: precioDe(t),
    // El coste es el neto de venta, como en la propuesta (`proposalService`).
    coste: t.netSaleAmount > 0 ? t.netSaleAmount : null,
  };
}

export interface EstanciaDeHotel extends ResultadoDeLaEstancia {
  chofer: number;
}

/**
 * Cómo van los profesores y el chófer en las tarifas de UN hotel (06/11/2026):
 * cuántos en cada tarifa (tarifa → cantidad) y cuántos en gratuidad del hotel.
 * Los que no se asignan a ninguna van como dice el panel de la estancia.
 */
export interface AcompanantesDelHotel {
  profesores?: Record<string, number>;
  chofer?: Record<string, number>;
  gratisProfesores?: number;
  gratisChofer?: number;
}

export function estanciaDeHotel(
  hotel: AccommodationSearchMatch,
  composicion: ComposicionDeLaEstancia,
  viaje: { fechaEntrada: string; noches: number; alumnos: number; profesores: number; edad?: { min: number | null; max: number | null } | null },
  /** Cuántos alumnos van en cada tarifa de ESTE hotel (tarifa → cantidad); los demás, en la elegida. */
  asignacionDeAlumnos?: Record<string, number>,
  /** Lo mismo para profesores y chófer, y la gratuidad del hotel. */
  acompanantes?: AcompanantesDelHotel,
): EstanciaDeHotel | null {
  if (!viaje.fechaEntrada || viaje.noches <= 0) return null;
  const otras = [
    ...(hotel.singleRate ? [hotel.singleRate] : []),
    ...(hotel.alternativas ?? []),
  ].map(comoTarifa);
  const elegida = comoTarifa(hotel.rate);
  const bloques = gruposDeAlumnosPorTarifa([elegida, ...otras], elegida.id, asignacionDeAlumnos ?? {});
  const tarifas = [elegida, ...otras];
  const deProfesores = gruposDeProfesoresPorTarifa(tarifas, acompanantes?.profesores ?? {}, acompanantes?.gratisProfesores ?? 0);
  const deChofer = gruposDeChoferPorTarifa(tarifas, acompanantes?.chofer ?? {}, acompanantes?.gratisChofer ?? 0);
  const resultado = precioDeLaEstancia({
    fechaEntrada: viaje.fechaEntrada,
    noches: viaje.noches,
    alumnos: viaje.alumnos,
    profesores: viaje.profesores,
    composicion: {
      ...composicion,
      ...(bloques.length ? { alumnosOtros: bloques } : {}),
      // Los de la tabla primero: la gratuidad y las tarifas elegidas; después, los del panel.
      ...(deProfesores.length ? { profesoresOtros: [...deProfesores, ...(composicion.profesoresOtros ?? [])] } : {}),
      ...(deChofer.length ? { choferOtros: [...deChofer, ...(composicion.choferOtros ?? [])] } : {}),
    },
    edadGrupo: viaje.edad ?? null,
    elegida,
    otras,
    suplementos: hotel.suplementosHabitacion ?? {},
  });
  return { ...resultado, chofer: Math.max(composicion.chofer?.cantidad ?? 0, 0) };
}
