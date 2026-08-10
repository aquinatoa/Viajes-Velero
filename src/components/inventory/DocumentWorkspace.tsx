import { useEffect, useState } from "react";
import type {
  AiDocumentAnalysisResult,
  DocumentExtraction,
  DryRunPublishResult,
  DryRunUnpublishResult,
  ImportIssue,
  InventoryDocumentDetail,
  PublishApprovedResult,
  PublishedInventorySummary,
  PublishedItemKind,
  StagingEntityKey,
  StagingReviewStatus,
  UnpublishResult,
} from "../../domain/documentImportTypes";
import {
  analyzeInventoryDocumentApi,
  analyzeInventoryDocumentWithAiApi,
  bulkUpdateInventoryStagingApi,
  createInventoryDocumentStagingApi,
  dryRunPublishApprovedInventoryDocumentApi,
  dryRunUnpublishInventoryDocumentApi,
  getInventoryDocumentApi,
  getPublishedInventoryByDocumentApi,
  publishApprovedInventoryDocumentApi,
  regenerateInventoryDocumentStagingApi,
  removeInventoryDocumentFileApi,
  unpublishInventoryDocumentApi,
  unpublishPublishedItemApi,
  uploadInventoryDocumentFileApi,
} from "../../services/apiClient";
import {
  extractionStatusLabels,
  formatAmount,
  getErrorMessage,
  stagingReviewStatusLabels,
  statusLabels,
  targetTypeLabels,
} from "./inventoryFormatting";
import {
  accommodationAdjustmentFields,
  accommodationBlackoutFields,
  accommodationFields,
  accommodationPolicyFields,
  accommodationRateColumns,
  accommodationRateFields,
  activityFields,
  activityPolicyFields,
  activityRateColumns,
  activityRateFields,
  adjustmentColumns,
  blackoutColumns,
  policyColumns,
  RateReviewTable,
  StagingEditableCard,
  type CandidateItem,
} from "./RateReviewTable";
import { buildMatrix, RateDetailDialog, RateMatrix } from "./RateMatrix";
import { checkRates } from "../../domain/rateChecks";

/** Estados de revisión en claro, para la cabecera de cada alojamiento. */
const reviewStatusLabels: Record<string, string> = {
  PENDING: "Por revisar",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  NEEDS_CHANGES: "Requiere cambios",
  CORRECTED: "Corregido",
  CONFIRMED: "Confirmado",
};

/**
 * Resumen de un alojamiento para poder tenerlo plegado: cuántas tarifas, entre
 * qué precios y con qué regímenes. Sin esto, plegar sería esconder.
 */
function resumirTarifas(rates: { boardType?: string | null; pvpAmount?: number | null; netAmount?: number | null }[]): string {
  if (rates.length === 0) return "Sin tarifas";

  const importes = rates
    .map((rate) => Number(rate.pvpAmount ?? rate.netAmount ?? 0))
    .filter((valor) => Number.isFinite(valor) && valor > 0);

  const regimenes = [...new Set(rates.map((rate) => String(rate.boardType ?? "")).filter(Boolean))];

  const partes = [`${rates.length} tarifa(s)`];
  if (importes.length > 0) {
    const min = Math.min(...importes);
    const max = Math.max(...importes);
    const fmt = (valor: number) =>
      new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(valor);
    partes.push(min === max ? `${fmt(min)} €` : `${fmt(min)} – ${fmt(max)} €`);
  }
  if (regimenes.length > 0) partes.push(regimenes.join(", "));
  return partes.join(" · ");
}

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
  AI_MOCK_MODE: "Análisis en modo mock",
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
  // Las condiciones ya no se aplanan: el catálogo las guarda con su tipo, su
  // importe y sus fechas, además del texto que lee el colegio. El aviso que
  // decía "se pierde su estructura" dejó de ser cierto.
  void foldedPolicies;
  void foldedAdjustments;
  void foldedBlackouts;
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

interface DocumentWorkspaceProps {
  /** Documento cuyo detalle/revisión se gestiona. */
  documentId: string;
  /** Pestaña inicial (p. ej. "pendientes" al abrir desde la columna "Por revisar"). */
  initialTab?: string;
  /**
   * Cambia (lo incrementa el contenedor) para forzar una recarga silenciosa del
   * detalle sin desmontar el workspace, p. ej. al editar los metadatos del
   * documento abierto desde la lista. No reinicia las pestañas ni el estado.
   */
  reloadToken?: number;
  /** Notifica al contenedor que algo cambió para que recargue la lista. */
  onChanged: () => void | Promise<void>;
  /** Cierra el detalle (lo controla el contenedor). */
  onClose: () => void;
}

/**
 * Workspace de revisión de un documento: archivo fuente, pipeline de análisis,
 * candidatos staging por pestañas (pendientes/aprobados/rechazados), publicación
 * con dry-run + confirmación, trazabilidad de lo publicado, retirada (total o
 * granular) e incidencias. Gestiona su propio estado, errores y subida de
 * archivo; avisa al contenedor con onChanged tras acciones que cambian la lista.
 *
 * Se monta con key={documentId} en el contenedor, así que cada documento arranca
 * con estado limpio (no hace falta reiniciar manualmente al cambiar de detalle).
 */
