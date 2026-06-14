import "./loadEnv";
import express from "express";
import cors from "cors";
import multer from "multer";
import type { SearchFilters } from "../src/domain/types";
import {
  approveZohoOpportunityOption,
  createZohoOpportunity,
  exchangeZohoAuthCode,
  getZohoAuthStatus,
  getZohoAuthUrl,
  searchZohoOpportunitiesByEmail,
  ZohoReauthRequiredError,
} from "./zoho";
import { searchAccommodationsDb, searchActivitiesDb } from "./searchDb";
import {
  addInventoryDocumentExtraction,
  addInventoryDocumentIssue,
  attachInventoryDocumentFile,
  countInventoryDocumentStaging,
  bulkUpdateStagingReview,
  createInventoryDocument,
  createInventoryDocumentStaging,
  deleteInventoryDocument,
  deleteInventoryDocumentStaging,
  DeleteDocumentValidationError,
  removeInventoryDocumentFile,
  updateInventoryDocumentMetadata,
  dryRunDeleteInventoryDocument,
  dryRunPublishApprovedInventoryDocument,
  dryRunUnpublishInventoryDocument,
  getInventoryDocumentDetail,
  getPublishedInventoryByDocument,
  getPublishedInventoryCatalog,
  listInventoryDocuments,
  publishApprovedInventoryDocument,
  PublishValidationError,
  StagingValidationError,
  unpublishInventoryDocument,
  unpublishPublishedItem,
  updateInventoryDocumentStatus,
  updateStagingEntity,
} from "./documentImportDb";
import { saveInventoryDocumentFile } from "./documentStorage";
import { extractPdfText } from "./pdfTextExtraction";
import { analyzeDocumentText, AiAnalysisError } from "./aiDocumentAnalysis";

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

// Editar metadatos de control del documento (nombre, ubicación, año, etc.).
// No toca el archivo, el staging ni el inventario operativo.
app.patch("/api/inventory/documents/:id", async (request, response) => {
  try {
    const documentId = String(request.params.id);
    const existing = await getInventoryDocumentDetail(documentId);

    if (!existing) {
      response.status(404).json({ error: "Documento no encontrado." });
      return;
    }

    const payload = (request.body ?? {}) as {
      targetType?: "ACCOMMODATION" | "ACTIVITY" | "MIXED" | "UNKNOWN";
      controlName?: string;
      controlLocation?: string | null;
      controlYear?: number | null;
      controlCategory?: string | null;
      controlNotes?: string | null;
    };

    if (payload.controlName !== undefined && !payload.controlName.trim()) {
      response.status(400).json({ error: "El nombre de control no puede quedar vacío." });
      return;
    }

    const updated = await updateInventoryDocumentMetadata(documentId, payload);
    response.json(updated);
  } catch (error) {
    console.error("Error updating inventory document metadata", error);
    response.status(500).json({ error: "No se pudo actualizar el documento." });
  }
});

