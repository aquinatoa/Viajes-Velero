import type {
  AiDocumentAnalysisResult,
  CreateSourceDocumentInput,
  BulkReviewResult,
  CreateStagingResult,
  DeleteDocumentResult,
  DryRunDeleteDocumentResult,
  DryRunPublishResult,
  DryRunUnpublishResult,
  InventoryDocumentDetail,
  PublishApprovedResult,
  PublishedInventoryCatalog,
  PublishedInventorySummary,
  PublishedItemKind,
  SourceDocumentSummary,
  StagingEntityKey,
  UnpublishItemResult,
  UnpublishResult,
} from "../domain/documentImportTypes";
import type { Client, SearchFilters, TripProposal, TripRequest } from "../domain/types";

const API_BASE_URL = "http://localhost:8787";

export class ApiAuthError extends Error {
  code?: string;
  authUrl?: string;

  constructor(message: string, code?: string, authUrl?: string) {
    super(message);
    this.name = "ApiAuthError";
    this.code = code;
    this.authUrl = authUrl;
  }
}

// ── Token de sesión ───────────────────────────────────────────────────────────
const TOKEN_KEY = "velero_auth_token";
let authToken: string | null =
  typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAuthToken(): string | null {
  return authToken;
}

function authHeaders(base: Record<string, string> = {}): Record<string, string> {
  return authToken ? { ...base, Authorization: `Bearer ${authToken}` } : base;
}

async function parseErrorResponse(response: Response, fallbackError: string) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    code?: string;
    authUrl?: string;
  } | null;

  // Sesión inválida/expirada: limpiar token y avisar a la app para volver al login.
  if (response.status === 401) {
    setAuthToken(null);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("velero:unauthenticated"));
    }
    throw new ApiAuthError(payload?.error ?? "Sesión expirada.", "unauthenticated");
  }

  if (payload?.code === "zoho_reauth_required") {
    throw new ApiAuthError(payload.error ?? fallbackError, payload.code, payload.authUrl);
  }

  throw new Error(payload?.error ?? fallbackError);
}

async function getJson<T>(path: string, fallbackError: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });

  if (!response.ok) {
    await parseErrorResponse(response, fallbackError);
  }

  return response.json() as Promise<T>;
}

async function postJson<T>(
  path: string,
  payload: unknown,
  fallbackError: string,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await parseErrorResponse(response, fallbackError);
  }

  return response.json() as Promise<T>;
}

async function postFormData<T>(
  path: string,
  payload: FormData,
  fallbackError: string,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders(),
    body: payload,
  });

  if (!response.ok) {
    await parseErrorResponse(response, fallbackError);
  }

  return response.json() as Promise<T>;
}

async function patchJson<T>(
  path: string,
  payload: unknown,
  fallbackError: string,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await parseErrorResponse(response, fallbackError);
  }

  return response.json() as Promise<T>;
}

async function deleteJson<T>(path: string, fallbackError: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  if (!response.ok) {
    await parseErrorResponse(response, fallbackError);
  }

  return response.json() as Promise<T>;
}

// ── Auth API ──────────────────────────────────────────────────────────────────

export type BackendRole = "ADMIN" | "DEPT_ADMIN" | "QUOTER" | "USER";
export type BackendDepartment = "GROUPS" | "SPORTS";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: BackendRole;
  department: BackendDepartment | null;
}

export interface ManagedUser extends AuthUser {
  isActive: boolean;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  userEmail: string | null;
  role: string | null;
  action: string;
  entity: string | null;
  detail: string | null;
  createdAt: string;
}

export async function loginApi(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
  const result = await postJson<{ token: string; user: AuthUser }>(
    "/api/auth/login",
    { email, password },
    "No se pudo iniciar sesión.",
  );
  setAuthToken(result.token);
  return result;
}

export async function logoutApi(): Promise<void> {
  try {
    await postJson("/api/auth/logout", {}, "No se pudo cerrar sesión.");
  } finally {
    setAuthToken(null);
  }
}

