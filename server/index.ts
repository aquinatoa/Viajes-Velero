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
  getZohoDealStages,
  listZohoDeals,
  searchZohoOpportunitiesByEmail,
  updateZohoDeal,
  ZohoReauthRequiredError,
} from "./zoho";
import { searchAccommodationsDb, searchActivitiesDb } from "./searchDb";
import fs from "node:fs";
import path from "node:path";
import { applyChange, previewChange, type DatosLeidos } from "./proposalChanges";
import {
  DEPOSIT_PERCENT,
  chooseOption,
  getDelivery,
  listDeliveries,
  prepareDelivery,
  readPublicProposal,
  sendDelivery,
} from "./proposalDelivery";
import {
  addInventoryDocumentExtraction,
  addInventoryDocumentIssue,
  attachInventoryDocumentFile,
  countInventoryDocumentStaging,
  bulkUpdateStagingReview,
  confirmAccommodationAssignmentDb,
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
import { toRateKind } from "./pricing";
import { updateInventoryDocumentAiUsage } from "./documentImportDb";
import {
  approveTripProposalDb,
  ensureTripRequestDealDb,
  findClientByEmailDb,
  getClientTripRequestsDb,
  type SaveTripRequestInput,
  saveTripProposalDb,
  saveTripRequestDb,
  upsertClientFromIntakeDb,
} from "./commercialDb";
import { saveInventoryDocumentFile } from "./documentStorage";
import {
  type AuthedRequest,
  changeOwnPassword,
  createUser,
  ensureAdminFromEnv,
  listAuditLog,
  listUsers,
  login as authLogin,
  logout as authLogout,
  requireAuth,
  requireRole,
  tripRequestVisibilityWhere,
  updateUser,
  writeAudit,
} from "./auth";
import { extractPdfText } from "./pdfTextExtraction";
import { analyzeDocumentText, AiAnalysisError } from "./aiDocumentAnalysis";
import {
  parseBody,
  loginSchema,
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
} from "./validation";

const app = express();
// Puerto de la API. Deliberadamente API_PORT y no PORT: `npm run dev` levanta
// API y Vite con el mismo entorno, y muchas herramientas definen PORT por su
// cuenta, con lo que ambos procesos pelearian por el mismo puerto.
const port = Number(process.env.API_PORT ?? 8787);

/**
 * Recupera los acentos del nombre de un fichero subido.
 *
 * multer decodifica el nombre como latin-1, así que un PDF llamado
 * "GENÉRICO.pdf" llega como "GENÃ‰RICO.pdf". Se vuelve a leer como UTF-8; si el
 * resultado no es válido (un nombre que sí era latin-1 de verdad), se deja como
 * estaba en vez de estropearlo más.
 */
/** Guarda el consumo de IA de la última lectura del documento. */
async function recordAiUsage(
  documentId: string,
  usage: { inputTokens: number; outputTokens: number; model: string },
) {
  try {
    await updateInventoryDocumentAiUsage(documentId, usage);
  } catch (error) {
    // Que no se pueda anotar el consumo no debe tumbar una lectura correcta.
    console.error("No se pudo registrar el consumo de IA", error);
  }
}

function decodeFileName(name: string): string {
  try {
    const recuperado = Buffer.from(name, "latin1").toString("utf8");
    return recuperado.includes("�") ? name : recuperado;
  } catch {
    return name;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

// Detras de nginx el front y la API comparten origen, asi que no hay preflight
// que atender. CORS_ORIGINS (lista separada por comas) queda para cuando la
// API se sirva desde otro dominio; por defecto, los origenes de desarrollo.
const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:5174")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins,
  }),
);

app.use(express.json());

// ── Control de acceso por rol (RBAC). El backend es la fuente de verdad ──────
// /api/auth/* y /api/health quedan públicos (login). Todo lo demás exige sesión;
// el módulo documental (/api/inventory) es para administradores (global o de
// departamento); el rol Cotizador (QUOTER) no gestiona el catálogo de tarifas.
app.use("/api/inventory", requireAuth, requireRole("ADMIN", "DEPT_ADMIN"));
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
      /**
       * Solicitud de la que nace el trato. Si viene, el trato se crea UNA sola
       * vez por solicitud: reintentar el cierre devuelve el que ya existe en vez
       * de duplicarlo en el CRM del cliente.
       */
      tripRequestId?: string;
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

    const result = payload.tripRequestId
      ? await ensureTripRequestDealDb(payload.tripRequestId, () => createZohoOpportunity(payload))
      : { ...(await createZohoOpportunity(payload)), reused: false };

    // Solo se audita lo que de verdad ha entrado en Zoho.
    if (!result.reused) {
      await writeAudit({
        user: (request as AuthedRequest).user,
        action: "CRM_OPPORTUNITY_CREATE",
        entity: "crm",
        detail: payload.contact?.email ?? payload.opportunity?.opportunity_name ?? null,
      });
    }
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