// Quitar el archivo asociado al documento (corregir una subida equivocada).
app.delete("/api/inventory/documents/:id/file", async (request, response) => {
  try {
    const documentId = String(request.params.id);
    const existing = await getInventoryDocumentDetail(documentId);

    if (!existing) {
      response.status(404).json({ error: "Documento no encontrado." });
      return;
    }

    const updated = await removeInventoryDocumentFile(documentId);
    response.json(updated);
  } catch (error) {
    console.error("Error removing inventory document file", error);
    response.status(500).json({ error: "No se pudo quitar el archivo del documento." });
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

    if (!document.storedFilePath) {
      response.status(400).json({
        error: "El documento no tiene un archivo asociado. Sube un archivo antes de analizarlo.",
      });
      return;
    }

    const mimeType = (document.fileMimeType ?? "").toLowerCase();
    const fileName = (document.originalFileName ?? "").toLowerCase();
    const isPdf = mimeType.includes("pdf") || fileName.endsWith(".pdf");

    if (!isPdf) {
      await addInventoryDocumentIssue({
        sourceDocumentId: documentId,
        severity: "INFO",
        issueType: "EXTRACTION_PENDING_FOR_TYPE",
        message: `La extracción automática para archivos de tipo "${
          document.fileMimeType ?? "desconocido"
        }" queda pendiente. Por ahora solo se procesan documentos PDF.`,
      });

      const updatedDocument = await updateInventoryDocumentStatus(documentId, "PENDING_REVIEW");
      response.json(updatedDocument);
      return;
    }

    const hasExistingTextExtraction = document.extractions.some(
      (existingExtraction) => existingExtraction.extractionMethod === "TEXT",
    );

    if (hasExistingTextExtraction) {
      await addInventoryDocumentIssue({
        sourceDocumentId: documentId,
        severity: "INFO",
        issueType: "TEXT_ALREADY_EXTRACTED",
        message:
          "El documento ya tenía texto extraído. No se creó una extracción duplicada.",
      });

      const updatedDocument = await updateInventoryDocumentStatus(
        documentId,
        "PENDING_REVIEW",
        "EXTRACTED",
      );
      response.json(updatedDocument);
      return;
    }

    try {
      const extraction = await extractPdfText(document.storedFilePath);

      if (extraction.hasText) {
        await addInventoryDocumentExtraction({
          sourceDocumentId: documentId,
          extractionMethod: "TEXT",
          rawText: extraction.text,
        });

        const updatedDocument = await updateInventoryDocumentStatus(
          documentId,
          "PENDING_REVIEW",
          "EXTRACTED",
        );
        response.json(updatedDocument);
        return;
      }

      await addInventoryDocumentIssue({
        sourceDocumentId: documentId,
        severity: "WARNING",
        issueType: "NO_TEXT_LAYER",
        message:
          "No se pudo extraer texto del PDF. Puede tratarse de un documento escaneado que requiere OCR en una fase posterior.",
      });

      const updatedDocument = await updateInventoryDocumentStatus(
        documentId,
        "PENDING_REVIEW",
        "NEEDS_OCR",
      );
      response.json(updatedDocument);
    } catch (extractionError) {
      console.error("Error extracting PDF text", extractionError);

      await addInventoryDocumentIssue({
        sourceDocumentId: documentId,
        severity: "ERROR",
        issueType: "PDF_EXTRACTION_FAILED",
        message: "No se pudo procesar el PDF para extraer su texto. Revisa el archivo subido.",
      });

      const updatedDocument = await updateInventoryDocumentStatus(
        documentId,
        "PENDING_REVIEW",
        "FAILED",
      );
      response.json(updatedDocument);
    }
  } catch (error) {
    console.error("Error analyzing inventory document", error);
    response.status(500).json({
      error: "No se pudo analizar el documento de inventario.",
    });
  }
});

app.post("/api/inventory/documents/:id/ai-analyze", async (request, response) => {
  try {
    const documentId = String(request.params.id);
    const document = await getInventoryDocumentDetail(documentId);

    if (!document) {
      response.status(404).json({
        error: "Documento no encontrado.",
      });
      return;
    }

    // Buscar la última extracción con texto utilizable (TEXT u OCR).
    // Las extracciones vienen ordenadas por fecha de creación descendente.
    const textExtraction = document.extractions.find(
      (extraction) =>
        (extraction.extractionMethod === "TEXT" || extraction.extractionMethod === "OCR") &&
        (extraction.rawText ?? "").trim().length > 0,
    );

    if (!textExtraction?.rawText) {
      response.status(400).json({
        error:
          "El documento no tiene texto extraído. Ejecuta primero el análisis de texto del PDF antes del análisis IA.",
      });
      return;
    }

    const result = await analyzeDocumentText({
      text: textExtraction.rawText,
      context: {
        targetType: document.targetType,
        controlName: document.controlName,
        controlLocation: document.controlLocation,
        controlYear: document.controlYear,
        controlCategory: document.controlCategory,
      },
    });

    await addInventoryDocumentIssue({
      sourceDocumentId: documentId,
      severity: "INFO",
      issueType: "AI_ANALYSIS_EXECUTED",
      message: `Se ejecutó el análisis IA (${result.mode}). Generó candidatos preliminares para revisión humana; no se guardó nada en staging.`,
    });

    response.json(result);
  } catch (error) {
    if (error instanceof AiAnalysisError) {
      response.status(502).json({ error: error.message });
      return;
    }
    console.error("Error running AI analysis on inventory document", error);
    response.status(500).json({
      error: "No se pudo ejecutar el análisis IA del documento de inventario.",
    });
  }
});