export function meApi() {
  return getJson<{ user: AuthUser }>("/api/auth/me", "No se pudo verificar la sesión.");
}

export function listAuthUsersApi() {
  return getJson<{ users: ManagedUser[] }>("/api/auth/users", "No se pudieron cargar los usuarios.");
}

export function createAuthUserApi(input: {
  email: string;
  name?: string;
  password: string;
  role: BackendRole;
  department?: BackendDepartment | null;
}) {
  return postJson<ManagedUser>("/api/auth/users", input, "No se pudo crear el usuario.");
}

export function updateAuthUserApi(
  id: string,
  patch: {
    name?: string;
    role?: BackendRole;
    department?: BackendDepartment | null;
    isActive?: boolean;
    password?: string;
  },
) {
  return patchJson<ManagedUser>(
    `/api/auth/users/${encodeURIComponent(id)}`,
    patch,
    "No se pudo actualizar el usuario.",
  );
}

export function changeOwnPasswordApi(input: { currentPassword: string; newPassword: string }) {
  return postJson<{ ok: true }>(
    "/api/auth/change-password",
    input,
    "No se pudo cambiar la contraseña.",
  );
}

export function auditLogApi(limit = 200) {
  return getJson<{ entries: AuditEntry[] }>(`/api/audit?limit=${limit}`, "No se pudo cargar la auditoría.");
}

export function searchAccommodationsApi(filters: SearchFilters) {
  return postJson<any>(
    "/api/search/accommodations",
    filters,
    "No se pudo buscar alojamientos.",
  );
}

export function searchActivitiesApi(filters: SearchFilters) {
  return postJson<any>(
    "/api/search/activities",
    filters,
    "No se pudo buscar actividades.",
  );
}

export function createZohoOpportunityApi(payload: unknown) {
  return postJson<any>(
    "/api/crm/opportunities/new",
    payload,
    "No se pudo crear el trato en Zoho.",
  );
}

export function searchZohoOpportunitiesApi(email: string) {
  return getJson<{ opportunities: any[] }>(
    `/api/crm/opportunities/search?email=${encodeURIComponent(email)}`,
    "No se pudieron buscar tratos en Zoho.",
  );
}

export function approveZohoOpportunityApi(payload: {
  dealId: string;
  approvedOptionNumber: number;
}) {
  return postJson<any>(
    "/api/crm/opportunities/approve",
    payload,
    "No se pudo actualizar el trato en Zoho.",
  );
}

export interface ZohoDealSummary {
  id: string;
  dealName: string;
  stage: string;
  amount: number | null;
  closingDate: string;
  accountName: string;
  contactName: string;
  description: string;
  nextStep: string;
  createdTime: string;
  modifiedTime: string;
  dealUrl: string;
}

export function listZohoOpportunitiesApi() {
  return getJson<{ deals: ZohoDealSummary[] }>(
    "/api/crm/opportunities",
    "No se pudieron listar los tratos de Zoho.",
  );
}

export function fetchZohoDealStagesApi() {
  return getJson<{ stages: string[] }>(
    "/api/crm/deal-stages",
    "No se pudieron obtener las fases de Zoho.",
  );
}

export function updateZohoOpportunityApi(
  id: string,
  payload: { stage?: string; chosenOption?: number | null; note?: string },
) {
  return postJson<{ dealId: string; stage?: string; chosenOption?: number | null }>(
    `/api/crm/opportunities/${encodeURIComponent(id)}/update`,
    payload,
    "No se pudo actualizar el trato en Zoho.",
  );
}

export function fetchZohoAuthUrlApi() {
  return getJson<{ authUrl: string }>(
    "/api/crm/auth/url",
    "No se pudo generar la URL de autenticación de Zoho.",
  ).then((result) => result.authUrl);
}

export function exchangeZohoAuthCodeApi(code: string) {
  return postJson<any>(
    "/api/crm/auth/exchange",
    { code },
    "No se pudo intercambiar el código de Zoho.",
  );
}

