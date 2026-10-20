import {
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

export function estanciaDeHotel(
  hotel: AccommodationSearchMatch,
  composicion: ComposicionDeLaEstancia,
  viaje: { fechaEntrada: string; noches: number; alumnos: number; profesores: number; edad?: { min: number | null; max: number | null } | null },
): EstanciaDeHotel | null {
  if (!viaje.fechaEntrada || viaje.noches <= 0) return null;
  const otras = [
    ...(hotel.singleRate ? [hotel.singleRate] : []),
    ...(hotel.alternativas ?? []),
  ].map(comoTarifa);
  const resultado = precioDeLaEstancia({
    fechaEntrada: viaje.fechaEntrada,
    noches: viaje.noches,
    alumnos: viaje.alumnos,
    profesores: viaje.profesores,
    composicion,
    edadGrupo: viaje.edad ?? null,
    elegida: comoTarifa(hotel.rate),
    otras,
    suplementos: hotel.suplementosHabitacion ?? {},
  });
  return { ...resultado, chofer: Math.max(composicion.chofer?.cantidad ?? 0, 0) };
}
