export type InventoryTargetType = "ACCOMMODATION" | "ACTIVITY" | "MIXED" | "UNKNOWN";

export type SourceDocumentStatus =
  | "UPLOADED"
  | "ANALYZING"
  | "PENDING_REVIEW"
  | "PARTIALLY_REVIEWED"
  | "APPROVED"
  | "REJECTED"
  | "PUBLISHED";

export type ExtractionStatus =
  | "NOT_STARTED"
  | "EXTRACTING"
  | "EXTRACTED"
  | "PARTIALLY_EXTRACTED"
  | "FAILED"
  | "NEEDS_OCR";

export type ExtractionMethod = "TEXT" | "TABLE" | "OCR" | "AI" | "MANUAL";

export type ReviewStatus = "PENDING" | "CONFIRMED" | "CORRECTED" | "REJECTED";

export type ImportIssueSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export type AccommodationRateUnit =
  | "PER_PAX_NIGHT"
  | "PER_PAX_DAY"
  | "PER_ROOM_NIGHT"
  | "PER_UNIT_NIGHT"
  | "PER_BUNGALOW_NIGHT"
  | "PER_APARTMENT_NIGHT"
  | "PER_STAY"
  | "PER_SERVICE"
  | "UNKNOWN";

export type ActivityRateUnit =
  | "PER_PAX"
  | "PER_GROUP"
  | "PER_SERVICE"
  | "PER_HOUR"
  | "PER_DAY"
  | "UNKNOWN";

export type AdjustmentType =
  | "SUPPLEMENT"
  | "DISCOUNT"
  | "FREE_POLICY"
  | "TAX"
  | "DEPOSIT"
  | "UNKNOWN";

export type AmountType = "FIXED" | "PERCENT" | "TEXT_ONLY";

export type AppliesPer =
  | "PAX"
  | "NIGHT"
  | "ROOM"
  | "UNIT"
  | "STAY"
  | "BOOKING"
  | "UNKNOWN";

export type AccommodationPolicyType =
  | "GRATUITY"
  | "PAYMENT"
  | "CANCELLATION"
  | "DEPOSIT"
  | "ROOMING_LIST"
  | "MIN_STAY"
  | "MIN_GROUP_SIZE"
  | "TAX"
  | "CHECK_IN_OUT"
  | "MEAL_CONDITIONS"
  | "SPECIAL_NOTES"
  | "UNKNOWN";

export type ActivityPolicyType =
  | "CANCELLATION"
  | "PAYMENT"
  | "MIN_GROUP_SIZE"
  | "MAX_GROUP_SIZE"
  | "AGE_RESTRICTION"
  | "TRANSPORT_REQUIRED"
  | "WEATHER_DEPENDENT"
  | "LANGUAGE"
  | "SPECIAL_NOTES"
  | "UNKNOWN";

export type AvailabilityStatus = "BLOCKED" | "ON_REQUEST" | "SPECIAL_RATE" | "UNKNOWN";

/**
 * Qué precios trae el documento. Lo declara quien lo sube: la IA reparte los
 * importes entre coste y venta según lo que intuye del texto, y equivocarse
 * cuesta dinero (una tarifa de venta tomada por coste sale con margen encima).
 */
export type RateKind = "PURCHASE" | "SALE" | "UNKNOWN";

/** Canal de venta al que pertenece una tarifa de venta. */
export type ClientSegment = "GENERIC" | "SWISS_TTOO";

export const rateKindLabels: Record<RateKind, string> = {
  PURCHASE: "De compra",
  SALE: "De venta",
  UNKNOWN: "Sin declarar",
};

export const clientSegmentLabels: Record<ClientSegment, string> = {
  GENERIC: "Cualquier otro cliente",
  SWISS_TTOO: "Turoperador suizo",
};

/** Margen por defecto del sistema cuando el documento es de compra. */
export const DEFAULT_MARGIN_PERCENT = 8;

export interface CreateSourceDocumentInput {
  targetType: InventoryTargetType;
  controlName: string;
  controlLocation?: string;
  controlYear?: number | null;
  controlCategory?: string;
  controlNotes?: string;
  rateKind?: RateKind;
  marginPercent?: number | null;
  clientSegment?: ClientSegment | null;
}