export function createInventoryDocumentApi(payload: CreateSourceDocumentInput) {
  return postJson<InventoryDocumentDetail>(
    "/api/inventory/documents",
    payload,
    "No se pudo crear el documento de inventario.",
  );
}

export async function listInventoryDocumentsApi() {
  const payload = await getJson<SourceDocumentSummary[] | { documents: SourceDocumentSummary[] }>(
    "/api/inventory/documents",
    "No se pudieron cargar los documentos de inventario.",
  );

  if (Array.isArray(payload)) {
    return payload;
  }

  return payload.documents ?? [];
}

export function getInventoryDocumentApi(documentId: string) {
  return getJson<InventoryDocumentDetail>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}`,
    "No se pudo cargar el detalle del documento de inventario.",
  );
}

export function uploadInventoryDocumentFileApi(documentId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return postFormData<InventoryDocumentDetail>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/file`,
    formData,
    "No se pudo subir el archivo del documento.",
  );
}

export function analyzeInventoryDocumentApi(documentId: string) {
  return postJson<InventoryDocumentDetail>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/analyze`,
    {},
    "No se pudo analizar el documento de inventario.",
  );
}

export function analyzeInventoryDocumentWithAiApi(documentId: string) {
  return postJson<AiDocumentAnalysisResult>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/ai-analyze`,
    {},
    "No se pudo ejecutar el análisis IA del documento.",
  );
}

export function createInventoryDocumentStagingApi(documentId: string) {
  return postJson<CreateStagingResult>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/create-staging`,
    {},
    "No se pudieron crear los candidatos revisables del documento.",
  );
}

export function patchInventoryStagingApi(
  entity: StagingEntityKey,
  id: string,
  patch: Record<string, unknown>,
) {
  return patchJson<Record<string, unknown>>(
    `/api/inventory/staging/${entity}/${encodeURIComponent(id)}`,
    patch,
    "No se pudo actualizar el candidato.",
  );
}

// Cambio de estado de revisión en lote para varios candidatos del mismo tipo.
export function bulkUpdateInventoryStagingApi(
  entity: StagingEntityKey,
  ids: string[],
  reviewStatus: string,
) {
  return patchJson<BulkReviewResult>(
    "/api/inventory/staging/bulk",
    { entity, ids, reviewStatus },
    "No se pudo actualizar el estado de los candidatos.",
  );
}

// Regenerar candidatos: descarta el staging actual y lo vuelve a crear con IA.
/** Firma el reparto: "estas tarifas son de este alojamiento". */
export function confirmAssignmentApi(documentId: string, accommodationIds: string[]) {
  return postJson<{ confirmed: number }>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/confirm-assignment`,
    { accommodationIds },
    "No se pudo confirmar el reparto.",
  );
}

export function regenerateInventoryDocumentStagingApi(documentId: string) {
  return postJson<CreateStagingResult>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/regenerate-staging`,
    {},
    "No se pudieron regenerar los candidatos del documento.",
  );
}

export function publishApprovedInventoryDocumentApi(documentId: string) {
  return postJson<PublishApprovedResult>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/publish-approved`,
    {},
    "No se pudo publicar el documento al inventario operativo.",
  );
}

// Simulación de publicación (dry-run): GET, de solo lectura. No escribe nada.
export function dryRunPublishApprovedInventoryDocumentApi(documentId: string) {
  return getJson<DryRunPublishResult>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/publish-approved/dry-run`,
    "No se pudo simular la publicación del documento.",
  );
}

// Trazabilidad: GET de solo lectura con lo publicado desde este documento.
export function getPublishedInventoryByDocumentApi(documentId: string) {
  return getJson<PublishedInventorySummary>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/published`,
    "No se pudo obtener la trazabilidad de lo publicado.",
  );
}

