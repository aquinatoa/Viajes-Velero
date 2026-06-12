import "./loadEnv";
import express from "express";
import type { SearchFilters } from "../src/domain/types";
import { importRatesFromExcel } from "../prisma/importRates";
import {
  approveZohoOpportunityOption,
  createZohoOpportunity,
  exchangeZohoAuthCode,
  getZohoAuthStatus,
  ZohoReauthRequiredError,
  getZohoAuthUrl,
  searchZohoOpportunitiesByEmail,
} from "./zoho";
import {
  getImportedCatalogDb,
  getInventorySummaryDb,
  searchAccommodationsDb,
  searchActivitiesDb,
} from "./searchDb";
import {
  approveInventoryDocument,
  createInventoryDocument,
  getInventoryDocumentDetail,
  listInventoryDocuments,
  markInventoryDocumentAsPendingReview,
  rejectInventoryDocument,
  updateInventoryDocumentStatus,
} from "./documentImportDb";

const app = express();
const port = 8787;

app.use(express.json());

function crmErrorResponse(error: unknown, response: express.Response, fallback: string) {
  if (error instanceof ZohoReauthRequiredError) {
    response.status(401).json({
      error: error.message,
      code: "zoho_reauth_required",
      authUrl: error.authUrl,
    });
    return;
  }

  response.status(500).json({
    error: error instanceof Error ? error.message : fallback,
  });
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/crm/auth/status", (_request, response) => {
  response.json(getZohoAuthStatus());
});

app.get("/api/crm/auth/url", (_request, response) => {
  response.json({ authUrl: getZohoAuthUrl() });
});

app.post("/api/crm/auth/exchange", async (request, response) => {
  try {
    const payload = request.body as { code?: string };
    if (!payload.code) {
      response.status(400).json({ error: "Falta el código de autorización de Zoho." });
      return;
    }

    const result = await exchangeZohoAuthCode(payload.code);
    response.json({
      ok: true,
      ...result,
      note: "La reautenticación quedó activa en el servidor actual. Si reinicias, vuelve a guardar el refresh token manualmente.",
    });
  } catch (error) {
    crmErrorResponse(error, response, "No se pudo intercambiar el código de Zoho.");
  }
});

app.get("/api/data/summary", async (_request, response) => {
  try {
    const summary = await getInventorySummaryDb();
    response.json(summary);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "No se pudo leer el resumen de inventario.",
    });
  }
});

app.get("/api/data/catalog", async (_request, response) => {
  try {
    const catalog = await getImportedCatalogDb();
    response.json(catalog);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "No se pudo leer el catálogo importado.",
    });
  }
});

app.post("/api/data/import", async (request, response) => {
  try {
    const payload = request.body as {
      accommodationPath?: string;
      activityPath?: string;
    };

    const result = await importRatesFromExcel({
      accommodationPath: payload.accommodationPath,
      activityPath: payload.activityPath,
    });

    response.json(result);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "No se pudo importar la base de datos.",
    });
  }
});

app.post("/api/search/accommodations", async (request, response) => {
  try {
    const filters = request.body as SearchFilters;
    const result = await searchAccommodationsDb(filters);
    response.json(result);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "No se pudo buscar alojamientos.",
    });
  }
});

app.post("/api/search/activities", async (request, response) => {
  try {
    const filters = request.body as SearchFilters;
    const result = await searchActivitiesDb(filters);
    response.json(result);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : "No se pudo buscar actividades.",
    });
  }
});

app.post("/api/inventory/documents", async (request, response) => {
  try {
    const document = await createInventoryDocument(request.body);
    response.status(201).json(document);
  } catch (error) {
    console.error("Error creando documento de inventario", error);
    response.status(500).json({
      error: "No se pudo crear el documento de inventario.",
    });
  }
});

app.get("/api/inventory/documents", async (_request, response) => {
  try {
    const documents = await listInventoryDocuments();
    response.json(documents);
  } catch (error) {
    console.error("Error listando documentos de inventario", error);
    response.status(500).json({
      error: "No se pudieron listar los documentos de inventario.",
    });
  }
});

app.get("/api/inventory/documents/:id", async (request, response) => {
  try {
    const document = await getInventoryDocumentDetail(request.params.id);

    if (!document) {
      response.status(404).json({
        error: "Documento de inventario no encontrado.",
      });
      return;
    }

    response.json(document);
  } catch (error) {
    console.error("Error obteniendo detalle de documento de inventario", error);
    response.status(500).json({
      error: "No se pudo obtener el detalle del documento de inventario.",
    });
  }
});

app.post("/api/inventory/documents/:id/analyze", async (request, response) => {
  try {
    const document = await markInventoryDocumentAsPendingReview(request.params.id);
    response.json(document);
  } catch (error) {
    console.error("Error marcando documento como pendiente de revisión", error);
    response.status(500).json({
      error: "No se pudo analizar el documento de inventario.",
    });
  }
});

app.post("/api/inventory/documents/:id/approve", async (request, response) => {
  try {
    const document = await approveInventoryDocument(request.params.id);
    response.json(document);
  } catch (error) {
    console.error("Error aprobando documento de inventario", error);
    response.status(500).json({
      error: "No se pudo aprobar el documento de inventario.",
    });
  }
});

app.post("/api/inventory/documents/:id/reject", async (request, response) => {
  try {
    const document = await rejectInventoryDocument(request.params.id);
    response.json(document);
  } catch (error) {
    console.error("Error rechazando documento de inventario", error);
    response.status(500).json({
      error: "No se pudo rechazar el documento de inventario.",
    });
  }
});

app.post("/api/inventory/documents/:id/publish", async (request, response) => {
  try {
    const document = await updateInventoryDocumentStatus(request.params.id, "PUBLISHED");
    response.json(document);
  } catch (error) {
    console.error("Error publicando documento de inventario", error);
    response.status(500).json({
      error: "No se pudo publicar el documento de inventario.",
    });
  }
});

app.post("/api/crm/opportunities/new", async (request, response) => {
  try {
    const payload = request.body as {
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
    };

    const result = await createZohoOpportunity(payload);
    response.json(result);
  } catch (error) {
    crmErrorResponse(error, response, "No se pudo crear la oportunidad en Zoho.");
  }
});

app.get("/api/crm/opportunities/search", async (request, response) => {
  try {
    const email = String(request.query.email ?? "");
    const result = await searchZohoOpportunitiesByEmail(email);
    response.json({ opportunities: result });
  } catch (error) {
    crmErrorResponse(error, response, "No se pudieron buscar oportunidades en Zoho.");
  }
});

app.post("/api/crm/opportunities/approve", async (request, response) => {
  try {
    const payload = request.body as {
      dealId: string;
      approvedOptionNumber: number;
    };
    const result = await approveZohoOpportunityOption(payload);
    response.json(result);
  } catch (error) {
    crmErrorResponse(error, response, "No se pudo actualizar la oportunidad en Zoho.");
  }
});

app.listen(port, () => {
  console.log(`Viajes Velero API escuchando en http://localhost:${port}`);
});