export interface SourceDocumentSummary {
  id: string;
  targetType: InventoryTargetType;
  controlName: string;
  controlLocation?: string | null;
  controlYear?: number | null;
  controlCategory?: string | null;
  rateKind?: RateKind;
  marginPercent?: number | null;
  clientSegment?: ClientSegment | null;
  status: SourceDocumentStatus;
  extractionStatus: ExtractionStatus;
  requiresOcr: boolean;
  aiConfidence?: number | null;
  createdAt: string;
  updatedAt: string;
  /** Candidatos staging totales del documento. */
  candidateCount?: number;
  /** Candidatos pendientes o que requieren cambios (por revisar). */
  pendingReviewCount?: number;
  /** Candidatos aprobados. */
  approvedCount?: number;
}

export interface ImportIssue {
  id: string;
  severity: ImportIssueSeverity;
  issueType: string;
  message: string;
  fieldName?: string | null;
  rawValue?: string | null;
  pageNumber?: number | null;
  resolved: boolean;
}

export interface DocumentExtraction {
  id: string;
  extractionMethod: ExtractionMethod;
  pageNumber?: number | null;
  rawText?: string | null;
  rawJson?: unknown;
  confidenceScore?: number | null;
}

export interface StagingAccommodationRate {
  id: string;
  seasonName?: string | null;
  year?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  boardType?: string | null;
  unitName?: string | null;
  unitType?: string | null;
  rateUnit?: AccommodationRateUnit | null;
  occupancyLabel?: string | null;
  minNights?: number | null;
  minPax?: number | null;
  minUnits?: number | null;
  currency: string;
  taxIncluded?: boolean | null;
  pvpAmount?: number | null;
  netAmount?: number | null;
  costAmount?: number | null;
  commissionPercent?: number | null;
  rawText?: string | null;
  sourcePage?: number | null;
  confidenceScore?: number | null;
  requiresReview: boolean;
  reviewStatus: ReviewStatus;
}

export interface StagingAccommodationAdjustment {
  id: string;
  adjustmentType: AdjustmentType;
  concept: string;
  amountType?: AmountType | null;
  amount?: number | null;
  appliesPer?: AppliesPer | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  conditionText?: string | null;
  rawText?: string | null;
  sourcePage?: number | null;
  confidenceScore?: number | null;
  requiresReview: boolean;
  reviewStatus: ReviewStatus;
}

export interface StagingAccommodationPolicy {
  id: string;
  policyType: AccommodationPolicyType;
  policyText: string;
  structuredJson?: unknown;
  sourcePage?: number | null;
  confidenceScore?: number | null;
  requiresReview: boolean;
  reviewStatus: ReviewStatus;
}

export interface StagingAccommodationBlackoutDate {
  id: string;
  dateFrom?: string | null;
  dateTo?: string | null;
  availabilityStatus: AvailabilityStatus;
  reason?: string | null;
  rawText?: string | null;
  sourcePage?: number | null;
  confidenceScore?: number | null;
  requiresReview: boolean;
  reviewStatus: ReviewStatus;
}

export interface StagingAccommodation {
  id: string;
  accommodationName: string;
  providerName?: string | null;
  locality?: string | null;
  province?: string | null;
  country?: string | null;
  categoryType?: string | null;
  accommodationType?: string | null;
  confidenceScore?: number | null;
  reviewStatus: ReviewStatus;
  rates: StagingAccommodationRate[];
  adjustments: StagingAccommodationAdjustment[];
  policies: StagingAccommodationPolicy[];
  blackoutDates: StagingAccommodationBlackoutDate[];
}

export interface StagingActivityRate {
  id: string;
  year?: number | null;
  seasonName?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  ageLabel?: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  rateUnit?: ActivityRateUnit | null;
  currency: string;
  salePvpAmount?: number | null;
  costNetAmount?: number | null;
  commissionPercent?: number | null;
  minPax?: number | null;
  maxPax?: number | null;
  durationText?: string | null;
  rawText?: string | null;
  sourcePage?: number | null;
  confidenceScore?: number | null;
  requiresReview: boolean;
  reviewStatus: ReviewStatus;
}

export interface StagingActivityPolicy {
  id: string;
  policyType: ActivityPolicyType;
  policyText: string;
  structuredJson?: unknown;
  sourcePage?: number | null;
  confidenceScore?: number | null;
  requiresReview: boolean;
  reviewStatus: ReviewStatus;
}