app.post("/api/inventory/documents/:id/create-staging", async (request, response) => {
  try {
    const documentId = String(request.params.id);
    const document = await getInventoryDocumentDetail(documentId);

    if (!document) {
      response.status(404).json({
        error: "Documento no encontrado.",
      });
      return;
    }

    const textExtraction = document.extractions.find(
      (extraction) =>
        (extraction.extractionMethod === "TEXT" || extraction.extractionMethod === "OCR") &&
        (extraction.rawText ?? "").trim().length > 0,
    );

    if (!textExtraction?.rawText) {
      response.status(400).json({
        error:
          "El documento no tiene texto extraído. Ejecuta primero el análisis de texto del PDF antes de crear candidatos.",
      });
      return;
    }

    const existingStaging = await countInventoryDocumentStaging(documentId);

    if (existingStaging.total > 0) {
      response.status(409).json({
        error: "Ya existen candidatos revisables para este documento.",
      });
      return;
    }

    const analysis = await analyzeDocumentText({
      text: textExtraction.rawText,
      context: {
        targetType: document.targetType,
        controlName: document.controlName,
        controlLocation: document.controlLocation,
        controlYear: document.controlYear,
        controlCategory: document.controlCategory,
      },
    });

    const result = await createInventoryDocumentStaging(documentId, analysis, {
      targetType: document.targetType,
      controlName: document.controlName,
    });

    await addInventoryDocumentIssue({
      sourceDocumentId: documentId,
      severity: "INFO",
      issueType: "STAGING_CANDIDATES_CREATED",
      message: `Se crearon candidatos revisables: ${result.accommodations} alojamiento(s), ${result.rates} tarifa(s), ${result.adjustments} suplemento(s), ${result.policies} política(s), ${result.blackoutDates} fecha(s) especial(es) y ${result.activities} actividad(es). Pendientes de revisión humana; no se publicó nada.`,
    });

    for (const warning of result.warnings) {
      await addInventoryDocumentIssue({
        sourceDocumentId: documentId,
        severity: "WARNING",
        issueType: "STAGING_AMBIGUOUS_DATA",
        message: warning,
      });
    }

    // Reconciliar el estado del documento: al existir candidatos revisables y
    // texto extraído (TEXT/OCR), el documento debe quedar como pendiente de
    // revisión y con la extracción marcada como completada. No se publica nada.
    if (document.status !== "PUBLISHED") {
      await updateInventoryDocumentStatus(documentId, "PENDING_REVIEW", "EXTRACTED");
    }

    response.json(result);
  } catch (error) {
    if (error instanceof AiAnalysisError) {
      response.status(502).json({ error: error.message });
      return;
    }
    console.error("Error creating inventory document staging", error);
    response.status(500).json({
      error: "No se pudieron crear los candidatos revisables del documento.",
    });
  }
});

