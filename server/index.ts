import "./loadEnv";
import express from "express";
import cors from "cors";
import multer from "multer";
import type { SearchFilters } from "../src/domain/types";
import { importRatesFromExcel } from "../prisma/importRates";
import {
  approveZohoOpportunityOption,
  createZohoOpportunity,
  exchangeZohoAuthCode,
  getZohoAuthStatus,
  getZohoAuthUrl,
  searchZohoOpportunitiesByEmail,
  ZohoReauthRequiredError,
} from "./zoho";
import {
  getImportedCatalogDb,
  getInventorySummaryDb,
  searchAccommodationsDb,
  searchActivitiesDb,
} from "./searchDb";
import {
  addInventoryDocumentExtraction,
  addInventoryDocumentIssue,
  approveInventoryDocument,
  attachInventoryDocumentFile,
  createInventoryDocument,
  getInventoryDocumentDetail,
  listInventoryDocuments,
  markInventoryDocumentAsPendingReview,
  rejectInventoryDocument,
  updateInventoryDocumentStatus,
} from "./documentImportDb";
import { saveInventoryDocumentFile } from "./documentStorage";

const app = express();
const port = 8787;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
  }),
);

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
      response.status(400).json({
        error: "Falta el código de autorización de Zoho.",
      });
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
    crmErrorResponse(error, response, "No se pudo crear el trato en Zoho.");
  }
});

app.get("/api/crm/opportunities/search", async (request, response) => {
  try {
    const email = String(request.query.email ?? "");
    const result = await searchZohoOpportunitiesByEmail(email);
    response.json({ opportunities: result });
  } catch (error) {
    crmErrorResponse(error, response, "No se pudieron buscar tratos en Zoho.");
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
    crmErrorResponse(error, response, "No se pudo actualizar el trato en Zoho.");
  }
});

app.post("/api/inventory/documents", async (request, response) => {
  try {
    const payload = request.body as {
      targetType?: "ACCOMMODATION" | "ACTIVITY" | "MIXED" | "UNKNOWN";
      controlName?: string;
      controlLocation?: string;
      controlYear?: number | null;
      controlCategory?: string;
      controlNotes?: string;
    };

    if (!payload.controlName?.trim()) {
      response.status(400).json({
        error: "Falta el nombre de control del documento.",
      });
      return;
    }

    const document = await createInventoryDocument({
      targetType: payload.targetType ?? "UNKNOWN",
      controlName: payload.controlName.trim(),
      controlLocation: payload.controlLocation,
      controlYear: payload.controlYear,
      controlCategory: payload.controlCategory,
      controlNotes: payload.controlNotes,
    });

    response.json(document);
  } catch (error) {
    console.error("Error creating inventory document", error);
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
    console.error("Error listing inventory documents", error);
    response.status(500).json({
      error: "No se pudieron cargar los documentos de inventario.",
    });
  }
});

app.get("/api/inventory/documents/:id", async (request, response) => {
  try {
    const documentId = String(request.params.id);
    const document = await getInventoryDocumentDetail(documentId);

    if (!document) {
      response.status(404).json({
        error: "Documento no encontrado.",
      });
      return;
    }

    response.json(document);
  } catch (error) {
    console.error("Error getting inventory document detail", error);
    response.status(500).json({
      error: "No se pudo cargar el detalle del documento de inventario.",
    });
  }
});

app.post(
  "/api/inventory/documents/:id/file",
  upload.single("file"),
  async (request, response) => {
    try {
      const documentId = String(request.params.id);

      if (!request.file) {
        response.status(400).json({
          error: "No se recibió ningún archivo.",
        });
        return;
      }

      const existingDocument = await getInventoryDocumentDetail(documentId);

      if (!existingDocument) {
        response.status(404).json({
          error: "Documento no encontrado.",
        });
        return;
      }

      const storedFile = await saveInventoryDocumentFile({
        documentId,
        originalFileName: request.file.originalname,
        mimeType: request.file.mimetype,
        buffer: request.file.buffer,
      });

      const updatedDocument = await attachInventoryDocumentFile({
        documentId,
        ...storedFile,
      });

      response.json(updatedDocument);
    } catch (error) {
      console.error("Error uploading inventory document file", error);
      response.status(500).json({
        error: "No se pudo subir el archivo del documento.",
      });
    }
  },
);

app.post("/api/inventory/documents/:id/analyze", async (request, response) => {
  try {
    const documentId = String(request.params.id);
    const document = await getInventoryDocumentDetail(documentId);

    if (!document) {
      response.status(404).json({
        error: "Documento no encontrado.",
      });
      return;
    }

    await addInventoryDocumentExtraction({
      sourceDocumentId: documentId,
      extractionMethod: "MANUAL",
      rawText: "Análisis pendiente de implementar. Registro preparado para revisión humana.",
    });

    await addInventoryDocumentIssue({
      sourceDocumentId: documentId,
      severity: "INFO",
      issueType: "ANALYSIS_PLACEHOLDER",
      message:
        "El documento quedó marcado como pendiente de revisión. La extracción automática se implementará en una fase posterior.",
    });

    const updatedDocument = await markInventoryDocumentAsPendingReview(documentId);
    response.json(updatedDocument);
  } catch (error) {
    console.error("Error analyzing inventory document", error);
    response.status(500).json({
      error: "No se pudo analizar el documento de inventario.",
    });
  }
});

app.post("/api/inventory/documents/:id/approve", async (request, response) => {
  try {
    const documentId = String(request.params.id);
    const updatedDocument = await approveInventoryDocument(documentId);
    response.json(updatedDocument);
  } catch (error) {
    console.error("Error approving inventory document", error);
    response.status(500).json({
      error: "No se pudo aprobar el documento de inventario.",
    });
  }
});

app.post("/api/inventory/documents/:id/reject", async (request, response) => {
  try {
    const documentId = String(request.params.id);
    const updatedDocument = await rejectInventoryDocument(documentId);
    response.json(updatedDocument);
  } catch (error) {
    console.error("Error rejecting inventory document", error);
    response.status(500).json({
      error: "No se pudo rechazar el documento de inventario.",
    });
  }
});

app.post("/api/inventory/documents/:id/publish", async (request, response) => {
  try {
    const documentId = String(request.params.id);
    const updatedDocument = await updateInventoryDocumentStatus(documentId, "PUBLISHED");
    response.json(updatedDocument);
  } catch (error) {
    console.error("Error publishing inventory document", error);
    response.status(500).json({
      error: "No se pudo publicar el documento de inventario.",
    });
  }
});

app.listen(port, () => {
  console.log(`Viajes Velero API escuchando en http://localhost:${port}`);
});