export function DocumentWorkspace({
  documentId,
  initialTab = "resumen",
  reloadToken = 0,
  onChanged,
  onClose,
}: DocumentWorkspaceProps) {
  const [detail, setDetail] = useState<InventoryDocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const [workspaceTab, setWorkspaceTab] = useState<string>(initialTab);
  const [actionInProgress, setActionInProgress] = useState<DocumentActionKey | null>(null);
  const [aiResult, setAiResult] = useState<AiDocumentAnalysisResult | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  // Paso actual de "Leer el documento": null = parado.
  const [readingStep, setReadingStep] = useState<"extract" | "ai" | "staging" | null>(null);
  const [stagingCreating, setStagingCreating] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [awaitingRegenerateConfirm, setAwaitingRegenerateConfirm] = useState(false);

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

  // Retirada granular de un registro publicado (alojamiento/actividad/tarifa).
  const [unpublishItemConfirm, setUnpublishItemConfirm] = useState<{
    kind: PublishedItemKind;
    id: string;
    label: string;
  } | null>(null);
  const [unpublishItemBusy, setUnpublishItemBusy] = useState(false);

  // Subida/quitado del archivo fuente (propio del workspace).
  const [replaceFile, setReplaceFile] = useState<File | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [removingFile, setRemovingFile] = useState(false);

  async function refreshDetail() {
    const updatedDetail = await getInventoryDocumentApi(documentId);
    setDetail(updatedDetail);
    return updatedDetail;
  }

  // Carga inicial del detalle + trazabilidad en vivo. El contenedor monta el
  // componente con key={documentId}, así que esto corre una vez por documento;
  // al cambiar reloadToken se recarga en silencio (detailLoading ya está en
  // false, así que no parpadea el "Cargando...").
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const updatedDetail = await getInventoryDocumentApi(documentId);
        if (cancelled) return;
        setDetail(updatedDetail);
        try {
          const live = await getPublishedInventoryByDocumentApi(documentId);
          if (!cancelled) setPublishedInventory(live);
        } catch {
          // No bloquea el detalle: la trazabilidad se puede cargar manualmente.
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getErrorMessage(error, "No se pudo cargar el detalle del documento."));
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [documentId, reloadToken]);

  // --- Archivo fuente ---------------------------------------------------------
  async function handleReplaceFile() {
    setErrorMessage(null);
    setFeedbackMessage(null);

    if (!replaceFile) {
      setErrorMessage("Selecciona un archivo antes de subirlo.");
      return;
    }

    setUploading(true);
    try {
      await uploadInventoryDocumentFileApi(documentId, replaceFile);
      setReplaceFile(undefined);
      setFeedbackMessage("Archivo subido correctamente.");
      await onChanged();
      await refreshDetail();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo subir el archivo."));
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveFile() {
    setErrorMessage(null);
    setFeedbackMessage(null);
    setRemovingFile(true);
    try {
      await removeInventoryDocumentFileApi(documentId);
      await onChanged();
      await refreshDetail();
      setFeedbackMessage("Archivo quitado del documento. Puedes subir otro.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo quitar el archivo del documento."));
    } finally {
      setRemovingFile(false);
    }
  }

  // --- Retirada granular de un registro publicado ----------------------------
  function handleRequestUnpublishItem(kind: PublishedItemKind, id: string, label: string) {
    setErrorMessage(null);
    setFeedbackMessage(null);
    setUnpublishItemConfirm({ kind, id, label });
  }

  function handleCancelUnpublishItem() {
    setUnpublishItemConfirm(null);
  }

  async function handleConfirmUnpublishItem() {
    if (!unpublishItemConfirm) {
      return;
    }
    const { kind, id, label } = unpublishItemConfirm;
    setUnpublishItemBusy(true);
    setErrorMessage(null);
    setFeedbackMessage(null);
    try {
      await unpublishPublishedItemApi(kind, id);
      setUnpublishItemConfirm(null);
      // Refrescar la trazabilidad en vivo y el detalle (estado/contadores).
      const live = await getPublishedInventoryByDocumentApi(documentId);
      setPublishedInventory(live);
      await refreshDetail();
      await onChanged();
      setFeedbackMessage(`Se retiró del inventario: ${label}.`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo retirar el registro del inventario."));
    } finally {
      setUnpublishItemBusy(false);
    }
  }

  async function handleAiAnalyze() {
    setErrorMessage(null);
    setFeedbackMessage(null);
    setAiAnalyzing(true);

    try {
      const result = await analyzeInventoryDocumentWithAiApi(documentId);
      setAiResult(result);
      setFeedbackMessage(
        `Análisis IA ejecutado (modo ${result.mode}). Candidatos preliminares listos para revisión.`,
      );
      await refreshDetail();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo ejecutar el análisis IA del documento."));
    } finally {
      setAiAnalyzing(false);
    }
  }

  async function handleCreateStaging() {
    setErrorMessage(null);
    setFeedbackMessage(null);
    setStagingCreating(true);

    try {
      const result = await createInventoryDocumentStagingApi(documentId);
      const mockNote =
        result.aiMode === "mock"
          ? " ⚠ Análisis en modo MOCK (sin IA real): los candidatos son de ejemplo; configura la clave del proveedor (p. ej. ANTHROPIC_API_KEY) y regenera."
          : "";
      setFeedbackMessage(
        `Candidatos revisables creados: ${result.accommodations} alojamiento(s), ${result.rates} tarifa(s), ${result.adjustments} suplemento(s), ${result.policies} política(s), ${result.blackoutDates} fecha(s) especial(es) y ${result.activities} actividad(es).${mockNote}`,
      );
      await refreshDetail();
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "No se pudieron crear los candidatos revisables del documento."),
      );
    } finally {
      setStagingCreating(false);
    }
  }

  /**
   * Leer el documento de principio a fin: extraer el texto, pasarlo por la IA y
   * dejar los candidatos listos para revisar.
   *
   * Antes eran tres botones que había que pulsar en el orden correcto, sin que
   * nada lo dijera. Es la misma cadena; lo que cambia es que la app la conduce y
   * va contando por dónde va.
   */
  async function handleReadDocument() {
    setErrorMessage(null);
    setFeedbackMessage(null);
    setReadingStep("extract");

    try {
      await analyzeInventoryDocumentApi(documentId);

      setReadingStep("ai");
      const ai = await analyzeInventoryDocumentWithAiApi(documentId);
      setAiResult(ai);

      setReadingStep("staging");
      const staging = await createInventoryDocumentStagingApi(documentId);

      await refreshDetail();
      await onChanged();

      const mockNote =
        staging.aiMode === "mock"
          ? " Ojo: se ha usado el modo de ejemplo, sin IA real. Configura la clave del proveedor y vuelve a leerlo."
          : "";
      setFeedbackMessage(
        `Documento leído: ${staging.accommodations} alojamiento(s) y ${staging.rates} tarifa(s) esperando tu revisión.${mockNote}`,
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "No se pudo leer el documento. Puedes intentarlo de nuevo."),
      );
    } finally {
      setReadingStep(null);
    }
  }

  /**
   * Qué toca hacer ahora con este documento.
   *
   * La pantalla tiene siete zonas y el usuario preguntaba, con razón, "¿y ahora
   * qué?". Esto lo responde en una frase y un botón, mirando en qué punto está:
   * sin archivo → sin leer → pendientes de revisar → aprobados sin publicar →
   * publicado.
   */
  function calcularSiguientePaso() {
    if (!detail) {
      return { tone: "wait", eyebrow: "", title: "", hint: "", action: null };
    }

    const candidatos =
      detail.stagingAccommodations.length + detail.stagingActivities.length;

    if (!detail.originalFileName) {
      return {
        tone: "todo" as const,
        eyebrow: "Siguiente paso",
        title: "Sube el archivo de tarifas",
        hint: "Sin el PDF o el Excel no hay nada que leer.",
        action: null,
      };
    }

    if (candidatos === 0) {
      return {
        tone: "todo" as const,
        eyebrow: "Siguiente paso",
        title: "Lee el documento",
        hint: "Saca el texto, lo entiende con IA y deja las tarifas listas para revisar. Tarda un par de minutos.",
        action: { label: "Leer el documento", run: () => void handleReadDocument() },
      };
    }

    const porRevisar =
      (qcSummary?.counts.PENDING ?? 0) + (qcSummary?.counts.NEEDS_CHANGES ?? 0);
    const aprobados = qcSummary?.counts.APPROVED ?? 0;

    // Decir "revisa 6 candidatos" no ayuda: hay que decir QUÉ queda, porque
    // alojamientos y actividades son cosas distintas e independientes.
    const sinRevisar = (estado: unknown) =>
      String(estado) === "PENDING" || String(estado) === "NEEDS_CHANGES";

    const alojamientosPendientes = detail.stagingAccommodations.filter(
      (a) =>
        sinRevisar(a.reviewStatus) ||
        a.rates.some((r) => sinRevisar(r.reviewStatus)) ||
        a.adjustments.some((r) => sinRevisar(r.reviewStatus)) ||
        a.policies.some((r) => sinRevisar(r.reviewStatus)) ||
        a.blackoutDates.some((r) => sinRevisar(r.reviewStatus)),
    ).length;

    const actividadesPendientes = detail.stagingActivities.filter(
      (a) =>
        sinRevisar(a.reviewStatus) ||
        a.rates.some((r) => sinRevisar(r.reviewStatus)) ||
        a.policies.some((r) => sinRevisar(r.reviewStatus)),
    ).length;

    if (alojamientosPendientes > 0) {
      return {
        tone: "todo" as const,
        eyebrow: "Siguiente paso",
        title:
          alojamientosPendientes === 1
            ? "Revisa el alojamiento que queda"
            : `Revisa ${alojamientosPendientes} alojamientos`,
        hint:
          actividadesPendientes > 0
            ? `Después quedarán ${actividadesPendientes} actividad(es), que van aparte. Nada llega al catálogo hasta que lo apruebes.`
            : "Comprueba que los precios son correctos y aprueba cada alojamiento. Nada llega al catálogo hasta que lo hagas.",
        action: { label: "Ir a pendientes", run: () => setWorkspaceTab("pendientes") },
      };
    }

    if (actividadesPendientes > 0) {
      return {
        tone: "todo" as const,
        eyebrow: "Siguiente paso",
        title: `Quedan ${actividadesPendientes} actividad(es) por revisar`,
        hint: `Los alojamientos ya están aprobados. Las actividades —alquiler de campos, partidos, clases— son independientes de ellos y se aprueban aparte. No es obligatorio: puedes publicar solo los alojamientos, y lo que no apruebes simplemente no pasa al catálogo.`,
        action: { label: "Ir a las actividades", run: () => setWorkspaceTab("pendientes") },
      };
    }

    if (porRevisar > 0) {
      return {
        tone: "todo" as const,
        eyebrow: "Siguiente paso",
        title: `Revisa ${porRevisar} candidato(s)`,
        hint: "Comprueba que los precios y los alojamientos son correctos, y apruébalos. Nada llega al catálogo hasta que lo hagas.",
        action: { label: "Ir a pendientes", run: () => setWorkspaceTab("pendientes") },
      };
    }

    if (aprobados > 0 && detail.status !== "PUBLISHED") {
      return {
        tone: "ready" as const,
        eyebrow: "Siguiente paso",
        title: `Publica ${aprobados} candidato(s) aprobado(s)`,
        hint: "Ya está todo revisado. Al publicar pasan al catálogo y el comercial podrá cotizar con ellos.",
        action: { label: "Ir a publicar", run: () => setWorkspaceTab("aprobados") },
      };
    }

    if (detail.status === "PUBLISHED") {
      return {
        tone: "done" as const,
        eyebrow: "Terminado",
        title: "Sus tarifas están en el catálogo",
        hint: "Ya se puede cotizar con ellas. Si el proveedor manda una corrección, reemplaza el archivo y vuelve a leerlo.",
        action: { label: "Ver lo publicado", run: () => setWorkspaceTab("publicados") },
      };
    }

    return {
      tone: "done" as const,
      eyebrow: "Sin nada pendiente",
      title: "No queda nada por revisar",
      hint: "Ningún candidato espera decisión en este documento.",
      action: null,
    };
  }

  /**
   * Aprueba un alojamiento y TODO lo suyo en un solo gesto: sus tarifas, sus
   * suplementos, sus condiciones y sus fechas especiales.
   *
   * El porqué: hasta ahora el hotel se aprobaba aparte de sus tarifas, y era
   * posible aprobar las 18 y olvidar el hotel. Al publicar, esas 18 se caían con
   * un aviso que nadie leía — así llegamos a tener 42 tarifas aprobadas y una
   * publicada. Uniéndolo en una acción, el error deja de existir en vez de
   * quedarse en advertencia.
   */
  async function handleApproveWholeAccommodation(accommodation: {
    id: string;
    accommodationName: string;
    rates: { id: string }[];
    adjustments: { id: string }[];
    policies: { id: string }[];
    blackoutDates: { id: string }[];
  }) {
    const total =
      accommodation.rates.length +
      accommodation.adjustments.length +
      accommodation.policies.length +
      accommodation.blackoutDates.length;

    setErrorMessage(null);
    setFeedbackMessage(null);
    setBulkBusy(true);
    try {
      // El padre primero: si fallara, no dejamos hijas aprobadas colgando de un
      // alojamiento sin aprobar, que es justo el estado que causaba el problema.
      await bulkUpdateInventoryStagingApi("accommodations", [accommodation.id], "APPROVED");

      const porTipo: [StagingEntityKey, string[]][] = [
        ["accommodation-rates", accommodation.rates.map((r) => r.id)],
        ["accommodation-adjustments", accommodation.adjustments.map((r) => r.id)],
        ["accommodation-policies", accommodation.policies.map((r) => r.id)],
        ["accommodation-blackout-dates", accommodation.blackoutDates.map((r) => r.id)],
      ];
      for (const [entity, ids] of porTipo) {
        if (ids.length > 0) {
          await bulkUpdateInventoryStagingApi(entity, ids, "APPROVED");
        }
      }

      setDryRunResult(null);
      setAwaitingPublishConfirm(false);
      await refreshDetail();
      await onChanged();
      setFeedbackMessage(
        `"${accommodation.accommodationName}" aprobado junto con sus ${total} candidato(s). Ya se puede publicar.`,
      );
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "No se pudo aprobar el alojamiento con todo su contenido."),
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleStagingSaved() {
    // Al cambiar un candidato, la simulación previa deja de ser válida: se
    // descarta para obligar a re-simular antes de confirmar la publicación.
    setDryRunResult(null);
    setAwaitingPublishConfirm(false);
    await refreshDetail();
  }

  // Cambia el estado de revisión de varios candidatos del mismo tipo a la vez.
  async function handleBulkReview(
    entity: StagingEntityKey,
    ids: string[],
    reviewStatus: string,
    label: string,
  ) {
    if (ids.length === 0) {
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
      await refreshDetail();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo actualizar el estado de los candidatos."));
    } finally {
      setBulkBusy(false);
    }
  }

  // Aprueba el alojamiento/actividad padre y los candidatos indicados a la vez,
  // para que el conjunto sea realmente publicable.
  async function handleApproveWithParent(
    entity: StagingEntityKey,
    parentEntity: StagingEntityKey,
    parentId: string,
    ids: string[],
    label: string,
  ) {
    if (ids.length === 0) {
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
      await refreshDetail();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo aprobar el conjunto."));
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleRegenerate() {
    setAwaitingRegenerateConfirm(false);
    setErrorMessage(null);
    setFeedbackMessage(null);
    setRegenerating(true);

    try {
      const result = await regenerateInventoryDocumentStagingApi(documentId);
      setFeedbackMessage(
        `Candidatos regenerados (se descartó la revisión previa): ${result.accommodations} alojamiento(s), ${result.rates} tarifa(s), ${result.adjustments} suplemento(s), ${result.policies} política(s) y ${result.activities} actividad(es).`,
      );
      setDryRunResult(null);
      setAwaitingPublishConfirm(false);
      await refreshDetail();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudieron regenerar los candidatos."));
    } finally {
      setRegenerating(false);
    }
  }

  async function handleDryRun() {
    setErrorMessage(null);
    setFeedbackMessage(null);
    setDryRunning(true);

    try {
      const result = await dryRunPublishApprovedInventoryDocumentApi(documentId);
      setDryRunResult(result);
      setFeedbackMessage(
        "Simulación de publicación lista. No se escribió nada en el inventario operativo.",
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo simular la publicación del documento."));
    } finally {
      setDryRunning(false);
    }
  }

  // Paso 1 de la publicación real: asegurar una simulación reciente y pasar al
  // estado de confirmación. No escribe nada todavía.
  async function handleRequestPublish() {
    setErrorMessage(null);
    setFeedbackMessage(null);

    if (!dryRunResult) {
      setPreparingPublish(true);
      try {
        const result = await dryRunPublishApprovedInventoryDocumentApi(documentId);
        setDryRunResult(result);
      } catch (error) {
        setErrorMessage(getErrorMessage(error, "No se pudo simular la publicación del documento."));
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
    setErrorMessage(null);
    setFeedbackMessage(null);
    setPublishing(true);

    try {
      const result = await publishApprovedInventoryDocumentApi(documentId);
      setPublishResult(result);

      // El mensaje dice lo que ha pasado, no "completado" a secas: publicar y
      // que no entre nada es un resultado posible y hay que verlo.
      const entraron = result.accommodationRates + result.activityRates;
      const fuera =
        result.skippedRates +
        result.skippedActivityRates +
        result.skippedAccommodations +
        result.skippedActivities;

      if (entraron === 0) {
        setErrorMessage(
          fuera > 0
            ? `No entró ninguna tarifa al catálogo: ${fuera} se quedaron fuera. Mira los motivos aquí abajo, arréglalos y vuelve a publicar.`
            : "No entró ninguna tarifa al catálogo: no había nada aprobado que publicar.",
        );
      } else {
        setFeedbackMessage(
          fuera > 0
            ? `${entraron} tarifa(s) ya están en el catálogo. ${fuera} se quedaron fuera: mira los motivos aquí abajo.`
            : `Todo dentro: ${entraron} tarifa(s) en el catálogo, de ${result.accommodations} alojamiento(s) y ${result.activities} actividad(es).`,
        );
      }
      await refreshDetail();
      await onChanged();
      // Si la trazabilidad estaba cargada, refrescarla para reflejar lo vivo.
      if (publishedInventory) {
        try {
          const live = await getPublishedInventoryByDocumentApi(documentId);
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
    setErrorMessage(null);
    setPublishedLoading(true);

    try {
      const result = await getPublishedInventoryByDocumentApi(documentId);
      setPublishedInventory(result);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo obtener la trazabilidad de lo publicado."));
    } finally {
      setPublishedLoading(false);
    }
  }

  // Paso 1 de la retirada: simular cuántos registros se quitarían y, si hay
  // algo publicado, pasar a confirmación. No borra nada.
  async function handleRequestUnpublish() {
    setErrorMessage(null);
    setFeedbackMessage(null);
    setUnpublishResult(null);
    setPreparingUnpublish(true);

    try {
      const result = await dryRunUnpublishInventoryDocumentApi(documentId);
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
      setErrorMessage(getErrorMessage(error, "No se pudo simular la retirada de la publicación."));
    } finally {
      setPreparingUnpublish(false);
    }
  }

  function handleCancelUnpublish() {
    setAwaitingUnpublishConfirm(false);
  }

  // Paso 2: confirmación explícita. Aquí sí se elimina del inventario operativo.
  async function handleConfirmUnpublish() {
    setAwaitingUnpublishConfirm(false);
    setErrorMessage(null);
    setFeedbackMessage(null);
    setUnpublishing(true);

    try {
      const result = await unpublishInventoryDocumentApi(documentId);
      setUnpublishResult(result);
      setFeedbackMessage(
        `Publicación retirada: ${result.accommodationsRemoved} alojamiento(s) y ${result.accommodationRatesRemoved} tarifa(s); ${result.activitiesRemoved} actividad(es) y ${result.activityRatesRemoved} tarifa(s) de actividad. Los candidatos staging se conservan.`,
      );
      await refreshDetail();
      await onChanged();
      // La trazabilidad ya no debe mostrar registros: refrescarla si estaba abierta.
      if (publishedInventory) {
        try {
          const live = await getPublishedInventoryByDocumentApi(documentId);
          setPublishedInventory(live);
        } catch {
          setPublishedInventory(null);
        }
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo retirar la publicación del documento."));
    } finally {
      setUnpublishing(false);
    }
  }

  // Extrae el texto del PDF (no crea candidatos; eso es un paso aparte).
  async function handleDocumentAction(action: DocumentActionKey) {
    setErrorMessage(null);
    setFeedbackMessage(null);
    setActionInProgress(action);

    try {
      await analyzeInventoryDocumentApi(documentId);
      setFeedbackMessage("Texto extraído. El documento quedó pendiente de revisión.");
      await refreshDetail();
      await onChanged();
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

  // Tarifa abierta desde una celda de la matriz (para corregir una suelta).
  const [matrixEditId, setMatrixEditId] = useState<string | null>(null);
  // Qué vista usa cada alojamiento: rejilla (por defecto) o lista.
  const [vistaLista, setVistaLista] = useState<Record<string, boolean>>({});

  const qcSummary = detail ? computeQualitySummary(detail) : null;
  // Se calcula aquí, después del resumen de calidad, porque lo usa.
  const nextStep = calcularSiguientePaso();
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

  return (
    <div className="section-card__detail">
      <div className="section-card__header compact">
        <div>
          <h3>Detalle del documento</h3>
          <p>Revisión humana del documento seleccionado.</p>
        </div>
        <button type="button" onClick={onClose}>
          Cerrar detalle
        </button>
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

      {detailLoading ? <p>Cargando detalle...</p> : null}

      {!detailLoading && detail ? (
        <div className="stack">
          {/* Lo primero es qué hay que hacer ahora, no cuándo se creó el
              documento. Antes esta pantalla abría con siete fichas de metadatos
              y la única acción quedaba a tres pantallazos de scroll. */}
          <div className={`next-step next-step--${nextStep.tone}`}>
            <div className="next-step__txt">
              <span className="next-step__eyebrow">{nextStep.eyebrow}</span>
              <h4>{nextStep.title}</h4>
              <p>{nextStep.hint}</p>
            </div>
            {nextStep.action ? (
              <button
                type="button"
                className="primary next-step__go"
                onClick={nextStep.action.run}
              >
                {nextStep.action.label}
              </button>
            ) : null}
          </div>

          {/* Identidad en una línea, no en fichas. */}
          <p className="doc-id">
            <strong>{detail.controlName}</strong>
            <span>{targetTypeLabels[detail.targetType]}</span>
            {detail.controlLocation ? <span>{detail.controlLocation}</span> : null}
            {detail.controlYear ? <span>Temporada {detail.controlYear}</span> : null}
            <span className={`doc-state doc-state--${detail.status.toLowerCase()}`}>
              {statusLabels[detail.status] ?? detail.status}
            </span>
          </p>

          {/* Fechas y notas: sirven para diagnosticar, no para trabajar. */}
          <details className="doc-meta">
            <summary>Ficha técnica del documento</summary>
            <div className="grid two">
              <div className="field">
                <span>Extracción</span>
                <strong>
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
          </details>

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

              <div className="file-cell">
                {/* Botón de verdad; el input nativo va dentro, oculto pero
                    alcanzable con el teclado. */}
                <label className="filepick__choose">
                  {replaceFile ? `Elegido: ${replaceFile.name}` : "Elegir otro archivo"}
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      setReplaceFile(file);
                    }}
                  />
                </label>
                <div className="stack compact actions-row">
                  <button
                    type="button"
                    disabled={!replaceFile || uploading}
                    onClick={() => void handleReplaceFile()}
                  >
                    {uploading
                      ? "Subiendo..."
                      : detail.originalFileName
                        ? "Reemplazar archivo"
                        : "Subir archivo"}
                  </button>
                  {detail.originalFileName ? (
                    <button
                      type="button"
                      className="link-action link-action--reject"
                      disabled={removingFile}
                      onClick={() => void handleRemoveFile()}
                    >
                      {removingFile ? "Quitando..." : "Quitar archivo"}
                    </button>
                  ) : null}
                </div>
                {detail.originalFileName ? (
                  <small className="file-cell__name">
                    Reemplazar o quitar el archivo reinicia la extracción de texto (no borra los
                    candidatos ya creados).
                  </small>
                ) : null}
              </div>

              {/* Una sola acción. Los tres pasos siguen existiendo debajo, por
                  si hay que repetir uno suelto, pero ya no hay que saberse el
                  orden para usar la aplicación. */}
              <div className="read-doc">
                <div className="read-doc__head">
                  <h4>Leer el documento</h4>
                  <p>
                    Saca el texto del PDF, lo entiende con IA y deja las tarifas listas para que
                    las revises. Tarda un par de minutos.
                  </p>
                </div>

                <button
                  type="button"
                  className="primary read-doc__go"
                  disabled={
                    readingStep !== null ||
                    actionInProgress !== null ||
                    aiAnalyzing ||
                    stagingCreating ||
                    !detail.originalFileName
                  }
                  title={
                    !detail.originalFileName ? "Sube antes el archivo del documento." : undefined
                  }
                  onClick={() => void handleReadDocument()}
                >
                  {readingStep ? "Leyendo…" : "Leer el documento"}
                </button>

                {readingStep ? (
                  <ol className="read-doc__steps">
                    <li className={readingStep === "extract" ? "is-now" : "is-done"}>
                      Sacando el texto
                    </li>
                    <li
                      className={
                        readingStep === "ai" ? "is-now" : readingStep === "staging" ? "is-done" : ""
                      }
                    >
                      Entendiendo las tarifas
                    </li>
                    <li className={readingStep === "staging" ? "is-now" : ""}>
                      Preparando la revisión
                    </li>
                  </ol>
                ) : null}
              </div>

              <details className="read-doc__manual">
                <summary>Repetir un paso suelto</summary>
                <div className="stack compact actions-row">
                  <button
                    type="button"
                    disabled={actionInProgress !== null || aiAnalyzing || readingStep !== null}
                    onClick={() => void handleDocumentAction("analyze")}
                  >
                    {actionInProgress === "analyze" ? "Sacando texto…" : "1 · Sacar el texto"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      actionInProgress !== null ||
                      aiAnalyzing ||
                      stagingCreating ||
                      readingStep !== null
                    }
                    onClick={() => void handleAiAnalyze()}
                  >
                    {aiAnalyzing ? "Entendiendo…" : "2 · Entender con IA"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      actionInProgress !== null ||
                      aiAnalyzing ||
                      stagingCreating ||
                      readingStep !== null ||
                      detail.stagingAccommodations.length > 0 ||
                      detail.stagingActivities.length > 0
                    }
                    title={
                      detail.stagingAccommodations.length > 0 ||
                      detail.stagingActivities.length > 0
                        ? "Ya hay candidatos. Usa 'Regenerar candidatos' para rehacerlos."
                        : undefined
                    }
                    onClick={() => void handleCreateStaging()}
                  >
                    {stagingCreating ? "Preparando…" : "3 · Preparar la revisión"}
                  </button>
                </div>
              </details>

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
                  publicada(s) ahora. Pulsa "Revisar y publicar aprobados".
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

                {detail.stagingAccommodations.map((accommodation) => {
                  const visibles = accommodation.rates.filter((rate) =>
                    passesReviewFilter(rate.reviewStatus),
                  );
                  const matriz = buildMatrix(visibles as unknown as CandidateItem[]);
                  const resumen = resumirTarifas(visibles);
                  // La máquina comprueba lo que sabe comprobar; la persona solo
                  // decide sobre lo que no cuadra.
                  const avisos = checkRates(visibles as never);
                  const conAviso = avisos.size;

                  // Con un filtro puesto (p. ej. "Pendientes"), un alojamiento
                  // cuyo contenido ya está todo resuelto no pinta nada aquí:
                  // aparecía vacío y con "Sin tarifas", como si se hubieran
                  // perdido las 18 que se acababan de aprobar.
                  const quedaAlgo =
                    passesReviewFilter(accommodation.reviewStatus) ||
                    visibles.length > 0 ||
                    accommodation.adjustments.some((x) => passesReviewFilter(x.reviewStatus)) ||
                    accommodation.policies.some((x) => passesReviewFilter(x.reviewStatus)) ||
                    accommodation.blackoutDates.some((x) => passesReviewFilter(x.reviewStatus));
                  if (!quedaAlgo) return null;
                  return (
                  <details key={accommodation.id} className="staging-group hot-group" open={false}>
                    <summary className="hot-group__head">
                      <span className="hot-group__name">{accommodation.accommodationName}</span>
                      <span className="hot-group__sum">{resumen}</span>
                      <span
                        className={`hot-group__pill hot-group__pill--${String(
                          accommodation.reviewStatus,
                        ).toLowerCase()}`}
                      >
                        {reviewStatusLabels[String(accommodation.reviewStatus)] ??
                          String(accommodation.reviewStatus)}
                      </span>
                    </summary>

                    {visibles.length > 0 ? (
                      <p className={`hot-check${conAviso > 0 ? " hot-check--warn" : ""}`}>
                        {conAviso > 0 ? (
                          <>
                            <b>
                              {visibles.length - conAviso} de {visibles.length} tarifas cuadran
                            </b>{" "}
                            · {conAviso} no: están marcadas en la tabla. Púlsalas para ver por qué.
                          </>
                        ) : (
                          <>
                            <b>Las {visibles.length} tarifas cuadran.</b> El precio de cada una
                            aparece en su texto de origen y la tabla es coherente consigo misma.
                          </>
                        )}
                      </p>
                    ) : null}

                    {/* Una sola decisión: aprobar el hotel y todo lo suyo a la
                        vez. Antes eran dos gestos y olvidarse del segundo
                        tiraba el trabajo del primero. */}
                    {String(accommodation.reviewStatus) !== "APPROVED" ? (
                      <div className="hot-decide">
                        <span className="hot-decide__txt">
                          <b>¿Cuadra con el documento?</b> Aprobar da por buenas las{" "}
                          {accommodation.rates.length} tarifas, sus suplementos y sus condiciones
                          junto con el alojamiento. Nada se queda a medias.
                        </span>
                        <button
                          type="button"
                          className="btn-go"
                          disabled={bulkBusy}
                          onClick={() => void handleApproveWholeAccommodation(accommodation)}
                        >
                          {bulkBusy
                            ? "Aprobando…"
                            : `Aprobar ${accommodation.accommodationName} y sus ${accommodation.rates.length} tarifas`}
                        </button>
                      </div>
                    ) : null}

                    {matriz ? (
                      <div className="hot-group__mx">
                        <div className="hot-switch" role="group" aria-label="Cómo ver las tarifas">
                          <button
                            type="button"
                            className={vistaLista[accommodation.id] ? "" : "on"}
                            onClick={() =>
                              setVistaLista((v) => ({ ...v, [accommodation.id]: false }))
                            }
                          >
                            Como en el documento
                          </button>
                          <button
                            type="button"
                            className={vistaLista[accommodation.id] ? "on" : ""}
                            onClick={() =>
                              setVistaLista((v) => ({ ...v, [accommodation.id]: true }))
                            }
                          >
                            Como lista
                          </button>
                        </div>

                        {!vistaLista[accommodation.id] ? (
                          <>
                            <RateMatrix
                              matrix={matriz}
                              flags={avisos}
                              selectedId={matrixEditId}
                              onSelectRate={(rateId: string) =>
                                setMatrixEditId((actual) => (actual === rateId ? null : rateId))
                              }
                            />
                            <RateDetailDialog
                              rate={
                                (visibles as unknown as CandidateItem[]).find(
                                  (r) => String(r.id) === matrixEditId,
                                ) ?? null
                              }
                              flags={matrixEditId ? (avisos.get(matrixEditId) ?? []) : []}
                              onClose={() => setMatrixEditId(null)}
                              onEdit={() => {
                                setVistaLista((v) => ({ ...v, [accommodation.id]: true }));
                              }}
                              onApprove={(rateId) => {
                                setMatrixEditId(null);
                                void handleApproveWithParent(
                                  "accommodation-rates",
                                  "accommodations",
                                  accommodation.id,
                                  [rateId],
                                  "Tarifa aprobada",
                                );
                              }}
                              onReject={(rateId) => {
                                setMatrixEditId(null);
                                void handleBulkReview(
                                  "accommodation-rates",
                                  [rateId],
                                  "REJECTED",
                                  "Tarifa descartada",
                                );
                              }}
                            />
                          </>
                        ) : null}
                      </div>
                    ) : null}

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

                    {/* La lista solo cuando NO hay rejilla o cuando se pide
                        expresamente: enseñar las dos era repetir 18 filas. */}
                    {!matriz || vistaLista[accommodation.id] ? (
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
                      openId={matrixEditId}
                      itemLabel="tarifa(s)"
                      editorTitle="Editar tarifa"
                      fields={accommodationRateFields}
                      busy={bulkBusy}
                      onApprove={handleApproveWithParent}
                      onBulkReview={handleBulkReview}
                      onSaved={handleStagingSaved}
                    />

                    ) : null}

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
                  </details>
                  );
                })}

                {detail.stagingActivities.length > 0 ? (
                  <p className="acts-note">
                    <b>Actividades</b> — van aparte de los alojamientos: alquiler de campos,
                    partidos, clases. Se aprueban por su cuenta y no es obligatorio: lo que no
                    apruebes no pasa al catálogo, y puedes publicar solo los alojamientos.
                  </p>
                ) : null}

                {detail.stagingActivities.map((activity) => {
                  const quedaActividad =
                    passesReviewFilter(activity.reviewStatus) ||
                    activity.rates.some((x) => passesReviewFilter(x.reviewStatus)) ||
                    activity.policies.some((x) => passesReviewFilter(x.reviewStatus));
                  if (!quedaActividad) return null;
                  return (
                  <div key={activity.id} className="staging-group">
                    {activity.rates.length > 0 ? (
                      <p className="acts-sum">
                        {activity.rates.length} precio(s) ·{" "}
                        {activity.rates.every((r) => r.rawText)
                          ? "todos traen el texto del documento del que salieron"
                          : "alguno no trae texto de origen: compruébalo contra el PDF"}
                      </p>
                    ) : (
                      <p className="acts-sum acts-sum--warn">
                        Esta actividad no trae ningún precio. Si la apruebas entrará al catálogo
                        muda y saldrá como «a consultar» en las propuestas.
                      </p>
                    )}

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
                  );
                })}
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

              {/* Mientras se confirma, el panel de simulación repetía cifra por
                  cifra lo que ya dice la confirmación. Solo se enseña cuando se
                  simula por separado. */}
              {dryRunResult && !awaitingPublishConfirm ? (
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
                  {/* Titular: lo que entró y lo que no, en una línea. */}
                  <p className="pub-head">
                    <strong
                      className={
                        publishResult.accommodationRates + publishResult.activityRates > 0
                          ? "pub-head__in"
                          : "pub-head__none"
                      }
                    >
                      {publishResult.accommodationRates + publishResult.activityRates} tarifa(s) en
                      el catálogo
                    </strong>
                    {publishResult.skippedRates + publishResult.skippedActivityRates > 0 ? (
                      <span className="pub-head__out">
                        · {publishResult.skippedRates + publishResult.skippedActivityRates} fuera
                      </span>
                    ) : null}
                  </p>

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
                  </div>

                  {/* Los motivos, que es lo accionable. Antes solo había un total. */}
                  {publishResult.skipReasons?.length > 0 ? (
                    <>
                      <span className="ai-result__label">Por qué no entró el resto</span>
                      <ul className="pub-reasons">
                        {publishResult.skipReasons.map((reason) => (
                          <li key={reason.code}>
                            <span className="pub-reasons__n">{reason.count}</span>
                            <span>
                              {reason.message}
                              {reason.fix ? <em> {reason.fix}</em> : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="pub-again">
                        Arregla lo que puedas y vuelve a pulsar «Publicar aprobados»: se recalcula
                        entero, no duplica nada y lo que aprueben ahora entrará.
                      </p>
                    </>
                  ) : (
                    <p>Entró todo lo aprobado. No se quedó nada fuera.</p>
                  )}

                  {publishResult.warnings.length > 0 ? (
                    <>
                      <span className="ai-result__label">Otras advertencias</span>
                      <ul className="detail-list">
                        {publishResult.warnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    </>
                  ) : null}
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

              {unpublishItemConfirm ? (
                <div className="alert alert--warning confirm-box" role="alertdialog">
                  <p>
                    ¿Quitar del inventario <strong>{unpublishItemConfirm.label}</strong>? Solo se
                    elimina este registro; el resto y los candidatos staging se conservan (se puede
                    volver a publicar).
                  </p>
                  <div className="stack compact actions-row">
                    <button
                      type="button"
                      className="primary"
                      disabled={unpublishItemBusy}
                      onClick={() => void handleConfirmUnpublishItem()}
                    >
                      {unpublishItemBusy ? "Quitando..." : "Sí, quitar del inventario"}
                    </button>
                    <button type="button" disabled={unpublishItemBusy} onClick={handleCancelUnpublishItem}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}

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
                            <div className="published-item__actions">
                              <button
                                type="button"
                                className="link-action link-action--reject"
                                disabled={unpublishItemBusy}
                                onClick={() =>
                                  handleRequestUnpublishItem(
                                    "accommodation",
                                    accommodation.id,
                                    `${accommodation.accommodationName} (alojamiento y sus ${accommodation.rates.length} tarifa(s))`,
                                  )
                                }
                              >
                                Quitar alojamiento del inventario
                              </button>
                            </div>
                            <ul className="detail-list">
                              {accommodation.rates.map((rate) => (
                                <li key={rate.id}>
                                  {rate.year} · {rate.boardType ?? "—"} ·{" "}
                                  {rate.pvpAmount != null
                                    ? formatAmount(rate.pvpAmount, rate.currency)
                                    : "sin precio"}
                                  <button
                                    type="button"
                                    className="link-action link-action--reject published-item__rate-remove"
                                    disabled={unpublishItemBusy}
                                    onClick={() =>
                                      handleRequestUnpublishItem(
                                        "accommodation-rate",
                                        rate.id,
                                        `tarifa ${rate.year} de ${accommodation.accommodationName}`,
                                      )
                                    }
                                  >
                                    quitar
                                  </button>
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
                            <div className="published-item__actions">
                              <button
                                type="button"
                                className="link-action link-action--reject"
                                disabled={unpublishItemBusy}
                                onClick={() =>
                                  handleRequestUnpublishItem(
                                    "activity",
                                    activity.id,
                                    `${activity.activityName} (actividad y sus ${activity.rates.length} tarifa(s))`,
                                  )
                                }
                              >
                                Quitar actividad del inventario
                              </button>
                            </div>
                            <ul className="detail-list">
                              {activity.rates.map((rate) => (
                                <li key={rate.id}>
                                  {rate.year} · {rate.ageLabel ?? "—"} ·{" "}
                                  {rate.salePvpAmount != null
                                    ? formatAmount(rate.salePvpAmount, rate.currency)
                                    : "sin precio"}
                                  <button
                                    type="button"
                                    className="link-action link-action--reject published-item__rate-remove"
                                    disabled={unpublishItemBusy}
                                    onClick={() =>
                                      handleRequestUnpublishItem(
                                        "activity-rate",
                                        rate.id,
                                        `tarifa ${rate.year} de ${activity.activityName}`,
                                      )
                                    }
                                  >
                                    quitar
                                  </button>
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

              {aiResult.mode === "mock" ? (
                <div className="alert alert--warning" role="status">
                  Análisis en modo MOCK: no se usó IA real (falta configurar la clave del
                  proveedor, p. ej. <code>ANTHROPIC_API_KEY</code>). Los candidatos son de
                  ejemplo y no reflejan el contenido del documento. Configura la clave en el{" "}
                  <code>.env</code> y vuelve a analizar para extraer datos reales.
                </div>
              ) : null}

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
  );
}