// Simulación de retirada (dry-run): GET de solo lectura. No borra nada.
export function dryRunUnpublishInventoryDocumentApi(documentId: string) {
  return getJson<DryRunUnpublishResult>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/unpublish/dry-run`,
    "No se pudo simular la retirada de la publicación.",
  );
}

// Retirada real: POST que elimina del inventario lo publicado (idempotente).
export function unpublishInventoryDocumentApi(documentId: string) {
  return postJson<UnpublishResult>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/unpublish`,
    {},
    "No se pudo retirar la publicación del documento.",
  );
}

// Editar metadatos del documento (nombre, ubicación, año, categoría, notas).
export function updateInventoryDocumentApi(
  documentId: string,
  patch: Partial<CreateSourceDocumentInput>,
) {
  return patchJson<SourceDocumentSummary>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}`,
    patch,
    "No se pudo actualizar el documento.",
  );
}

// Quitar el archivo asociado a un documento (corregir una subida equivocada).
export function removeInventoryDocumentFileApi(documentId: string) {
  return deleteJson<InventoryDocumentDetail>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/file`,
    "No se pudo quitar el archivo del documento.",
  );
}

// Simulación de borrado del documento (dry-run): GET de solo lectura.
export function dryRunDeleteInventoryDocumentApi(documentId: string) {
  return getJson<DryRunDeleteDocumentResult>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/delete/dry-run`,
    "No se pudo simular el borrado del documento.",
  );
}

// Borrado real del documento (DELETE). Bloqueado si tiene registros publicados.
export function deleteInventoryDocumentApi(documentId: string) {
  return deleteJson<DeleteDocumentResult>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}`,
    "No se pudo borrar el documento.",
  );
}

// Catálogo global del inventario publicado (todos los documentos), solo lectura.
export function getInventoryCatalogApi() {
  return getJson<PublishedInventoryCatalog>(
    "/api/inventory/catalog",
    "No se pudo obtener el catálogo del inventario.",
  );
}

// Retirada granular: DELETE de un registro publicado concreto (o una tarifa).
export function unpublishPublishedItemApi(kind: PublishedItemKind, id: string) {
  return deleteJson<UnpublishItemResult>(
    `/api/inventory/published/${kind}/${encodeURIComponent(id)}`,
    "No se pudo retirar el registro del inventario.",
  );
}

// ─── Flujo comercial (persistencia real en BD) ──────────────────────────────

export function findClientByEmailApi(email: string) {
  return getJson<{ client: Client | null }>(
    `/api/commercial/clients?email=${encodeURIComponent(email)}`,
    "No se pudo buscar el cliente.",
  );
}

export function upsertClientApi(input: {
  email: string;
  firstName: string;
  lastName: string;
  clientType: "new" | "existing";
}) {
  return postJson<Client>("/api/commercial/clients", input, "No se pudo guardar el cliente.");
}

export function getClientTripRequestsApi(clientId: string) {
  return getJson<{
    requests: { id: string; opportunityName: string | null; destinationText: string | null; createdAt: string }[];
  }>(
    `/api/commercial/clients/${encodeURIComponent(clientId)}/trip-requests`,
    "No se pudieron cargar las solicitudes del cliente.",
  );
}

export function saveTripRequestApi(input: Record<string, unknown>) {
  return postJson<TripRequest>(
    "/api/commercial/trip-requests",
    input,
    "No se pudo guardar la solicitud.",
  );
}

export function saveTripProposalApi(input: Record<string, unknown>) {
  return postJson<TripProposal>(
    "/api/commercial/proposals",
    input,
    "No se pudo guardar la propuesta.",
  );
}

export function approveTripProposalApi(proposalId: string, approvedOptionNumber: number) {
  return postJson<TripProposal>(
    `/api/commercial/proposals/${encodeURIComponent(proposalId)}/approve`,
    { approvedOptionNumber },
    "No se pudo aprobar la propuesta.",
  );
}
// ── Entrega de propuestas al cliente ─────────────────────────────────────────
// Preparar genera el PDF y la referencia sin que salga nada; enviar es lo que
// la pone en el buzón. Mientras no haya clave del buzón el envío responde
// `simulated: true`: la propuesta queda registrada pero no ha salido.

