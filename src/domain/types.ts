export type ClientType = "new" | "existing";

/**
 * Usuario activo que consume la pantalla inicial (HomeLanding).
 *
 * Hoy se deriva del usuario autenticado del backend (login propio). El día que
 * la app viva como widget dentro de Zoho CRM, este mismo objeto se rellenará
 * desde el SDK de Zoho (usuario conectado) sin tocar la pantalla: solo cambia
 * la FUENTE que lo construye. La auditoría de cada acción se asocia a este id.
 */
export interface CurrentUser {
  id: string;
  name: string;
  email?: string;
  role?: "admin" | "operativo" | "lectura";
}

export type RequestStatus =
  | "RECEIVED"
  | "PARSED_WITH_GAPS"
  | "READY_FOR_SEARCH"
  | "PROPOSAL_IN_PROGRESS"
  | "APPROVED"
  | "CRM_READY";

export type ProposalStatus = "DRAFT" | "READY_FOR_APPROVAL" | "APPROVED";

export type RecommendationAction = "create_new" | "update_existing" | "ask_user";

export interface Client {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  isReturningCustomer: boolean;
  crmContactId?: string;
  crmAccountId?: string;
}

export interface MissingField {
  field: string;
  label: string;
  reason: string;
  severity: "critical" | "warning";
}

export interface WarningItem {
  code: string;
  message: string;
}

export interface NormalizedRequestDraft {
  language: string;
  destinationText: string;
  destinationCountry: string;
  dateFrom: string;
  dateTo: string;
  participants: number | null;
  teachers: number | null;
  ageRangeText: string;
  averageAgeText: string;
  groupType: string;
  regimeRequested: string;
  categoryRequested: string;
  requirementsText: string;
}

export interface TripRequest {
  id: string;
  clientId: string;
  opportunityName?: string;
  originalMessage: string;
  language: string;
  destinationText: string;
  destinationCountry: string;
  dateFrom: string;
  dateTo: string;
  participants: number | null;
  teachers: number | null;
  ageRangeText: string;
  averageAgeText: string;
  groupType: string;
  regimeRequested: string;
  categoryRequested: string;
  requirementsText: string;
  requestStatus: RequestStatus;
  missingFields: MissingField[];
  warnings: WarningItem[];
}

export interface ParseTripRequestInput {
  clientType: ClientType;
  email: string;
  firstName: string;
  lastName: string;
  opportunityName?: string;
  rawTripRequestText: string;
}

export interface ParseTripRequestResult {
  normalized: NormalizedRequestDraft;
  missingFields: MissingField[];
  warnings: WarningItem[];
  requestStatus: RequestStatus;
}