// Confirmar solicitud: listar todos los tratos del CRM.
app.get("/api/crm/opportunities", async (_request, response) => {
  try {
    const deals = await listZohoDeals();
    response.json({ deals });
  } catch (error) {
    crmErrorResponse(error, response, "No se pudieron listar los tratos de Zoho.");
  }
});

// Fases válidas del pipeline (para el desplegable de avance de fase).
app.get("/api/crm/deal-stages", async (_request, response) => {
  try {
    const stages = await getZohoDealStages();
    response.json({ stages });
  } catch (error) {
    crmErrorResponse(error, response, "No se pudieron obtener las fases de Zoho.");
  }
});

// Confirmar/actualizar un trato (fase, opción elegida y/o nota).
app.post("/api/crm/opportunities/:id/update", async (request, response) => {
  try {
    const body = request.body as { stage?: string; chosenOption?: number | null; note?: string };
    const noteDate = new Date().toISOString().slice(0, 10);
    const result = await updateZohoDeal({
      dealId: request.params.id,
      stage: body.stage,
      chosenOption: body.chosenOption,
      note: body.note,
      noteDate,
    });
    await writeAudit({
      user: (request as AuthedRequest).user,
      action: "CRM_OPPORTUNITY_UPDATE",
      entity: "crm",
      detail: request.params.id,
    });
    response.json(result);
  } catch (error) {
    crmErrorResponse(error, response, "No se pudo actualizar el trato en Zoho.");
  }
});

/**
 * Comprueba que la declaración de precios del documento es coherente. Devuelve
 * el mensaje de error, o null si está bien.
 *
 * Se valida en el servidor y no solo en la pantalla porque de esto depende que
 * una tarifa se publique con margen o sin él.
 */
function validateRateDeclaration(payload: {
  rateKind?: string;
  marginPercent?: number | null;
  clientSegment?: string | null;
}): string | null {
  const { rateKind, marginPercent, clientSegment } = payload;

  if (rateKind !== undefined && !["PURCHASE", "SALE", "UNKNOWN"].includes(rateKind)) {
    return "El tipo de precios debe ser de compra o de venta.";
  }
  if (rateKind === "PURCHASE" && clientSegment) {
    return "Un documento de compra no lleva tipo de cliente: el cliente se elige al cotizar.";
  }
  if (rateKind === "SALE" && marginPercent !== undefined && marginPercent !== null) {
    return "Un documento de venta no lleva margen: sus precios se guardan tal cual.";
  }
  if (
    marginPercent !== undefined &&
    marginPercent !== null &&
    (!Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent > 100)
  ) {
    return "El margen tiene que ser un porcentaje entre 0 y 100.";
  }
  if (clientSegment && !["GENERIC", "SWISS_TTOO"].includes(clientSegment)) {
    return "El tipo de cliente no es uno de los conocidos.";
  }
  return null;
}

