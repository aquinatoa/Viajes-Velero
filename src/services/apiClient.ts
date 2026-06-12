import type {
  AiDocumentAnalysisResult,
  CreateSourceDocumentInput,
  InventoryDocumentDetail,
  SourceDocumentSummary,
} from "../domain/documentImportTypes";
import type { SearchFilters } from "../domain/types";

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

export function fetchInventorySummaryApi() {
  return getJson<any>("/api/data/summary", "No se pudo cargar el resumen de inventario.");
}

export function fetchImportedCatalogApi() {
  return getJson<any>("/api/data/catalog", "No se pudo cargar el catálogo importado.");
}

export function importInventoryApi(payload: {
  accommodationPath?: string;
  activityPath?: string;
}) {
  return postJson<any>(
    "/api/data/import",
    payload,
    "No se pudo importar la base de datos.",
  );
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

export function approveInventoryDocumentApi(documentId: string) {
  return postJson<InventoryDocumentDetail>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/approve`,
    {},
    "No se pudo aprobar el documento de inventario.",
  );
}

export function rejectInventoryDocumentApi(documentId: string) {
  return postJson<InventoryDocumentDetail>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/reject`,
    {},
    "No se pudo rechazar el documento de inventario.",
  );
}

export function publishInventoryDocumentApi(documentId: string) {
  return postJson<InventoryDocumentDetail>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/publish`,
    {},
    "No se pudo publicar el documento de inventario.",
  );
}