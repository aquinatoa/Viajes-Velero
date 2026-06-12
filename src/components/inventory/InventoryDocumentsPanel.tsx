import { useEffect, useState } from "react";
import type {
  AiDocumentAnalysisResult,
  CreateSourceDocumentInput,
  DocumentExtraction,
  InventoryDocumentDetail,
  InventoryTargetType,
  PublishApprovedResult,
  SourceDocumentSummary,
  StagingEntityKey,
  StagingReviewStatus,
} from "../../domain/documentImportTypes";
import {
  analyzeInventoryDocumentApi,
  analyzeInventoryDocumentWithAiApi,
  approveInventoryDocumentApi,
  createInventoryDocumentApi,
  createInventoryDocumentStagingApi,
  getInventoryDocumentApi,
  listInventoryDocumentsApi,
  patchInventoryStagingApi,
  publishApprovedInventoryDocumentApi,
  publishInventoryDocumentApi,
  rejectInventoryDocumentApi,
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

type DocumentActionKey = "analyze" | "approve" | "reject" | "publish";

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

/**
 * Extrae el primer importe del texto de origen como respaldo de visualización
 * (p. ej. "3 noches o más 35,0 €" → 35). Es de solo lectura: no modifica datos.
 * Exige un símbolo de moneda o un decimal para evitar confundir números como
 * "3 noches" con un precio.
 */
function extractAmountFromText(text?: string | null): number | null {
  if (!text) {
    return null;
  }
  const match =
    text.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:€|EUR)/i) ??
    text.match(/(\d+[.,]\d{1,2})/);
  if (!match) {
    return null;
  }
  const normalized = match[1].replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

interface DetectedPrice {
  label: string;
  amount: number;
}

interface RatePriceSummaryProps {
  prices: (DetectedPrice | null)[];
  currency?: string | null;
  rawText?: string | null;
}

/**
 * Resumen de solo lectura de los precios de una tarifa staging. Muestra cada
 * precio tipado que exista (PVP, neto, coste) y la moneda. Si no hay ningún
 * precio tipado pero el texto de origen contiene un importe, lo muestra como
 * "Precio detectado" sin asignarle un tipo.
 */
function RatePriceSummary(props: RatePriceSummaryProps) {
  const prices = props.prices.filter((price): price is DetectedPrice => price !== null);
  const currencyCode = (props.currency ?? "EUR").trim().toUpperCase() || "EUR";

  if (prices.length === 0) {
    const detected = extractAmountFromText(props.rawText);
    return (
      <div className="rate-prices">
        {detected != null ? (
          <span className="rate-price rate-price--detected">
            Precio detectado: <strong>{formatAmount(detected, currencyCode)}</strong>
          </span>
        ) : (
          <span className="rate-price rate-price--empty">Sin precio detectado</span>
        )}
      </div>
    );
  }

  return (
    <div className="rate-prices">
      {prices.map((price) => (
        <span className="rate-price" key={price.label}>
          {price.label}: <strong>{formatAmount(price.amount, currencyCode)}</strong>
        </span>
      ))}
      <span className="rate-price rate-price--currency">Moneda: {currencyCode}</span>
    </div>
  );
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

  return (
    <div className="staging-card">
      <div className="staging-card__head">
        <strong>{props.title}</strong>
        <span className="staging-card__status">
          {stagingReviewStatusLabels[status] ?? status}
        </span>
      </div>

      {props.summary ? <div className="staging-card__summary">{props.summary}</div> : null}

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
    </div>
  );
}