export type DeliveryStatus = "DRAFT" | "SIMULATED" | "SENT" | "FAILED";

export interface ProposalDeliveryResult {
  id: string;
  reference: string;
  status: DeliveryStatus;
  recipientEmail: string;
  subject: string;
  pdfPath: string | null;
  publicUrl: string | null;
  simulated: boolean;
  failureReason?: string | null;
}

export interface ProposalDelivery {
  id: string;
  proposalId: string;
  reference: string;
  department: BackendDepartment | null;
  recipientEmail: string;
  recipientName: string | null;
  subject: string;
  status: DeliveryStatus;
  failureReason: string | null;
  sentAt: string | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
  chosenOptionNumber: number | null;
  chosenAt: string | null;
  depositDueAt: string | null;
  depositPaidAt: string | null;
  createdAt: string;
  proposal?: {
    id: string;
    tripRequest?: {
      opportunityName: string | null;
      destinationText: string | null;
      dateFrom: string | null;
      dateTo: string | null;
      participants: number | null;
    } | null;
  } | null;
}

export function prepareProposalDeliveryApi(
  proposalId: string,
  input?: { recipientEmail?: string; recipientName?: string },
) {
  return postJson<ProposalDeliveryResult>(
    `/api/proposals/${encodeURIComponent(proposalId)}/prepare-delivery`,
    input ?? {},
    "No se pudo preparar la propuesta para enviar.",
  );
}

export function sendProposalDeliveryApi(deliveryId: string) {
  return postJson<ProposalDeliveryResult>(
    `/api/deliveries/${encodeURIComponent(deliveryId)}/send`,
    {},
    "No se pudo enviar la propuesta.",
  );
}

export function listProposalDeliveriesApi() {
  return getJson<{ deliveries: ProposalDelivery[] }>(
    "/api/deliveries",
    "No se pudieron cargar las propuestas enviadas.",
  );
}

/**
 * Abre el documento de una entrega en otra pestaña. Se descarga con la sesión
 * en la cabecera y se abre desde memoria: así el token no acaba en la URL, ni
 * en el historial del navegador ni en los registros del servidor.
 */
export async function abrirProposalPdf(deliveryId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/deliveries/${encodeURIComponent(deliveryId)}/pdf`,
    { headers: authHeaders() },
  );
  if (!response.ok) {
    await parseErrorResponse(response, "No se pudo abrir el documento.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  // Se revoca con margen para que la pestaña haya cargado el PDF.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ── Cambios del cliente sobre una propuesta ya hecha ─────────────────────────
// El mensaje se lee en el navegador (allí vive el lector en español) y al
// servidor solo van los datos entendidos, que es lo que afecta a precios.

export interface DatosLeidosCambio {
  participants?: number | null;
  teachers?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  regimeRequested?: string | null;
  destinationText?: string | null;
}

export interface CampoCambiado {
  campo: string;
  etiqueta: string;
  antes: string;
  ahora: string;
}

export interface OpcionRecalculada {
  optionNumber: number;
  accommodationName: string;
  precioAntes: number | null;
  precioAhora: number | null;
  totalAntes: number | null;
  totalAhora: number | null;
  aviso: string | null;
}

export interface VistaPreviaCambio {
  proposalId: string;
  hayCambios: boolean;
  campos: CampoCambiado[];
  opciones: OpcionRecalculada[];
  avisos: string[];
}

export function previewChangeApi(proposalId: string, leido: DatosLeidosCambio) {
  return postJson<VistaPreviaCambio>(
    `/api/proposals/${encodeURIComponent(proposalId)}/changes/preview`,
    { leido },
    "No se pudo calcular el cambio.",
  );
}

export function applyChangeApi(proposalId: string, leido: DatosLeidosCambio, mensaje: string) {
  return postJson<{ proposalId: string; versionNumber: number; cambios: number }>(
    `/api/proposals/${encodeURIComponent(proposalId)}/changes/apply`,
    { leido, mensaje },
    "No se pudo aplicar el cambio.",
  );
}
