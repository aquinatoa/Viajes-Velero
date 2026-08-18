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

export interface TotalAlojamientoInput {
  /** Precio por pax y noche de la ocupación compartida (los alumnos). */
  unitPrice: number;
  /** Precio por pax y noche de los profesores; normalmente, uso individual. */
  teacherPrice: number;
  participants: number;
  teachers: number;
  nights: number;
}

/**
 * Lo que cuesta el alojamiento de un grupo.
 *
 * Los profesores se cobran, y a su precio. Antes el total era
 * `precio x alumnos x noches`: en un grupo de 40 alumnos y 4 profesores, cuatro
 * personas dormían gratis toda la semana. Y en Fútbol Salou el profesor va en
 * habitación individual, que cuesta 19 € más por noche que la doble.
 */
export function totalAlojamiento(input: TotalAlojamientoInput): number {
  const noches = Math.max(input.nights, 0);
  const alumnos = Math.max(input.participants, 0);
  const profesores = Math.max(input.teachers, 0);
  return round2((input.unitPrice * alumnos + input.teacherPrice * profesores) * noches);
}
