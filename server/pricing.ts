/**
 * Regla de precios de Oravia — "Opción A" acordada con el cliente (15/07/2026).
 * ---------------------------------------------------------------------------
 * El documento de tarifas trae el COSTE (lo que a Oravia le cuesta el hotel o
 * la actividad). El precio de VENTA (PVP) se calcula aplicando un margen por
 * defecto del 8% sobre el coste.
 *
 * Excepción: si el documento trae un PVP de venta explícito, ESE prevalece
 * (permite márgenes distintos del 8% por producto). Nunca se inventa un precio:
 * si no hay ni coste ni PVP, se devuelve null y la tarifa se omite aguas arriba.
 */

/** Margen de venta por defecto sobre el coste (%). */
export const DEFAULT_MARKUP_PERCENT = 8;

/** Redondeo a 2 decimales estable (evita 12.345000001). */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Precio de venta a partir del coste y (opcionalmente) un PVP explícito.
 *
 * @param cost      coste/neto del documento (puede ser null)
 * @param explicitPvp PVP de venta si el documento lo trae (prevalece); null si no
 * @param markupPercent margen a aplicar sobre el coste (por defecto 8%)
 * @returns el PVP de venta, o null si no hay base para calcularlo
 */
export function deriveSalePrice(
  cost: number | null | undefined,
  explicitPvp: number | null | undefined,
  markupPercent: number = DEFAULT_MARKUP_PERCENT,
): number | null {
  if (explicitPvp !== null && explicitPvp !== undefined && explicitPvp > 0) {
    return round2(explicitPvp);
  }
  if (cost !== null && cost !== undefined && cost > 0) {
    return round2(cost * (1 + markupPercent / 100));
  }
  return null;
}
