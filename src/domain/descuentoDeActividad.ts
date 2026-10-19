/**
 * El descuento de una actividad.
 *
 * Reunión del 19/10/2026: las actividades llevan 2 € menos por persona cuando
 * el colegio contrata también el alojamiento con Oravia, «para promocionar la
 * compra de alojamiento». Javier no lo quiere automático ni fijo: «en cada uno
 * de los conceptos de actividades poder elegir si aplica el descuento», y
 * abierto, «importe o porcentaje», para usarlo también en otras promociones.
 *
 * Se aplica al precio por persona: a la tarifa de la actividad o, si se cotiza
 * por líneas (tarifa × cantidad), a cada línea. Así el total, el precio por
 * alumno y el documento salen de las mismas cuentas.
 */
import type { LineaDeActividad } from "./lineasDeActividad";

export interface DescuentoDeActividad {
  /** EUR: tanto por persona. PCT: tanto por ciento del precio. */
  tipo: "EUR" | "PCT";
  valor: number;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Un descuento que se puede aplicar: mayor que cero y, si es porcentaje, hasta el 100. */
export function descuentoValido(d: DescuentoDeActividad | null | undefined): d is DescuentoDeActividad {
  if (!d || !Number.isFinite(d.valor) || d.valor <= 0) return false;
  return d.tipo === "EUR" || (d.tipo === "PCT" && d.valor <= 100);
}

/** El precio por persona con el descuento. Nunca por debajo de cero. */
export function precioConDescuento(precio: number, d: DescuentoDeActividad | null | undefined): number {
  if (!descuentoValido(d) || !(precio > 0)) return precio;
  const resultado = d.tipo === "EUR" ? precio - d.valor : precio * (1 - d.valor / 100);
  return Math.max(0, redondear(resultado));
}

/** Las líneas con el descuento aplicado a cada una. */
export function lineasConDescuento(
  lineas: LineaDeActividad[],
  d: DescuentoDeActividad | null | undefined,
): LineaDeActividad[] {
  if (!descuentoValido(d)) return lineas;
  return lineas.map((l) => ({ ...l, precio: precioConDescuento(l.precio, d) }));
}

const euros = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 })
    .format(n)
    .replace(/ /g, " ");

/** «2,00 € menos por persona» o «10 % menos». */
export function textoDelDescuento(d: DescuentoDeActividad | null | undefined): string {
  if (!descuentoValido(d)) return "";
  return d.tipo === "EUR" ? `${euros(d.valor)} menos por persona` : `${String(d.valor).replace(".", ",")} % menos`;
}