export interface ValidationIssue {
  field: string;
  label: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidateTripRequestInput {
  clientType: ClientType;
  email: string;
  firstName: string;
  lastName: string;
  normalized: NormalizedRequestDraft;
}

export interface ValidateTripRequestResult {
  isValid: boolean;
  issues: ValidationIssue[];
  criticalMissingFields: string[];
}

export interface SearchFilters {
  destinationText: string;
  destinationCountry?: string;
  boardType?: string;
  categoryRequested?: string;
  dateFrom?: string;
  dateTo?: string;
  participants?: number | null;
  teachers?: number | null;
  ageRangeText?: string;
  averageAgeText?: string;
}

export interface Accommodation {
  id: string;
  accommodationName: string;
  locality: string;
  categoryType: string;
  accommodationType: string;
  observations: string;
  conditionsText: string;
  freePolicy: string;
  sourceFile: string;
  /** Trazabilidad: documento del que se publicó este alojamiento (si aplica). */
  sourceDocumentId?: string;
  sourceDocumentName?: string;
}

export interface AccommodationRate {
  id: string;
  accommodationId: string;
  rateSource: string;
  year: number;
  seasonName: string;
  dateFrom: string;
  dateTo: string;
  minNights: number;
  boardType: string;
  tariffUnit: string;
  pvpAmount: number;
  netSaleAmount: number;
  netAzulmarinoAmount: number;
  sourceFile: string;
  sourceSheet: string;
}

export interface Activity {
  id: string;
  activityName: string;
  supplierName: string;
  locationMain: string;
  durationText: string;
  descriptionText: string;
  sourceFile: string;
  /** Trazabilidad: documento del que se publicó esta actividad (si aplica). */
  sourceDocumentId?: string;
  sourceDocumentName?: string;
}

export interface ActivityRate {
  id: string;
  activityId: string;
  year: number;
  ageLabel: string;
  ageMin: number;
  ageMax: number;
  salePvpAmount: number;
  costNetAmount: number;
  commissionPercent: number;
  durationText: string;
  sourceFile: string;
  sourceSheet: string;
}

export interface AccommodationSearchMatch {
  accommodation: Accommodation;
  rate: AccommodationRate;
  score: number;
  matchReasons: string[];
}

export interface ActivitySearchMatch {
  activity: Activity;
  rate: ActivityRate;
  score: number;
  matchReasons: string[];
}

export interface SearchAccommodationsResult {
  filters: SearchFilters;
  matches: AccommodationSearchMatch[];
  warnings: WarningItem[];
  missingFields: MissingField[];
  status: "ok" | "no_matches" | "insufficient_filters";
}

export interface SearchActivitiesResult {
  filters: SearchFilters;
  matches: ActivitySearchMatch[];
  warnings: WarningItem[];
  missingFields: MissingField[];
  status: "ok" | "no_matches" | "insufficient_filters";
}

export interface ProposalBuilderState {
  selectedAccommodationIds: string[];
  activitiesByOption: Record<number, string[]>;
}

export interface ProposalAccommodationOption {
  id: string;
  optionNumber: number;
  accommodationId: string;
  accommodationNameSnapshot: string;
  boardType: string;
  dateFrom: string;
  dateTo: string;
  nights: number;
  participants: number;
  teachers: number;
  totalPvpText: string;
  priceBreakdownText: string;
  conditionsText: string;
  observationsText: string;
  isSelected: boolean;
}

export interface ProposalActivityOption {
  id: string;
  optionNumber: number;
  activityId: string;
  displayOrder: number;
  activityNameSnapshot: string;
  providerSnapshot: string;
  durationSnapshot: string;
  pvpSnapshot: string;
  descriptionSnapshot: string;
  isSelected: boolean;
}

export interface TripProposal {
  id: string;
  tripRequestId: string;
  versionNumber: number;
  proposalStatus: ProposalStatus;
  approvedOptionNumber?: number;
  crmPayloadJson?: CrmPayload;
  summaryText: string;
  accommodationOptions: ProposalAccommodationOption[];
  activityOptions: ProposalActivityOption[];
}

export interface BuildProposalInput {
  tripRequestId: string;
  normalized: NormalizedRequestDraft;
  accommodationMatches: AccommodationSearchMatch[];
  activityMatches: ActivitySearchMatch[];
  builderState: ProposalBuilderState;
}

export interface ApproveProposalInput {
  proposal: TripProposal;
  approvedOptionNumber: number;
}

export interface CrmSyncLog {
  id: string;
  entityType: string;
  actionType: string;
  requestPayload: Record<string, unknown>;
  responsePayload?: Record<string, unknown>;
  syncStatus: "PENDING" | "SUCCESS" | "ERROR";
  errorMessage?: string;
}

export interface CandidateOpportunity {
  id: string;
  name: string;
  reason: string;
  score: number;
  status: "open" | "won" | "lost";
}

export interface FindCandidateOpportunitiesResult {
  recommendation: RecommendationAction;
  opportunities: CandidateOpportunity[];
  rationale: string;
}

export interface CrmPayload {
  contact: Record<string, unknown>;
  account: Record<string, unknown>;
  opportunity: Record<string, unknown>;
  approved_option: Record<string, unknown> | null;
  activities: Record<string, unknown>[];
}

export interface CrmOpportunityOptionRecord {
  optionNumber: number;
  accommodationName: string;
  totalPvpText: string;
  boardType: string;
}

export interface CrmOpportunityRecord {
  id: string;
  clientEmail: string;
  clientName: string;
  opportunityName: string;
  destination: string;
  status: "draft" | "sent" | "approved";
  proposalId?: string;
  approvedOptionNumber?: number;
  proposalOptions: CrmOpportunityOptionRecord[];
  payload: Record<string, unknown>;
}

export interface PrepareCrmPayloadInput {
  client: Client;
  request: NormalizedRequestDraft;
  proposal: TripProposal;
  opportunityRecommendation?: FindCandidateOpportunitiesResult;
}