// Regenera los candidatos: descarta el staging existente del documento y lo
// vuelve a crear desde el análisis IA. Destructivo SOLO sobre staging (nunca
// sobre el inventario operativo). Se pierde la revisión manual previa.
app.post("/api/inventory/documents/:id/regenerate-staging", async (request, response) => {
  try {
    const documentId = String(request.params.id);
    const document = await getInventoryDocumentDetail(documentId);

    if (!document) {
      response.status(404).json({ error: "Documento no encontrado." });
      return;
    }

    const textExtraction = document.extractions.find(
      (extraction) =>
        (extraction.extractionMethod === "TEXT" || extraction.extractionMethod === "OCR") &&
        (extraction.rawText ?? "").trim().length > 0,
    );

    if (!textExtraction?.rawText) {
      response.status(400).json({
        error:
          "El documento no tiene texto extraído. Ejecuta primero el análisis de texto del PDF antes de regenerar candidatos.",
      });
      return;
    }

    await deleteInventoryDocumentStaging(documentId);

    const analysis = await analyzeDocumentText({
      text: textExtraction.rawText,
      context: {
        targetType: document.targetType,
        controlName: document.controlName,
        controlLocation: document.controlLocation,
        controlYear: document.controlYear,
        controlCategory: document.controlCategory,
      },
    });

    const result = await createInventoryDocumentStaging(documentId, analysis, {
      targetType: document.targetType,
      controlName: document.controlName,
    });

    await addInventoryDocumentIssue({
      sourceDocumentId: documentId,
      severity: "INFO",
      issueType: "STAGING_REGENERATED",
      message: `Se regeneraron los candidatos (se descartó la revisión previa): ${result.accommodations} alojamiento(s), ${result.rates} tarifa(s), ${result.adjustments} suplemento(s), ${result.policies} política(s) y ${result.activities} actividad(es).`,
    });

    if (document.status !== "PUBLISHED") {
      await updateInventoryDocumentStatus(documentId, "PENDING_REVIEW", "EXTRACTED");
    }

    response.json(result);
  } catch (error) {
    if (error instanceof AiAnalysisError) {
      response.status(502).json({ error: error.message });
      return;
    }
    console.error("Error regenerating inventory document staging", error);
    response.status(500).json({
      error: "No se pudieron regenerar los candidatos del documento.",
    });
  }
});

// Cambio de estado de revisión en lote para varios candidatos del mismo tipo.
app.patch("/api/inventory/staging/bulk", async (request, response) => {
  try {
    const body = (request.body ?? {}) as {
      entity?: unknown;
      ids?: unknown;
      reviewStatus?: unknown;
    };
    const entity = String(body.entity ?? "");
    const reviewStatus = String(body.reviewStatus ?? "");
    const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id)) : [];

    if (ids.length === 0) {
      response.status(400).json({ error: "No se indicaron candidatos a actualizar." });
      return;
    }

    const result = await bulkUpdateStagingReview(entity, ids, reviewStatus);
    response.json(result);
  } catch (error) {
    if (error instanceof StagingValidationError) {
      response.status(400).json({ error: error.message });
      return;
    }
    console.error("Error bulk-updating staging entities", error);
    response.status(500).json({ error: "No se pudo actualizar el estado de los candidatos." });
  }
});

app.patch("/api/inventory/staging/:entity/:id", async (request, response) => {
  try {
    const entity = String(request.params.entity);
    const id = String(request.params.id);
    const patch = (request.body ?? {}) as Record<string, unknown>;

    const updated = await updateStagingEntity(entity, id, patch);

    if (!updated) {
      response.status(404).json({
        error: "Candidato staging no encontrado.",
      });
      return;
    }

    response.json(updated);
  } catch (error) {
    if (error instanceof StagingValidationError) {
      response.status(400).json({
        error: error.message,
      });
      return;
    }

    console.error("Error updating staging entity", error);
    response.status(500).json({
      error: "No se pudo actualizar el candidato staging.",
    });
  }
});

// Trazabilidad (GET, solo lectura): registros del inventario operativo
// publicados actualmente desde este documento (por sourceDocumentId).
app.get("/api/inventory/documents/:id/published", async (request, response) => {
  try {
    const documentId = String(request.params.id);
    const document = await getInventoryDocumentDetail(documentId);

    if (!document) {
      response.status(404).json({
        error: "Documento no encontrado.",
      });
      return;
    }

    const result = await getPublishedInventoryByDocument(documentId);
    response.json(result);
  } catch (error) {
    console.error("Error fetching published inventory for document", error);
    response.status(500).json({
      error: "No se pudo obtener la trazabilidad de lo publicado.",
    });
  }
});

