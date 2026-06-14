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
import {
  approveTripProposalDb,
  findClientByEmailDb,
  getClientTripRequestsDb,
  saveTripProposalDb,
  saveTripRequestDb,
  upsertClientFromIntakeDb,
} from "./commercialDb";
import { saveInventoryDocumentFile } from "./documentStorage";
import {
  type AuthedRequest,
  createUser,
  ensureAdminFromEnv,
  listAuditLog,
  listUsers,
  login as authLogin,
  logout as authLogout,
  requireAuth,
  requireRole,
  updateUser,
  writeAudit,
} from "./auth";
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

// ── Control de acceso por rol (RBAC). El backend es la fuente de verdad ──────
// /api/auth/* y /api/health quedan públicos (login). Todo lo demás exige sesión;
// el módulo documental (/api/inventory) es solo para ADMIN.
app.use("/api/inventory", requireAuth, requireRole("ADMIN"));
app.use("/api/commercial", requireAuth);
app.use("/api/search", requireAuth);
app.use("/api/crm", requireAuth);

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
    await writeAudit({
      user: (request as AuthedRequest).user,
      action: "CRM_OPPORTUNITY_CREATE",
      entity: "crm",
      detail: payload.contact?.email ?? payload.opportunity?.opportunity_name ?? null,
    });
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

    // Si el análisis corrió en modo mock (sin clave de IA real), dejarlo visible
    // como incidencia: los candidatos son de ejemplo, no del documento.
    if (analysis.mode === "mock") {
      await addInventoryDocumentIssue({
        sourceDocumentId: documentId,
        severity: "WARNING",
        issueType: "AI_MOCK_MODE",
        message:
          "El análisis IA corrió en modo MOCK (no se usó IA real): falta configurar la clave del proveedor (p. ej. ANTHROPIC_API_KEY). Los candidatos generados son de ejemplo y no reflejan el documento.",
      });
    }

    // Reconciliar el estado del documento: al existir candidatos revisables y
    // texto extraído (TEXT/OCR), el documento debe quedar como pendiente de
    // revisión y con la extracción marcada como completada. No se publica nada.
    if (document.status !== "PUBLISHED") {
      await updateInventoryDocumentStatus(documentId, "PENDING_REVIEW", "EXTRACTED");
    }

    response.json({ ...result, aiMode: analysis.mode });
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

    await writeAudit({
      user: (request as AuthedRequest).user,
      action: "INVENTORY_PUBLISH",
      entity: "document",
      detail: `${document.controlName}: ${result.accommodations} aloj., ${result.activities} act.`,
    });
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

    await writeAudit({
      user: (request as AuthedRequest).user,
      action: "INVENTORY_UNPUBLISH",
      entity: "document",
      detail: document.controlName,
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
    await writeAudit({
      user: (request as AuthedRequest).user,
      action: "INVENTORY_DELETE_DOCUMENT",
      entity: "document",
      detail: document.controlName,
    });
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

// ─── Flujo comercial (Nuevo/Existente): persistencia real en BD ─────────────

// Buscar cliente por email (para detectar cliente recurrente / validación).
app.get("/api/commercial/clients", async (request, response) => {
  try {
    const email = String(request.query.email ?? "").trim();
    if (!email) {
      response.status(400).json({ error: "Falta el email." });
      return;
    }
    const client = await findClientByEmailDb(email);
    response.json({ client });
  } catch (error) {
    console.error("Error finding client by email", error);
    response.status(500).json({ error: "No se pudo buscar el cliente." });
  }
});

// Crear/actualizar cliente por email (upsert).
app.post("/api/commercial/clients", async (request, response) => {
  try {
    const body = (request.body ?? {}) as {
      email?: string;
      firstName?: string;
      lastName?: string;
      clientType?: "new" | "existing";
    };
    if (!body.email?.trim()) {
      response.status(400).json({ error: "El email es obligatorio." });
      return;
    }
    const client = await upsertClientFromIntakeDb({
      email: body.email.trim(),
      firstName: (body.firstName ?? "").trim(),
      lastName: (body.lastName ?? "").trim(),
      clientType: body.clientType === "existing" ? "existing" : "new",
    });
    response.json(client);
  } catch (error) {
    console.error("Error upserting client", error);
    response.status(500).json({ error: "No se pudo guardar el cliente." });
  }
});

// Solicitudes previas de un cliente (oportunidades candidatas).
app.get("/api/commercial/clients/:id/trip-requests", async (request, response) => {
  try {
    const requests = await getClientTripRequestsDb(String(request.params.id));
    response.json({ requests });
  } catch (error) {
    console.error("Error listing client trip requests", error);
    response.status(500).json({ error: "No se pudieron cargar las solicitudes del cliente." });
  }
});

// Guardar una solicitud de viaje normalizada.
app.post("/api/commercial/trip-requests", async (request, response) => {
  try {
    const body = (request.body ?? {}) as { clientId?: string; originalMessage?: string };
    if (!body.clientId || !body.originalMessage) {
      response.status(400).json({ error: "Faltan datos de la solicitud (clientId/mensaje)." });
      return;
    }
    const saved = await saveTripRequestDb(request.body as never);
    response.json(saved);
  } catch (error) {
    console.error("Error saving trip request", error);
    response.status(500).json({ error: "No se pudo guardar la solicitud." });
  }
});

// Guardar una propuesta con sus opciones.
app.post("/api/commercial/proposals", async (request, response) => {
  try {
    const body = (request.body ?? {}) as { tripRequestId?: string };
    if (!body.tripRequestId) {
      response.status(400).json({ error: "Falta tripRequestId." });
      return;
    }
    const saved = await saveTripProposalDb(request.body as never);
    response.json(saved);
  } catch (error) {
    console.error("Error saving trip proposal", error);
    response.status(500).json({ error: "No se pudo guardar la propuesta." });
  }
});

// Aprobar una propuesta y fijar la opción elegida.
app.post("/api/commercial/proposals/:id/approve", async (request, response) => {
  try {
    const body = (request.body ?? {}) as { approvedOptionNumber?: number };
    if (!body.approvedOptionNumber) {
      response.status(400).json({ error: "Falta approvedOptionNumber." });
      return;
    }
    const updated = await approveTripProposalDb(String(request.params.id), body.approvedOptionNumber);
    if (!updated) {
      response.status(404).json({ error: "Propuesta no encontrada." });
      return;
    }
    response.json(updated);
  } catch (error) {
    console.error("Error approving trip proposal", error);
    response.status(500).json({ error: "No se pudo aprobar la propuesta." });
  }
});

// ── Autenticación ────────────────────────────────────────────────────────────

app.post("/api/auth/login", async (request, response) => {
  try {
    const body = (request.body ?? {}) as { email?: string; password?: string };
    if (!body.email || !body.password) {
      response.status(400).json({ error: "Email y contraseña son obligatorios." });
      return;
    }
    const result = await authLogin(body.email, body.password);
    if (!result) {
      response.status(401).json({ error: "Credenciales no válidas." });
      return;
    }
    await writeAudit({ user: result.user, action: "LOGIN", entity: "auth" });
    response.json(result);
  } catch (error) {
    console.error("Error en login", error);
    response.status(500).json({ error: "No se pudo iniciar sesión." });
  }
});

app.post("/api/auth/logout", requireAuth, async (request, response) => {
  const req = request as AuthedRequest;
  try {
    if (req.authToken) await authLogout(req.authToken);
    await writeAudit({ user: req.user, action: "LOGOUT", entity: "auth" });
    response.json({ ok: true });
  } catch (error) {
    console.error("Error en logout", error);
    response.status(500).json({ error: "No se pudo cerrar sesión." });
  }
});

app.get("/api/auth/me", requireAuth, (request, response) => {
  response.json({ user: (request as AuthedRequest).user });
});

// Gestión de usuarios (solo ADMIN).
app.get("/api/auth/users", requireAuth, requireRole("ADMIN"), async (_request, response) => {
  try {
    response.json({ users: await listUsers() });
  } catch (error) {
    console.error("Error listando usuarios", error);
    response.status(500).json({ error: "No se pudieron cargar los usuarios." });
  }
});

app.post("/api/auth/users", requireAuth, requireRole("ADMIN"), async (request, response) => {
  const req = request as AuthedRequest;
  try {
    const body = (request.body ?? {}) as {
      email?: string;
      name?: string;
      password?: string;
      role?: "ADMIN" | "USER";
    };
    if (!body.email?.trim() || !body.password) {
      response.status(400).json({ error: "Email y contraseña son obligatorios." });
      return;
    }
    if (body.password.length < 8) {
      response.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
      return;
    }
    const role = body.role === "ADMIN" ? "ADMIN" : "USER";
    const user = await createUser({
      email: body.email,
      name: body.name ?? null,
      password: body.password,
      role,
    });
    await writeAudit({
      user: req.user,
      action: "USER_CREATE",
      entity: "user",
      detail: `${user.email} (${role})`,
    });
    response.json(user);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      response.status(409).json({ error: "Ya existe un usuario con ese email." });
      return;
    }
    console.error("Error creando usuario", error);
    response.status(500).json({ error: "No se pudo crear el usuario." });
  }
});

app.patch("/api/auth/users/:id", requireAuth, requireRole("ADMIN"), async (request, response) => {
  const req = request as AuthedRequest;
  try {
    const id = String(request.params.id);
    const body = (request.body ?? {}) as {
      name?: string;
      role?: "ADMIN" | "USER";
      isActive?: boolean;
      password?: string;
    };
    // Evitar que el admin se desactive o se quite el rol a sí mismo (lockout).
    if (id === req.user?.id && (body.isActive === false || body.role === "USER")) {
      response.status(400).json({ error: "No puedes quitarte el acceso de administrador a ti mismo." });
      return;
    }
    if (body.password && body.password.length < 8) {
      response.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
      return;
    }
    const user = await updateUser(id, body);
    if (!user) {
      response.status(404).json({ error: "Usuario no encontrado." });
      return;
    }
    await writeAudit({ user: req.user, action: "USER_UPDATE", entity: "user", detail: user.email });
    response.json(user);
  } catch (error) {
    console.error("Error actualizando usuario", error);
    response.status(500).json({ error: "No se pudo actualizar el usuario." });
  }
});

// Registro de auditoría (solo ADMIN).
app.get("/api/audit", requireAuth, requireRole("ADMIN"), async (request, response) => {
  try {
    const limit = Number(request.query.limit ?? 200);
    response.json({ entries: await listAuditLog(Number.isFinite(limit) ? limit : 200) });
  } catch (error) {
    console.error("Error listando auditoría", error);
    response.status(500).json({ error: "No se pudo cargar la auditoría." });
  }
});

app.listen(port, async () => {
  await ensureAdminFromEnv();
  console.log(`Viajes Velero API escuchando en http://localhost:${port}`);
});