app.post("/api/inventory/documents", async (request, response) => {
  try {
    const payload = request.body as {
      targetType?: "ACCOMMODATION" | "ACTIVITY" | "MIXED" | "UNKNOWN";
      controlName?: string;
      controlLocation?: string;
      controlYear?: number | null;
      controlCategory?: string;
      controlNotes?: string;
      rateKind?: string;
      marginPercent?: number | null;
      clientSegment?: string | null;
    };

    if (!payload.controlName?.trim()) {
      response.status(400).json({
        error: "Falta el nombre de control del documento.",
      });
      return;
    }

    const rateKindError = validateRateDeclaration(payload);
    if (rateKindError) {
      response.status(400).json({ error: rateKindError });
      return;
    }

    const document = await createInventoryDocument({
      targetType: payload.targetType ?? "UNKNOWN",
      controlName: payload.controlName.trim(),
      controlLocation: payload.controlLocation,
      controlYear: payload.controlYear,
      controlCategory: payload.controlCategory,
      controlNotes: payload.controlNotes,
      rateKind: payload.rateKind,
      marginPercent: payload.marginPercent,
      clientSegment: payload.clientSegment,
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
      rateKind?: string;
      marginPercent?: number | null;
      clientSegment?: string | null;
    };

    if (payload.controlName !== undefined && !payload.controlName.trim()) {
      response.status(400).json({ error: "El nombre de control no puede quedar vacío." });
      return;
    }

    const rateKindError = validateRateDeclaration(payload);
    if (rateKindError) {
      response.status(400).json({ error: rateKindError });
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
        // multer entrega el nombre del fichero interpretado como latin-1, así
        // que "GENÉRICO.pdf" llegaba como "GENÃ‰RICO.pdf". Se devuelve a UTF-8.
        originalFileName: decodeFileName(request.file.originalname),
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
    // Registrar lo que costó esta lectura. Es la única forma de saber cuánto
    // cuesta cargar una temporada entera.
    if (result?.usage) {
      await recordAiUsage(documentId, result.usage);
    }


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
    // Registrar lo que costó esta lectura. Es la única forma de saber cuánto
    // cuesta cargar una temporada entera.
    if (analysis?.usage) {
      await recordAiUsage(documentId, analysis.usage);
    }


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
    // Registrar lo que costó esta lectura. Es la única forma de saber cuánto
    // cuesta cargar una temporada entera.
    if (analysis?.usage) {
      await recordAiUsage(documentId, analysis.usage);
    }


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

// Firmar el reparto: "estas tarifas son de este alojamiento". Es requisito para
// publicar cuando el documento trae varios (ver `buildPublishPlan`).
app.post("/api/inventory/documents/:id/confirm-assignment", async (request, response) => {
  try {
    const body = (request.body ?? {}) as { accommodationIds?: unknown };
    const ids = Array.isArray(body.accommodationIds)
      ? body.accommodationIds.map((value) => String(value)).filter(Boolean)
      : [];
    if (ids.length === 0) {
      response.status(400).json({ error: "No se indicó qué alojamiento confirmar." });
      return;
    }

    const result = await confirmAccommodationAssignmentDb(String(request.params.id), ids);
    await writeAudit({
      user: (request as AuthedRequest).user,
      action: "INVENTORY_ASSIGNMENT_CONFIRM",
      entity: "inventory",
      detail: `${result.confirmed} alojamiento(s) del documento ${request.params.id}`,
    });
    response.json(result);
  } catch (error) {
    console.error("Error confirming accommodation assignment", error);
    response.status(500).json({ error: "No se pudo confirmar el reparto." });
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
        rateKind: toRateKind(document.rateKind),
        marginPercent: document.marginPercent === null ? null : Number(document.marginPercent),
        clientSegment: document.clientSegment,
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
      rateKind: toRateKind(document.rateKind),
      marginPercent: document.marginPercent === null ? null : Number(document.marginPercent),
      clientSegment: document.clientSegment,
    });

    // Un documento solo queda "Publicado" si algo llegó de verdad al catálogo.
    // Antes se marcaba siempre: se aprobaban 40 tarifas, no entraba ninguna y
    // la pantalla decía "Publicado" igual. Si no entró nada, se queda en
    // revisión para que se pueda arreglar y volver a intentar.
    const publishedSomething =
      result.accommodations > 0 ||
      result.accommodationRates > 0 ||
      result.activities > 0 ||
      result.activityRates > 0;

    await updateInventoryDocumentStatus(
      documentId,
      publishedSomething ? "PUBLISHED" : "PENDING_REVIEW",
    );

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
    const req = request as AuthedRequest;
    const where = req.user ? tripRequestVisibilityWhere(req.user) : {};
    const requests = await getClientTripRequestsDb(String(request.params.id), where);
    response.json({ requests });
  } catch (error) {
    console.error("Error listing client trip requests", error);
    response.status(500).json({ error: "No se pudieron cargar las solicitudes del cliente." });
  }
});

// Guardar una solicitud de viaje normalizada.
app.post("/api/commercial/trip-requests", async (request, response) => {
  try {
    const req = request as AuthedRequest;
    const body = (request.body ?? {}) as {
      clientId?: string;
      originalMessage?: string;
      department?: "GROUPS" | "SPORTS" | null;
    };
    if (!body.clientId || !body.originalMessage) {
      response.status(400).json({ error: "Faltan datos de la solicitud (clientId/mensaje)." });
      return;
    }
    // El dueño es SIEMPRE el usuario autenticado (fuente de verdad, no el body);
    // el departamento se toma del body o, si no, del departamento del usuario.
    const saved = await saveTripRequestDb({
      ...(request.body as SaveTripRequestInput),
      ownerUserId: req.user?.id ?? null,
      department: body.department ?? req.user?.department ?? null,
    });
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
    const body = parseBody(loginSchema, request, response);
    if (!body) return;
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

// Cambio de la propia contraseña (cualquier usuario autenticado).
app.post("/api/auth/change-password", requireAuth, async (request, response) => {
  const req = request as AuthedRequest;
  try {
    const body = parseBody(changePasswordSchema, request, response);
    if (!body) return;
    if (!req.user) {
      response.status(401).json({ error: "No autenticado." });
      return;
    }
    const result = await changeOwnPassword(
      req.user.id,
      body.currentPassword,
      body.newPassword,
      req.authToken,
    );
    if (!result.ok) {
      if (result.reason === "bad_current") {
        response.status(400).json({ error: "La contraseña actual no es correcta." });
        return;
      }
      response.status(404).json({ error: "Usuario no encontrado." });
      return;
    }
    await writeAudit({ user: req.user, action: "PASSWORD_CHANGE", entity: "auth" });
    response.json({ ok: true });
  } catch (error) {
    console.error("Error cambiando contraseña", error);
    response.status(500).json({ error: "No se pudo cambiar la contraseña." });
  }
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
    const body = parseBody(createUserSchema, request, response);
    if (!body) return;
    const role = body.role ?? "USER";
    // Un admin de departamento debe llevar su departamento; los roles globales no.
    const department =
      role === "DEPT_ADMIN" || role === "QUOTER" ? body.department ?? null : null;
    const user = await createUser({
      email: body.email,
      name: body.name ?? null,
      password: body.password,
      role,
      department,
    });
    await writeAudit({
      user: req.user,
      action: "USER_CREATE",
      entity: "user",
      detail: `${user.email} (${role}${department ? `/${department}` : ""})`,
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
    const body = parseBody(updateUserSchema, request, response);
    if (!body) return;
    // Evitar que el admin global se desactive o se degrade a sí mismo (lockout).
    if (id === req.user?.id && (body.isActive === false || (body.role && body.role !== "ADMIN"))) {
      response.status(400).json({ error: "No puedes quitarte el acceso de administrador a ti mismo." });
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

// ── Envío de propuestas al cliente ──────────────────────────────────────────
// Preparar deja la entrega lista con su PDF y su referencia, sin que salga
// nada; enviar es lo que la pone en el buzón. Se separan porque el cotizador
// querrá revisar el PDF antes de que llegue al colegio.

app.post("/api/proposals/:id/prepare-delivery", requireAuth, async (request, response) => {
  try {
    const body = request.body as { recipientEmail?: string; recipientName?: string };
    const result = await prepareDelivery({
      proposalId: String(request.params.id),
      recipientEmail: body?.recipientEmail,
      recipientName: body?.recipientName,
      sentByUserId: (request as AuthedRequest).user?.id,
    });
    await writeAudit({
      user: (request as AuthedRequest).user,
      action: "PROPOSAL_DELIVERY_PREPARE",
      entity: "proposal",
      detail: result.reference,
    });
    response.json(result);
  } catch (error) {
    console.error("Error preparando la entrega", error);
    response.status(400).json({
      error: error instanceof Error ? error.message : "No se pudo preparar la propuesta.",
    });
  }
});

app.post("/api/deliveries/:id/send", requireAuth, async (request, response) => {
  try {
    const result = await sendDelivery(String(request.params.id));
    await writeAudit({
      user: (request as AuthedRequest).user,
      action: result.simulated ? "PROPOSAL_DELIVERY_SIMULATED" : "PROPOSAL_DELIVERY_SENT",
      entity: "proposal",
      detail: `${result.reference} -> ${result.recipientEmail}`,
    });
    response.json(result);
  } catch (error) {
    console.error("Error enviando la propuesta", error);
    response.status(400).json({
      error: error instanceof Error ? error.message : "No se pudo enviar la propuesta.",
    });
  }
});

// El documento tal como lo recibirá el colegio. Sirve para revisarlo ANTES de
// enviarlo: preparar y enviar son dos gestos distintos a propósito.
app.get("/api/deliveries/:id/pdf", requireAuth, async (request, response) => {
  try {
    const delivery = await getDelivery(String(request.params.id));
    if (!delivery?.pdfPath) {
      response.status(404).json({ error: "Esa propuesta no tiene documento generado." });
      return;
    }
    const absoluto = path.resolve(process.cwd(), delivery.pdfPath);
    if (!fs.existsSync(absoluto)) {
      response.status(404).json({ error: "El documento ya no está en el servidor." });
      return;
    }
    response.type("application/pdf");
    response.setHeader("Content-Disposition", `inline; filename="Propuesta-${delivery.reference}.pdf"`);
    fs.createReadStream(absoluto).pipe(response);
  } catch (error) {
    console.error("Error sirviendo el documento", error);
    response.status(500).json({ error: "No se pudo abrir el documento." });
  }
});

app.get("/api/deliveries", requireAuth, async (request, response) => {
  try {
    const user = (request as AuthedRequest).user;
    // Un administrador de departamento solo ve lo suyo; los globales, todo.
    const department = user?.role === "DEPT_ADMIN" ? user.department : null;
    response.json({ deliveries: await listDeliveries({ department }) });
  } catch (error) {
    console.error("Error listando entregas", error);
    response.status(500).json({ error: "No se pudieron cargar las propuestas enviadas." });
  }
});

// ── Página pública de la propuesta ──────────────────────────────────────────
// SIN sesión: entra el colegio con el enlace del correo. La única protección es
// que el token es largo y aleatorio, así que aquí no se expone nada que no
// estuviera ya en el PDF que el cliente tiene en su bandeja. Nunca datos de
// alumnos. Se monta fuera de /api para que la ruta del enlace sea corta.

app.get("/api/public/proposals/:token", async (request, response) => {
  try {
    const delivery = await readPublicProposal(String(request.params.token));
    if (!delivery) {
      response.status(404).json({ error: "Esta propuesta ya no está disponible." });
      return;
    }
    const request_ = delivery.proposal.tripRequest;
    response.json({
      reference: delivery.reference,
      department: delivery.department,
      tripTitle: request_.opportunityName ?? request_.destinationText ?? "Vuestro viaje",
      destination: request_.destinationText,
      dateFrom: request_.dateFrom,
      dateTo: request_.dateTo,
      participants: request_.participants,
      teachers: request_.teachers,
      chosenOptionNumber: delivery.chosenOptionNumber,
      depositDueAt: delivery.depositDueAt,
      options: delivery.proposal.accommodationOptions.map((option) => ({
        optionNumber: option.optionNumber,
        accommodationName: option.accommodationNameSnapshot,
        boardType: option.boardType,
        nights: option.nights,
        totalPvpText: option.totalPvpText,
        priceBreakdownText: option.priceBreakdownText,
        conditionsText: option.conditionsText,
      })),
    });
  } catch (error) {
    console.error("Error abriendo la propuesta pública", error);
    response.status(500).json({ error: "No se pudo abrir la propuesta." });
  }
});

app.post("/api/public/proposals/:token/choose", async (request, response) => {
  try {
    const optionNumber = Number((request.body as { optionNumber?: number })?.optionNumber);
    if (!Number.isFinite(optionNumber)) {
      response.status(400).json({ error: "Falta indicar la opción elegida." });
      return;
    }
    const delivery = await chooseOption(String(request.params.token), optionNumber);
    if (!delivery) {
      response.status(404).json({ error: "Esta propuesta ya no está disponible." });
      return;
    }
    response.json({
      reference: delivery.reference,
      chosenOptionNumber: delivery.chosenOptionNumber,
      chosenAt: delivery.chosenAt,
      depositDueAt: delivery.depositDueAt,
      depositPercent: DEPOSIT_PERCENT,
    });
  } catch (error) {
    console.error("Error registrando la opción elegida", error);
    response.status(500).json({ error: "No se pudo registrar la elección." });
  }
});


// ── Cambios del cliente sobre un viaje ya propuesto ─────────────────────────
// "Mañana nos dicen que en vez de 48 serán 46". Ver primero, aplicar después:
// aplicar crea una versión nueva de la propuesta, no pisa la que ya salió.

app.post("/api/proposals/:id/changes/preview", requireAuth, async (request, response) => {
  try {
    const body = request.body as { leido?: DatosLeidos };
    const vista = await previewChange(String(request.params.id), body?.leido ?? {});
    response.json(vista);
  } catch (error) {
    console.error("Error calculando el cambio", error);
    response.status(400).json({
      error: error instanceof Error ? error.message : "No se pudo calcular el cambio.",
    });
  }
});

app.post("/api/proposals/:id/changes/apply", requireAuth, async (request, response) => {
  try {
    const body = request.body as { leido?: DatosLeidos; mensaje?: string };
    const resultado = await applyChange(
      String(request.params.id),
      body?.leido ?? {},
      body?.mensaje ?? "",
    );
    await writeAudit({
      user: (request as AuthedRequest).user,
      action: "PROPOSAL_CHANGE_APPLIED",
      entity: "proposal",
      detail: `${request.params.id} → v${resultado.versionNumber} (${resultado.cambios} campos)`,
    });
    response.json(resultado);
  } catch (error) {
    console.error("Error aplicando el cambio", error);
    response.status(400).json({
      error: error instanceof Error ? error.message : "No se pudo aplicar el cambio.",
    });
  }
});

app.listen(port, async () => {
  await ensureAdminFromEnv();
  console.log(`Viajes Velero API escuchando en http://localhost:${port}`);
});