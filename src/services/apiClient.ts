import type {
  SearchAccommodationsResult,
  SearchActivitiesResult,
  SearchFilters,
} from "../domain/types";
import type {
  CreateSourceDocumentInput,
  InventoryDocumentDetail,
  SourceDocumentSummary,
} from "../domain/documentImportTypes";

export class ApiAuthError extends Error {
  requiresReauth: boolean;
  authUrl?: string;

  constructor(message: string, authUrl?: string) {
    super(message);
    this.name = "ApiAuthError";
    this.requiresReauth = true;
    this.authUrl = authUrl;
  }
}

async function parseError(response: Response) {
  return (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    authUrl?: string;
  };
}

async function postJson<TResponse>(url: string, payload: unknown): Promise<TResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await parseError(response);
    if (error.code === "zoho_reauth_required") {
      throw new ApiAuthError(error.error ?? "Zoho requiere reautenticación.", error.authUrl);
    }
    throw new Error(error.error ?? "La petición no se pudo completar.");
  }

  return response.json() as Promise<TResponse>;
}

async function getJson<TResponse>(url: string, fallbackMessage: string): Promise<TResponse> {
  const response = await fetch(url);

  if (!response.ok) {
    const error = await parseError(response);
    if (error.code === "zoho_reauth_required") {
      throw new ApiAuthError(error.error ?? "Zoho requiere reautenticación.", error.authUrl);
    }
    throw new Error(error.error ?? fallbackMessage);
  }

  return response.json() as Promise<TResponse>;
}

export function searchAccommodationsApi(filters: SearchFilters) {
  return postJson<SearchAccommodationsResult>("/api/search/accommodations", filters);
}

export function searchActivitiesApi(filters: SearchFilters) {
  return postJson<SearchActivitiesResult>("/api/search/activities", filters);
}

export async function fetchInventorySummaryApi() {
  return getJson<{
    accommodations: number;
    accommodationRates: number;
    activities: number;
    activityRates: number;
  }>("/api/data/summary", "No se pudo cargar el resumen de inventario.");
}

export async function fetchZohoAuthUrlApi() {
  const json = await getJson<{
    authUrl?: string;
    error?: string;
  }>("/api/crm/auth/url", "No se pudo obtener la URL de autenticación Zoho.");

  if (!json.authUrl) {
    throw new Error(json.error ?? "No se pudo obtener la URL de autenticación Zoho.");
  }

  return json.authUrl;
}

export function exchangeZohoAuthCodeApi(code: string) {
  return postJson<{
    ok: boolean;
    refreshToken: string;
    apiDomain: string;
    note: string;
  }>("/api/crm/auth/exchange", { code });
}

export async function fetchImportedCatalogApi() {
  return getJson<{
    accommodations: Array<{
      id: string;
      accommodationName: string;
      locality: string;
      categoryType: string;
      accommodationType: string;
      observations: string;
      conditionsText: string;
      freePolicy: string;
      sourceFile: string;
      rates: Array<{
        id: string;
        year: number;
        seasonName: string;
        dateFrom: string;
        dateTo: string;
        minNights: number | null;
        boardType: string;
        tariffUnit: string;
        pvpAmount: number;
        netSaleAmount: number;
        netAzulmarinoAmount: number;
        sourceSheet: string;
      }>;
    }>;
    activities: Array<{
      id: string;
      activityName: string;
      supplierName: string;
      locationMain: string;
      durationText: string;
      descriptionText: string;
      sourceFile: string;
      rates: Array<{
        id: string;
        year: number;
        ageLabel: string;
        ageMin: number | null;
        ageMax: number | null;
        salePvpAmount: number;
        costNetAmount: number;
        commissionPercent: number;
        durationText: string;
        sourceSheet: string;
      }>;
    }>;
  }>("/api/data/catalog", "No se pudo cargar el catálogo importado.");
}

export function importInventoryApi(payload: {
  accommodationPath?: string;
  activityPath?: string;
}) {
  return postJson<{
    accommodations: number;
    accommodationRates: number;
    activities: number;
    activityRates: number;
    accommodationSource: string;
    activitySource: string;
  }>("/api/data/import", payload);
}

export function createInventoryDocumentApi(payload: CreateSourceDocumentInput) {
  return postJson<InventoryDocumentDetail>("/api/inventory/documents", payload);
}

export function listInventoryDocumentsApi() {
  return getJson<SourceDocumentSummary[]>(
    "/api/inventory/documents",
    "No se pudieron cargar los documentos de inventario."
  );
}

export function getInventoryDocumentApi(documentId: string) {
  return getJson<InventoryDocumentDetail>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}`,
    "No se pudo cargar el detalle del documento de inventario."
  );
}

export function analyzeInventoryDocumentApi(documentId: string) {
  return postJson<InventoryDocumentDetail>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/analyze`,
    {}
  );
}

export function approveInventoryDocumentApi(documentId: string) {
  return postJson<InventoryDocumentDetail>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/approve`,
    {}
  );
}

export function rejectInventoryDocumentApi(documentId: string) {
  return postJson<InventoryDocumentDetail>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/reject`,
    {}
  );
}

export function publishInventoryDocumentApi(documentId: string) {
  return postJson<InventoryDocumentDetail>(
    `/api/inventory/documents/${encodeURIComponent(documentId)}/publish`,
    {}
  );
}

export function createZohoOpportunityApi(payload: {
  contact: {
    email: string;
    first_name: string;
    last_name: string;
    full_name: string;
  };
  account: {
    crm_account_id?: string | null;
  };
  opportunity: {
    opportunity_name?: string;
    destination?: string;
    destination_country?: string;
    date_from?: string;
    date_to?: string;
    participants?: number | null;
    teachers?: number | null;
    group_type?: string;
  };
  proposalOptions: unknown;
}) {
  return postJson<{
    dealId: string | null;
    contactId: string | null;
    accountId: string | null;
  }>("/api/crm/opportunities/new", payload);
}

export async function searchZohoOpportunitiesApi(email: string) {
  return getJson<{
    opportunities: Array<{
      id: string;
      dealName: string;
      stage: string;
      raw: Record<string, unknown>;
    }>;
  }>(
    `/api/crm/opportunities/search?email=${encodeURIComponent(email)}`,
    "No se pudieron buscar oportunidades en Zoho."
  );
}

export function approveZohoOpportunityApi(payload: {
  dealId: string;
  approvedOptionNumber: number;
}) {
  return postJson<{
    dealId: string;
    approvedOptionNumber: number;
  }>("/api/crm/opportunities/approve", payload);
}