// Simulación de publicación (dry-run). Se usa GET porque NO muta estado: solo
// lee el staging y calcula qué se publicaría/omitiría. La publicación real es
// POST porque escribe en el inventario operativo.
app.get(
  "/api/inventory/documents/:id/publish-approved/dry-run",
  async (request, response) => {
    try {
      const documentId = String(request.params.id);
      const document = await getInventoryDocumentDetail(documentId);

      if (!document) {
        response.status(404).json({
          error: "Documento no encontrado.",
        });
        return;
      }

      const result = await dryRunPublishApprovedInventoryDocument(documentId, {
        controlLocation: document.controlLocation,
        controlYear: document.controlYear,
      });

      response.json(result);
    } catch (error) {
      console.error("Error running publish dry-run on inventory document", error);
      response.status(500).json({
        error: "No se pudo simular la publicación del documento.",
      });
    }
  },
);

app.post("/api/inventory/documents/:id/publish-approved", async (request, response) => {
  try {
    const documentId = String(request.params.id);
    const document = await getInventoryDocumentDetail(documentId);

    if (!document) {
      response.status(404).json({
        error: "Documento no encontrado.",
      });
      return;
    }

    const result = await publishApprovedInventoryDocument(documentId, {
      controlLocation: document.controlLocation,
      controlYear: document.controlYear,
    });

    // Marcar como publicado solo si la publicación terminó correctamente.
    await updateInventoryDocumentStatus(documentId, "PUBLISHED");

    await addInventoryDocumentIssue({
      sourceDocumentId: documentId,
      severity: "INFO",
      issueType: "PUBLISH_COMPLETED",
      message: `Publicación al inventario operativo: ${result.accommodations} alojamiento(s), ${result.accommodationRates} tarifa(s) de alojamiento, ${result.activities} actividad(es) y ${result.activityRates} tarifa(s) de actividad. Omitidos: ${result.skippedAccommodations} alojamiento(s), ${result.skippedRates} tarifa(s), ${result.skippedActivities} actividad(es), ${result.skippedActivityRates} tarifa(s) de actividad.`,
    });

    for (const warning of result.warnings) {
      await addInventoryDocumentIssue({
        sourceDocumentId: documentId,
        severity: "WARNING",
        issueType: "PUBLISH_WARNING",
        message: warning,
      });
    }

    response.json(result);
  } catch (error) {
    if (error instanceof PublishValidationError) {
      response.status(400).json({
        error: error.message,
      });
      return;
    }

    console.error("Error publishing approved inventory document", error);
    response.status(500).json({
      error: "No se pudo publicar el documento al inventario operativo.",
    });
  }
});

// Simulación de retirada (GET, solo lectura): cuántos registros operativos se
// eliminarían del inventario para este documento. No borra nada.
app.get("/api/inventory/documents/:id/unpublish/dry-run", async (request, response) => {
  try {
    const documentId = String(request.params.id);
    const document = await getInventoryDocumentDetail(documentId);

    if (!document) {
      response.status(404).json({
        error: "Documento no encontrado.",
      });
      return;
    }

    const result = await dryRunUnpublishInventoryDocument(documentId);
    response.json(result);
  } catch (error) {
    console.error("Error running unpublish dry-run on inventory document", error);
    response.status(500).json({
      error: "No se pudo simular la retirada de la publicación.",
    });
  }
});

