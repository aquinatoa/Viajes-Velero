import { Fragment, useEffect, useState } from "react";
import type {
  AiDocumentAnalysisResult,
  CreateSourceDocumentInput,
  DocumentExtraction,
  DryRunPublishResult,
  DryRunUnpublishResult,
  ImportIssue,
  InventoryDocumentDetail,
  InventoryTargetType,
  PublishApprovedResult,
  PublishedInventorySummary,
  SourceDocumentSummary,
  StagingEntityKey,
  StagingReviewStatus,
  UnpublishResult,
} from "../../domain/documentImportTypes";
import {
  analyzeInventoryDocumentApi,
  analyzeInventoryDocumentWithAiApi,
  bulkUpdateInventoryStagingApi,
  createInventoryDocumentApi,
  createInventoryDocumentStagingApi,
  dryRunPublishApprovedInventoryDocumentApi,
  dryRunUnpublishInventoryDocumentApi,
  getInventoryDocumentApi,
  getPublishedInventoryByDocumentApi,
  listInventoryDocumentsApi,
  patchInventoryStagingApi,
  publishApprovedInventoryDocumentApi,
  regenerateInventoryDocumentStagingApi,
  unpublishInventoryDocumentApi,
  uploadInventoryDocumentFileApi,
} from "../../services/apiClient";

const targetTypeLabels: Record<InventoryTargetType, string> = {
  ACCOMMODATION: "Alojamiento",
  ACTIVITY: "Actividad",
  MIXED: "Mixto",
  UNKNOWN: "No estoy seguro",
};

const statusLabels: Record<string, string> = {
  UPLOADED: "Subido",
  ANALYZING: "Analizando",
  PENDING_REVIEW: "Pendiente de revisión",
  PARTIALLY_REVIEWED: "Revisado parcialmente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  PUBLISHED: "Publicado",
};

const extractionStatusLabels: Record<string, string> = {
  NOT_STARTED: "No iniciado",
  EXTRACTING: "Extrayendo",
  EXTRACTED: "Extraído",
  PARTIALLY_EXTRACTED: "Extraído parcialmente",
  FAILED: "Fallido",
  NEEDS_OCR: "Requiere OCR",
};

const extractionMethodLabels: Record<string, string> = {
  TEXT: "Texto",
  TABLE: "Tabla",
  OCR: "OCR",
  AI: "IA",
  MANUAL: "Manual",
};

const issueSeverityLabels: Record<string, string> = {
  INFO: "Información",
  WARNING: "Aviso",
  ERROR: "Error",
  CRITICAL: "Crítico",
};

type DocumentActionKey = "analyze";

const initialForm: CreateSourceDocumentInput = {
  targetType: "ACCOMMODATION",
  controlName: "",
  controlLocation: "",
  controlYear: new Date().getFullYear(),
  controlCategory: "",
  controlNotes: "",
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString();
}

