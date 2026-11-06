/**
 * La gratuidad de un hotel, leída de lo que dice su documento.
 *
 * Vienen como texto en la columna «Gratuidades» y se guardan así en el alojamiento
 * (`freePolicy`): «1 gratuidad cada 25 de pago (hab. múltiple)», «1 gratuidad en
 * base doble por cada 25 de pago», «2 gratis por cada 10 alumnos». Hasta el
 * 06/11/2026 solo se enseñaban: nadie sabía cuántos profesores iban gratis ni lo
 * veía en la tabla de tarifas, que es donde se decide a qué tarifa va cada uno.
 *
 * Aquí se entiende, para poder DECIR cuántos profesores son gratuidad con el grupo
 * de la petición. Aplicarlo al precio es una decisión de quien cotiza, no de esta
 * función: una gratuidad puede estar sujeta a condiciones que el texto no recoge.
 */

export interface GratuidadDeHotel {
  /** Cuántas plazas gratis… */
  gratis: number;
  /** …por cada tanto de alumnos de pago. */
  cada: number;
  /** Lo que dice el documento, sin el punto final. */
  texto: string;
  /** La habitación a la que se refiere, si lo dice: «doble», «multiple»… */
  enHabitacion: string | null;
}

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** La gratuidad «N por cada M» que dice el texto, o null si no dice ninguna (o dice «consultar»). */
export function gratuidadDeHotel(freePolicy: string | null | undefined): GratuidadDeHotel | null {
  const texto = (freePolicy ?? "").trim();
  if (!texto) return null;
  for (const frase of texto.split(/\s*[|;\n]\s*|(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ0-9])/)) {
    const t = normal(frase);
    const m = /(\d+)\s*(?:profesor(?:es)?\s*|plaza(?:s)?\s*)?(?:gratuidad(?:es)?|gratis)\b[^0-9]{0,50}?\bcada\s*(\d+)/.exec(t);
    if (!m) continue;
    const gratis = Number(m[1]);
    const cada = Number(m[2]);
    if (!(gratis > 0 && cada > 0)) continue;
    const habitacion = /base\s+(doble|individual|triple)|hab(?:itacion)?\.?\s*(multiple|doble|individual)/.exec(t);
    return { gratis, cada, texto: frase.trim().replace(/\.$/, ""), enHabitacion: habitacion ? (habitacion[1] ?? habitacion[2]) : null };
  }
  return null;
}

/** Cuántos profesores caben en la gratuidad con ese grupo: N por cada M alumnos, sin pasar de los profesores. */
export function profesoresEnGratuidad(g: GratuidadDeHotel | null | undefined, alumnos: number, profesores: number): number {
  if (!g || alumnos <= 0 || profesores <= 0) return 0;
  return Math.min(Math.floor(profesores), Math.floor(alumnos / g.cada) * g.gratis);
}