export interface StagingActivity {
  id: string;
  activityName: string;
  supplierName?: string | null;
  locationMain?: string | null;
  province?: string | null;
  country?: string | null;
  activityType?: string | null;
  durationText?: string | null;
  descriptionText?: string | null;
  confidenceScore?: number | null;
  reviewStatus: ReviewStatus;
  rates: StagingActivityRate[];
  policies: StagingActivityPolicy[];
}

export interface InventoryDocumentDetail extends SourceDocumentSummary {
  originalFileName?: string | null;
  fileMimeType?: string | null;
  fileSizeBytes?: number | null;
  fileHash?: string | null;
  storedFilePath?: string | null;
  controlNotes?: string | null;
  processedAt?: string | null;
  extractions: DocumentExtraction[];
  importIssues: ImportIssue[];
  stagingAccommodations: StagingAccommodation[];
  stagingActivities: StagingActivity[];
}

// ----------------------------------------------------------------------------
// Contrato de salida del análisis IA (candidatos preliminares, NO definitivos).
// Los candidatos se devuelven para revisión humana; nunca se publican
// automáticamente al inventario operativo.
// ----------------------------------------------------------------------------

export type AiAnalysisMode = "mock" | "ai";

export interface AiDetectedAccommodation {
  accommodationName?: string | null;
  providerName?: string | null;
  locality?: string | null;
  province?: string | null;
  country?: string | null;
  categoryType?: string | null;
  accommodationType?: string | null;
}

export interface AiDetectedActivity {
  activityName: string;
  supplierName?: string | null;
  locationMain?: string | null;
  activityType?: string | null;
  durationText?: string | null;
  descriptionText?: string | null;
}

export interface AiCandidateRate {
  seasonName?: string | null;
  year?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  boardType?: string | null;
  /**
   * A qué alojamiento del documento pertenece esta tarifa. Un PDF de tarifas
   * suele traer varios establecimientos con su propia tabla; sin esta etiqueta
   * todas las tarifas acaban colgadas del primero.
   */
  accommodationName?: string | null;
  unitName?: string | null;
  rateUnit?: string | null;
  occupancyLabel?: string | null;
  /** Qué va incluido además del alojamiento (campo artificial, natural...). */
  includedService?: string | null;
  minNights?: number | null;
  currency?: string | null;
  pvpAmount?: number | null;
  netAmount?: number | null;
  costAmount?: number | null;
  rawText?: string | null;
}

/**
 * Precio de una actividad. Va aparte de las tarifas de alojamiento porque su
 * forma es otra: una actividad se cobra por equipo, por hora o por persona, no
 * por régimen y ocupación. Sin esta estructura no había dónde poner el precio
 * de un alquiler de campo, y las actividades entraban al catálogo mudas.
 */
export interface AiCandidateActivityRate {
  /** Nombre exacto de la actividad de `detectedActivities` a la que pertenece. */
  activityName: string;
  /** Cómo se cobra: PER_GROUP, PER_HOUR, PER_PAX, PER_SERVICE, PER_DAY. */
  rateUnit?: string | null;
  year?: number | null;
  seasonName?: string | null;
  currency?: string | null;
  salePvpAmount?: number | null;
  costNetAmount?: number | null;
  durationText?: string | null;
  /** A quién aplica: categoría, día de la semana, edad… */
  ageLabel?: string | null;
  minPax?: number | null;
  maxPax?: number | null;
  rawText?: string | null;
}

export interface AiCandidateSupplement {
  /** Alojamiento al que pertenece el suplemento, si el documento lo separa. */
  accommodationName?: string | null;
  adjustmentType?: string | null;
  concept: string;
  amountType?: string | null;
  amount?: number | null;
  appliesPer?: string | null;
  conditionText?: string | null;
  rawText?: string | null;
}

export interface AiCandidatePolicy {
  policyType?: string | null;
  policyText: string;
  rawText?: string | null;
}

export interface AiCandidateBlackoutDate {
  dateFrom?: string | null;
  dateTo?: string | null;
  availabilityStatus?: string | null;
  reason?: string | null;
  rawText?: string | null;
}