function formatFileSize(bytes?: number | null) {
  if (bytes == null) {
    return "-";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${Math.round(kilobytes)} KB`;
  }

  return `${(kilobytes / 1024).toFixed(2)} MB`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const currencySymbols: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
};

/** Formatea un importe con dos decimales en formato español y su moneda. */
function formatAmount(amount: number, currency?: string | null): string {
  const formatted = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  const code = (currency ?? "EUR").trim().toUpperCase() || "EUR";
  const symbol = currencySymbols[code];
  return symbol ? `${formatted} ${symbol}` : `${formatted} ${code}`;
}

interface AnnotatedExtraction {
  extraction: DocumentExtraction;
  isCurrentText: boolean;
  isHistoricalText: boolean;
}

/**
 * Marca la extracción TEXT más reciente como actual y las TEXT anteriores como
 * históricas, sin alterar ni eliminar datos. Las extracciones llegan ya
 * ordenadas de más reciente a más antigua desde el backend.
 */
function annotateExtractions(extractions: DocumentExtraction[]): AnnotatedExtraction[] {
  let textSeen = false;

  return extractions.map((extraction) => {
    const isText = extraction.extractionMethod === "TEXT";
    const isCurrentText = isText && !textSeen;

    if (isText) {
      textSeen = true;
    }

    return {
      extraction,
      isCurrentText,
      isHistoricalText: isText && !isCurrentText,
    };
  });
}

const stagingReviewStatusLabels: Record<string, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  NEEDS_CHANGES: "Requiere cambios",
};

const stagingReviewStatusOptions: { value: StagingReviewStatus; label: string }[] = [
  { value: "PENDING", label: "Pendiente" },
  { value: "APPROVED", label: "Aprobado" },
  { value: "REJECTED", label: "Rechazado" },
  { value: "NEEDS_CHANGES", label: "Requiere cambios" },
];

const reviewStatusOrder: StagingReviewStatus[] = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "NEEDS_CHANGES",
];

interface QualitySummary {
  /** Conteo de candidatos por estado de revisión (todas las entidades staging). */
  counts: Record<string, number>;
  totalCandidates: number;
  /** Advertencias de calidad calculadas antes de publicar (solo lectura). */
  warnings: string[];
}

function isApprovedReview(status: unknown): boolean {
  return String(status) === "APPROVED";
}

/**
 * Clasifica las advertencias del dry-run en críticas (afectan a lo que se
 * publicaría: tarifas aprobadas sin precio o sin moneda, alojamiento/actividad
 * no aprobado con tarifas aprobadas, o ningún candidato aprobado) e
 * informativas (p. ej. políticas/suplementos que se plegarán a texto libre).
 * Las críticas se destacan antes de confirmar, pero no bloquean la decisión.
 */
function classifyDryRunWarnings(warnings: string[]): {
  critical: string[];
  info: string[];
} {
  const critical: string[] = [];
  const info: string[] = [];

  for (const warning of warnings) {
    const lower = warning.toLowerCase();
    const isCritical =
      lower.includes("sin precio") ||
      lower.includes("sin moneda") ||
      lower.includes("no está aprobad") ||
      lower.includes("no hay candidatos aprobados");

    if (isCritical) {
      critical.push(warning);
    } else {
      info.push(warning);
    }
  }

  return { critical, info };
}

const issueTypeLabels: Record<string, string> = {
  EXTRACTION_PENDING_FOR_TYPE: "Extracción pendiente para el tipo",
  TEXT_ALREADY_EXTRACTED: "Texto ya extraído",
  NO_TEXT_LAYER: "Sin capa de texto",
  PDF_EXTRACTION_FAILED: "Fallo de extracción de PDF",
  AI_ANALYSIS_EXECUTED: "Análisis IA ejecutado",
  STAGING_CANDIDATES_CREATED: "Candidatos creados",
  STAGING_AMBIGUOUS_DATA: "Datos ambiguos en candidatos",
  PUBLISH_COMPLETED: "Publicación completada",
  PUBLISH_WARNING: "Aviso de publicación",
  UNPUBLISH_COMPLETED: "Publicación retirada",
  ANALYSIS_PLACEHOLDER: "Marcador de posición (antiguo)",
};

const issueSeverityRank: Record<string, number> = {
  INFO: 0,
  WARNING: 1,
  ERROR: 2,
  CRITICAL: 3,
};

/** Tipos de incidencia heredados de versiones anteriores (no del flujo actual). */
const historicalIssueTypes = new Set(["ANALYSIS_PLACEHOLDER"]);

interface ImportIssueGroup {
  issueType: string;
  /** Severidad más alta encontrada dentro del grupo. */
  severity: string;
  count: number;
  resolvedCount: number;
  /** Mensaje más reciente del grupo (las incidencias llegan de nuevas a viejas). */
  latestMessage: string;
  isHistorical: boolean;
  issues: ImportIssue[];
}

/**
 * Agrupa las incidencias por tipo para reducir el ruido de los eventos de
 * trazabilidad repetidos (p. ej. "Análisis IA ejecutado" se registra en cada
 * ejecución). Es de solo lectura: no borra ni modifica incidencias.
 */
function groupImportIssues(issues: ImportIssue[]): {
  groups: ImportIssueGroup[];
  severityCounts: Record<string, number>;
  resolvedTotal: number;
} {
  const map = new Map<string, ImportIssueGroup>();
  const severityCounts: Record<string, number> = {
    INFO: 0,
    WARNING: 0,
    ERROR: 0,
    CRITICAL: 0,
  };
  let resolvedTotal = 0;

  for (const issue of issues) {
    const severity = String(issue.severity);
    // Los conteos por severidad reflejan solo las incidencias activas; las
    // resueltas (p. ej. eventos antiguos superados) se cuentan aparte.
    if (issue.resolved) {
      resolvedTotal += 1;
    } else {
      severityCounts[severity] = (severityCounts[severity] ?? 0) + 1;
    }

    const existing = map.get(issue.issueType);
    if (!existing) {
      map.set(issue.issueType, {
        issueType: issue.issueType,
        severity,
        count: 1,
        resolvedCount: issue.resolved ? 1 : 0,
        latestMessage: issue.message,
        isHistorical: historicalIssueTypes.has(issue.issueType),
        issues: [issue],
      });
      continue;
    }

    existing.count += 1;
    if (issue.resolved) {
      existing.resolvedCount += 1;
    }
    if ((issueSeverityRank[severity] ?? 0) > (issueSeverityRank[existing.severity] ?? 0)) {
      existing.severity = severity;
    }
    existing.issues.push(issue);
  }

  const groups = Array.from(map.values()).sort((a, b) => {
    const bySeverity =
      (issueSeverityRank[b.severity] ?? 0) - (issueSeverityRank[a.severity] ?? 0);
    if (bySeverity !== 0) {
      return bySeverity;
    }
    return b.count - a.count;
  });

  return { groups, severityCounts, resolvedTotal };
}

const issueSeverityOrder = ["CRITICAL", "ERROR", "WARNING", "INFO"];

/**
 * Panel consolidado de incidencias de importación: conteos por severidad y
 * grupos plegables por tipo. Solo lectura.
 */
function ImportIssuesPanel({ issues }: { issues: ImportIssue[] }) {
  if (issues.length === 0) {
    return (
      <>
        <div className="section-card__header compact">
          <div>
            <h4>Incidencias de importación</h4>
            <p>0 incidencia(s)</p>
          </div>
        </div>
        <p>No hay incidencias registradas.</p>
      </>
    );
  }

  const { groups, severityCounts, resolvedTotal } = groupImportIssues(issues);
  const hasHistorical = groups.some((group) => group.isHistorical);
  const activeTotal = issues.length - resolvedTotal;

  return (
    <>
      <div className="section-card__header compact">
        <div>
          <h4>Incidencias de importación</h4>
          <p>
            {activeTotal} activa(s)
            {resolvedTotal > 0 ? ` (+${resolvedTotal} resuelta(s))` : ""} en {groups.length} tipo(s)
          </p>
        </div>
      </div>

      <div className="issue-counts">
        {issueSeverityOrder
          .filter((severity) => (severityCounts[severity] ?? 0) > 0)
          .map((severity) => (
            <span className={`issue-count issue-count--${severity.toLowerCase()}`} key={severity}>
              {issueSeverityLabels[severity] ?? severity}: <strong>{severityCounts[severity]}</strong>
            </span>
          ))}
      </div>

      {hasHistorical ? (
        <p className="issue-note">
          Las incidencias marcadas como "Histórica" provienen de versiones anteriores; se conservan
          para trazabilidad y no afectan al análisis actual.
        </p>
      ) : null}

      <ul className="issue-groups">
        {groups.map((group) => (
          <li key={group.issueType} className="issue-group">
            <details>
              <summary>
                <span className={`issue-badge issue-badge--${group.severity.toLowerCase()}`}>
                  {issueSeverityLabels[group.severity] ?? group.severity}
                </span>
                <span className="issue-group__type">
                  {issueTypeLabels[group.issueType] ?? group.issueType}
                </span>
                {group.count > 1 ? (
                  <span className="issue-group__count">×{group.count}</span>
                ) : null}
                {group.isHistorical ? (
                  <span className="issue-badge issue-badge--historical">Histórica</span>
                ) : null}
                {group.resolvedCount > 0 ? (
                  <span className="issue-group__resolved">
                    {group.resolvedCount} resuelta(s)
                  </span>
                ) : null}
                <span className="issue-group__latest">{group.latestMessage}</span>
              </summary>
              <ul className="detail-list issue-group__list">
                {group.issues.map((issue) => (
                  <li key={issue.id}>
                    <span>{issue.message}</span>
                    {issue.resolved ? <em> (resuelta)</em> : null}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Calcula un resumen de control de calidad a partir del detalle del documento.
 * Es de solo lectura: no modifica datos, no publica nada y refleja la misma
 * lógica que aplica el backend al publicar (sin ejecutarla).
 */
function computeQualitySummary(detail: InventoryDocumentDetail): QualitySummary {
  const counts: Record<string, number> = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
    NEEDS_CHANGES: 0,
  };
  let totalCandidates = 0;

  const tally = (status: unknown) => {
    const key = String(status ?? "PENDING");
    counts[key] = (counts[key] ?? 0) + 1;
    totalCandidates += 1;
  };

  // El backend solo omite por año cuando no hay año en la tarifa NI año de
  // control en el documento; reflejamos esa misma condición para no alarmar.
  const hasControlYear = detail.controlYear != null;

  let approvedRatesNoPrice = 0;
  let approvedRatesNoCurrency = 0;
  let approvedRatesNoYear = 0;
  let orphanApprovedRates = 0;
  let foldedPolicies = 0;
  let foldedAdjustments = 0;
  let foldedBlackouts = 0;

  for (const accommodation of detail.stagingAccommodations) {
    tally(accommodation.reviewStatus);
    const parentApproved = isApprovedReview(accommodation.reviewStatus);

    for (const rate of accommodation.rates) {
      tally(rate.reviewStatus);
      if (!isApprovedReview(rate.reviewStatus)) {
        continue;
      }
      const hasPrice = rate.pvpAmount != null || rate.netAmount != null;
      if (!hasPrice) approvedRatesNoPrice += 1;
      if (!rate.currency || String(rate.currency).trim() === "") approvedRatesNoCurrency += 1;
      if (rate.year == null && !hasControlYear) approvedRatesNoYear += 1;
      if (!parentApproved) orphanApprovedRates += 1;
    }

    for (const adjustment of accommodation.adjustments) {
      tally(adjustment.reviewStatus);
      if (isApprovedReview(adjustment.reviewStatus) && parentApproved) foldedAdjustments += 1;
    }
    for (const policy of accommodation.policies) {
      tally(policy.reviewStatus);
      if (isApprovedReview(policy.reviewStatus) && parentApproved) foldedPolicies += 1;
    }
    for (const blackout of accommodation.blackoutDates) {
      tally(blackout.reviewStatus);
      if (isApprovedReview(blackout.reviewStatus) && parentApproved) foldedBlackouts += 1;
    }
  }

  for (const activity of detail.stagingActivities) {
    tally(activity.reviewStatus);
    const parentApproved = isApprovedReview(activity.reviewStatus);

    for (const rate of activity.rates) {
      tally(rate.reviewStatus);
      if (!isApprovedReview(rate.reviewStatus)) {
        continue;
      }
      if (rate.salePvpAmount == null) approvedRatesNoPrice += 1;
      if (!rate.currency || String(rate.currency).trim() === "") approvedRatesNoCurrency += 1;
      if (rate.year == null && !hasControlYear) approvedRatesNoYear += 1;
      if (!parentApproved) orphanApprovedRates += 1;
    }

    for (const policy of activity.policies) {
      tally(policy.reviewStatus);
      if (isApprovedReview(policy.reviewStatus) && parentApproved) foldedPolicies += 1;
    }
  }

  const warnings: string[] = [];
  if (approvedRatesNoPrice > 0) {
    warnings.push(
      `Hay ${approvedRatesNoPrice} tarifa(s) aprobada(s) sin precio (PVP ni neto); se omitirán al publicar.`,
    );
  }
  if (approvedRatesNoCurrency > 0) {
    warnings.push(
      `Hay ${approvedRatesNoCurrency} tarifa(s) aprobada(s) sin moneda; se omitirán al publicar.`,
    );
  }
  if (approvedRatesNoYear > 0) {
    warnings.push(
      `Hay ${approvedRatesNoYear} tarifa(s) aprobada(s) sin año y el documento no tiene año de control; se omitirán al publicar.`,
    );
  }
  if (orphanApprovedRates > 0) {
    warnings.push(
      `Hay ${orphanApprovedRates} tarifa(s) aprobada(s) cuyo alojamiento o actividad no está aprobado; no se publicarán.`,
    );
  }
  const foldedTotal = foldedPolicies + foldedAdjustments + foldedBlackouts;
  if (foldedTotal > 0) {
    warnings.push(
      `Se publicarán como texto libre ${foldedPolicies} política(s), ${foldedAdjustments} suplemento(s) y ${foldedBlackouts} fecha(s) especial(es); se pierde su estructura.`,
    );
  }
  const pending = (counts.PENDING ?? 0) + (counts.NEEDS_CHANGES ?? 0);
  if (pending > 0) {
    warnings.push(
      `Hay ${pending} candidato(s) pendiente(s) o que requieren cambios sin revisar.`,
    );
  }

  return { counts, totalCandidates, warnings };
}

/**
 * Cuenta las tarifas aprobadas que SÍ se publicarían (con precio, moneda y año
 * resoluble), replicando las reglas de publicación. Sirve para detectar cambios
 * aprobados aún no publicados comparando con la trazabilidad en vivo.
 */
function countApprovedPublishableRates(detail: InventoryDocumentDetail): number {
  const hasControlYear = detail.controlYear != null;
  let total = 0;

  for (const accommodation of detail.stagingAccommodations) {
    if (!isApprovedReview(accommodation.reviewStatus)) continue;
    for (const rate of accommodation.rates) {
      if (!isApprovedReview(rate.reviewStatus)) continue;
      const hasPrice = rate.pvpAmount != null || rate.netAmount != null;
      const hasCurrency = !!rate.currency && String(rate.currency).trim() !== "";
      const hasYear = rate.year != null || hasControlYear;
      if (hasPrice && hasCurrency && hasYear) total += 1;
    }
  }
  for (const activity of detail.stagingActivities) {
    if (!isApprovedReview(activity.reviewStatus)) continue;
    for (const rate of activity.rates) {
      if (!isApprovedReview(rate.reviewStatus)) continue;
      const hasPrice = rate.salePvpAmount != null;
      const hasCurrency = !!rate.currency && String(rate.currency).trim() !== "";
      const hasYear = rate.year != null || hasControlYear;
      if (hasPrice && hasCurrency && hasYear) total += 1;
    }
  }
  return total;
}

interface QualityControlPanelProps {
  summary: QualitySummary;
}

/**
 * Resumen visual de control de calidad: conteos por estado de revisión y
 * advertencias previas a la publicación. No publica ni modifica nada.
 */
function QualityControlPanel(props: QualityControlPanelProps) {
  const { counts, totalCandidates, warnings } = props.summary;

  return (
    <div className="qc-panel">
      <div className="qc-panel__head">
        <strong>Control de calidad</strong>
        <span className="qc-panel__total">{totalCandidates} candidato(s)</span>
      </div>

      <div className="qc-counts">
        {reviewStatusOrder.map((status) => (
          <span className={`qc-count qc-count--${status.toLowerCase()}`} key={status}>
            {stagingReviewStatusLabels[status] ?? status}: <strong>{counts[status] ?? 0}</strong>
          </span>
        ))}
      </div>

      {warnings.length > 0 ? (
        <div className="qc-warnings" role="status">
          <span className="ai-result__label">Antes de publicar, revisa:</span>
          <ul className="detail-list">
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="qc-panel__ok">Sin alertas de calidad detectadas.</p>
      )}

      <p className="qc-panel__note">
        Recuerda: un candidato "Aprobado" todavía no está en el inventario operativo hasta que
        pulses "Publicar aprobados". Que el staging aparezca como "No publicado" es normal: no es
        un error.
      </p>
    </div>
  );
}

type StagingFieldType = "text" | "number" | "date";

interface StagingFieldDef {
  key: string;
  label: string;
  type: StagingFieldType;
}

const accommodationFields: StagingFieldDef[] = [
  { key: "accommodationName", label: "Nombre", type: "text" },
  { key: "locality", label: "Localidad", type: "text" },
  { key: "province", label: "Provincia", type: "text" },
  { key: "categoryType", label: "Categoría", type: "text" },
  { key: "accommodationType", label: "Tipo", type: "text" },
  { key: "providerName", label: "Proveedor", type: "text" },
];

const accommodationRateFields: StagingFieldDef[] = [
  { key: "seasonName", label: "Temporada", type: "text" },
  { key: "year", label: "Año", type: "number" },
  { key: "dateFrom", label: "Fecha inicio", type: "date" },
  { key: "dateTo", label: "Fecha fin", type: "date" },
  { key: "boardType", label: "Régimen", type: "text" },
  { key: "minNights", label: "Noches mínimas", type: "number" },
  { key: "occupancyLabel", label: "Ocupación", type: "text" },
  { key: "pvpAmount", label: "Precio PVP", type: "number" },
  { key: "netAmount", label: "Precio neto", type: "number" },
  { key: "costAmount", label: "Coste", type: "number" },
  { key: "currency", label: "Moneda", type: "text" },
];

const accommodationAdjustmentFields: StagingFieldDef[] = [
  { key: "adjustmentType", label: "Tipo", type: "text" },
  { key: "concept", label: "Concepto", type: "text" },
  { key: "amountType", label: "Tipo de importe", type: "text" },
  { key: "amount", label: "Importe", type: "number" },
  { key: "appliesPer", label: "Aplica por", type: "text" },
  { key: "conditionText", label: "Condición", type: "text" },
];

const accommodationPolicyFields: StagingFieldDef[] = [
  { key: "policyType", label: "Tipo", type: "text" },
  { key: "policyText", label: "Texto", type: "text" },
];

const accommodationBlackoutFields: StagingFieldDef[] = [
  { key: "dateFrom", label: "Fecha inicio", type: "date" },
  { key: "dateTo", label: "Fecha fin", type: "date" },
  { key: "availabilityStatus", label: "Disponibilidad", type: "text" },
  { key: "reason", label: "Motivo", type: "text" },
];

const activityFields: StagingFieldDef[] = [
  { key: "activityName", label: "Nombre", type: "text" },
  { key: "supplierName", label: "Proveedor", type: "text" },
  { key: "locationMain", label: "Ubicación", type: "text" },
  { key: "activityType", label: "Tipo", type: "text" },
  { key: "durationText", label: "Duración", type: "text" },
  { key: "descriptionText", label: "Descripción", type: "text" },
];

const activityRateFields: StagingFieldDef[] = [
  { key: "seasonName", label: "Temporada", type: "text" },
  { key: "year", label: "Año", type: "number" },
  { key: "dateFrom", label: "Fecha inicio", type: "date" },
  { key: "dateTo", label: "Fecha fin", type: "date" },
  { key: "ageLabel", label: "Edad", type: "text" },
  { key: "salePvpAmount", label: "Precio PVP", type: "number" },
  { key: "costNetAmount", label: "Coste neto", type: "number" },
  { key: "currency", label: "Moneda", type: "text" },
];

const activityPolicyFields: StagingFieldDef[] = [
  { key: "policyType", label: "Tipo", type: "text" },
  { key: "policyText", label: "Texto", type: "text" },
];

interface StagingEditableCardProps {
  entity: StagingEntityKey;
  id: string;
  title: string;
  fields: StagingFieldDef[];
  values: object;
  reviewStatus: string;
  rawText?: string | null;
  structuredJson?: unknown;
  summary?: React.ReactNode;
  /** Si true, la tarjeta se muestra plegada (resumen en una línea, editar al expandir). */
  collapsible?: boolean;
  onSaved: () => Promise<void> | void;
}

function StagingEditableCard(props: StagingEditableCardProps) {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const sourceValues = props.values as Record<string, unknown>;
    const initial: Record<string, string> = {};
    for (const field of props.fields) {
      const value = sourceValues[field.key];
      if (value === null || value === undefined) {
        initial[field.key] = "";
      } else if (field.type === "date") {
        initial[field.key] = String(value).slice(0, 10);
      } else {
        initial[field.key] = String(value);
      }
    }
    return initial;
  });
  const [status, setStatus] = useState<string>(props.reviewStatus || "PENDING");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-sincroniza el estado mostrado cuando cambia desde fuera (acciones en
  // lote, regeneración, refresco): la tarjeta se reutiliza por su key y el
  // useState inicial no se vuelve a ejecutar.
  useEffect(() => {
    setStatus(props.reviewStatus || "PENDING");
    setSaved(false);
  }, [props.reviewStatus]);

  async function handleSave() {
    setError(null);
    setSaved(false);

    for (const field of props.fields) {
      const raw = fieldValues[field.key] ?? "";
      if (field.type === "number" && raw.trim() !== "" && !Number.isFinite(Number(raw))) {
        setError(`El campo ${field.label} debe ser numérico.`);
        return;
      }
    }

    setSaving(true);
    try {
      const patch: Record<string, unknown> = { reviewStatus: status };
      for (const field of props.fields) {
        const raw = (fieldValues[field.key] ?? "").trim();
        if (field.type === "number") {
          patch[field.key] = raw === "" ? null : Number(raw);
        } else if (field.type === "date") {
          patch[field.key] = raw === "" ? null : raw;
        } else {
          patch[field.key] = raw;
        }
      }

      await patchInventoryStagingApi(props.entity, props.id, patch);
      setSaved(true);
      await props.onSaved();
    } catch (saveError) {
      setError(getErrorMessage(saveError, "No se pudo guardar el candidato."));
    } finally {
      setSaving(false);
    }
  }

  const statusLabel = stagingReviewStatusLabels[status] ?? status;
  const statusClass = `staging-card__status staging-card__status--${status.toLowerCase()}`;

  const editableBody = (
    <>
      <div className="grid two">
        {props.fields.map((field) => (
          <label className="field" key={field.key}>
            <span>{field.label}</span>
            <input
              type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
              value={fieldValues[field.key] ?? ""}
              onChange={(event) =>
                setFieldValues((current) => ({
                  ...current,
                  [field.key]: event.target.value,
                }))
              }
            />
          </label>
        ))}

        <label className="field">
          <span>Estado de revisión</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {stagingReviewStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {props.rawText ? (
        <>
          <span className="ai-result__label">Texto de origen</span>
          <pre className="extraction-text">{props.rawText}</pre>
        </>
      ) : null}

      {props.structuredJson ? (
        <>
          <span className="ai-result__label">Datos estructurados</span>
          <pre className="extraction-text">{JSON.stringify(props.structuredJson, null, 2)}</pre>
        </>
      ) : null}

      {error ? (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      ) : null}

      {saved ? <small>Cambios guardados.</small> : null}

      <button type="button" disabled={saving} onClick={() => void handleSave()}>
        {saving ? "Guardando..." : "Guardar candidato"}
      </button>
    </>
  );

  if (props.collapsible) {
    return (
      <details className="staging-card staging-card--collapsible">
        <summary className="staging-card__summary-row">
          <span className="staging-card__title">{props.title}</span>
          {props.summary ? (
            <span className="staging-card__summary-inline">{props.summary}</span>
          ) : null}
          <span className={statusClass}>{statusLabel}</span>
        </summary>
        <div className="staging-card__body">{editableBody}</div>
      </details>
    );
  }

  return (
    <div className="staging-card">
      <div className="staging-card__head">
        <strong>{props.title}</strong>
        <span className={statusClass}>{statusLabel}</span>
      </div>

      {props.summary ? <div className="staging-card__summary">{props.summary}</div> : null}

      {editableBody}
    </div>
  );
}

interface RateLike {
  id: string;
  reviewStatus: string;
  year?: number | null;
  seasonName?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  boardType?: string | null;
  occupancyLabel?: string | null;
  minNights?: number | null;
  ageLabel?: string | null;
  currency?: string | null;
  pvpAmount?: number | null;
  netAmount?: number | null;
  costAmount?: number | null;
  salePvpAmount?: number | null;
  costNetAmount?: number | null;
  rawText?: string | null;
}

/** Periodo legible de una tarifa: rango de fechas o temporada. */
function formatRatePeriod(rate: RateLike): string {
  const fmt = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  };
  const from = fmt(rate.dateFrom);
  const to = fmt(rate.dateTo);
  if (from && to) return `${from} → ${to}`;
  if (from) return `desde ${from}`;
  if (rate.seasonName) return rate.seasonName;
  return "—";
}

/** Precio principal compacto de una tarifa, con su tipo. */
function compactPrice(
  rate: RateLike,
  kind: "accommodation" | "activity",
): { amount: number | null; label: string } {
  if (kind === "accommodation") {
    if (rate.pvpAmount != null) return { amount: Number(rate.pvpAmount), label: "PVP" };
    if (rate.netAmount != null) return { amount: Number(rate.netAmount), label: "neto" };
    if (rate.costAmount != null) return { amount: Number(rate.costAmount), label: "coste" };
    return { amount: null, label: "" };
  }
  if (rate.salePvpAmount != null) return { amount: Number(rate.salePvpAmount), label: "PVP" };
  if (rate.costNetAmount != null) return { amount: Number(rate.costNetAmount), label: "coste" };
  return { amount: null, label: "" };
}

type CandidateItem = {
  id: string;
  reviewStatus: string;
  rawText?: string | null;
  structuredJson?: unknown;
} & Record<string, unknown>;

interface CandidateColumn {
  header: string;
  render: (item: CandidateItem) => React.ReactNode;
}

/** Celda de texto segura: muestra "—" si el valor está vacío. */
function cell(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

/** Celda de precio: importe principal con su tipo (PVP/neto/coste). */
function renderPriceCell(rate: RateLike, kind: "accommodation" | "activity"): React.ReactNode {
  const price = compactPrice(rate, kind);
  if (price.amount == null) {
    return <span className="rate-table__empty">sin precio</span>;
  }
  return (
    <>
      <strong>{formatAmount(price.amount, rate.currency)}</strong>{" "}
      <span className="rate-table__pricetype">{price.label}</span>
    </>
  );
}

interface RateReviewTableProps {
  entity: StagingEntityKey;
  parentEntity: StagingEntityKey;
  parentId: string;
  /** Candidatos ya filtrados por la pestaña activa. */
  rates: CandidateItem[];
  columns: CandidateColumn[];
  itemLabel: string;
  editorTitle: string;
  fields: StagingFieldDef[];
  busy: boolean;
  onBulkReview: (
    entity: StagingEntityKey,
    ids: string[],
    reviewStatus: string,
    label: string,
  ) => void;
  onApprove: (
    entity: StagingEntityKey,
    parentEntity: StagingEntityKey,
    parentId: string,
    ids: string[],
    label: string,
  ) => void;
  onSaved: () => Promise<void> | void;
}

/**
 * Tabla de revisión de candidatos (tarifas, suplementos, políticas, fechas):
 * lectura compacta por columnas configurables, selección múltiple, aprobación
 * de un clic por fila y acciones en lote. Pensada para revisar muchos
 * candidatos con poco esfuerzo.
 */
function RateReviewTable(props: RateReviewTableProps) {
  const { rates, entity, parentEntity, parentId, busy, columns } = props;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visibleIds = rates.map((rate) => rate.id);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const allSelected = rates.length > 0 && selectedVisible.length === rates.length;

  // Limpia la selección si cambian las tarifas (refresco / cambio de pestaña).
  useEffect(() => {
    setSelected((current) => {
      const next = new Set<string>();
      for (const id of visibleIds) {
        if (current.has(id)) next.add(id);
      }
      return next.size === current.size ? current : next;
    });
    setExpandedId((current) => (current && visibleIds.includes(current) ? current : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds.join(",")]);

  if (rates.length === 0) {
    return null;
  }

  const toggleAll = () => setSelected(() => (allSelected ? new Set() : new Set(visibleIds)));
  const toggleOne = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const approveRates = (list: CandidateItem[]) =>
    props.onApprove(
      entity,
      parentEntity,
      parentId,
      list.map((item) => item.id),
      props.itemLabel,
    );

  return (
    <div className="rate-table-wrap">
      <div className="rate-table__bar">
        <span className="rate-table__count">
          {rates.length} {props.itemLabel}
        </span>
        <div className="rate-table__bar-actions">
          {selectedVisible.length > 0 ? (
            <>
              <strong>{selectedVisible.length} seleccionada(s):</strong>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => approveRates(rates.filter((rate) => selected.has(rate.id)))}
              >
                Aprobar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  props.onBulkReview(entity, selectedVisible, "REJECTED", "Rechazar seleccionadas")
                }
              >
                Rechazar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  props.onBulkReview(entity, selectedVisible, "PENDING", "Pasar a pendientes")
                }
              >
                A pendientes
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => approveRates(rates)}
              >
                Aprobar todas
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  props.onBulkReview(entity, visibleIds, "REJECTED", "Rechazar todas")
                }
              >
                Rechazar todas
              </button>
            </>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table className="rate-table">
          <thead>
            <tr>
              <th className="rate-table__check">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Seleccionar todas"
                />
              </th>
              {columns.map((column) => (
                <th key={column.header}>{column.header}</th>
              ))}
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((rate) => {
              const status = String(rate.reviewStatus);
              const isExpanded = expandedId === rate.id;
              return (
                <Fragment key={rate.id}>
                  <tr className={selected.has(rate.id) ? "is-selected" : undefined}>
                    <td className="rate-table__check">
                      <input
                        type="checkbox"
                        checked={selected.has(rate.id)}
                        onChange={() => toggleOne(rate.id)}
                        aria-label="Seleccionar tarifa"
                      />
                    </td>
                    {columns.map((column) => (
                      <td key={column.header}>{column.render(rate)}</td>
                    ))}
                    <td>
                      <span className={`status-tag status-tag--${status.toLowerCase()}`}>
                        {stagingReviewStatusLabels[status] ?? status}
                      </span>
                    </td>
                    <td className="rate-table__actions">
                      {status !== "APPROVED" ? (
                        <button
                          type="button"
                          className="link-action link-action--approve"
                          disabled={busy}
                          onClick={() => approveRates([rate])}
                        >
                          Aprobar
                        </button>
                      ) : null}
                      {status !== "REJECTED" ? (
                        <button
                          type="button"
                          className="link-action link-action--reject"
                          disabled={busy}
                          onClick={() =>
                            props.onBulkReview(entity, [rate.id], "REJECTED", "Rechazar tarifa")
                          }
                        >
                          Rechazar
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="link-action"
                        onClick={() => setExpandedId(isExpanded ? null : rate.id)}
                      >
                        {isExpanded ? "Cerrar" : "Editar"}
                      </button>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="rate-table__editor">
                      <td colSpan={columns.length + 3}>
                        <StagingEditableCard
                          entity={entity}
                          id={rate.id}
                          title={props.editorTitle}
                          fields={props.fields}
                          values={rate}
                          reviewStatus={status}
                          rawText={rate.rawText}
                          structuredJson={rate.structuredJson}
                          onSaved={props.onSaved}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const accommodationRateColumns: CandidateColumn[] = [
  { header: "Periodo", render: (i) => formatRatePeriod(i as unknown as RateLike) },
  { header: "Régimen", render: (i) => cell(i.boardType) },
  { header: "Precio", render: (i) => renderPriceCell(i as unknown as RateLike, "accommodation") },
  { header: "Año", render: (i) => cell(i.year) },
];

const activityRateColumns: CandidateColumn[] = [
  { header: "Periodo", render: (i) => formatRatePeriod(i as unknown as RateLike) },
  { header: "Edad", render: (i) => cell(i.ageLabel) },
  { header: "Precio", render: (i) => renderPriceCell(i as unknown as RateLike, "activity") },
  { header: "Año", render: (i) => cell(i.year) },
];

const adjustmentColumns: CandidateColumn[] = [
  { header: "Concepto", render: (i) => cell(i.concept) },
  {
    header: "Importe",
    render: (i) =>
      i.amount != null ? `${i.amount}${i.amountType ? ` ${String(i.amountType)}` : ""}` : "—",
  },
  { header: "Aplica por", render: (i) => cell(i.appliesPer) },
];

const policyColumns: CandidateColumn[] = [
  { header: "Tipo", render: (i) => cell(i.policyType) },
  {
    header: "Texto",
    render: (i) => <span className="cell-truncate">{cell(i.policyText)}</span>,
  },
];

const blackoutColumns: CandidateColumn[] = [
  { header: "Fechas", render: (i) => formatRatePeriod(i as unknown as RateLike) },
  { header: "Disponibilidad", render: (i) => cell(i.availabilityStatus) },
  { header: "Motivo", render: (i) => cell(i.reason) },
];

export function InventoryDocumentsPanel() {
  const [documents, setDocuments] = useState<SourceDocumentSummary[]>([]);
  const [documentFilter, setDocumentFilter] = useState("");
  const [form, setForm] = useState<CreateSourceDocumentInput>(initialForm);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | undefined>>({});
  const [uploadingDocumentId, setUploadingDocumentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InventoryDocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<DocumentActionKey | null>(null);
  const [aiResult, setAiResult] = useState<AiDocumentAnalysisResult | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [stagingCreating, setStagingCreating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishApprovedResult | null>(null);
  const [dryRunning, setDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<DryRunPublishResult | null>(null);
  const [preparingPublish, setPreparingPublish] = useState(false);
  const [awaitingPublishConfirm, setAwaitingPublishConfirm] = useState(false);
  const [publishedInventory, setPublishedInventory] = useState<PublishedInventorySummary | null>(
    null,
  );
  const [publishedLoading, setPublishedLoading] = useState(false);
  const [preparingUnpublish, setPreparingUnpublish] = useState(false);
  const [awaitingUnpublishConfirm, setAwaitingUnpublishConfirm] = useState(false);
  const [unpublishDryRun, setUnpublishDryRun] = useState<DryRunUnpublishResult | null>(null);
  const [unpublishing, setUnpublishing] = useState(false);
  const [unpublishResult, setUnpublishResult] = useState<UnpublishResult | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<string>("resumen");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [awaitingRegenerateConfirm, setAwaitingRegenerateConfirm] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  async function loadDocuments() {
    setLoading(true);
    try {
      const result = await listInventoryDocumentsApi();
      setDocuments(result);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudieron cargar los documentos."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, []);

  async function refreshDetail(documentId: string) {
    const updatedDetail = await getInventoryDocumentApi(documentId);
    setDetail(updatedDetail);
    return updatedDetail;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setFeedbackMessage(null);

    if (!form.controlName.trim()) {
      setErrorMessage("Indica el nombre del alojamiento, actividad o proveedor.");
      return;
    }

    setSaving(true);
    try {
      await createInventoryDocumentApi({
        ...form,
        controlName: form.controlName.trim(),
        controlLocation: form.controlLocation?.trim() || undefined,
        controlCategory: form.controlCategory?.trim() || undefined,
        controlNotes: form.controlNotes?.trim() || undefined,
        controlYear: form.controlYear ? Number(form.controlYear) : null,
      });

      setForm(initialForm);
      setFeedbackMessage("Documento registrado correctamente.");
      await loadDocuments();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo crear el documento."));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(documentId: string) {
    const file = selectedFiles[documentId];
    setErrorMessage(null);
    setFeedbackMessage(null);

    if (!file) {
      setErrorMessage("Selecciona un archivo antes de subirlo.");
      return;
    }

    setUploadingDocumentId(documentId);
    try {
      await uploadInventoryDocumentFileApi(documentId, file);
      setSelectedFiles((current) => ({
        ...current,
        [documentId]: undefined,
      }));
      setFeedbackMessage("Archivo subido correctamente.");
      await loadDocuments();

      if (selectedDocumentId === documentId) {
        await refreshDetail(documentId);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo subir el archivo."));
    } finally {
      setUploadingDocumentId(null);
    }
  }

  async function handleViewDetail(documentId: string) {
    setSelectedDocumentId(documentId);
    setDetail(null);
    setAiResult(null);
    setPublishResult(null);
    setDryRunResult(null);
    setAwaitingPublishConfirm(false);
    setPublishedInventory(null);
    setAwaitingUnpublishConfirm(false);
    setUnpublishDryRun(null);
    setUnpublishResult(null);
    setWorkspaceTab("resumen");
    setAwaitingRegenerateConfirm(false);
    setErrorMessage(null);
    setFeedbackMessage(null);
    setDetailLoading(true);
    try {
      await refreshDetail(documentId);
      // Carga la trazabilidad en vivo para poder avisar de cambios sin publicar.
      try {
        const live = await getPublishedInventoryByDocumentApi(documentId);
        setPublishedInventory(live);
      } catch {
        // No bloquea el detalle: la trazabilidad se puede cargar manualmente.
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo cargar el detalle del documento."));
    } finally {
      setDetailLoading(false);
    }
  }

  function handleCloseDetail() {
    setSelectedDocumentId(null);
    setDetail(null);
    setAiResult(null);
    setPublishResult(null);
    setDryRunResult(null);
    setAwaitingPublishConfirm(false);
    setPublishedInventory(null);
    setAwaitingUnpublishConfirm(false);
    setUnpublishDryRun(null);
    setUnpublishResult(null);
    setWorkspaceTab("resumen");
    setAwaitingRegenerateConfirm(false);
    setActionInProgress(null);
  }

  async function handleAiAnalyze() {
    if (!selectedDocumentId) {
      return;
    }

    setErrorMessage(null);
    setFeedbackMessage(null);
    setAiAnalyzing(true);

    try {
      const result = await analyzeInventoryDocumentWithAiApi(selectedDocumentId);
      setAiResult(result);
      setFeedbackMessage(
        `Análisis IA ejecutado (modo ${result.mode}). Candidatos preliminares listos para revisión.`,
      );
      await refreshDetail(selectedDocumentId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo ejecutar el análisis IA del documento."));
    } finally {
      setAiAnalyzing(false);
    }
  }

  async function handleCreateStaging() {
    if (!selectedDocumentId) {
      return;
    }

    setErrorMessage(null);
    setFeedbackMessage(null);
    setStagingCreating(true);

    try {
      const result = await createInventoryDocumentStagingApi(selectedDocumentId);
      setFeedbackMessage(
        `Candidatos revisables creados: ${result.accommodations} alojamiento(s), ${result.rates} tarifa(s), ${result.adjustments} suplemento(s), ${result.policies} política(s), ${result.blackoutDates} fecha(s) especial(es) y ${result.activities} actividad(es).`,
      );
      await refreshDetail(selectedDocumentId);
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "No se pudieron crear los candidatos revisables del documento."),
      );
    } finally {
      setStagingCreating(false);
    }
  }

  async function handleStagingSaved() {
    if (!selectedDocumentId) {
      return;
    }
    // Al cambiar un candidato, la simulación previa deja de ser válida: se
    // descarta para obligar a re-simular antes de confirmar la publicación.
    setDryRunResult(null);
    setAwaitingPublishConfirm(false);
    await refreshDetail(selectedDocumentId);
  }

  // Cambia el estado de revisión de varios candidatos del mismo tipo a la vez.
  async function handleBulkReview(
    entity: StagingEntityKey,
    ids: string[],
    reviewStatus: string,
    label: string,
  ) {
    if (!selectedDocumentId || ids.length === 0) {
      return;
    }

    setErrorMessage(null);
    setFeedbackMessage(null);
    setBulkBusy(true);

    try {
      const result = await bulkUpdateInventoryStagingApi(entity, ids, reviewStatus);
      const skippedNote =
        result.skipped.length > 0 ? `; ${result.skipped.length} omitida(s) por validación` : "";
      setFeedbackMessage(`${label}: ${result.updated} actualizada(s)${skippedNote}.`);
      // La revisión cambió: invalida simulación y confirmaciones, y muestra todo
      // para que se vea el resultado del cambio.
      setDryRunResult(null);
      setAwaitingPublishConfirm(false);
      await refreshDetail(selectedDocumentId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo actualizar el estado de los candidatos."));
    } finally {
      setBulkBusy(false);
    }
  }

  /**
   * Aprueba el alojamiento/actividad y sus tarifas a la vez, para que el
   * conjunto sea realmente publicable (una tarifa aprobada bajo un padre no
   * aprobado no se publica). Si onlyWithPrice, solo aprueba las tarifas con
   * precio y moneda.
   */
  // Aprueba el alojamiento/actividad padre y los candidatos indicados a la vez,
  // para que el conjunto sea realmente publicable.
  async function handleApproveWithParent(
    entity: StagingEntityKey,
    parentEntity: StagingEntityKey,
    parentId: string,
    ids: string[],
    label: string,
  ) {
    if (!selectedDocumentId || ids.length === 0) {
      return;
    }

    setErrorMessage(null);
    setFeedbackMessage(null);
    setBulkBusy(true);

    try {
      await bulkUpdateInventoryStagingApi(parentEntity, [parentId], "APPROVED");
      const result = await bulkUpdateInventoryStagingApi(entity, ids, "APPROVED");
      const skippedNote =
        result.skipped.length > 0
          ? `; ${result.skipped.length} omitida(s) por validación`
          : "";
      setFeedbackMessage(`${label}: ${result.updated} aprobada(s)${skippedNote}.`);
      setDryRunResult(null);
      setAwaitingPublishConfirm(false);
      await refreshDetail(selectedDocumentId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo aprobar el conjunto."));
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleRegenerate() {
    if (!selectedDocumentId) {
      return;
    }

    setAwaitingRegenerateConfirm(false);
    setErrorMessage(null);
    setFeedbackMessage(null);
    setRegenerating(true);

    try {
      const result = await regenerateInventoryDocumentStagingApi(selectedDocumentId);
      setFeedbackMessage(
        `Candidatos regenerados (se descartó la revisión previa): ${result.accommodations} alojamiento(s), ${result.rates} tarifa(s), ${result.adjustments} suplemento(s), ${result.policies} política(s) y ${result.activities} actividad(es).`,
      );
      setDryRunResult(null);
      setAwaitingPublishConfirm(false);
      await refreshDetail(selectedDocumentId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudieron regenerar los candidatos."));
    } finally {
      setRegenerating(false);
    }
  }

  async function handleDryRun() {
    if (!selectedDocumentId) {
      return;
    }

    setErrorMessage(null);
    setFeedbackMessage(null);
    setDryRunning(true);

    try {
      const result = await dryRunPublishApprovedInventoryDocumentApi(selectedDocumentId);
      setDryRunResult(result);
      setFeedbackMessage(
        "Simulación de publicación lista. No se escribió nada en el inventario operativo.",
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "No se pudo simular la publicación del documento."),
      );
    } finally {
      setDryRunning(false);
    }
  }

  // Paso 1 de la publicación real: asegurar una simulación reciente y pasar al
  // estado de confirmación. No escribe nada todavía.
  async function handleRequestPublish() {
    if (!selectedDocumentId) {
      return;
    }

    setErrorMessage(null);
    setFeedbackMessage(null);

    if (!dryRunResult) {
      setPreparingPublish(true);
      try {
        const result = await dryRunPublishApprovedInventoryDocumentApi(selectedDocumentId);
        setDryRunResult(result);
      } catch (error) {
        setErrorMessage(
          getErrorMessage(error, "No se pudo simular la publicación del documento."),
        );
        return;
      } finally {
        setPreparingPublish(false);
      }
    }

    setAwaitingPublishConfirm(true);
  }

  function handleCancelPublish() {
    setAwaitingPublishConfirm(false);
  }

  // Paso 2: confirmación explícita. Aquí sí se escribe en el inventario.
  async function handleConfirmPublish() {
    setAwaitingPublishConfirm(false);
    await handlePublishApproved();
  }

  async function handlePublishApproved() {
    if (!selectedDocumentId) {
      return;
    }

    setErrorMessage(null);
    setFeedbackMessage(null);
    setPublishing(true);

    try {
      const result = await publishApprovedInventoryDocumentApi(selectedDocumentId);
      setPublishResult(result);
      setFeedbackMessage(
        `Publicación completada: ${result.accommodations} alojamiento(s) y ${result.accommodationRates} tarifa(s); ${result.activities} actividad(es) y ${result.activityRates} tarifa(s) de actividad.`,
      );
      await refreshDetail(selectedDocumentId);
      await loadDocuments();
      // Si la trazabilidad estaba cargada, refrescarla para reflejar lo vivo.
      if (publishedInventory) {
        try {
          const live = await getPublishedInventoryByDocumentApi(selectedDocumentId);
          setPublishedInventory(live);
        } catch {
          // No bloquea la publicación: la traza se puede recargar manualmente.
          setPublishedInventory(null);
        }
      }
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "No se pudo publicar el documento al inventario operativo."),
      );
    } finally {
      setPublishing(false);
    }
  }

  async function handleLoadPublished() {
    if (!selectedDocumentId) {
      return;
    }

    setErrorMessage(null);
    setPublishedLoading(true);

    try {
      const result = await getPublishedInventoryByDocumentApi(selectedDocumentId);
      setPublishedInventory(result);
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "No se pudo obtener la trazabilidad de lo publicado."),
      );
    } finally {
      setPublishedLoading(false);
    }
  }

  // Paso 1 de la retirada: simular cuántos registros se quitarían y, si hay
  // algo publicado, pasar a confirmación. No borra nada.
  async function handleRequestUnpublish() {
    if (!selectedDocumentId) {
      return;
    }

    setErrorMessage(null);
    setFeedbackMessage(null);
    setUnpublishResult(null);
    setPreparingUnpublish(true);

    try {
      const result = await dryRunUnpublishInventoryDocumentApi(selectedDocumentId);
      setUnpublishDryRun(result);
      if (!result.hasPublishedRecords) {
        setFeedbackMessage(
          "No hay registros operativos publicados desde este documento; no hay nada que retirar.",
        );
        setAwaitingUnpublishConfirm(false);
        return;
      }
      setAwaitingUnpublishConfirm(true);
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "No se pudo simular la retirada de la publicación."),
      );
    } finally {
      setPreparingUnpublish(false);
    }
  }

  function handleCancelUnpublish() {
    setAwaitingUnpublishConfirm(false);
  }

  // Paso 2: confirmación explícita. Aquí sí se elimina del inventario operativo.
  async function handleConfirmUnpublish() {
    if (!selectedDocumentId) {
      return;
    }

    setAwaitingUnpublishConfirm(false);
    setErrorMessage(null);
    setFeedbackMessage(null);
    setUnpublishing(true);

    try {
      const result = await unpublishInventoryDocumentApi(selectedDocumentId);
      setUnpublishResult(result);
      setFeedbackMessage(
        `Publicación retirada: ${result.accommodationsRemoved} alojamiento(s) y ${result.accommodationRatesRemoved} tarifa(s); ${result.activitiesRemoved} actividad(es) y ${result.activityRatesRemoved} tarifa(s) de actividad. Los candidatos staging se conservan.`,
      );
      await refreshDetail(selectedDocumentId);
      await loadDocuments();
      // La trazabilidad ya no debe mostrar registros: refrescarla si estaba abierta.
      if (publishedInventory) {
        try {
          const live = await getPublishedInventoryByDocumentApi(selectedDocumentId);
          setPublishedInventory(live);
        } catch {
          setPublishedInventory(null);
        }
      }
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "No se pudo retirar la publicación del documento."),
      );
    } finally {
      setUnpublishing(false);
    }
  }

  // Extrae el texto del PDF (no crea candidatos; eso es un paso aparte).
  async function handleDocumentAction(action: DocumentActionKey) {
    if (!selectedDocumentId) {
      return;
    }

    setErrorMessage(null);
    setFeedbackMessage(null);
    setActionInProgress(action);

    try {
      await analyzeInventoryDocumentApi(selectedDocumentId);
      setFeedbackMessage("Texto extraído. El documento quedó pendiente de revisión.");
      await refreshDetail(selectedDocumentId);
      await loadDocuments();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo extraer el texto del documento."));
    } finally {
      setActionInProgress(null);
    }
  }

  // Las pestañas de candidatos determinan qué estados se muestran.
  const tabStatusFilter: Record<string, string[] | null> = {
    pendientes: ["PENDING", "NEEDS_CHANGES"],
    aprobados: ["APPROVED"],
    rechazados: ["REJECTED"],
  };
  const passesReviewFilter = (status: unknown) => {
    const allowed = tabStatusFilter[workspaceTab];
    return allowed ? allowed.includes(String(status)) : true;
  };

  const isCandidateTab =
    workspaceTab === "pendientes" ||
    workspaceTab === "aprobados" ||
    workspaceTab === "rechazados";

  const qcSummary = detail ? computeQualitySummary(detail) : null;
  const candidateCounts = qcSummary?.counts ?? {};
  const pendingTabCount = (candidateCounts.PENDING ?? 0) + (candidateCounts.NEEDS_CHANGES ?? 0);
  const approvedTabCount = candidateCounts.APPROVED ?? 0;
  const rejectedTabCount = candidateCounts.REJECTED ?? 0;
  const publishedTabCount = publishedInventory
    ? publishedInventory.accommodationCount + publishedInventory.activityCount
    : null;
  const activeIssuesCount = detail
    ? detail.importIssues.filter((issue) => !issue.resolved).length
    : 0;

  const workspaceTabs: { id: string; label: string; badge: number | null }[] = [
    { id: "resumen", label: "Resumen", badge: null },
    { id: "pendientes", label: "Pendientes", badge: pendingTabCount },
    { id: "aprobados", label: "Aprobados", badge: approvedTabCount },
    { id: "rechazados", label: "Rechazados", badge: rejectedTabCount },
    { id: "publicados", label: "Publicados", badge: publishedTabCount },
    { id: "incidencias", label: "Incidencias", badge: activeIssuesCount },
  ];

  const documentQuery = documentFilter.trim().toLowerCase();
  const filteredDocuments = documentQuery
    ? documents.filter((document) =>
        [
          document.controlName,
          document.controlLocation ?? "",
          statusLabels[document.status] ?? document.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(documentQuery),
      )
    : documents;

  return (
    <section className="section-card">
      <div className="section-card__header">
        <div>
          <h2>Base documental de alojamientos y actividades</h2>
          <p>
            Registra documentos fuente antes de analizarlos, revisarlos y publicarlos en el
            inventario operativo.
          </p>
        </div>
      </div>

      {errorMessage ? (
        <div className="alert alert--error" role="alert">
          {errorMessage}
        </div>
      ) : null}

      {feedbackMessage ? (
        <div className="alert alert--success" role="status">
          {feedbackMessage}
        </div>
      ) : null}

      <form className="grid two" onSubmit={handleSubmit}>
        <label className="field">
          <span>Tipo de registro</span>
          <select
            value={form.targetType}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                targetType: event.target.value as InventoryTargetType,
              }))
            }
          >
            <option value="ACCOMMODATION">Alojamiento</option>
            <option value="ACTIVITY">Actividad</option>
            <option value="MIXED">Mixto</option>
            <option value="UNKNOWN">No estoy seguro</option>
          </select>
        </label>

        <label className="field">
          <span>Nombre de control</span>
          <input
            value={form.controlName}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                controlName: event.target.value,
              }))
            }
            placeholder="Ej. Hotel Calypso, Camping La Siesta, Actividades Valencia"
          />
        </label>

        <label className="field">
          <span>Ubicación</span>
          <input
            value={form.controlLocation ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                controlLocation: event.target.value,
              }))
            }
            placeholder="Ej. Valencia, Salou, Jaca"
          />
        </label>

        <label className="field">
          <span>Año / temporada</span>
          <input
            type="number"
            value={form.controlYear ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                controlYear: event.target.value ? Number(event.target.value) : null,
              }))
            }
            placeholder="2026"
          />
        </label>

        <label className="field">
          <span>Categoría</span>
          <input
            value={form.controlCategory ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                controlCategory: event.target.value,
              }))
            }
            placeholder="Hotel, Camping, Actividad náutica..."
          />
        </label>

        <label className="field">
          <span>Notas internas</span>
          <input
            value={form.controlNotes ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                controlNotes: event.target.value,
              }))
            }
            placeholder="Observaciones para revisión interna"
          />
        </label>

        <div>
          <button className="primary" type="submit" disabled={saving}>
            {saving ? "Guardando..." : "Registrar documento"}
          </button>
        </div>
      </form>

      <div className="section-card__header compact">
        <div>
          <h3>Documentos registrados</h3>
          <p>
            {loading
              ? "Cargando documentos..."
              : `${filteredDocuments.length} de ${documents.length} documento(s)`}
          </p>
        </div>
        <div className="stack compact actions-row">
          <input
            className="doc-search"
            type="search"
            value={documentFilter}
            onChange={(event) => setDocumentFilter(event.target.value)}
            placeholder="Buscar por nombre, ubicación o estado"
          />
          <button type="button" onClick={() => void loadDocuments()}>
            Actualizar
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Ubicación</th>
              <th>Año</th>
              <th>Estado</th>
              <th>Por revisar</th>
              <th>Extracción</th>
              <th>Creado</th>
              <th>Acciones</th>
              <th>Archivo fuente</th>
            </tr>
          </thead>
          <tbody>
            {filteredDocuments.map((document) => {
              const selectedFile = selectedFiles[document.id];
              const isUploading = uploadingDocumentId === document.id;
              const isSelected = selectedDocumentId === document.id;

              return (
                <tr key={document.id} className={isSelected ? "is-selected" : undefined}>
                  <td>{document.controlName}</td>
                  <td>{targetTypeLabels[document.targetType]}</td>
                  <td>{document.controlLocation ?? "-"}</td>
                  <td>{document.controlYear ?? "-"}</td>
                  <td>{statusLabels[document.status] ?? document.status}</td>
                  <td>
                    {document.pendingReviewCount && document.pendingReviewCount > 0 ? (
                      <span className="status-tag status-tag--needs_changes">
                        {document.pendingReviewCount} pendiente(s)
                      </span>
                    ) : document.candidateCount ? (
                      <span className="status-tag status-tag--approved">Revisado</span>
                    ) : (
                      <span className="rate-table__empty">Sin candidatos</span>
                    )}
                  </td>
                  <td>
                    {extractionStatusLabels[document.extractionStatus] ??
                      document.extractionStatus}
                  </td>
                  <td>{new Date(document.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button type="button" onClick={() => void handleViewDetail(document.id)}>
                      {isSelected ? "Detalle abierto" : "Ver detalle"}
                    </button>
                  </td>
                  <td>
                    <div className="file-cell">
                      <input
                        className="file-cell__input"
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0];

                          setSelectedFiles((current) => ({
                            ...current,
                            [document.id]: file,
                          }));
                        }}
                      />

                      {selectedFile ? (
                        <small className="file-cell__name">
                          Seleccionado: {selectedFile.name} (
                          {Math.round(selectedFile.size / 1024)} KB)
                        </small>
                      ) : (
                        <small className="file-cell__name file-cell__name--empty">
                          Sin archivo seleccionado.
                        </small>
                      )}

                      <button
                        type="button"
                        className="file-cell__button"
                        disabled={!selectedFile || isUploading}
                        onClick={() => void handleUpload(document.id)}
                      >
                        {isUploading ? "Subiendo..." : "Subir archivo"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!loading && filteredDocuments.length === 0 && (
              <tr>
                <td colSpan={10}>
                  {documents.length === 0
                    ? "Todavía no hay documentos registrados."
                    : "Ningún documento coincide con la búsqueda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedDocumentId ? (
        <div className="section-card__detail">
          <div className="section-card__header compact">
            <div>
              <h3>Detalle del documento</h3>
              <p>Revisión humana del documento seleccionado.</p>
            </div>
            <button type="button" onClick={handleCloseDetail}>
              Cerrar detalle
            </button>
          </div>

          {detailLoading ? <p>Cargando detalle...</p> : null}

          {!detailLoading && detail ? (
            <div className="stack">
              <div className="grid two">
                <div className="field">
                  <span>Nombre de control</span>
                  <strong>{detail.controlName}</strong>
                </div>
                <div className="field">
                  <span>Tipo de registro</span>
                  <strong>{targetTypeLabels[detail.targetType]}</strong>
                </div>
                <div className="field">
                  <span>Estado</span>
                  <strong>{statusLabels[detail.status] ?? detail.status}</strong>
                </div>
                <div className="field">
                  <span>Extracción</span>
                  <strong>
                    {/* Si ya existe una extracción TEXT/OCR con contenido, mostrar
                        "Extraído" aunque el estado almacenado no se haya reconciliado. */}
                    {detail.extractions.some(
                      (extraction) =>
                        (extraction.extractionMethod === "TEXT" ||
                          extraction.extractionMethod === "OCR") &&
                        (extraction.rawText ?? "").trim().length > 0,
                    ) && detail.extractionStatus === "NOT_STARTED"
                      ? "Extraído"
                      : extractionStatusLabels[detail.extractionStatus] ??
                        detail.extractionStatus}
                  </strong>
                </div>
                <div className="field">
                  <span>Creado</span>
                  <strong>{formatDateTime(detail.createdAt)}</strong>
                </div>
                <div className="field">
                  <span>Actualizado</span>
                  <strong>{formatDateTime(detail.updatedAt)}</strong>
                </div>
                {detail.processedAt ? (
                  <div className="field">
                    <span>Procesado</span>
                    <strong>{formatDateTime(detail.processedAt)}</strong>
                  </div>
                ) : null}
                {detail.controlNotes ? (
                  <div className="field">
                    <span>Notas internas</span>
                    <strong>{detail.controlNotes}</strong>
                  </div>
                ) : null}
              </div>

              <nav className="ws-tabs">
                {workspaceTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`ws-tab ${workspaceTab === tab.id ? "ws-tab--active" : ""}`}
                    onClick={() => setWorkspaceTab(tab.id)}
                  >
                    {tab.label}
                    {tab.badge != null ? (
                      <span className="ws-tab__badge">{tab.badge}</span>
                    ) : null}
                  </button>
                ))}
              </nav>

              {workspaceTab === "resumen" ? (
                <>
              <div className="section-card__header compact">
                <div>
                  <h4>Archivo fuente</h4>
                </div>
              </div>

              {detail.originalFileName ? (
                <div className="grid two">
                  <div className="field">
                    <span>Nombre original</span>
                    <strong>{detail.originalFileName}</strong>
                  </div>
                  <div className="field">
                    <span>Tipo MIME</span>
                    <strong>{detail.fileMimeType ?? "-"}</strong>
                  </div>
                  <div className="field">
                    <span>Tamaño</span>
                    <strong>{formatFileSize(detail.fileSizeBytes)}</strong>
                  </div>
                  <div className="field">
                    <span>Hash</span>
                    <strong className="break-all">{detail.fileHash ?? "-"}</strong>
                  </div>
                </div>
              ) : (
                <p>Todavía no se ha subido ningún archivo fuente para este documento.</p>
              )}

              <div className="section-card__header compact">
                <div>
                  <h4>Acciones de revisión</h4>
                  <p>
                    El análisis extrae texto básico del PDF para revisión humana. No crea tarifas
                    automáticamente.
                  </p>
                </div>
              </div>

              <div className="stack compact actions-row">
                <button
                  type="button"
                  className="primary"
                  disabled={actionInProgress !== null || aiAnalyzing}
                  onClick={() => void handleDocumentAction("analyze")}
                >
                  {actionInProgress === "analyze" ? "Analizando..." : "Ejecutar análisis"}
                </button>
                <button
                  type="button"
                  disabled={actionInProgress !== null || aiAnalyzing || stagingCreating}
                  onClick={() => void handleAiAnalyze()}
                >
                  {aiAnalyzing ? "Analizando con IA..." : "Analizar con IA"}
                </button>
                <button
                  type="button"
                  disabled={
                    actionInProgress !== null ||
                    aiAnalyzing ||
                    stagingCreating ||
                    detail.stagingAccommodations.length > 0 ||
                    detail.stagingActivities.length > 0
                  }
                  title={
                    detail.stagingAccommodations.length > 0 ||
                    detail.stagingActivities.length > 0
                      ? "Ya existen candidatos. Usa 'Regenerar candidatos' para rehacerlos."
                      : undefined
                  }
                  onClick={() => void handleCreateStaging()}
                >
                  {stagingCreating ? "Creando candidatos..." : "Crear candidatos revisables"}
                </button>
              </div>

              <div className="section-card__header compact">
                <div>
                  <h4>Candidatos revisables (staging)</h4>
                  <p>
                    {detail.status === "PUBLISHED"
                      ? "Candidatos revisados y publicados al inventario operativo."
                      : "Pendientes de revisión humana. No publicados al inventario operativo."}
                  </p>
                </div>
                {detail.status === "PUBLISHED" ? (
                  <span className="staging-badge staging-badge--published">
                    Publicado al inventario operativo
                  </span>
                ) : (
                  <span className="staging-badge">No publicado</span>
                )}
              </div>

              <div className="grid two">
                <div className="field">
                  <span>Alojamientos</span>
                  <strong>{detail.stagingAccommodations.length}</strong>
                </div>
                <div className="field">
                  <span>Tarifas</span>
                  <strong>
                    {detail.stagingAccommodations.reduce(
                      (total, accommodation) => total + accommodation.rates.length,
                      0,
                    ) +
                      detail.stagingActivities.reduce(
                        (total, activity) => total + activity.rates.length,
                        0,
                      )}
                  </strong>
                </div>
                <div className="field">
                  <span>Suplementos</span>
                  <strong>
                    {detail.stagingAccommodations.reduce(
                      (total, accommodation) => total + accommodation.adjustments.length,
                      0,
                    )}
                  </strong>
                </div>
                <div className="field">
                  <span>Políticas</span>
                  <strong>
                    {detail.stagingAccommodations.reduce(
                      (total, accommodation) => total + accommodation.policies.length,
                      0,
                    ) +
                      detail.stagingActivities.reduce(
                        (total, activity) => total + activity.policies.length,
                        0,
                      )}
                  </strong>
                </div>
                <div className="field">
                  <span>Fechas especiales</span>
                  <strong>
                    {detail.stagingAccommodations.reduce(
                      (total, accommodation) => total + accommodation.blackoutDates.length,
                      0,
                    )}
                  </strong>
                </div>
                <div className="field">
                  <span>Actividades</span>
                  <strong>{detail.stagingActivities.length}</strong>
                </div>
              </div>

              {detail.stagingAccommodations.length > 0 ||
              detail.stagingActivities.length > 0 ? (
                <QualityControlPanel summary={computeQualitySummary(detail)} />
              ) : null}

              {(detail.stagingAccommodations.length > 0 ||
                detail.stagingActivities.length > 0) &&
              publishedInventory != null &&
              countApprovedPublishableRates(detail) !==
                publishedInventory.accommodationRateCount +
                  publishedInventory.activityRateCount ? (
                <div className="alert alert--warning" role="status">
                  Tienes cambios aprobados sin publicar:{" "}
                  <strong>{countApprovedPublishableRates(detail)}</strong> tarifa(s) aprobada(s)
                  lista(s) frente a{" "}
                  <strong>
                    {publishedInventory.accommodationRateCount +
                      publishedInventory.activityRateCount}
                  </strong>{" "}
                  publicada(s) ahora. Usa "Simular publicación" y luego "Revisar y publicar".
                </div>
              ) : null}

              {detail.stagingAccommodations.length > 0 ||
              detail.stagingActivities.length > 0 ? (
                <div className="review-controls">
                  <span className="review-controls__label">
                    Revisa los candidatos en las pestañas "Pendientes" y "Aprobados".
                  </span>
                  <button
                    type="button"
                    disabled={regenerating || awaitingRegenerateConfirm}
                    onClick={() => setAwaitingRegenerateConfirm(true)}
                  >
                    {regenerating ? "Regenerando..." : "Regenerar candidatos"}
                  </button>
                </div>
              ) : null}

              {awaitingRegenerateConfirm ? (
                <div className="publish-confirm" role="alertdialog" aria-label="Confirmar regeneración">
                  <p className="publish-confirm__summary">
                    Regenerar <strong>descartará todos los candidatos actuales y su revisión
                    manual</strong>, y los volverá a crear con IA desde el texto del documento. No
                    afecta al inventario operativo ya publicado.
                  </p>
                  <div className="stack compact actions-row">
                    <button
                      type="button"
                      className="primary"
                      disabled={regenerating}
                      onClick={() => void handleRegenerate()}
                    >
                      {regenerating ? "Regenerando..." : "Sí, regenerar candidatos"}
                    </button>
                    <button
                      type="button"
                      disabled={regenerating}
                      onClick={() => setAwaitingRegenerateConfirm(false)}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}
                </>
              ) : null}

              {isCandidateTab ? (
                detail.stagingAccommodations.length === 0 &&
                detail.stagingActivities.length === 0 ? (
                <p>
                  Todavía no hay candidatos. Usa "Crear candidatos revisables" para generarlos a
                  partir del análisis.
                </p>
              ) : (
                <div className="staging-review">
                  <div className="review-context">
                    <span>
                      Vista:{" "}
                      <strong>
                        {workspaceTab === "pendientes"
                          ? "Pendientes de revisar"
                          : workspaceTab === "aprobados"
                            ? "Aprobados"
                            : "Rechazados"}
                      </strong>
                    </span>
                  </div>

                  {(workspaceTab === "pendientes" && pendingTabCount === 0) ||
                  (workspaceTab === "aprobados" && approvedTabCount === 0) ||
                  (workspaceTab === "rechazados" && rejectedTabCount === 0) ? (
                    <p className="empty-hint">
                      No hay candidatos en este estado. Usa las acciones en lote de cada alojamiento
                      para mover candidatos aquí.
                    </p>
                  ) : null}

                  {detail.stagingAccommodations.map((accommodation) => (
                    <div key={accommodation.id} className="staging-group">
                      <StagingEditableCard
                        entity="accommodations"
                        id={accommodation.id}
                        title={`Alojamiento: ${accommodation.accommodationName}`}
                        fields={accommodationFields}
                        values={accommodation}
                        reviewStatus={String(accommodation.reviewStatus)}
                        collapsible
                        onSaved={handleStagingSaved}
                      />

                      <RateReviewTable
                        entity="accommodation-rates"
                        parentEntity="accommodations"
                        parentId={accommodation.id}
                        rates={
                          accommodation.rates.filter((rate) =>
                            passesReviewFilter(rate.reviewStatus),
                          ) as unknown as CandidateItem[]
                        }
                        columns={accommodationRateColumns}
                        itemLabel="tarifa(s)"
                        editorTitle="Editar tarifa"
                        fields={accommodationRateFields}
                        busy={bulkBusy}
                        onApprove={handleApproveWithParent}
                        onBulkReview={handleBulkReview}
                        onSaved={handleStagingSaved}
                      />

                      <RateReviewTable
                        entity="accommodation-adjustments"
                        parentEntity="accommodations"
                        parentId={accommodation.id}
                        rates={
                          accommodation.adjustments.filter((adjustment) =>
                            passesReviewFilter(adjustment.reviewStatus),
                          ) as unknown as CandidateItem[]
                        }
                        columns={adjustmentColumns}
                        itemLabel="suplemento(s)"
                        editorTitle="Editar suplemento"
                        fields={accommodationAdjustmentFields}
                        busy={bulkBusy}
                        onApprove={handleApproveWithParent}
                        onBulkReview={handleBulkReview}
                        onSaved={handleStagingSaved}
                      />

                      <RateReviewTable
                        entity="accommodation-policies"
                        parentEntity="accommodations"
                        parentId={accommodation.id}
                        rates={
                          accommodation.policies.filter((policy) =>
                            passesReviewFilter(policy.reviewStatus),
                          ) as unknown as CandidateItem[]
                        }
                        columns={policyColumns}
                        itemLabel="política(s)"
                        editorTitle="Editar política"
                        fields={accommodationPolicyFields}
                        busy={bulkBusy}
                        onApprove={handleApproveWithParent}
                        onBulkReview={handleBulkReview}
                        onSaved={handleStagingSaved}
                      />

                      <RateReviewTable
                        entity="accommodation-blackout-dates"
                        parentEntity="accommodations"
                        parentId={accommodation.id}
                        rates={
                          accommodation.blackoutDates.filter((blackout) =>
                            passesReviewFilter(blackout.reviewStatus),
                          ) as unknown as CandidateItem[]
                        }
                        columns={blackoutColumns}
                        itemLabel="fecha(s) especial(es)"
                        editorTitle="Editar fecha especial"
                        fields={accommodationBlackoutFields}
                        busy={bulkBusy}
                        onApprove={handleApproveWithParent}
                        onBulkReview={handleBulkReview}
                        onSaved={handleStagingSaved}
                      />
                    </div>
                  ))}

                  {detail.stagingActivities.map((activity) => (
                    <div key={activity.id} className="staging-group">
                      <StagingEditableCard
                        entity="activities"
                        id={activity.id}
                        title={`Actividad: ${activity.activityName}`}
                        fields={activityFields}
                        values={activity}
                        reviewStatus={String(activity.reviewStatus)}
                        collapsible
                        onSaved={handleStagingSaved}
                      />

                      <RateReviewTable
                        entity="activity-rates"
                        parentEntity="activities"
                        parentId={activity.id}
                        rates={
                          activity.rates.filter((rate) =>
                            passesReviewFilter(rate.reviewStatus),
                          ) as unknown as CandidateItem[]
                        }
                        columns={activityRateColumns}
                        itemLabel="tarifa(s)"
                        editorTitle="Editar tarifa de actividad"
                        fields={activityRateFields}
                        busy={bulkBusy}
                        onApprove={handleApproveWithParent}
                        onBulkReview={handleBulkReview}
                        onSaved={handleStagingSaved}
                      />

                      <RateReviewTable
                        entity="activity-policies"
                        parentEntity="activities"
                        parentId={activity.id}
                        rates={
                          activity.policies.filter((policy) =>
                            passesReviewFilter(policy.reviewStatus),
                          ) as unknown as CandidateItem[]
                        }
                        columns={policyColumns}
                        itemLabel="política(s)"
                        editorTitle="Editar política"
                        fields={activityPolicyFields}
                        busy={bulkBusy}
                        onApprove={handleApproveWithParent}
                        onBulkReview={handleBulkReview}
                        onSaved={handleStagingSaved}
                      />
                    </div>
                  ))}
                </div>
              )
              ) : null}

              {workspaceTab === "aprobados" ? (
                <>
              <div className="section-card__header compact">
                <div>
                  <h4>Publicación al inventario operativo</h4>
                  <p>Solo se publican candidatos aprobados. Operación idempotente.</p>
                </div>
                <div className="stack compact actions-row">
                  <button
                    type="button"
                    disabled={dryRunning}
                    onClick={() => void handleDryRun()}
                  >
                    {dryRunning ? "Simulando..." : "Simular publicación"}
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={
                      publishing ||
                      preparingPublish ||
                      awaitingPublishConfirm ||
                      !(
                        detail.stagingAccommodations.some(
                          (accommodation) => String(accommodation.reviewStatus) === "APPROVED",
                        ) ||
                        detail.stagingActivities.some(
                          (activity) => String(activity.reviewStatus) === "APPROVED",
                        )
                      )
                    }
                    onClick={() => void handleRequestPublish()}
                  >
                    {preparingPublish
                      ? "Preparando simulación..."
                      : "Revisar y publicar aprobados"}
                  </button>
                </div>
              </div>

              {awaitingPublishConfirm && dryRunResult ? (
                <div className="publish-confirm" role="alertdialog" aria-label="Confirmar publicación">
                  <div className="section-card__header compact">
                    <div>
                      <h4>Confirmar publicación real</h4>
                      <p>
                        Revisa la simulación antes de publicar. Esta acción escribirá en el
                        inventario operativo.
                      </p>
                    </div>
                    <span className="staging-badge staging-badge--published">Escribe en inventario</span>
                  </div>

                  <p className="publish-confirm__summary">
                    Se publicarían <strong>{dryRunResult.accommodationsToPublish}</strong>{" "}
                    alojamiento(s) y <strong>{dryRunResult.accommodationRatesToPublish}</strong>{" "}
                    tarifa(s); <strong>{dryRunResult.activitiesToPublish}</strong> actividad(es) y{" "}
                    <strong>{dryRunResult.activityRatesToPublish}</strong> tarifa(s) de actividad. Se
                    omitirían <strong>{dryRunResult.skipped}</strong> candidato(s).
                    {dryRunResult.wouldReplaceExisting
                      ? " Reemplazaría la publicación previa de este documento (idempotente)."
                      : null}
                  </p>

                  {(() => {
                    const { critical, info } = classifyDryRunWarnings(dryRunResult.warnings);
                    return (
                      <>
                        {critical.length > 0 ? (
                          <div className="alert alert--error" role="alert">
                            <strong>Advertencias importantes:</strong>
                            <ul className="detail-list">
                              {critical.map((warning, index) => (
                                <li key={index}>{warning}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {info.length > 0 ? (
                          <div className="alert alert--warning" role="status">
                            <strong>Avisos informativos:</strong>
                            <ul className="detail-list">
                              {info.map((warning, index) => (
                                <li key={index}>{warning}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}

                        {critical.length === 0 && info.length === 0 ? (
                          <p>Sin advertencias. Todo lo aprobado se publicaría.</p>
                        ) : null}
                      </>
                    );
                  })()}

                  <div className="stack compact actions-row">
                    <button
                      type="button"
                      className="primary"
                      disabled={publishing}
                      onClick={() => void handleConfirmPublish()}
                    >
                      {publishing ? "Publicando..." : "Confirmar publicación real"}
                    </button>
                    <button type="button" disabled={publishing} onClick={handleCancelPublish}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}

              {dryRunResult ? (
                <div className="publish-result publish-result--dryrun">
                  <div className="section-card__header compact">
                    <div>
                      <h4>Simulación de publicación (dry-run)</h4>
                      <p>
                        Esta simulación no escribe en el inventario operativo. Solo muestra qué
                        ocurriría al publicar.
                      </p>
                    </div>
                    <span className="staging-badge">Sin efectos</span>
                  </div>

                  <div className="grid two">
                    <div className="field">
                      <span>Alojamientos a publicar</span>
                      <strong>{dryRunResult.accommodationsToPublish}</strong>
                    </div>
                    <div className="field">
                      <span>Tarifas de alojamiento a publicar</span>
                      <strong>{dryRunResult.accommodationRatesToPublish}</strong>
                    </div>
                    <div className="field">
                      <span>Actividades a publicar</span>
                      <strong>{dryRunResult.activitiesToPublish}</strong>
                    </div>
                    <div className="field">
                      <span>Tarifas de actividad a publicar</span>
                      <strong>{dryRunResult.activityRatesToPublish}</strong>
                    </div>
                    <div className="field">
                      <span>Candidatos que se omitirían</span>
                      <strong>{dryRunResult.skipped}</strong>
                    </div>
                    <div className="field">
                      <span>Aprobados / Pendientes / Rechazados / Requieren cambios</span>
                      <strong>
                        {dryRunResult.approvedCandidates} / {dryRunResult.pendingCandidates} /{" "}
                        {dryRunResult.rejectedCandidates} / {dryRunResult.needsChangesCandidates}
                      </strong>
                    </div>
                  </div>

                  {!dryRunResult.hasPublishableCandidates ? (
                    <div className="alert alert--warning" role="status">
                      No hay candidatos aprobados: al publicar no se crearía ningún registro
                      operativo.
                    </div>
                  ) : null}

                  {dryRunResult.wouldReplaceExisting ? (
                    <div className="alert alert--warning" role="status">
                      Publicar reemplazaría la publicación previa de este documento (operación
                      idempotente).
                    </div>
                  ) : null}

                  {dryRunResult.warnings.length > 0 ? (
                    <>
                      <span className="ai-result__label">Advertencias de la simulación</span>
                      <ul className="detail-list">
                        {dryRunResult.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p>Sin advertencias. Todo lo aprobado se publicaría.</p>
                  )}
                </div>
              ) : null}

              {publishResult ? (
                <div className="publish-result">
                  <div className="grid two">
                    <div className="field">
                      <span>Alojamientos publicados</span>
                      <strong>{publishResult.accommodations}</strong>
                    </div>
                    <div className="field">
                      <span>Tarifas de alojamiento</span>
                      <strong>{publishResult.accommodationRates}</strong>
                    </div>
                    <div className="field">
                      <span>Actividades publicadas</span>
                      <strong>{publishResult.activities}</strong>
                    </div>
                    <div className="field">
                      <span>Tarifas de actividad</span>
                      <strong>{publishResult.activityRates}</strong>
                    </div>
                    <div className="field">
                      <span>Omitidos (no aprobados / inválidos)</span>
                      <strong>
                        {publishResult.skippedAccommodations +
                          publishResult.skippedRates +
                          publishResult.skippedActivities +
                          publishResult.skippedActivityRates}
                      </strong>
                    </div>
                  </div>

                  {publishResult.warnings.length > 0 ? (
                    <>
                      <span className="ai-result__label">Advertencias de publicación</span>
                      <ul className="detail-list">
                        {publishResult.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p>Sin advertencias.</p>
                  )}
                </div>
              ) : null}
                </>
              ) : null}

              {workspaceTab === "publicados" ? (
                <>
              <div className="section-card__header compact">
                <div>
                  <h4>Trazabilidad: ¿qué hay publicado ahora?</h4>
                  <p>
                    Registros del inventario operativo vinculados a este documento (lectura en
                    vivo). No modifica nada.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={publishedLoading}
                  onClick={() => void handleLoadPublished()}
                >
                  {publishedLoading
                    ? "Cargando..."
                    : publishedInventory
                      ? "Actualizar lo publicado"
                      : "Ver lo publicado ahora"}
                </button>
              </div>

              {publishedInventory ? (
                <div className="published-trace">
                  <div className="grid two">
                    <div className="field">
                      <span>Alojamientos publicados</span>
                      <strong>{publishedInventory.accommodationCount}</strong>
                    </div>
                    <div className="field">
                      <span>Tarifas de alojamiento</span>
                      <strong>{publishedInventory.accommodationRateCount}</strong>
                    </div>
                    <div className="field">
                      <span>Actividades publicadas</span>
                      <strong>{publishedInventory.activityCount}</strong>
                    </div>
                    <div className="field">
                      <span>Tarifas de actividad</span>
                      <strong>{publishedInventory.activityRateCount}</strong>
                    </div>
                  </div>

                  {publishedInventory.accommodationCount === 0 &&
                  publishedInventory.activityCount === 0 ? (
                    <p>
                      No hay registros operativos publicados desde este documento ahora mismo.
                    </p>
                  ) : (
                    <ul className="published-list">
                      {publishedInventory.accommodations.map((accommodation) => (
                        <li key={accommodation.id} className="published-item">
                          <details>
                            <summary>
                              <strong>{accommodation.accommodationName}</strong>
                              {accommodation.locality ? (
                                <span className="published-item__meta">
                                  {accommodation.locality}
                                </span>
                              ) : null}
                              <span className="published-item__count">
                                {accommodation.rates.length} tarifa(s)
                              </span>
                            </summary>
                            <ul className="detail-list">
                              {accommodation.rates.map((rate) => (
                                <li key={rate.id}>
                                  {rate.year} · {rate.boardType ?? "—"} ·{" "}
                                  {rate.pvpAmount != null
                                    ? formatAmount(rate.pvpAmount, rate.currency)
                                    : "sin precio"}
                                  {rate.sourceStagingId ? (
                                    <span className="published-item__trace">
                                      {" "}
                                      · origen staging {rate.sourceStagingId.slice(0, 8)}…
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </details>
                        </li>
                      ))}

                      {publishedInventory.activities.map((activity) => (
                        <li key={activity.id} className="published-item">
                          <details>
                            <summary>
                              <strong>{activity.activityName}</strong>
                              {activity.locationMain ? (
                                <span className="published-item__meta">
                                  {activity.locationMain}
                                </span>
                              ) : null}
                              <span className="published-item__count">
                                {activity.rates.length} tarifa(s)
                              </span>
                            </summary>
                            <ul className="detail-list">
                              {activity.rates.map((rate) => (
                                <li key={rate.id}>
                                  {rate.year} · {rate.ageLabel ?? "—"} ·{" "}
                                  {rate.salePvpAmount != null
                                    ? formatAmount(rate.salePvpAmount, rate.currency)
                                    : "sin precio"}
                                </li>
                              ))}
                            </ul>
                          </details>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              <div className="section-card__header compact">
                <div>
                  <h4>Retirar publicación del inventario</h4>
                  <p>
                    Elimina del inventario operativo los registros publicados desde este documento.
                    Solo afecta a lo publicado desde aquí (nunca a datos importados de Excel). Los
                    candidatos staging se conservan y se puede volver a publicar.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={preparingUnpublish || unpublishing || awaitingUnpublishConfirm}
                  onClick={() => void handleRequestUnpublish()}
                >
                  {preparingUnpublish ? "Comprobando..." : "Retirar del inventario"}
                </button>
              </div>

              {awaitingUnpublishConfirm && unpublishDryRun ? (
                <div className="publish-confirm" role="alertdialog" aria-label="Confirmar retirada">
                  <div className="section-card__header compact">
                    <div>
                      <h4>Confirmar retirada de la publicación</h4>
                      <p>
                        Esta acción eliminará del inventario operativo los registros publicados
                        desde este documento. Es recuperable: podrás volver a publicar desde los
                        candidatos aprobados.
                      </p>
                    </div>
                    <span className="staging-badge">Borra del inventario</span>
                  </div>

                  <p className="publish-confirm__summary">
                    Se retirará <strong>todo</strong> lo publicado desde este documento:{" "}
                    <strong>{unpublishDryRun.accommodationsToRemove}</strong> alojamiento(s) y{" "}
                    <strong>{unpublishDryRun.accommodationRatesToRemove}</strong> tarifa(s);{" "}
                    <strong>{unpublishDryRun.activitiesToRemove}</strong> actividad(es) y{" "}
                    <strong>{unpublishDryRun.activityRatesToRemove}</strong> tarifa(s) de actividad.
                    Los candidatos staging no se borran.
                  </p>

                  {publishedInventory &&
                  (publishedInventory.accommodations.length > 0 ||
                    publishedInventory.activities.length > 0) ? (
                    <ul className="detail-list">
                      {publishedInventory.accommodations.map((accommodation) => (
                        <li key={accommodation.id}>
                          {accommodation.accommodationName} ({accommodation.rates.length} tarifa(s))
                        </li>
                      ))}
                      {publishedInventory.activities.map((activity) => (
                        <li key={activity.id}>
                          {activity.activityName} ({activity.rates.length} tarifa(s))
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="stack compact actions-row">
                    <button
                      type="button"
                      className="primary"
                      disabled={unpublishing}
                      onClick={() => void handleConfirmUnpublish()}
                    >
                      {unpublishing ? "Retirando..." : "Confirmar retirada"}
                    </button>
                    <button type="button" disabled={unpublishing} onClick={handleCancelUnpublish}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}

              {unpublishResult ? (
                <div className="publish-result publish-result--dryrun">
                  <div className="grid two">
                    <div className="field">
                      <span>Alojamientos retirados</span>
                      <strong>{unpublishResult.accommodationsRemoved}</strong>
                    </div>
                    <div className="field">
                      <span>Tarifas de alojamiento retiradas</span>
                      <strong>{unpublishResult.accommodationRatesRemoved}</strong>
                    </div>
                    <div className="field">
                      <span>Actividades retiradas</span>
                      <strong>{unpublishResult.activitiesRemoved}</strong>
                    </div>
                    <div className="field">
                      <span>Tarifas de actividad retiradas</span>
                      <strong>{unpublishResult.activityRatesRemoved}</strong>
                    </div>
                  </div>
                </div>
              ) : null}
                </>
              ) : null}

              {workspaceTab === "resumen" && aiResult ? (
                <div className="ai-result">
                  <div className="section-card__header compact">
                    <div>
                      <h4>Análisis IA (candidatos preliminares)</h4>
                      <p>
                        Modo {aiResult.mode} · Confianza {Math.round(aiResult.confidence * 100)}% ·
                        Sin guardar en staging
                      </p>
                    </div>
                  </div>

                  <div className="field">
                    <span>Resumen</span>
                    <strong>{aiResult.documentSummary}</strong>
                  </div>

                  <div className="grid two">
                    <div className="field">
                      <span>Alojamiento detectado</span>
                      <strong>
                        {aiResult.detectedAccommodation?.accommodationName ?? "No detectado"}
                      </strong>
                    </div>
                    <div className="field">
                      <span>Actividades detectadas</span>
                      <strong>{aiResult.detectedActivities.length}</strong>
                    </div>
                    <div className="field">
                      <span>Tarifas candidatas</span>
                      <strong>{aiResult.candidateRates.length}</strong>
                    </div>
                    <div className="field">
                      <span>Suplementos candidatos</span>
                      <strong>{aiResult.candidateSupplements.length}</strong>
                    </div>
                    <div className="field">
                      <span>Políticas candidatas</span>
                      <strong>{aiResult.candidatePolicies.length}</strong>
                    </div>
                    <div className="field">
                      <span>Fechas especiales candidatas</span>
                      <strong>{aiResult.candidateBlackoutDates.length}</strong>
                    </div>
                  </div>

                  {aiResult.warnings.length > 0 ? (
                    <>
                      <span className="ai-result__label">Advertencias</span>
                      <ul className="detail-list">
                        {aiResult.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  <span className="ai-result__label">JSON devuelto</span>
                  <pre className="extraction-text">{JSON.stringify(aiResult, null, 2)}</pre>
                </div>
              ) : null}

              {workspaceTab === "incidencias" ? (
                <>
              <ImportIssuesPanel issues={detail.importIssues} />

              <div className="section-card__header compact">
                <div>
                  <h4>Extracciones</h4>
                  <p>{detail.extractions.length} extracción(es)</p>
                </div>
              </div>

              {detail.extractions.length > 0 ? (
                <ul className="detail-list">
                  {annotateExtractions(detail.extractions).map(
                    ({ extraction, isCurrentText, isHistoricalText }) => (
                      <li
                        key={extraction.id}
                        className={isHistoricalText ? "extraction--historical" : undefined}
                      >
                        <strong>
                          {extractionMethodLabels[extraction.extractionMethod] ??
                            extraction.extractionMethod}
                        </strong>
                        {isCurrentText ? (
                          <span className="extraction-badge extraction-badge--current">Actual</span>
                        ) : null}
                        {isHistoricalText ? (
                          <span className="extraction-badge extraction-badge--historical">
                            Histórica (no se usa)
                          </span>
                        ) : null}
                        {extraction.pageNumber != null ? (
                          <span> · Página {extraction.pageNumber}</span>
                        ) : null}
                        {extraction.confidenceScore != null ? (
                          <span> · Confianza {extraction.confidenceScore}</span>
                        ) : null}
                        {extraction.rawText ? (
                          <pre className="extraction-text">{extraction.rawText}</pre>
                        ) : null}
                      </li>
                    ),
                  )}
                </ul>
              ) : (
                <p>No hay extracciones registradas.</p>
              )}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
