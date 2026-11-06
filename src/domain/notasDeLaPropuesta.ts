/**
 * Las «Notas» de una propuesta.
 *
 * Reunión con Oravia, 05/11/2026: hace falta un campo de texto libre en la
 * propuesta para lo que no cabe en las opciones (horarios de entrenamiento,
 * condiciones de pago, lo que se ha hablado con el cliente…). Lo que se escribe
 * ahí LO LEE EL CLIENTE: sale en el PDF y en la página del enlace, tal cual.
 *
 * Se guardan dentro de `stayJson`, junto al resto del estado del lienzo que ya
 * viaja con la propuesta (canal, composición, descuentos…): así «Rehacer» y los
 * cambios del cliente las conservan sin más, y no hace falta una migración de la
 * base de datos.
 */

/** Más largas que esto no caben en una página del documento sin romperlo. */
export const MAX_NOTAS = 2000;

/** Las notas limpias: sin retornos de Windows, sin espacios de más y sin párrafos vacíos de sobra. */
export function limpiarNotas(texto: unknown): string {
  if (typeof texto !== "string") return "";
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_NOTAS)
    .trim();
}

/** Las notas guardadas en la propuesta, o «» si no tiene (las de antes, o sin notas). */
export function notasGuardadas(stayJson: string | null | undefined): string {
  if (!stayJson) return "";
  try {
    const guardado = JSON.parse(stayJson) as Record<string, unknown> | null;
    return limpiarNotas(guardado?.notas);
  } catch {
    return "";
  }
}