export interface AiDocumentAnalysisResult {
  mode: AiAnalysisMode;
  documentSummary: string;
  /**
   * Compatibilidad: el primero de `detectedAccommodations`. Se mantiene para no
   * romper lo que ya lo leía; para trabajar, usa siempre la lista.
   */
  detectedAccommodation: AiDetectedAccommodation | null;
  /** Todos los alojamientos del documento. Un PDF de tarifas suele traer varios. */
  detectedAccommodations: AiDetectedAccommodation[];
  detectedActivities: AiDetectedActivity[];
  candidateRates: AiCandidateRate[];
  /** Precios de las actividades del documento. */
  candidateActivityRates: AiCandidateActivityRate[];
  candidateSupplements: AiCandidateSupplement[];
  candidatePolicies: AiCandidatePolicy[];
  candidateBlackoutDates: AiCandidateBlackoutDate[];
  warnings: string[];
  confidence: number;
  /** Consumo de la llamada, cuando el proveedor lo informa. */
  usage?: { inputTokens: number; outputTokens: number; model: string } | null;
  rawModelOutput?: string | null;
}

export interface CreateStagingResult {
  accommodations: number;
  rates: number;
  adjustments: number;
  policies: number;
  blackoutDates: number;
  activities: number;
  warnings: string[];
  /** Modo del análisis IA que originó estos candidatos ("mock" si no hay clave). */
  aiMode: AiAnalysisMode;
}

export type StagingEntityKey =
  | "accommodations"
  | "accommodation-rates"
  | "accommodation-adjustments"
  | "accommodation-policies"
  | "accommodation-blackout-dates"
  | "activities"
  | "activity-rates"
  | "activity-policies";

export type StagingReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_CHANGES";

/** Resultado de un cambio de estado de revisión en lote sobre candidatos staging. */
export interface BulkReviewResult {
  updated: number;
  notFound: number;
  /** Candidatos que no se pudieron cambiar (p. ej. aprobar una tarifa sin precio). */
  skipped: { id: string; reason: string }[];
}

export interface PublishApprovedResult {
  accommodations: number;
  accommodationRates: number;
  activities: number;
  activityRates: number;
  skippedAccommodations: number;
  skippedRates: number;
  skippedActivities: number;
  skippedActivityRates: number;
  /** Motivos agrupados de lo que no entró, del más frecuente al menos. */
  skipReasons: PublishSkipReason[];
  warnings: string[];
}

// ----------------------------------------------------------------------------
// Trazabilidad: registros del inventario operativo publicados desde un
// documento (consulta de solo lectura por sourceDocumentId).
// ----------------------------------------------------------------------------

export interface PublishedAccommodationRate {
  id: string;
  year: number;
  seasonName?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  boardType?: string | null;
  currency?: string | null;
  pvpAmount?: number | null;
  netSaleAmount?: number | null;
  netAzulmarinoAmount?: number | null;
  sourceStagingId?: string | null;
}

export interface PublishedAccommodation {
  id: string;
  accommodationName: string;
  locality: string;
  categoryType?: string | null;
  accommodationType?: string | null;
  sourceStagingId?: string | null;
  rates: PublishedAccommodationRate[];
}

export interface PublishedActivityRate {
  id: string;
  year: number;
  ageLabel?: string | null;
  currency?: string | null;
  salePvpAmount?: number | null;
  costNetAmount?: number | null;
  sourceStagingId?: string | null;
}

export interface PublishedActivity {
  id: string;
  activityName: string;
  supplierName?: string | null;
  locationMain?: string | null;
  sourceStagingId?: string | null;
  rates: PublishedActivityRate[];
}

export interface PublishedInventorySummary {
  accommodations: PublishedAccommodation[];
  activities: PublishedActivity[];
  accommodationCount: number;
  accommodationRateCount: number;
  activityCount: number;
  activityRateCount: number;
}

/**
 * Resultado de la simulación de publicación (dry-run). Refleja qué se
 * publicaría y qué se omitiría sin escribir nada en el inventario operativo.
 */
/**
 * Por qué se quedó algo fuera del catálogo, con cuántos casos y qué hacer.
 * Un "omitidos: 6" no es accionable; esto sí.
 */
