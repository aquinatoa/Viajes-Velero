/**
 * El suplemento B2C de un alojamiento o de una actividad.
 *
 * Ruth, 24/11/2026: «establece entonces el poder subir € o % sobre el neto de
 * B2B». Se monta como el descuento (en € o en %, en cada alojamiento y en cada
 * actividad), pero sumando, y va DENTRO del precio: el documento del cliente
 * enseña el precio ya con el suplemento, sin una línea aparte. El coste no
 * cambia, así que lo que se sube es margen.
 *
 * Qué es «€» en cada caso:
 *   · en un alojamiento, € por persona y noche (sus tarifas son por persona y
 *     noche): se suma al precio de cada tarifa;
 *   · en una actividad, € por persona: se suma a cada entrada de pago.
 * El porcentaje sube cada precio ese tanto por ciento.
 *
 * Lo gratuito (la gratuidad de profesores), el descuento y lo que no tiene
 * precio no se tocan.
 */
import type { LineaDeActividad } from "./lineasDeActividad";

export interface SuplementoB2C {
  /** EUR: tanto por persona (y noche, en un alojamiento). PCT: tanto por ciento del precio. */
  tipo: "EUR" | "PCT";
  valor: number;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Un suplemento que se puede aplicar: mayor que cero y, si es porcentaje, hasta el 100. */
export function suplementoValido(s: SuplementoB2C | null | undefined): s is SuplementoB2C {
  if (!s || !Number.isFinite(s.valor) || s.valor <= 0) return false;
  return s.tipo === "EUR" || (s.tipo === "PCT" && s.valor <= 100);
}

/** El precio con el suplemento. Lo que no tiene precio (cero o menos) se queda igual. */
export function precioConSuplemento(precio: number, s: SuplementoB2C | null | undefined): number {
  if (!suplementoValido(s) || !(precio > 0)) return precio;
  return redondear(s.tipo === "EUR" ? precio + s.valor : precio * (1 + s.valor / 100));
}

/**
 * Las entradas de una actividad con el suplemento: a cada una de pago. La
 * gratuidad (precio 0) y el descuento (en negativo) se quedan como están.
 */
export function lineasConSuplemento(lineas: LineaDeActividad[], s: SuplementoB2C | null | undefined): LineaDeActividad[] {
  if (!suplementoValido(s)) return lineas;
  return lineas.map((l) => (l.precio > 0 ? { ...l, precio: precioConSuplemento(l.precio, s) } : l));
}

const euros = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 })
    .format(n)
    .replace(/[  ]/g, " ");

/** «+2,00 € por persona y noche», «+2,00 € por persona» o «+10 %». */
export function textoDelSuplemento(s: SuplementoB2C | null | undefined, enAlojamiento = false): string {
  if (!suplementoValido(s)) return "";
  if (s.tipo === "PCT") return `+${String(s.valor).replace(".", ",")} %`;
  return `+${euros(s.valor)} ${enAlojamiento ? "por persona y noche" : "por persona"}`;
}

/** El suplemento de un alojamiento o actividad guardado en el estado de la propuesta (`stayJson`). */
export function suplementoGuardado(stayJson: string | null | undefined, id: string | null | undefined): SuplementoB2C | null {
  if (!stayJson || !id) return null;
  try {
    const g = JSON.parse(stayJson) as Record<string, unknown> | null;
    const todos = g?.suplementosB2C as Record<string, SuplementoB2C> | undefined;
    const s = todos?.[id];
    return suplementoValido(s) ? s : null;
  } catch {
    return null;
  }
}
