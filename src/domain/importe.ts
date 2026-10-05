/**
 * Leer un importe escrito para personas y devolver el número.
 *
 * Existe porque había TRES versiones de esto y dos estaban mal. La de
 * `crmService` —la que decide el importe de la oportunidad en Zoho— hacía:
 *
 *     text.replace(/[^\d]/g, "")
 *
 * Es decir, se quedaba con los dígitos y tiraba la coma. «5.951,94 €» salía
 * como **595194**, cien veces el importe real, y con él el depósito del 30%.
 * Ese número está ahora mismo en tratos reales del CRM de Oravia.
 *
 * El comentario que lo acompañaba explica cómo se coló: «"6.528 €" → 6528».
 * Con importes redondos funcionaba. En cuanto los totales llevaron céntimos,
 * dejó de funcionar y nada avisó, porque un número grande de más no da ningún
 * error: se guarda tan campante.
 *
 * La convención es la española, que es la que usa el formateador de la app:
 * el punto separa los miles y la coma los decimales.
 */

/**
 * El número que hay dentro de un texto con formato de dinero.
 *
 * Devuelve null cuando no hay ninguno, en vez de cero: un cero es un importe
 * real y confundirlo con «no se sabe» manda un trato a Zoho con importe cero.
 */
export function importeDe(texto: string | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;

  const limpio = String(texto)
    // Fuera el símbolo, los espacios y cualquier letra.
    .replace(/[^\d.,-]/g, "")
    // El punto que separa miles: solo cuenta si van EXACTAMENTE tres dígitos
    // detrás. Así «1.234» son mil doscientos treinta y cuatro y «1.23» es uno
    // con veintitrés.
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  if (!limpio || limpio === "-" || limpio === ".") return null;

  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}
