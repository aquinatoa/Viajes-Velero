/**
 * El descuento de una actividad.
 *
 * Reunión del 19/10/2026: las actividades llevan 2 € menos por persona cuando
 * el colegio contrata también el alojamiento con Oravia, «para promocionar la
 * compra de alojamiento». Javier no lo quiere automático ni fijo: «en cada uno
 * de los conceptos de actividades poder elegir si aplica el descuento», y
 * abierto, «importe o porcentaje», para usarlo también en otras promociones.
 *
 * «€ por persona» es lo que paga de menos CADA ALUMNO, que es el precio que ve
 * el colegio. Hasta el 23/10/2026 se restaba a cada línea, profesores
 * incluidos, y ese descuento de más se repartía entre los alumnos: Ruth puso
 * 4 € en el circuito de tirolinas (35 alumnos + 2 profesores, 22,95 €) y el
 * precio por alumno bajó de 24,26 a 20,03, 4,23 € y no 4. En una tarifa por
 * grupo o por hora, además, restaba 4 € al precio del grupo entero. Ahora va
 * en una línea propia, «− alumnos × importe», que se ve en el documento y
 * cuadra con cualquier unidad.
 *
 * El porcentaje sí va a cada línea: un 10 % menos de cada cosa es un 10 %
 * menos del total, y del precio por alumno.
 */
import { totalDeLineas, type LineaDeActividad } from "./lineasDeActividad";

/** La línea del descuento en euros lleva este id: no es una tarifa. */
export const MARCA_DESCUENTO = "#descuento";
export const esLineaDeDescuento = (l: Pick<LineaDeActividad, "rateId">) => l.rateId === MARCA_DESCUENTO;

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

/**
 * Las líneas con el descuento.
 *
 * - Porcentaje: a cada línea.
 * - Euros: una línea más, «alumnos × −importe». Nunca deja el total por debajo
 *   de cero. Sin alumnos no hay a quién descontar y las líneas no cambian.
 */
export function lineasConDescuento(
  lineas: LineaDeActividad[],
  d: DescuentoDeActividad | null | undefined,
  alumnos: number,
): LineaDeActividad[] {
  const sinDescuento = lineas.filter((l) => !esLineaDeDescuento(l));
  if (!descuentoValido(d)) return sinDescuento;
  if (d.tipo === "PCT") return sinDescuento.map((l) => ({ ...l, precio: precioConDescuento(l.precio, d) }));

  const total = totalDeLineas(sinDescuento.filter((l) => l.cantidad > 0));
  if (!(alumnos > 0) || !(total > 0)) return sinDescuento;
  // Lo más que se puede quitar por alumno es lo que paga, al céntimo por abajo.
  const tope = Math.floor((total / alumnos) * 100) / 100;
  const importe = Math.min(redondear(d.valor), tope);
  if (!(importe > 0)) return sinDescuento;
  return [
    ...sinDescuento,
    { rateId: MARCA_DESCUENTO, etiqueta: "descuento por alumno", precio: -importe, cantidad: alumnos },
  ];
}

const euros = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 })
    .format(n)
    .replace(/ /g, " ");

/** «2,00 € menos por alumno» o «10 % menos». */
export function textoDelDescuento(d: DescuentoDeActividad | null | undefined): string {
  if (!descuentoValido(d)) return "";
  return d.tipo === "EUR" ? `${euros(d.valor)} menos por alumno` : `${String(d.valor).replace(".", ",")} % menos`;
}
