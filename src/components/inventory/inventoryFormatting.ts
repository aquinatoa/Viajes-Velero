import type { StagingReviewStatus } from "../../domain/documentImportTypes";

/** Mensaje legible de un error desconocido, con texto de respaldo. */
export function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const currencySymbols: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
};

/** Formatea un importe con dos decimales en formato español y su moneda. */
export function formatAmount(amount: number, currency?: string | null): string {
  const formatted = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  const code = (currency ?? "EUR").trim().toUpperCase() || "EUR";
  const symbol = currencySymbols[code];
  return symbol ? `${formatted} ${symbol}` : `${formatted} ${code}`;
}

export const stagingReviewStatusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  NEEDS_CHANGES: "Requiere cambios",
};

export const stagingReviewStatusOptions: { value: StagingReviewStatus; label: string }[] = [
  { value: "PENDING", label: "Pendiente" },
  { value: "APPROVED", label: "Aprobado" },
  { value: "REJECTED", label: "Rechazado" },
  { value: "NEEDS_CHANGES", label: "Requiere cambios" },
];