export interface PublishSkipReason {
  code:
    | "ACCOMMODATION_NOT_APPROVED"
    | "RATE_NOT_APPROVED"
    | "MISSING_PRICE"
    | "MISSING_CURRENCY"
    | "MISSING_YEAR";
  count: number;
  /** Explicación en claro, con el número ya dentro. */
  message: string;
  /** Qué hacer para que entren. Null si no hay acción evidente. */
  fix: string | null;
}

export interface DryRunPublishResult {
  /** true si hay al menos un alojamiento o actividad aprobado. */
  hasPublishableCandidates: boolean;
  accommodationsToPublish: number;
  accommodationRatesToPublish: number;
  activitiesToPublish: number;
  activityRatesToPublish: number;
  /** Total de candidatos que se omitirían (suma de los "skipped"). */
  skipped: number;
  skippedAccommodations: number;
  skippedRates: number;
  skippedActivities: number;
  skippedActivityRates: number;
  /** Motivos agrupados de lo que no entraría, del más frecuente al menos. */
  skipReasons: PublishSkipReason[];
  warnings: string[];
  approvedCandidates: number;
  pendingCandidates: number;
  rejectedCandidates: number;
  needsChangesCandidates: number;
  /** true si publicar reemplazaría una publicación previa de este documento. */
  wouldReplaceExisting: boolean;
}

/**
 * Simulación de retirada de publicación (dry-run). Indica cuántos registros
 * operativos se eliminarían del inventario para este documento, sin borrar nada.
 */
export interface DryRunUnpublishResult {
  hasPublishedRecords: boolean;
  accommodationsToRemove: number;
  accommodationRatesToRemove: number;
  activitiesToRemove: number;
  activityRatesToRemove: number;
}

/** Resultado de retirar del inventario operativo lo publicado desde un documento. */
export interface UnpublishResult {
  accommodationsRemoved: number;
  accommodationRatesRemoved: number;
  activitiesRemoved: number;
  activityRatesRemoved: number;
}

// ----------------------------------------------------------------------------
// Borrado de un documento registrado (con sus candidatos staging). Bloqueado si
// el documento tiene registros publicados en el inventario operativo: primero
// hay que retirarlos.
// ----------------------------------------------------------------------------

export interface DryRunDeleteDocumentResult {
  stagingAccommodations: number;
  stagingActivities: number;
  stagingTotal: number;
  publishedAccommodations: number;
  publishedActivities: number;
  /** true si hay registros publicados: no se puede borrar hasta retirarlos. */
  blockedByPublished: boolean;
}

export interface DeleteDocumentResult {
  stagingAccommodationsRemoved: number;
  stagingActivitiesRemoved: number;
}

// ----------------------------------------------------------------------------
// Retirada granular: quitar del inventario operativo un registro publicado
// concreto (un alojamiento/actividad completo o una sola tarifa).
// ----------------------------------------------------------------------------

export type PublishedItemKind =
  | "accommodation"
  | "activity"
  | "accommodation-rate"
  | "activity-rate";

export interface UnpublishItemResult {
  kind: PublishedItemKind;
  removedAccommodations: number;
  removedAccommodationRates: number;
  removedActivities: number;
  removedActivityRates: number;
}

// ----------------------------------------------------------------------------
// Catálogo global del inventario operativo publicado (todos los documentos, e
// incluso filas heredadas de Excel sin documento). Solo lectura, con el origen
// documental resuelto para saber a qué hotel/actividad pertenece cada registro.
// ----------------------------------------------------------------------------

export interface CatalogRate {
  id: string;
  year: number;
  /** Régimen (alojamiento) o tramo de edad (actividad). */
  label?: string | null;
  period?: string | null;
  currency?: string | null;
  amount?: number | null;
}

export interface CatalogAccommodation {
  id: string;
  accommodationName: string;
  locality: string;
  categoryType?: string | null;
  sourceDocumentId?: string | null;
  sourceDocumentName?: string | null;
  rates: CatalogRate[];
}

export interface CatalogActivity {
  id: string;
  activityName: string;
  supplierName?: string | null;
  locationMain?: string | null;
  sourceDocumentId?: string | null;
  sourceDocumentName?: string | null;
  rates: CatalogRate[];
}

export interface PublishedInventoryCatalog {
  accommodations: CatalogAccommodation[];
  activities: CatalogActivity[];
  accommodationCount: number;
  activityCount: number;
  accommodationRateCount: number;
  activityRateCount: number;
}