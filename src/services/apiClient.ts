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

async function parseErrorResponse(response: Response, fallbackError: string) {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    code?: string;
    authUrl?: string;
  } | null;

  if (payload?.code === "zoho_reauth_required") {
    throw new ApiAuthError(payload.error ?? fallbackError, payload.code, payload.authUrl);
  }

  throw new Error(payload?.error ?? fallbackError);
}

async function getJson<T>(path: string, fallbackError: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);

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
    headers: {
      "Content-Type": "application/json",
    },
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
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    await parseErrorResponse(response, fallbackError);
  }

  return response.json() as Promise<T>;
}

async function deleteJson<T>(path: string, fallbackError: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { method: "DELETE" });

  if (!response.ok) {
    await parseErrorResponse(response, fallbackError);
  }

  return response.json() as Promise<T>;
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