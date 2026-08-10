/**
 * Regla de precios de Oravia (frontend) — "Opción A" (15/07/2026).
 * Espejo de `server/pricing.ts`: el coste llega del documento y la venta (PVP)
 * se calcula con un margen del 8% salvo que exista un PVP explícito.
 * Mantener ambos ficheros en sincronía si cambia el margen.
 */

export const DEFAULT_MARKUP_PERCENT = 8;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Aplica el margen por defecto (8%) sobre un coste/neto. */
export function applyDefaultMarkup(cost: number, markupPercent: number = DEFAULT_MARKUP_PERCENT): number {
  return round2(cost * (1 + markupPercent / 100));
}