// Retirada real (POST, escribe/borra): elimina del inventario operativo lo
// publicado desde este documento (idempotente, solo por sourceDocumentId).
app.post("/api/inventory/documents/:id/unpublish", async (request, response) => {
  try {
    const documentId = String(request.params.id);
    const document = await getInventoryDocumentDetail(documentId);

    if (!document) {
      response.status(404).json({
        error: "Documento no encontrado.",
      });
      return;
    }

    const result = await unpublishInventoryDocument(documentId);

    // Si el documento estaba marcado como publicado, revertir a pendiente de
    // revisión (los candidatos staging se conservan tal cual).
    if (document.status === "PUBLISHED") {
      await updateInventoryDocumentStatus(documentId, "PENDING_REVIEW");
    }

    await addInventoryDocumentIssue({
      sourceDocumentId: documentId,
      severity: "INFO",
      issueType: "UNPUBLISH_COMPLETED",
      message: `Retirada del inventario operativo: ${result.accommodationsRemoved} alojamiento(s), ${result.accommodationRatesRemoved} tarifa(s) de alojamiento, ${result.activitiesRemoved} actividad(es) y ${result.activityRatesRemoved} tarifa(s) de actividad. Los candidatos staging se conservan.`,
    });

    response.json(result);
  } catch (error) {
    console.error("Error unpublishing inventory document", error);
    response.status(500).json({
      error: "No se pudo retirar la publicación del documento.",
    });
  }
});

// Simulación de borrado de un documento (GET, solo lectura): cuántos candidatos
// staging se quitarían y si está bloqueado por tener registros publicados.
app.get("/api/inventory/documents/:id/delete/dry-run", async (request, response) => {
  try {
    const documentId = String(request.params.id);
    const document = await getInventoryDocumentDetail(documentId);

    if (!document) {
      response.status(404).json({ error: "Documento no encontrado." });
      return;
    }

    const result = await dryRunDeleteInventoryDocument(documentId);
    response.json(result);
  } catch (error) {
    console.error("Error running delete dry-run on inventory document", error);
    response.status(500).json({ error: "No se pudo simular el borrado del documento." });
  }
});

// Borrado real del documento (DELETE). Bloqueado si tiene registros publicados:
// primero hay que retirarlos. No toca el inventario operativo ni datos de Excel.
app.delete("/api/inventory/documents/:id", async (request, response) => {
  try {
    const documentId = String(request.params.id);
    const document = await getInventoryDocumentDetail(documentId);

    if (!document) {
      response.status(404).json({ error: "Documento no encontrado." });
      return;
    }

    const result = await deleteInventoryDocument(documentId);
    response.json(result);
  } catch (error) {
    if (error instanceof DeleteDocumentValidationError) {
      response.status(409).json({ error: error.message });
      return;
    }
    console.error("Error deleting inventory document", error);
    response.status(500).json({ error: "No se pudo borrar el documento." });
  }
});

// Catálogo global del inventario operativo publicado (todos los documentos, e
// incluso filas de Excel), con el documento de origen resuelto. Solo lectura.
app.get("/api/inventory/catalog", async (_request, response) => {
  try {
    const result = await getPublishedInventoryCatalog();
    response.json(result);
  } catch (error) {
    console.error("Error fetching published inventory catalog", error);
    response.status(500).json({ error: "No se pudo obtener el catálogo del inventario." });
  }
});

// Retirada granular (DELETE): quita del inventario operativo un registro
// publicado concreto (alojamiento/actividad completo o una tarifa). El resto del
// inventario y los candidatos staging se conservan.
app.delete("/api/inventory/published/:kind/:id", async (request, response) => {
  try {
    const kind = String(request.params.kind);
    const id = String(request.params.id);
    const validKinds = ["accommodation", "activity", "accommodation-rate", "activity-rate"];

    if (!validKinds.includes(kind)) {
      response.status(400).json({ error: "Tipo de registro publicado no válido." });
      return;
    }

    const result = await unpublishPublishedItem(
      kind as "accommodation" | "activity" | "accommodation-rate" | "activity-rate",
      id,
    );

    if (!result) {
      response.status(404).json({ error: "El registro publicado no existe o ya fue retirado." });
      return;
    }

    response.json(result);
  } catch (error) {
    console.error("Error unpublishing single inventory item", error);
    response.status(500).json({ error: "No se pudo retirar el registro del inventario." });
  }
});

app.listen(port, () => {
  console.log(`Viajes Velero API escuchando en http://localhost:${port}`);
});