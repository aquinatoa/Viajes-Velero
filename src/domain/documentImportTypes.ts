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

export interface CreateSourceDocumentInput {
  targetType: InventoryTargetType;
  controlName: string;
  controlLocation?: string;
  controlYear?: number | null;
  controlCategory?: string;
  controlNotes?: string;
}

export interface SourceDocumentSummary {
  id: string;
  targetType: InventoryTargetType;
  controlName: string;
  controlLocation?: string | null;
  controlYear?: number | null;
  controlCategory?: string | null;
  status: SourceDocumentStatus;
  extractionStatus: ExtractionStatus;
  requiresOcr: boolean;
  aiConfidence?: number | null;
  createdAt: string;
  updatedAt: string;
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

export type AiAnalysisMode = "mock" | "live";

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
  unitName?: string | null;
  rateUnit?: string | null;
  occupancyLabel?: string | null;
  minNights?: number | null;
  currency?: string | null;
  pvpAmount?: number | null;
  netAmount?: number | null;
  rawText?: string | null;
}

export interface AiCandidateSupplement {
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
  detectedAccommodation: AiDetectedAccommodation | null;
  detectedActivities: AiDetectedActivity[];
  candidateRates: AiCandidateRate[];
  candidateSupplements: AiCandidateSupplement[];
  candidatePolicies: AiCandidatePolicy[];
  candidateBlackoutDates: AiCandidateBlackoutDate[];
  warnings: string[];
  confidence: number;
  rawModelOutput?: string | null;
}