export function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function toIsoDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

export function diffNights(dateFrom: string, dateTo: string) {
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

/** Importe redondeado a euros. Para leer de un vistazo, no para cuadrar cuentas. */
export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Importe con céntimos, para todo lo que el cliente pueda multiplicar.
 *
 * El desglose de la propuesta usaba el formato redondeado y no cuadraba: una
 * tarifa de 34,56 € se imprimía «35 € x 55 alumnos ... x 4 noches», que da
 * 8.400, junto a un total de 8.294 €. Un colegio que hace la cuenta encuentra
 * 106 € de diferencia y deja de fiarse del resto del documento.
 */
export function formatCurrencyExact(amount: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}