export function InventoryDocumentsPanel() {
  const [documents, setDocuments] = useState<SourceDocumentSummary[]>([]);
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
    setErrorMessage(null);
    setFeedbackMessage(null);
    setDetailLoading(true);
    try {
      await refreshDetail(documentId);
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
    await refreshDetail(selectedDocumentId);
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
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "No se pudo publicar el documento al inventario operativo."),
      );
    } finally {
      setPublishing(false);
    }
  }

  async function handleDocumentAction(action: DocumentActionKey) {
    if (!selectedDocumentId) {
      return;
    }

    setErrorMessage(null);
    setFeedbackMessage(null);
    setActionInProgress(action);

    try {
      if (action === "analyze") {
        await analyzeInventoryDocumentApi(selectedDocumentId);
        setFeedbackMessage("Análisis ejecutado. El documento quedó pendiente de revisión.");
      } else if (action === "approve") {
        await approveInventoryDocumentApi(selectedDocumentId);
        setFeedbackMessage("Documento aprobado.");
      } else if (action === "reject") {
        await rejectInventoryDocumentApi(selectedDocumentId);
        setFeedbackMessage("Documento rechazado.");
      } else if (action === "publish") {
        await publishInventoryDocumentApi(selectedDocumentId);
        setFeedbackMessage("Documento publicado.");
      }

      await refreshDetail(selectedDocumentId);
      await loadDocuments();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo completar la acción sobre el documento."));
    } finally {
      setActionInProgress(null);
    }
  }

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
          <p>{loading ? "Cargando documentos..." : `${documents.length} documento(s)`}</p>
        </div>
        <button type="button" onClick={() => void loadDocuments()}>
          Actualizar
        </button>
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
              <th>Extracción</th>
              <th>Creado</th>
              <th>Acciones</th>
              <th>Archivo fuente</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => {
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

            {!loading && documents.length === 0 && (
              <tr>
                <td colSpan={9}>Todavía no hay documentos registrados.</td>
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
                    {extractionStatusLabels[detail.extractionStatus] ??
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
                  disabled={actionInProgress !== null || aiAnalyzing || stagingCreating}
                  onClick={() => void handleCreateStaging()}
                >
                  {stagingCreating ? "Creando candidatos..." : "Crear candidatos revisables"}
                </button>
                <button
                  type="button"
                  disabled={actionInProgress !== null}
                  onClick={() => void handleDocumentAction("approve")}
                >
                  {actionInProgress === "approve" ? "Aprobando..." : "Aprobar"}
                </button>
                <button
                  type="button"
                  disabled={actionInProgress !== null}
                  onClick={() => void handleDocumentAction("reject")}
                >
                  {actionInProgress === "reject" ? "Rechazando..." : "Rechazar"}
                </button>
                <button
                  type="button"
                  disabled={actionInProgress !== null}
                  onClick={() => void handleDocumentAction("publish")}
                >
                  {actionInProgress === "publish" ? "Publicando..." : "Publicar"}
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

              {detail.stagingAccommodations.length === 0 &&
              detail.stagingActivities.length === 0 ? (
                <p>
                  Todavía no hay candidatos. Usa "Crear candidatos revisables" para generarlos a
                  partir del análisis.
                </p>
              ) : (
                <div className="staging-review">
                  {detail.stagingAccommodations.map((accommodation) => (
                    <div key={accommodation.id} className="staging-group">
                      <StagingEditableCard
                        entity="accommodations"
                        id={accommodation.id}
                        title={`Alojamiento: ${accommodation.accommodationName}`}
                        fields={accommodationFields}
                        values={accommodation}
                        reviewStatus={String(accommodation.reviewStatus)}
                        onSaved={handleStagingSaved}
                      />

                      {accommodation.rates.map((rate) => (
                        <StagingEditableCard
                          key={rate.id}
                          entity="accommodation-rates"
                          id={rate.id}
                          title="Tarifa"
                          fields={accommodationRateFields}
                          values={rate}
                          reviewStatus={String(rate.reviewStatus)}
                          rawText={rate.rawText}
                          summary={
                            <RatePriceSummary
                              prices={[
                                rate.pvpAmount != null
                                  ? { label: "Precio PVP", amount: rate.pvpAmount }
                                  : null,
                                rate.netAmount != null
                                  ? { label: "Precio neto", amount: rate.netAmount }
                                  : null,
                                rate.costAmount != null
                                  ? { label: "Precio coste", amount: rate.costAmount }
                                  : null,
                              ]}
                              currency={rate.currency}
                              rawText={rate.rawText}
                            />
                          }
                          onSaved={handleStagingSaved}
                        />
                      ))}

                      {accommodation.adjustments.map((adjustment) => (
                        <StagingEditableCard
                          key={adjustment.id}
                          entity="accommodation-adjustments"
                          id={adjustment.id}
                          title="Suplemento / ajuste"
                          fields={accommodationAdjustmentFields}
                          values={adjustment}
                          reviewStatus={String(adjustment.reviewStatus)}
                          rawText={adjustment.rawText}
                          onSaved={handleStagingSaved}
                        />
                      ))}

                      {accommodation.policies.map((policy) => (
                        <StagingEditableCard
                          key={policy.id}
                          entity="accommodation-policies"
                          id={policy.id}
                          title="Política"
                          fields={accommodationPolicyFields}
                          values={policy}
                          reviewStatus={String(policy.reviewStatus)}
                          structuredJson={policy.structuredJson}
                          onSaved={handleStagingSaved}
                        />
                      ))}

                      {accommodation.blackoutDates.map((blackout) => (
                        <StagingEditableCard
                          key={blackout.id}
                          entity="accommodation-blackout-dates"
                          id={blackout.id}
                          title="Fecha especial / blackout"
                          fields={accommodationBlackoutFields}
                          values={blackout}
                          reviewStatus={String(blackout.reviewStatus)}
                          rawText={blackout.rawText}
                          onSaved={handleStagingSaved}
                        />
                      ))}
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
                        onSaved={handleStagingSaved}
                      />

                      {activity.rates.map((rate) => (
                        <StagingEditableCard
                          key={rate.id}
                          entity="activity-rates"
                          id={rate.id}
                          title="Tarifa de actividad"
                          fields={activityRateFields}
                          values={rate}
                          reviewStatus={String(rate.reviewStatus)}
                          rawText={rate.rawText}
                          summary={
                            <RatePriceSummary
                              prices={[
                                rate.salePvpAmount != null
                                  ? { label: "Precio PVP", amount: rate.salePvpAmount }
                                  : null,
                                rate.costNetAmount != null
                                  ? { label: "Coste neto", amount: rate.costNetAmount }
                                  : null,
                              ]}
                              currency={rate.currency}
                              rawText={rate.rawText}
                            />
                          }
                          onSaved={handleStagingSaved}
                        />
                      ))}

                      {activity.policies.map((policy) => (
                        <StagingEditableCard
                          key={policy.id}
                          entity="activity-policies"
                          id={policy.id}
                          title="Política de actividad"
                          fields={activityPolicyFields}
                          values={policy}
                          reviewStatus={String(policy.reviewStatus)}
                          structuredJson={policy.structuredJson}
                          onSaved={handleStagingSaved}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}

              <div className="section-card__header compact">
                <div>
                  <h4>Publicación al inventario operativo</h4>
                  <p>Solo se publican candidatos aprobados. Operación idempotente.</p>
                </div>
                <button
                  type="button"
                  className="primary"
                  disabled={
                    publishing ||
                    !(
                      detail.stagingAccommodations.some(
                        (accommodation) => String(accommodation.reviewStatus) === "APPROVED",
                      ) ||
                      detail.stagingActivities.some(
                        (activity) => String(activity.reviewStatus) === "APPROVED",
                      )
                    )
                  }
                  onClick={() => void handlePublishApproved()}
                >
                  {publishing ? "Publicando..." : "Publicar aprobados al inventario"}
                </button>
              </div>

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

              {aiResult ? (
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

              {detail.importIssues.some((issue) => issue.issueType === "ANALYSIS_PLACEHOLDER") ? (
                <div className="alert alert--warning" role="status">
                  Este documento tiene incidencias antiguas de tipo marcador de posición
                  (ANALYSIS_PLACEHOLDER) de versiones anteriores. Son históricas y no afectan al
                  análisis actual; se conservan para trazabilidad.
                </div>
              ) : null}

              <div className="section-card__header compact">
                <div>
                  <h4>Incidencias de importación</h4>
                  <p>{detail.importIssues.length} incidencia(s)</p>
                </div>
              </div>

              {detail.importIssues.length > 0 ? (
                <ul className="detail-list">
                  {detail.importIssues.map((issue) => (
                    <li key={issue.id}>
                      <strong>{issueSeverityLabels[issue.severity] ?? issue.severity}</strong>
                      {" · "}
                      <span>{issue.issueType}</span>
                      <br />
                      <span>{issue.message}</span>
                      {issue.resolved ? <em> (resuelta)</em> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No hay incidencias registradas.</p>
              )}

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
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
