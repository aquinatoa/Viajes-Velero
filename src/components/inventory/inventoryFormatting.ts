import type {
  InventoryTargetType,
  StagingReviewStatus,
} from "../../domain/documentImportTypes";

/** Mensaje legible de un error desconocido, con texto de respaldo. */
export function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

// Etiquetas compartidas por la lista de documentos y el workspace de detalle.
export const targetTypeLabels: Record<InventoryTargetType, string> = {
  ACCOMMODATION: "Alojamiento",
  ACTIVITY: "Actividad",
  MIXED: "Mixto",
  UNKNOWN: "No estoy seguro",
};

export const statusLabels: Record<string, string> = {
  UPLOADED: "Subido",
  ANALYZING: "Analizando",
  PENDING_REVIEW: "Pendiente de revisión",
  PARTIALLY_REVIEWED: "Revisado parcialmente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  PUBLISHED: "Publicado",
};

export const extractionStatusLabels: Record<string, string> = {
  NOT_STARTED: "No iniciado",
  EXTRACTING: "Extrayendo",
  EXTRACTED: "Extraído",
  PARTIALLY_EXTRACTED: "Extraído parcialmente",
  FAILED: "Fallido",
  NEEDS_OCR: "Requiere OCR",
};

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
