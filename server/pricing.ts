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

/**
 * Qué precios trae un documento de tarifas. Se declara al subirlo.
 * - PURCHASE: los importes son coste; la venta se calcula con el margen.
 * - SALE: los importes son precio de venta; se guardan tal cual, sin tocar.
 * - UNKNOWN: documentos anteriores a esta declaración. Se mantiene el
 *   comportamiento antiguo para no reescribir su historia.
 */
export type RateKind = "PURCHASE" | "SALE" | "UNKNOWN";

export interface RateAmounts {
  pvpAmount?: number | null;
  netAmount?: number | null;
  costAmount?: number | null;
}

export interface ResolvedRatePrices {
  /** Precio de venta a publicar. null = la tarifa no se puede publicar. */
  salePrice: number | null;
  /** Coste conocido, si el documento lo aporta. */
  costPrice: number | null;
}

function firstPositive(...values: Array<number | null | undefined>): number | null {
  for (const value of values) {
    if (value !== null && value !== undefined && value > 0) return value;
  }
  return null;
}

/**
 * Traduce los importes que sacó la IA a coste y venta, guiándose por lo que el
 * usuario declaró al subir el documento en vez de por en qué campo cayó cada
 * cifra.
 *
 * El porqué: la IA reparte los importes entre pvp/neto/coste según lo que
 * intuye del texto, y en la prueba del 10/08/2026 lo hizo distinto en cada
 * fichero — la tarifa de venta del turoperador suizo cayó en "neto" y se habría
 * publicado con un 8% encima de lo pactado. Con el tipo declarado, dónde caiga
 * la cifra deja de importar.
 */
export function resolveRatePrices(
  amounts: RateAmounts,
  rateKind: RateKind,
  marginPercent?: number | null,
): ResolvedRatePrices {
  const { pvpAmount, netAmount, costAmount } = amounts;

  if (rateKind === "PURCHASE") {
    // Todo lo que trae el documento es coste, esté en el campo que esté.
    const cost = firstPositive(costAmount, netAmount, pvpAmount);
    const markup = marginPercent ?? DEFAULT_MARKUP_PERCENT;
    return { salePrice: deriveSalePrice(cost, null, markup), costPrice: cost };
  }

  if (rateKind === "SALE") {
    // Todo lo que trae el documento es venta. No se le suma margen: ya lo lleva.
    const sale = firstPositive(pvpAmount, netAmount, costAmount);
    return { salePrice: sale === null ? null : round2(sale), costPrice: null };
  }

  // UNKNOWN: comportamiento anterior — neto/coste como base, PVP explícito manda.
  const cost = firstPositive(netAmount, costAmount);
  return {
    salePrice: deriveSalePrice(cost, pvpAmount),
    costPrice: cost,
  };
}

/** Normaliza a uno de los tres valores admitidos. */
export function toRateKind(value: unknown): RateKind {
  return value === "PURCHASE" || value === "SALE" ? value : "UNKNOWN";
}
