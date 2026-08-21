import { Prisma, PrismaClient } from "@prisma/client";
import type {
  AiDocumentAnalysisResult,
  BulkReviewResult,
  DeleteDocumentResult,
  DryRunDeleteDocumentResult,
  DryRunPublishResult,
  DryRunUnpublishResult,
  PublishedInventoryCatalog,
  PublishedInventorySummary,
  PublishedItemKind,
  UnpublishItemResult,
  UnpublishResult,
} from "../src/domain/documentImportTypes";
import { deriveSalePrice, resolveRatePrices, toRateKind, type RateKind } from "./pricing";

const prisma = new PrismaClient();

export interface CreateInventoryDocumentInput {
  targetType: "ACCOMMODATION" | "ACTIVITY" | "MIXED" | "UNKNOWN";
  controlName: string;
  controlLocation?: string;
  controlYear?: number | null;
  controlCategory?: string;
  controlNotes?: string;
  rateKind?: string;
  marginPercent?: number | null;
  clientSegment?: string | null;
  originalFileName?: string;
  fileMimeType?: string;
  fileSizeBytes?: number;
  storedFilePath?: string;
  fileHash?: string;
}

export interface AttachInventoryDocumentFileInput {
  documentId: string;
  originalFileName: string;
  storedFilePath: string;
  fileMimeType: string;
  fileSizeBytes: number;
  fileHash: string;
}

export async function createInventoryDocument(input: CreateInventoryDocumentInput) {
  return prisma.sourceDocument.create({
    data: {
      targetType: input.targetType,
      controlName: input.controlName,
      controlLocation: input.controlLocation ?? null,
      controlYear: input.controlYear ?? null,
      controlCategory: input.controlCategory ?? null,
      controlNotes: input.controlNotes ?? null,
      rateKind: toRateKind(input.rateKind),
      marginPercent: input.marginPercent ?? null,
      clientSegment: input.clientSegment ?? null,
      originalFileName: input.originalFileName ?? null,
      fileMimeType: input.fileMimeType ?? null,
      fileSizeBytes: input.fileSizeBytes ?? null,
      storedFilePath: input.storedFilePath ?? null,
      fileHash: input.fileHash ?? null,
      status: "UPLOADED",
      extractionStatus: "NOT_STARTED",
      requiresOcr: false,
    },
  });
}

/**
 * Anota el consumo de IA de la última lectura del documento.
 * No toca nada más: es solo contabilidad.
 */
export async function updateInventoryDocumentAiUsage(
  documentId: string,
  usage: { inputTokens: number; outputTokens: number; model: string },
) {
  return prisma.sourceDocument.update({
    where: { id: documentId },
    data: {
      aiInputTokens: usage.inputTokens,
      aiOutputTokens: usage.outputTokens,
      aiModel: usage.model,
    },
  });
}

export async function attachInventoryDocumentFile(input: AttachInventoryDocumentFileInput) {
  return prisma.sourceDocument.update({
    where: {
      id: input.documentId,
    },
    data: {
      originalFileName: input.originalFileName,
      storedFilePath: input.storedFilePath,
      fileMimeType: input.fileMimeType,
      fileSizeBytes: input.fileSizeBytes,
      fileHash: input.fileHash,
      status: "UPLOADED",
      extractionStatus: "NOT_STARTED",
      requiresOcr: false,
    },
  });
}

export interface UpdateInventoryDocumentMetadataInput {
  targetType?: "ACCOMMODATION" | "ACTIVITY" | "MIXED" | "UNKNOWN";
  controlName?: string;
  controlLocation?: string | null;
  controlYear?: number | null;
  controlCategory?: string | null;
  controlNotes?: string | null;
  rateKind?: string;
  marginPercent?: number | null;
  clientSegment?: string | null;
}

/**
 * Actualiza los metadatos de control de un documento (nombre, ubicación, año,
 * categoría, notas, tipo, y qué precios trae). NO toca el archivo, el staging
 * ni el inventario operativo. Solo incluye los campos presentes en la entrada.
 */
export async function updateInventoryDocumentMetadata(
  documentId: string,
  input: UpdateInventoryDocumentMetadataInput,
) {
  const data: Record<string, unknown> = {};
  if (input.targetType !== undefined) data.targetType = input.targetType;
  if (input.controlName !== undefined) data.controlName = input.controlName.trim();
  if (input.controlLocation !== undefined) data.controlLocation = input.controlLocation || null;
  if (input.controlYear !== undefined) data.controlYear = input.controlYear ?? null;
  if (input.controlCategory !== undefined) data.controlCategory = input.controlCategory || null;
  if (input.controlNotes !== undefined) data.controlNotes = input.controlNotes || null;
  if (input.rateKind !== undefined) data.rateKind = toRateKind(input.rateKind);
  if (input.marginPercent !== undefined) data.marginPercent = input.marginPercent ?? null;
  if (input.clientSegment !== undefined) data.clientSegment = input.clientSegment || null;

  const updated = await prisma.sourceDocument.update({
    where: { id: documentId },
    data,
  });
  return decimalsToNumbers(updated);
}

/**
 * Quita el archivo asociado a un documento: limpia los campos del fichero y
 * reinicia el estado de extracción. No borra el archivo físico de storage/ ni
 * los candidatos staging ya creados. Útil para corregir una subida equivocada.
 */
export async function removeInventoryDocumentFile(documentId: string) {
  const updated = await prisma.sourceDocument.update({
    where: { id: documentId },
    data: {
      originalFileName: null,
      storedFilePath: null,
      fileMimeType: null,
      fileSizeBytes: null,
      fileHash: null,
      status: "UPLOADED",
      extractionStatus: "NOT_STARTED",
      requiresOcr: false,
    },
  });
  return decimalsToNumbers(updated);
}

export async function listInventoryDocuments() {
  const reviewSelect = { select: { reviewStatus: true } } as const;
  const documents = await prisma.sourceDocument.findMany({
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      targetType: true,
      controlName: true,
      controlLocation: true,
      controlYear: true,
      controlCategory: true,
      // Sin estos tres la lista mostraba "Sin declarar" aunque estuviera
      // declarado: el select los omitía y nunca llegaban a la pantalla.
      rateKind: true,
      marginPercent: true,
      clientSegment: true,
      status: true,
      extractionStatus: true,
      requiresOcr: true,
      aiConfidence: true,
      createdAt: true,
      updatedAt: true,
      stagingAccommodations: {
        select: {
          reviewStatus: true,
          rates: reviewSelect,
          adjustments: reviewSelect,
          policies: reviewSelect,
          blackoutDates: reviewSelect,
        },
      },
      stagingActivities: {
        select: {
          reviewStatus: true,
          rates: reviewSelect,
          policies: reviewSelect,
        },
      },
    },
  });

  // Calcula contadores de revisión por documento (para priorizar de un vistazo)
  // y descarta las relaciones del payload de la lista.
  return documents.map((document) => {
    const statuses: string[] = [];
    for (const accommodation of document.stagingAccommodations) {
      statuses.push(accommodation.reviewStatus);
      accommodation.rates.forEach((row) => statuses.push(row.reviewStatus));
      accommodation.adjustments.forEach((row) => statuses.push(row.reviewStatus));
      accommodation.policies.forEach((row) => statuses.push(row.reviewStatus));
      accommodation.blackoutDates.forEach((row) => statuses.push(row.reviewStatus));
    }
    for (const activity of document.stagingActivities) {
      statuses.push(activity.reviewStatus);
      activity.rates.forEach((row) => statuses.push(row.reviewStatus));
      activity.policies.forEach((row) => statuses.push(row.reviewStatus));
    }

    const { stagingAccommodations: _a, stagingActivities: _b, ...summary } = document;
    return {
      ...summary,
      // El margen es Decimal en Prisma; la pantalla espera un número.
      marginPercent: summary.marginPercent === null ? null : Number(summary.marginPercent),
      candidateCount: statuses.length,
      pendingReviewCount: statuses.filter(
        (status) => status === "PENDING" || status === "NEEDS_CHANGES",
      ).length,
      approvedCount: statuses.filter((status) => status === "APPROVED").length,
    };
  });
}

/**
 * Convierte recursivamente los Decimal de Prisma a number para que la respuesta
 * JSON exponga importes numéricos (no strings) y los tipos del dominio se
 * cumplan. Preserva fechas y el resto de valores.
 */
/**
 * Transacciones que recorren el catalogo entero fila a fila. Con SQLite cada
 * consulta era un acceso a fichero local y sobraba el limite de 5 s que Prisma
 * pone por defecto a las transacciones interactivas; contra PostgreSQL cada una
 * es una ida y vuelta por red, y con unos cientos de tarifas el import se pasa
 * del limite y muere con P2028.
 */
const BULK_TX_OPTIONS = { timeout: 120_000, maxWait: 10_000 };

function decimalsToNumbers<T>(value: T): T {
  if (value instanceof Prisma.Decimal) {
    return Number(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => decimalsToNumbers(item)) as unknown as T;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = decimalsToNumbers(item);
    }
    return out as unknown as T;
  }
  return value;
}

export async function getInventoryDocumentDetail(documentId: string) {
  const detail = await prisma.sourceDocument.findUnique({
    where: {
      id: documentId,
    },
    include: {
      extractions: {
        orderBy: {
          createdAt: "desc",
        },
      },
      importIssues: {
        orderBy: {
          createdAt: "desc",
        },
      },
      stagingAccommodations: {
        include: {
          rates: true,
          adjustments: true,
          policies: true,
          blackoutDates: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
      stagingActivities: {
        include: {
          rates: true,
          policies: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  return decimalsToNumbers(detail);
}

export async function updateInventoryDocumentStatus(
  documentId: string,
  status: string,
  extractionStatus?: string,
) {
  return prisma.sourceDocument.update({
    where: {
      id: documentId,
    },
    data: {
      status,
      ...(extractionStatus ? { extractionStatus } : {}),
      processedAt:
        status === "PENDING_REVIEW" || status === "APPROVED" || status === "PUBLISHED"
          ? new Date()
          : undefined,
    },
  });
}

/**
 * Tipos de incidencia INFO que son eventos de bitácora repetibles: al registrar
 * uno nuevo se marcan como resueltos los anteriores del mismo tipo, de modo que
 * solo el último queda "activo". No se borra historial (sigue disponible para
 * trazabilidad), pero se evita que la lista de incidencias activas crezca sin
 * fin con cada análisis/publicación.
 */
const SUPERSEDING_ISSUE_TYPES = new Set([
  "AI_ANALYSIS_EXECUTED",
  "STAGING_CANDIDATES_CREATED",
  "STAGING_REGENERATED",
  "PUBLISH_COMPLETED",
  "UNPUBLISH_COMPLETED",
  "TEXT_ALREADY_EXTRACTED",
]);

export async function addInventoryDocumentIssue(input: {
  sourceDocumentId: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  issueType: string;
  message: string;
  fieldName?: string;
  rawValue?: string;
  pageNumber?: number;
}) {
  if (input.severity === "INFO" && SUPERSEDING_ISSUE_TYPES.has(input.issueType)) {
    await prisma.importIssue.updateMany({
      where: {
        sourceDocumentId: input.sourceDocumentId,
        issueType: input.issueType,
        resolved: false,
      },
      data: { resolved: true },
    });
  }

  return prisma.importIssue.create({
    data: {
      sourceDocumentId: input.sourceDocumentId,
      severity: input.severity,
      issueType: input.issueType,
      message: input.message,
      fieldName: input.fieldName ?? null,
      rawValue: input.rawValue ?? null,
      pageNumber: input.pageNumber ?? null,
    },
  });
}

export async function addInventoryDocumentExtraction(input: {
  sourceDocumentId: string;
  extractionMethod: "TEXT" | "TABLE" | "OCR" | "AI" | "MANUAL";
  pageNumber?: number;
  rawText?: string;
  confidenceScore?: number;
}) {
  return prisma.documentExtraction.create({
    data: {
      sourceDocumentId: input.sourceDocumentId,
      extractionMethod: input.extractionMethod,
      pageNumber: input.pageNumber ?? null,
      rawText: input.rawText ?? null,
      confidenceScore: input.confidenceScore ?? null,
    },
  });
}

export async function markInventoryDocumentAsPendingReview(documentId: string) {
  return updateInventoryDocumentStatus(documentId, "PENDING_REVIEW", "EXTRACTED");
}

export interface StagingCreationContext {
  targetType: string;
  controlName: string;
}

export interface StagingCreationResult {
  /** Precios de actividad guardados (antes se descartaban siempre). */
  activityRates?: number;
  accommodations: number;
  rates: number;
  adjustments: number;
  policies: number;
  blackoutDates: number;
  activities: number;
  warnings: string[];
}

/**
 * Convierte una fecha en texto (ISO o similar) a Date, o null si no es válida.
 */
function toStagingDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Cuenta los candidatos staging existentes para un documento, usado para evitar
 * duplicados antes de crear nuevos candidatos.
 */
export async function countInventoryDocumentStaging(sourceDocumentId: string) {
  const [accommodations, activities] = await Promise.all([
    prisma.stagingAccommodation.count({ where: { sourceDocumentId } }),
    prisma.stagingActivity.count({ where: { sourceDocumentId } }),
  ]);

  return { accommodations, activities, total: accommodations + activities };
}

/**
 * Crea candidatos revisables en las tablas staging a partir del resultado del
 * análisis IA/mock. Es transaccional: o se crean todos los candidatos del
 * documento, o ninguno. No escribe nada en el inventario operativo.
 */
export async function createInventoryDocumentStaging(
  sourceDocumentId: string,
  analysis: AiDocumentAnalysisResult,
  context: StagingCreationContext,
): Promise<StagingCreationResult> {
  const warnings: string[] = [];
  const confidence = analysis.confidence ?? null;

  const hasAccommodationData =
    analysis.detectedAccommodations?.length > 0 ||
    analysis.detectedAccommodation != null ||
    analysis.candidateRates.length > 0 ||
    analysis.candidateSupplements.length > 0 ||
    analysis.candidatePolicies.length > 0 ||
    analysis.candidateBlackoutDates.length > 0;

  const rateData = analysis.candidateRates.map((rate) => {
    if (rate.pvpAmount != null && !rate.currency) {
      warnings.push("Se detectó una tarifa con importe pero sin moneda; se asignó EUR por defecto.");
    }
    if (rate.dateFrom && !toStagingDate(rate.dateFrom)) {
      warnings.push(`No se pudo interpretar la fecha de inicio "${rate.dateFrom}" de una tarifa.`);
    }

    return {
      sourceDocumentId,
      // Se guarda aparte para repartir; no es columna de la tabla.
      _accommodationName: rate.accommodationName ?? null,
      seasonName: rate.seasonName ?? null,
      year: rate.year ?? null,
      dateFrom: toStagingDate(rate.dateFrom),
      dateTo: toStagingDate(rate.dateTo),
      boardType: rate.boardType ?? null,
      unitName: rate.unitName ?? null,
      rateUnit: rate.rateUnit ?? null,
      occupancyLabel: rate.occupancyLabel ?? null,
      includedService: rate.includedService ?? null,
      minNights: rate.minNights ?? null,
      currency: rate.currency ?? "EUR",
      pvpAmount: rate.pvpAmount ?? null,
      netAmount: rate.netAmount ?? null,
      costAmount: rate.costAmount ?? null,
      rawText: rate.rawText ?? null,
      confidenceScore: confidence,
      reviewStatus: "PENDING",
    };
  });

  const adjustmentData = analysis.candidateSupplements.map((supplement) => ({
    _accommodationName: supplement.accommodationName ?? null,
    adjustmentType: supplement.adjustmentType ?? "UNKNOWN",
    concept: supplement.concept,
    amountType: supplement.amountType ?? null,
    amount: supplement.amount ?? null,
    appliesPer: supplement.appliesPer ?? null,
    conditionText: supplement.conditionText ?? null,
    rawText: supplement.rawText ?? null,
    confidenceScore: confidence,
    reviewStatus: "PENDING",
  }));

  const activityRateData = (analysis.candidateActivityRates ?? []).map((rate) => ({
    // Se guarda aparte para repartir; no es columna de la tabla.
    _activityName: rate.activityName,
    year: rate.year ?? null,
    seasonName: rate.seasonName ?? null,
    ageLabel: rate.ageLabel ?? null,
    rateUnit: rate.rateUnit ?? null,
    currency: rate.currency ?? "EUR",
    salePvpAmount: rate.salePvpAmount ?? null,
    costNetAmount: rate.costNetAmount ?? null,
    minPax: rate.minPax ?? null,
    maxPax: rate.maxPax ?? null,
    durationText: rate.durationText ?? null,
    rawText: rate.rawText ?? null,
    confidenceScore: confidence,
    reviewStatus: "PENDING",
  }));

  const policyData = analysis.candidatePolicies.map((policy) => ({
    policyType: policy.policyType ?? "UNKNOWN",
    policyText: policy.policyText,
    structuredJson: policy.rawText ? { rawText: policy.rawText } : undefined,
    confidenceScore: confidence,
    reviewStatus: "PENDING",
  }));

  const blackoutData = analysis.candidateBlackoutDates.map((blackout) => ({
    dateFrom: toStagingDate(blackout.dateFrom),
    dateTo: toStagingDate(blackout.dateTo),
    availabilityStatus: blackout.availabilityStatus ?? "UNKNOWN",
    reason: blackout.reason ?? null,
    rawText: blackout.rawText ?? null,
    confidenceScore: confidence,
    reviewStatus: "PENDING",
  }));

  // Los alojamientos del documento. Si la IA no detectó ninguno pero sí hay
  // tarifas, se crea uno provisional con el nombre de control para no perderlas.
  const detectedList = analysis.detectedAccommodations?.length
    ? analysis.detectedAccommodations
    : analysis.detectedAccommodation
      ? [analysis.detectedAccommodation]
      : [];

  const accommodationsToCreate =
    detectedList.length > 0
      ? detectedList
      : hasAccommodationData
        ? [{ accommodationName: context.controlName } as (typeof detectedList)[number]]
        : [];

  if (detectedList.length === 0 && hasAccommodationData) {
    warnings.push(
      "Se detectaron tarifas o condiciones sin un alojamiento claro; se creó un alojamiento provisional a partir del nombre de control.",
    );
  }
  if (detectedList.length > 1) {
    warnings.push(
      `El documento trae ${detectedList.length} alojamientos: ${detectedList
        .map((accommodation) => accommodation.accommodationName)
        .join(", ")}. Revisa que cada tarifa esté en el suyo.`,
    );
  }

  // Reparto por nombre. La clave se normaliza porque la IA no siempre repite el
  // nombre con las mismas mayúsculas o espacios que en la cabecera.
  const normalizeKey = (value: string | null | undefined) =>
    (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

  const nameToIndex = new Map<string, number>();
  accommodationsToCreate.forEach((accommodation, index) => {
    nameToIndex.set(normalizeKey(accommodation.accommodationName), index);
  });

  /** Índice del alojamiento al que pertenece un candidato; 0 si no se sabe. */
  function indexFor(accommodationName: string | null | undefined): number {
    if (accommodationsToCreate.length <= 1) return 0;
    const exact = nameToIndex.get(normalizeKey(accommodationName));
    if (exact !== undefined) return exact;
    // La IA a veces devuelve "Mediterrània MED1 (doble)" o un fragmento.
    const key = normalizeKey(accommodationName);
    if (key) {
      for (const [name, index] of nameToIndex) {
        if (key.includes(name) || name.includes(key)) return index;
      }
    }
    return -1;
  }

  const orphanRates: string[] = [];
  const ratesByAccommodation = accommodationsToCreate.map(() => [] as typeof rateData);
  for (const rate of rateData) {
    const index = indexFor(rate._accommodationName);
    if (index < 0) {
      orphanRates.push(rate._accommodationName ?? "(sin nombre)");
      ratesByAccommodation[0].push(rate);
    } else {
      ratesByAccommodation[index].push(rate);
    }
  }

  const adjustmentsByAccommodation = accommodationsToCreate.map(() => [] as typeof adjustmentData);
  for (const adjustment of adjustmentData) {
    const index = indexFor(adjustment._accommodationName);
    adjustmentsByAccommodation[index < 0 ? 0 : index].push(adjustment);
  }

  if (orphanRates.length > 0) {
    const unique = [...new Set(orphanRates)];
    warnings.push(
      `${orphanRates.length} tarifa(s) no decían a qué alojamiento pertenecen (${unique
        .slice(0, 3)
        .join(", ")}); se han dejado en "${accommodationsToCreate[0]?.accommodationName}". Compruébalas.`,
    );
  }

  if (accommodationsToCreate.length > 1 && (policyData.length > 0 || blackoutData.length > 0)) {
    warnings.push(
      `Las condiciones y fechas bloqueadas del documento se han asociado a "${accommodationsToCreate[0]?.accommodationName}". Si valen para todos los alojamientos, cópialas.`,
    );
  }

  const counts = await prisma.$transaction(async (tx) => {
    let accommodationsCount = 0;

    for (const [index, detected] of accommodationsToCreate.entries()) {
      // Las condiciones del documento son de ámbito general: se cuelgan del
      // primero para no multiplicarlas por cada hotel sin que nadie lo decida.
      const isFirst = index === 0;
      const rates = ratesByAccommodation[index].map(
        ({ _accommodationName, ...rate }) => rate,
      );
      const adjustments = adjustmentsByAccommodation[index].map(
        ({ _accommodationName, ...adjustment }) => adjustment,
      );

      await tx.stagingAccommodation.create({
        data: {
          sourceDocumentId,
          accommodationName: detected?.accommodationName?.trim() || context.controlName,
          providerName: detected?.providerName ?? null,
          locality: detected?.locality ?? null,
          province: detected?.province ?? null,
          country: detected?.country ?? null,
          categoryType: detected?.categoryType ?? null,
          accommodationType: detected?.accommodationType ?? null,
          confidenceScore: confidence,
          reviewStatus: "PENDING",
          rates: rates.length > 0 ? { create: rates } : undefined,
          adjustments: adjustments.length > 0 ? { create: adjustments } : undefined,
          policies: isFirst && policyData.length > 0 ? { create: policyData } : undefined,
          blackoutDates: isFirst && blackoutData.length > 0 ? { create: blackoutData } : undefined,
        },
      });

      accommodationsCount += 1;
    }

    let activitiesCount = 0;

    // Las tarifas de actividad se reparten por nombre, igual que las de
    // alojamiento. Hasta ahora se creaba la actividad y se tiraba cualquier
    // precio, así que entraban al catálogo mudas y las propuestas salían con
    // "a consultar".
    const tarifasPorActividad = new Map<string, typeof activityRateData>();
    for (const rate of activityRateData) {
      const clave = normalizeKey(rate._activityName);
      tarifasPorActividad.set(clave, [...(tarifasPorActividad.get(clave) ?? []), rate]);
    }

    for (const activity of analysis.detectedActivities) {
      const suyas = tarifasPorActividad.get(normalizeKey(activity.activityName)) ?? [];
      const rates = suyas.map(({ _activityName, ...rate }) => rate);

      await tx.stagingActivity.create({
        data: {
          sourceDocumentId,
          activityName: activity.activityName,
          supplierName: activity.supplierName ?? null,
          locationMain: activity.locationMain ?? null,
          activityType: activity.activityType ?? null,
          durationText: activity.durationText ?? null,
          descriptionText: activity.descriptionText ?? null,
          confidenceScore: confidence,
          reviewStatus: "PENDING",
          rates: rates.length > 0 ? { create: rates } : undefined,
        },
      });

      activitiesCount += 1;
    }

    const sinDuenyo = activityRateData.filter(
      (rate) =>
        !analysis.detectedActivities.some(
          (activity) => normalizeKey(activity.activityName) === normalizeKey(rate._activityName),
        ),
    );
    if (sinDuenyo.length > 0) {
      warnings.push(
        `${sinDuenyo.length} precio(s) de actividad no encajan con ninguna actividad detectada y se han descartado. Revisa el documento.`,
      );
    }

    return { accommodationsCount, activitiesCount };
  }, BULK_TX_OPTIONS);

  return {
    accommodations: counts.accommodationsCount,
    rates: rateData.length,
    adjustments: adjustmentData.length,
    policies: policyData.length,
    blackoutDates: blackoutData.length,
    activities: counts.activitiesCount,
    activityRates: activityRateData.length,
    warnings,
  };
}

// ----------------------------------------------------------------------------
// Edición de candidatos staging (revisión humana, Bloque 5).
// ----------------------------------------------------------------------------

/** Error de validación de edición de staging; el endpoint lo traduce a HTTP 400. */
export class StagingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StagingValidationError";
  }
}

const VALID_STAGING_REVIEW_STATUS = new Set([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "NEEDS_CHANGES",
]);

interface StagingEntityConfig {
  getDelegate: () => {
    findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
  };
  requiredStringFields: string[];
  optionalStringFields: string[];
  intFields: string[];
  decimalFields: string[];
  dateFields: string[];
  booleanFields: string[];
  /** Campo crítico que no puede quedar vacío al aprobar. */
  nameField?: string;
  /** Campos de precio: basta con que uno tenga valor. Obliga moneda y no permite aprobar sin precio. */
  priceFields?: string[];
  currencyField?: string;
}

const STAGING_ENTITY_REGISTRY: Record<string, StagingEntityConfig> = {
  accommodations: {
    getDelegate: () => prisma.stagingAccommodation,
    requiredStringFields: ["accommodationName"],
    optionalStringFields: [
      "providerName",
      "locality",
      "province",
      "country",
      "categoryType",
      "accommodationType",
    ],
    intFields: [],
    decimalFields: [],
    dateFields: [],
    booleanFields: [],
    nameField: "accommodationName",
  },
  "accommodation-rates": {
    getDelegate: () => prisma.stagingAccommodationRate,
    requiredStringFields: ["currency"],
    optionalStringFields: [
      "seasonName",
      "boardType",
      "unitName",
      "unitType",
      "rateUnit",
      "occupancyLabel",
      "rawText",
    ],
    intFields: ["year", "minNights", "minPax", "minUnits"],
    decimalFields: ["pvpAmount", "netAmount", "costAmount", "commissionPercent"],
    dateFields: ["dateFrom", "dateTo"],
    booleanFields: ["taxIncluded"],
    priceFields: ["pvpAmount", "netAmount"],
    currencyField: "currency",
  },
  "accommodation-adjustments": {
    getDelegate: () => prisma.stagingAccommodationAdjustment,
    requiredStringFields: ["adjustmentType", "concept"],
    optionalStringFields: ["amountType", "appliesPer", "conditionText", "rawText"],
    intFields: [],
    decimalFields: ["amount"],
    dateFields: ["dateFrom", "dateTo"],
    booleanFields: [],
    nameField: "concept",
  },
  "accommodation-policies": {
    getDelegate: () => prisma.stagingAccommodationPolicy,
    requiredStringFields: ["policyType", "policyText"],
    optionalStringFields: [],
    intFields: [],
    decimalFields: [],
    dateFields: [],
    booleanFields: [],
    nameField: "policyText",
  },
  "accommodation-blackout-dates": {
    getDelegate: () => prisma.stagingAccommodationBlackoutDate,
    requiredStringFields: ["availabilityStatus"],
    optionalStringFields: ["reason", "rawText"],
    intFields: [],
    decimalFields: [],
    dateFields: ["dateFrom", "dateTo"],
    booleanFields: [],
  },
  activities: {
    getDelegate: () => prisma.stagingActivity,
    requiredStringFields: ["activityName"],
    optionalStringFields: [
      "supplierName",
      "locationMain",
      "province",
      "country",
      "activityType",
      "durationText",
      "descriptionText",
    ],
    intFields: [],
    decimalFields: [],
    dateFields: [],
    booleanFields: [],
    nameField: "activityName",
  },
  "activity-rates": {
    getDelegate: () => prisma.stagingActivityRate,
    requiredStringFields: ["currency"],
    optionalStringFields: ["seasonName", "ageLabel", "rateUnit", "durationText", "rawText"],
    intFields: ["year", "ageMin", "ageMax", "minPax", "maxPax"],
    decimalFields: ["salePvpAmount", "costNetAmount", "commissionPercent"],
    dateFields: ["dateFrom", "dateTo"],
    booleanFields: [],
    priceFields: ["salePvpAmount"],
    currencyField: "currency",
  },
  "activity-policies": {
    getDelegate: () => prisma.stagingActivityPolicy,
    requiredStringFields: ["policyType", "policyText"],
    optionalStringFields: [],
    intFields: [],
    decimalFields: [],
    dateFields: [],
    booleanFields: [],
    nameField: "policyText",
  },
};

function parseEditableNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new StagingValidationError(`El campo ${label} debe ser numérico.`);
  }

  return parsed;
}

function parseEditableInt(value: unknown, label: string): number | null {
  const parsed = parseEditableNumber(value, label);
  if (parsed === null) {
    return null;
  }
  if (!Number.isInteger(parsed)) {
    throw new StagingValidationError(`El campo ${label} debe ser un número entero.`);
  }
  return parsed;
}

function parseEditableDate(value: unknown, label: string): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new StagingValidationError(`La fecha ${label} no es válida.`);
  }

  return parsed;
}

/**
 * Actualiza un candidato staging de cualquier tipo soportado, validando el tipo
 * de entidad, los campos editables y las reglas de revisión. Devuelve null si el
 * candidato no existe. No publica nada al inventario operativo.
 */
export async function updateStagingEntity(
  entityKey: string,
  id: string,
  patch: Record<string, unknown>,
) {
  const config = STAGING_ENTITY_REGISTRY[entityKey];
  if (!config) {
    throw new StagingValidationError("Tipo de candidato staging no válido.");
  }

  const delegate = config.getDelegate();
  const existing = await delegate.findUnique({ where: { id } });
  if (!existing) {
    return null;
  }

  const data: Record<string, unknown> = {};

  for (const field of config.requiredStringFields) {
    if (field in patch) {
      const value = patch[field];
      const normalized = value === null || value === undefined ? "" : String(value).trim();
      if (normalized === "") {
        throw new StagingValidationError(`El campo ${field} no puede quedar vacío.`);
      }
      data[field] = normalized;
    }
  }

  for (const field of config.optionalStringFields) {
    if (field in patch) {
      const value = patch[field];
      const normalized = value === null || value === undefined ? "" : String(value).trim();
      data[field] = normalized === "" ? null : normalized;
    }
  }

  for (const field of config.intFields) {
    if (field in patch) {
      data[field] = parseEditableInt(patch[field], field);
    }
  }

  for (const field of config.decimalFields) {
    if (field in patch) {
      data[field] = parseEditableNumber(patch[field], field);
    }
  }

  for (const field of config.dateFields) {
    if (field in patch) {
      data[field] = parseEditableDate(patch[field], field);
    }
  }

  for (const field of config.booleanFields) {
    if (field in patch) {
      const value = patch[field];
      data[field] = value === null || value === undefined ? null : Boolean(value);
    }
  }

  if ("reviewStatus" in patch) {
    const reviewStatus = String(patch.reviewStatus);
    if (!VALID_STAGING_REVIEW_STATUS.has(reviewStatus)) {
      throw new StagingValidationError("Estado de revisión no válido.");
    }
    data.reviewStatus = reviewStatus;
  }

  const merged = { ...existing, ...data };
  const resultingStatus = String(merged.reviewStatus ?? "PENDING");

  if (config.priceFields && config.priceFields.length > 0) {
    const hasPrice = config.priceFields.some((field) => {
      const value = merged[field];
      return value !== null && value !== undefined;
    });

    if (hasPrice && config.currencyField) {
      const currency = merged[config.currencyField];
      if (!currency || String(currency).trim() === "") {
        throw new StagingValidationError("La moneda es obligatoria cuando la tarifa tiene precio.");
      }
    }

    if (resultingStatus === "APPROVED" && !hasPrice) {
      throw new StagingValidationError("No se puede aprobar una tarifa sin precio (PVP o neto).");
    }
  }

  if (config.nameField && resultingStatus === "APPROVED") {
    const name = merged[config.nameField];
    if (!name || String(name).trim() === "") {
      throw new StagingValidationError("No se puede aprobar un candidato sin nombre o concepto.");
    }
  }

  return delegate.update({ where: { id }, data });
}

/**
 * Cambia el estado de revisión de varios candidatos del mismo tipo a la vez.
 * Aplica la misma validación que la edición individual por cada candidato; si
 * uno no se puede cambiar (p. ej. aprobar una tarifa sin precio), se omite con
 * su motivo y el resto continúa. No publica nada.
 */
export async function bulkUpdateStagingReview(
  entityKey: string,
  ids: string[],
  reviewStatus: string,
): Promise<BulkReviewResult> {
  if (!STAGING_ENTITY_REGISTRY[entityKey]) {
    throw new StagingValidationError("Tipo de candidato staging no válido.");
  }
  if (!VALID_STAGING_REVIEW_STATUS.has(reviewStatus)) {
    throw new StagingValidationError("Estado de revisión no válido.");
  }

  let updated = 0;
  let notFound = 0;
  const skipped: { id: string; reason: string }[] = [];

  for (const id of ids) {
    try {
      const result = await updateStagingEntity(entityKey, id, { reviewStatus });
      if (result === null) {
        notFound += 1;
      } else {
        updated += 1;
      }
    } catch (error) {
      if (error instanceof StagingValidationError) {
        skipped.push({ id, reason: error.message });
      } else {
        throw error;
      }
    }
  }

  return { updated, notFound, skipped };
}

/**
 * Borra TODOS los candidatos staging de un documento (alojamientos y
 * actividades; sus hijos caen por onDelete: Cascade). Solo afecta al staging,
 * nunca al inventario operativo. Se usa para regenerar candidatos desde cero.
 */
/**
 * Firma el reparto de un bloque: alguien ha comprobado contra el documento que
 * esas tarifas son de ese alojamiento.
 *
 * Se guarda la fecha, no un booleano, porque lo que importa después es *cuándo*
 * se miró: si el documento se vuelve a leer y cambian los candidatos, la firma
 * anterior ya no vale para lo nuevo.
 */
export async function confirmAccommodationAssignmentDb(
  sourceDocumentId: string,
  accommodationIds: string[],
): Promise<{ confirmed: number }> {
  if (accommodationIds.length === 0) return { confirmed: 0 };

  const result = await prisma.stagingAccommodation.updateMany({
    where: { sourceDocumentId, id: { in: accommodationIds } },
    data: { assignmentConfirmedAt: new Date() },
  });
  return { confirmed: result.count };
}

export async function deleteInventoryDocumentStaging(sourceDocumentId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.stagingAccommodation.deleteMany({ where: { sourceDocumentId } });
    await tx.stagingActivity.deleteMany({ where: { sourceDocumentId } });
  });
}

// ----------------------------------------------------------------------------
// Publicación de candidatos aprobados al inventario operativo (Bloque 6).
// Solo se publica reviewStatus === "APPROVED". Idempotente por sourceDocumentId.
// No toca filas importadas desde Excel (sourceDocumentId null).
// ----------------------------------------------------------------------------

/** Error de validación de publicación; el endpoint lo traduce a HTTP 400. */
export class PublishValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishValidationError";
  }
}

export interface PublishApprovedContext {
  controlLocation?: string | null;
  controlYear?: number | null;
  /** Qué precios trae el documento, declarado al subirlo. */
  rateKind?: RateKind;
  /** Margen sobre el coste cuando el documento es de compra. */
  marginPercent?: number | null;
  /** Canal de venta al que pertenece la tarifa cuando el documento es de venta. */
  clientSegment?: string | null;
}

/**
 * Por qué se quedó algo fuera del catálogo, con cuántos casos y qué hacer.
 * Existe porque un recuento de "omitidos: 6" no dice nada accionable: hay que
 * saber si faltaba aprobar un hotel (se arregla en un clic) o si las tarifas no
 * traen moneda (hay que editarlas).
 */
export interface PublishSkipReason {
  /** Clave estable para agrupar; no se enseña al usuario. */
  code:
    | "ACCOMMODATION_NOT_APPROVED"
    /** Falta confirmar que ese bloque de tarifas es de ese alojamiento. */
    | "ASSIGNMENT_NOT_CONFIRMED"
    | "RATE_NOT_APPROVED"
    | "MISSING_PRICE"
    | "MISSING_CURRENCY"
    | "MISSING_YEAR";
  /** Cuántas tarifas o fichas se quedaron fuera por este motivo. */
  count: number;
  /** Explicación en claro, ya con el número dentro. */
  message: string;
  /** Qué hay que hacer para que entren. Null si no hay acción evidente. */
  fix: string | null;
}

export interface PublishApprovedResult {
  accommodations: number;
  accommodationRates: number;
  activities: number;
  activityRates: number;
  skippedAccommodations: number;
  skippedRates: number;
  skippedActivities: number;
  skippedActivityRates: number;
  /** Motivos agrupados de lo que no entró, del más frecuente al menos. */
  skipReasons: PublishSkipReason[];
  warnings: string[];
}

const isApprovedStatus = (status: string) => status === "APPROVED";

/**
 * Construye el plan de publicación (registros a crear, advertencias y conteos
 * de omisiones) a partir de los candidatos staging aprobados. Es de SOLO
 * LECTURA: no escribe en ninguna tabla. Lo reutilizan tanto la publicación real
 * como la simulación (dry-run).
 */
async function buildPublishPlan(sourceDocumentId: string, context: PublishApprovedContext) {
  const accommodations = await prisma.stagingAccommodation.findMany({
    where: { sourceDocumentId },
    include: { rates: true, adjustments: true, policies: true, blackoutDates: true },
  });
  const activities = await prisma.stagingActivity.findMany({
    where: { sourceDocumentId },
    include: { rates: true, policies: true },
  });

  const anyPublishable =
    accommodations.some((accommodation) => isApprovedStatus(accommodation.reviewStatus)) ||
    activities.some((activity) => isApprovedStatus(activity.reviewStatus));

  const warnings: string[] = [];
  let skippedAccommodations = 0;
  let skippedRates = 0;
  let skippedActivities = 0;
  let skippedActivityRates = 0;

  // Motivos agrupados: se cuentan aquí y se redactan al final, para que la
  // pantalla pueda decir "4 por X, 2 por Y" en vez de un total mudo.
  const skipCounts = new Map<PublishSkipReason["code"], number>();
  const noteSkip = (code: PublishSkipReason["code"], count = 1) => {
    skipCounts.set(code, (skipCounts.get(code) ?? 0) + count);
  };

  const accommodationsToCreate: Record<string, unknown>[] = [];

  // Con varios alojamientos en el mismo documento, el reparto —qué tabla de
  // precios es de qué hotel— lo firma una persona. No es burocracia: en un PDF
  // con la capa de texto desordenada, los nombres salen lejos de sus tablas y
  // en otro orden, así que a qué hotel pertenece cada bloque NO se deduce del
  // texto. Cambiar dos hoteles de sitio cotiza el caro al precio del barato
  // toda la temporada, y los números siguen pareciendo razonables.
  const exigeReparto = accommodations.length > 1;

  for (const accommodation of accommodations) {
    if (exigeReparto && !accommodation.assignmentConfirmedAt) {
      skippedAccommodations += 1;
      const suyas = accommodation.rates.length;
      warnings.push(
        `Falta confirmar que las ${suyas} tarifas del bloque son de "${accommodation.accommodationName}". Hasta entonces no se publica.`,
      );
      if (suyas > 0) {
        skippedRates += suyas;
        noteSkip("ASSIGNMENT_NOT_CONFIRMED", suyas);
      }
      continue;
    }

    if (!isApprovedStatus(accommodation.reviewStatus)) {
      skippedAccommodations += 1;
      const approvedChildRates = accommodation.rates.filter((rate) =>
        isApprovedStatus(rate.reviewStatus),
      ).length;
      const pendingChildRates = accommodation.rates.length - approvedChildRates;

      if (approvedChildRates > 0) {
        warnings.push(
          `El alojamiento "${accommodation.accommodationName}" no está aprobado: no se publican sus ${approvedChildRates} tarifa(s) aprobada(s).`,
        );
        skippedRates += approvedChildRates;
        noteSkip("ACCOMMODATION_NOT_APPROVED", approvedChildRates);
      }
      // Las tarifas que tampoco están aprobadas también se quedan fuera: si no
      // se cuentan, el resultado dice "0 fuera" con el catálogo vacío.
      if (pendingChildRates > 0) {
        skippedRates += pendingChildRates;
        noteSkip("RATE_NOT_APPROVED", pendingChildRates);
      }
      continue;
    }

    const ratePayloads: Record<string, unknown>[] = [];
    for (const rate of accommodation.rates) {
      if (!isApprovedStatus(rate.reviewStatus)) {
        skippedRates += 1;
        noteSkip("RATE_NOT_APPROVED");
        continue;
      }

      const year = rate.year ?? context.controlYear ?? null;
      // El tipo de tarifa lo declara quien sube el documento, no lo deduce la
      // IA: si es de compra se le aplica el margen, y si es de venta se guarda
      // tal cual. Ver `resolveRatePrices` para el porqué.
      const { salePrice, costPrice } = resolveRatePrices(
        {
          pvpAmount: decimalToNumber(rate.pvpAmount),
          netAmount: decimalToNumber(rate.netAmount),
          costAmount: decimalToNumber(rate.costAmount),
        },
        context.rateKind ?? "UNKNOWN",
        context.marginPercent,
      );
      if (salePrice === null || salePrice === undefined) {
        warnings.push(`Tarifa de "${accommodation.accommodationName}" omitida: sin precio (coste ni PVP).`);
        skippedRates += 1;
        noteSkip("MISSING_PRICE");
        continue;
      }
      if (!rate.currency || rate.currency.trim() === "") {
        warnings.push(`Tarifa de "${accommodation.accommodationName}" omitida: sin moneda.`);
        skippedRates += 1;
        noteSkip("MISSING_CURRENCY");
        continue;
      }
      if (year === null) {
        warnings.push(`Tarifa de "${accommodation.accommodationName}" omitida: sin año.`);
        skippedRates += 1;
        noteSkip("MISSING_YEAR");
        continue;
      }

      ratePayloads.push({
        rateSource: `staging:${rate.id}`,
        year,
        seasonName: rate.seasonName,
        dateFrom: rate.dateFrom,
        dateTo: rate.dateTo,
        minNights: rate.minNights,
        boardType: rate.boardType,
        tariffUnit: rate.rateUnit,
        currency: rate.currency,
        // De qué canal es este precio, qué lleva incluido y para qué ocupación:
        // sin los tres, dos tarifas del mismo hotel y régimen son
        // indistinguibles al cotizar. En Fútbol Salou, la misma línea vale 73 €
        // en doble y 92 € en individual.
        clientSegment: context.clientSegment ?? null,
        includedService: rate.includedService ?? null,
        occupancyLabel: rate.occupancyLabel ?? null,
        pvpAmount: salePrice,
        // El coste resuelto, no el campo crudo donde cayó la cifra. En un
        // documento de venta queda a null: ese papel no dice lo que cuesta.
        netSaleAmount: costPrice,
        netAzulmarinoAmount: rate.costAmount,
        sourceDocumentId,
        sourceStagingId: rate.id,
      });
    }

    const approvedPolicies = accommodation.policies.filter((policy) =>
      isApprovedStatus(policy.reviewStatus),
    );
    const approvedAdjustments = accommodation.adjustments.filter((adjustment) =>
      isApprovedStatus(adjustment.reviewStatus),
    );
    const approvedBlackouts = accommodation.blackoutDates.filter((blackout) =>
      isApprovedStatus(blackout.reviewStatus),
    );

    const conditionsText =
      approvedPolicies.map((policy) => `[${policy.policyType}] ${policy.policyText}`).join(" | ") ||
      null;

    const adjustmentsText = approvedAdjustments
      .map((adjustment) =>
        adjustment.amount != null
          ? `${adjustment.concept} (${adjustment.amount})`
          : adjustment.concept,
      )
      .join(" | ");
    const blackoutText = approvedBlackouts
      .map((blackout) =>
        blackout.reason
          ? `${blackout.availabilityStatus}: ${blackout.reason}`
          : blackout.availabilityStatus,
      )
      .join(" | ");

    const observations =
      [
        accommodation.providerName ? `Proveedor: ${accommodation.providerName}` : "",
        accommodation.province ? `Provincia: ${accommodation.province}` : "",
        accommodation.country ? `País: ${accommodation.country}` : "",
        adjustmentsText ? `Suplementos: ${adjustmentsText}` : "",
        blackoutText ? `Fechas especiales: ${blackoutText}` : "",
      ]
        .filter(Boolean)
        .join(" | ") || null;

    const freePolicySource = approvedPolicies.find((policy) => /GRAT|FREE/i.test(policy.policyType));
    const freePolicy = freePolicySource ? freePolicySource.policyText : null;


    const locality =
      (accommodation.locality && accommodation.locality.trim()) ||
      (context.controlLocation ?? "") ||
      "";

    accommodationsToCreate.push({
      accommodationName: accommodation.accommodationName,
      locality,
      categoryType: accommodation.categoryType,
      accommodationType: accommodation.accommodationType,
      observations,
      conditionsText,
      // Además del texto —que se conserva porque es lo que lee el colegio en la
      // propuesta—, cada condición se guarda con su tipo, su importe y sus
      // fechas. Aplanarlas impedía que la aplicación las usara para calcular.
      policies:
        approvedPolicies.length > 0
          ? {
              create: approvedPolicies.map((policy) => ({
                policyType: policy.policyType ?? "UNKNOWN",
                policyText: policy.policyText,
                sourceDocumentId,
                sourceStagingId: policy.id,
              })),
            }
          : undefined,
      adjustments:
        approvedAdjustments.length > 0
          ? {
              create: approvedAdjustments.map((adjustment) => ({
                adjustmentType: adjustment.adjustmentType ?? "UNKNOWN",
                concept: adjustment.concept,
                amountType: adjustment.amountType,
                amount: adjustment.amount,
                appliesPer: adjustment.appliesPer,
                conditionText: adjustment.conditionText,
                sourceDocumentId,
                sourceStagingId: adjustment.id,
              })),
            }
          : undefined,
      blackoutDates:
        approvedBlackouts.length > 0
          ? {
              create: approvedBlackouts.map((blackout) => ({
                dateFrom: blackout.dateFrom,
                dateTo: blackout.dateTo,
                availabilityStatus: blackout.availabilityStatus ?? "UNKNOWN",
                reason: blackout.reason,
                sourceDocumentId,
                sourceStagingId: blackout.id,
              })),
            }
          : undefined,
      freePolicy,
      sourceFile: null,
      sourceDocumentId,
      sourceStagingId: accommodation.id,
      rates: { create: ratePayloads },
    });
  }

  const activitiesToCreate: Record<string, unknown>[] = [];

  for (const activity of activities) {
    if (!isApprovedStatus(activity.reviewStatus)) {
      skippedActivities += 1;
      const approvedChildRates = activity.rates.filter((rate) =>
        isApprovedStatus(rate.reviewStatus),
      ).length;
      if (approvedChildRates > 0) {
        warnings.push(
          `La actividad "${activity.activityName}" no está aprobada: no se publican sus ${approvedChildRates} tarifa(s) aprobada(s).`,
        );
        skippedActivityRates += approvedChildRates;
        noteSkip("ACCOMMODATION_NOT_APPROVED", approvedChildRates);
      }
      continue;
    }

    const ratePayloads: Record<string, unknown>[] = [];
    for (const rate of activity.rates) {
      if (!isApprovedStatus(rate.reviewStatus)) {
        skippedActivityRates += 1;
        noteSkip("RATE_NOT_APPROVED");
        continue;
      }

      const year = rate.year ?? context.controlYear ?? null;
      // Mismo criterio que en alojamientos: manda lo declarado al subir, no el
      // campo en el que la IA colocó la cifra.
      const { salePrice: activitySalePrice, costPrice: activityCostPrice } = resolveRatePrices(
        {
          pvpAmount: decimalToNumber(rate.salePvpAmount),
          costAmount: decimalToNumber(rate.costNetAmount),
        },
        context.rateKind ?? "UNKNOWN",
        context.marginPercent,
      );
      if (activitySalePrice === null || activitySalePrice === undefined) {
        warnings.push(`Tarifa de "${activity.activityName}" omitida: sin precio (coste ni PVP).`);
        skippedActivityRates += 1;
        noteSkip("MISSING_PRICE");
        continue;
      }
      if (!rate.currency || rate.currency.trim() === "") {
        warnings.push(`Tarifa de "${activity.activityName}" omitida: sin moneda.`);
        skippedActivityRates += 1;
        noteSkip("MISSING_CURRENCY");
        continue;
      }
      if (year === null) {
        warnings.push(`Tarifa de "${activity.activityName}" omitida: sin año.`);
        skippedActivityRates += 1;
        noteSkip("MISSING_YEAR");
        continue;
      }

      ratePayloads.push({
        year,
        ageLabel: rate.ageLabel,
        ageMin: rate.ageMin,
        ageMax: rate.ageMax,
        currency: rate.currency,
        salePvpAmount: activitySalePrice,
        costNetAmount: activityCostPrice,
        clientSegment: context.clientSegment ?? null,
        commissionPercent: rate.commissionPercent,
        durationText: rate.durationText,
        sourceDocumentId,
        sourceStagingId: rate.id,
      });
    }

    const approvedPolicies = activity.policies.filter((policy) =>
      isApprovedStatus(policy.reviewStatus),
    );
    const policyText = approvedPolicies
      .map((policy) => `[${policy.policyType}] ${policy.policyText}`)
      .join(" | ");

    if (approvedPolicies.length > 0) {
      warnings.push(
        `En la actividad "${activity.activityName}" se plegaron ${approvedPolicies.length} política(s) a la descripción; se pierde su estructura.`,
      );
    }

    const descriptionText =
      [activity.descriptionText, policyText].filter(Boolean).join(" | ") || null;

    activitiesToCreate.push({
      activityName: activity.activityName,
      supplierName: activity.supplierName,
      locationMain: activity.locationMain,
      durationText: activity.durationText,
      descriptionText,
      sourceFile: null,
      sourceDocumentId,
      sourceStagingId: activity.id,
      rates: { create: ratePayloads },
    });
  }

  return {
    accommodations,
    activities,
    anyPublishable,
    accommodationsToCreate,
    activitiesToCreate,
    warnings,
    skippedAccommodations,
    skippedRates,
    skippedActivities,
    skippedActivityRates,
    skipReasons: buildSkipReasons(skipCounts),
  };
}

/**
 * Convierte los recuentos por motivo en frases con su arreglo. El orden es por
 * frecuencia: lo que más tarifas está frenando, primero.
 */
function buildSkipReasons(
  counts: Map<PublishSkipReason["code"], number>,
): PublishSkipReason[] {
  const plural = (count: number, one: string, many: string) =>
    count === 1 ? one : many;

  const describe: Record<
    PublishSkipReason["code"],
    (count: number) => { message: string; fix: string | null }
  > = {
    ACCOMMODATION_NOT_APPROVED: (count) => ({
      message: `${count} ${plural(count, "tarifa aprobada se quedó fuera", "tarifas aprobadas se quedaron fuera")} porque su alojamiento todavía no está aprobado.`,
      fix: "Aprueba el alojamiento y vuelve a publicar: entrarán solas.",
    }),
    ASSIGNMENT_NOT_CONFIRMED: (count) => ({
      message: `${count} ${plural(count, "tarifa espera", "tarifas esperan")} a que se confirme de qué alojamiento son. Este documento trae varios y el reparto no se puede dar por bueno solo.`,
      fix: "En cada alojamiento, comprueba contra el documento que esos precios son suyos y confírmalo.",
    }),
    RATE_NOT_APPROVED: (count) => ({
      message: `${count} ${plural(count, "tarifa sigue", "tarifas siguen")} sin aprobar.`,
      fix: "Revísalas y apruébalas en la pestaña de revisión.",
    }),
    MISSING_PRICE: (count) => ({
      message: `${count} ${plural(count, "tarifa no trae precio", "tarifas no traen precio")} (ni coste ni venta).`,
      fix: "Edita la tarifa y escribe el importe; sin él no se puede cotizar.",
    }),
    MISSING_CURRENCY: (count) => ({
      message: `${count} ${plural(count, "tarifa no dice en qué moneda está", "tarifas no dicen en qué moneda están")}.`,
      fix: "Edita la tarifa e indica la moneda (normalmente EUR).",
    }),
    MISSING_YEAR: (count) => ({
      message: `${count} ${plural(count, "tarifa no tiene temporada", "tarifas no tienen temporada")}.`,
      fix: "Pon el año en la tarifa, o rellena el año de control del documento.",
    }),
  };

  return [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ code, count, ...describe[code](count) }));
}

function countCreatedRates(items: Record<string, unknown>[]): number {
  return items.reduce(
    (total, item) => total + ((item.rates as { create: unknown[] }).create.length ?? 0),
    0,
  );
}

export async function publishApprovedInventoryDocument(
  sourceDocumentId: string,
  context: PublishApprovedContext,
): Promise<PublishApprovedResult> {
  const plan = await buildPublishPlan(sourceDocumentId, context);

  if (!plan.anyPublishable) {
    throw new PublishValidationError(
      "No hay candidatos aprobados para publicar (se requiere al menos un alojamiento o actividad aprobado).",
    );
  }

  await prisma.$transaction(async (tx) => {
    // Idempotencia: borrar lo publicado previamente desde ESTE documento y
    // reinsertar. No afecta a filas de Excel (sourceDocumentId null).
    await tx.accommodation.deleteMany({ where: { sourceDocumentId } });
    await tx.activity.deleteMany({ where: { sourceDocumentId } });

    for (const data of plan.accommodationsToCreate) {
      await tx.accommodation.create({ data: data as never });
    }
    for (const data of plan.activitiesToCreate) {
      await tx.activity.create({ data: data as never });
    }
  }, BULK_TX_OPTIONS);

  return {
    accommodations: plan.accommodationsToCreate.length,
    accommodationRates: countCreatedRates(plan.accommodationsToCreate),
    activities: plan.activitiesToCreate.length,
    activityRates: countCreatedRates(plan.activitiesToCreate),
    skippedAccommodations: plan.skippedAccommodations,
    skippedRates: plan.skippedRates,
    skippedActivities: plan.skippedActivities,
    skippedActivityRates: plan.skippedActivityRates,
    skipReasons: plan.skipReasons,
    warnings: plan.warnings,
  };
}

/**
 * Simulación de publicación (dry-run). Reutiliza buildPublishPlan para calcular
 * qué se publicaría/omitiría y qué advertencias surgirían, SIN escribir nada:
 * no hace deleteMany, create, ni cambia el estado del documento, ni crea
 * incidencias. Solo lee.
 */
export async function dryRunPublishApprovedInventoryDocument(
  sourceDocumentId: string,
  context: PublishApprovedContext,
): Promise<DryRunPublishResult> {
  const plan = await buildPublishPlan(sourceDocumentId, context);

  const warnings = [...plan.warnings];
  if (!plan.anyPublishable) {
    warnings.unshift(
      "No hay candidatos aprobados: al publicar no se crearía ningún registro operativo (se requiere al menos un alojamiento o actividad aprobado).",
    );
  }

  let approvedCandidates = 0;
  let pendingCandidates = 0;
  let rejectedCandidates = 0;
  let needsChangesCandidates = 0;

  const tally = (status: string) => {
    if (status === "APPROVED") approvedCandidates += 1;
    else if (status === "REJECTED") rejectedCandidates += 1;
    else if (status === "NEEDS_CHANGES") needsChangesCandidates += 1;
    else pendingCandidates += 1;
  };

  for (const accommodation of plan.accommodations) {
    tally(accommodation.reviewStatus);
    accommodation.rates.forEach((rate) => tally(rate.reviewStatus));
    accommodation.adjustments.forEach((adjustment) => tally(adjustment.reviewStatus));
    accommodation.policies.forEach((policy) => tally(policy.reviewStatus));
    accommodation.blackoutDates.forEach((blackout) => tally(blackout.reviewStatus));
  }
  for (const activity of plan.activities) {
    tally(activity.reviewStatus);
    activity.rates.forEach((rate) => tally(rate.reviewStatus));
    activity.policies.forEach((policy) => tally(policy.reviewStatus));
  }

  // Lectura: ¿ya existen registros operativos publicados desde este documento?
  const existingAccommodations = await prisma.accommodation.count({
    where: { sourceDocumentId },
  });
  const existingActivities = await prisma.activity.count({ where: { sourceDocumentId } });
  const wouldReplaceExisting = existingAccommodations + existingActivities > 0;

  if (wouldReplaceExisting) {
    warnings.push(
      `Publicar reemplazaría la publicación previa de este documento (${existingAccommodations} alojamiento(s) y ${existingActivities} actividad(es) ya publicados). La operación es idempotente.`,
    );
  }

  return {
    hasPublishableCandidates: plan.anyPublishable,
    accommodationsToPublish: plan.accommodationsToCreate.length,
    accommodationRatesToPublish: countCreatedRates(plan.accommodationsToCreate),
    activitiesToPublish: plan.activitiesToCreate.length,
    activityRatesToPublish: countCreatedRates(plan.activitiesToCreate),
    skipped:
      plan.skippedAccommodations +
      plan.skippedRates +
      plan.skippedActivities +
      plan.skippedActivityRates,
    skippedAccommodations: plan.skippedAccommodations,
    skippedRates: plan.skippedRates,
    skippedActivities: plan.skippedActivities,
    skippedActivityRates: plan.skippedActivityRates,
    skipReasons: plan.skipReasons,
    warnings,
    approvedCandidates,
    pendingCandidates,
    rejectedCandidates,
    needsChangesCandidates,
    wouldReplaceExisting,
  };
}

/** Convierte un Decimal de Prisma (u otro valor) a number, o null si no aplica. */
function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Trazabilidad: devuelve los registros del inventario operativo publicados
 * desde un documento (filtrando por sourceDocumentId). Es de SOLO LECTURA: no
 * escribe ni borra nada. Refleja el estado vivo actual del inventario.
 */
export async function getPublishedInventoryByDocument(
  sourceDocumentId: string,
): Promise<PublishedInventorySummary> {
  const accommodations = await prisma.accommodation.findMany({
    where: { sourceDocumentId },
    include: { rates: true },
    orderBy: { createdAt: "desc" },
  });
  const activities = await prisma.activity.findMany({
    where: { sourceDocumentId },
    include: { rates: true },
    orderBy: { createdAt: "desc" },
  });

  const mappedAccommodations = accommodations.map((accommodation) => ({
    id: accommodation.id,
    accommodationName: accommodation.accommodationName,
    locality: accommodation.locality,
    categoryType: accommodation.categoryType,
    accommodationType: accommodation.accommodationType,
    sourceStagingId: accommodation.sourceStagingId,
    rates: accommodation.rates.map((rate) => ({
      id: rate.id,
      year: rate.year,
      seasonName: rate.seasonName,
      dateFrom: rate.dateFrom ? rate.dateFrom.toISOString() : null,
      dateTo: rate.dateTo ? rate.dateTo.toISOString() : null,
      boardType: rate.boardType,
      currency: rate.currency,
      pvpAmount: decimalToNumber(rate.pvpAmount),
      netSaleAmount: decimalToNumber(rate.netSaleAmount),
      netAzulmarinoAmount: decimalToNumber(rate.netAzulmarinoAmount),
      sourceStagingId: rate.sourceStagingId,
    })),
  }));

  const mappedActivities = activities.map((activity) => ({
    id: activity.id,
    activityName: activity.activityName,
    supplierName: activity.supplierName,
    locationMain: activity.locationMain,
    sourceStagingId: activity.sourceStagingId,
    rates: activity.rates.map((rate) => ({
      id: rate.id,
      year: rate.year,
      ageLabel: rate.ageLabel,
      currency: rate.currency,
      salePvpAmount: decimalToNumber(rate.salePvpAmount),
      costNetAmount: decimalToNumber(rate.costNetAmount),
      sourceStagingId: rate.sourceStagingId,
    })),
  }));

  return {
    accommodations: mappedAccommodations,
    activities: mappedActivities,
    accommodationCount: mappedAccommodations.length,
    accommodationRateCount: mappedAccommodations.reduce(
      (total, accommodation) => total + accommodation.rates.length,
      0,
    ),
    activityCount: mappedActivities.length,
    activityRateCount: mappedActivities.reduce(
      (total, activity) => total + activity.rates.length,
      0,
    ),
  };
}

/**
 * Simulación de retirada (dry-run): cuántos registros operativos se eliminarían
 * del inventario para este documento. Solo lectura; reutiliza la consulta de
 * trazabilidad. No borra nada.
 */
export async function dryRunUnpublishInventoryDocument(
  sourceDocumentId: string,
): Promise<DryRunUnpublishResult> {
  const published = await getPublishedInventoryByDocument(sourceDocumentId);

  return {
    hasPublishedRecords: published.accommodationCount + published.activityCount > 0,
    accommodationsToRemove: published.accommodationCount,
    accommodationRatesToRemove: published.accommodationRateCount,
    activitiesToRemove: published.activityCount,
    activityRatesToRemove: published.activityRateCount,
  };
}

/**
 * Retira del inventario operativo lo publicado desde un documento. Borra SOLO
 * las filas vinculadas a ESTE documento (por sourceDocumentId); nunca toca las
 * filas de Excel (sourceDocumentId null). Las tarifas caen por onDelete:
 * Cascade. Idempotente: si no hay nada publicado, no borra nada y devuelve 0.
 * Recuperable: se puede volver a publicar desde el staging aprobado.
 */
export async function unpublishInventoryDocument(
  sourceDocumentId: string,
): Promise<UnpublishResult> {
  // Conteo previo (para el resultado) reutilizando la trazabilidad.
  const published = await getPublishedInventoryByDocument(sourceDocumentId);

  await prisma.$transaction(async (tx) => {
    await tx.accommodation.deleteMany({ where: { sourceDocumentId } });
    await tx.activity.deleteMany({ where: { sourceDocumentId } });
  });

  return {
    accommodationsRemoved: published.accommodationCount,
    accommodationRatesRemoved: published.accommodationRateCount,
    activitiesRemoved: published.activityCount,
    activityRatesRemoved: published.activityRateCount,
  };
}

/** Error de validación al borrar un documento (p. ej. tiene publicados vivos). */
export class DeleteDocumentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeleteDocumentValidationError";
  }
}

/**
 * Simulación de borrado de un documento (solo lectura): cuántos candidatos
 * staging se eliminarían y si está bloqueado por tener registros publicados en
 * el inventario operativo (en cuyo caso primero hay que retirarlos).
 */
export async function dryRunDeleteInventoryDocument(
  sourceDocumentId: string,
): Promise<DryRunDeleteDocumentResult> {
  const staging = await countInventoryDocumentStaging(sourceDocumentId);
  const published = await getPublishedInventoryByDocument(sourceDocumentId);
  const blockedByPublished = published.accommodationCount + published.activityCount > 0;

  return {
    stagingAccommodations: staging.accommodations,
    stagingActivities: staging.activities,
    stagingTotal: staging.total,
    publishedAccommodations: published.accommodationCount,
    publishedActivities: published.activityCount,
    blockedByPublished,
  };
}

/**
 * Borra un documento registrado y sus candidatos staging (extracciones,
 * incidencias y staging caen por onDelete: Cascade). NO toca el inventario
 * operativo: si el documento tiene registros publicados, lanza un error y exige
 * retirarlos primero (los Accommodation/Activity referencian el documento por id
 * suelto, no por FK con cascade, así que nunca se borran sin querer).
 *
 * No elimina el archivo físico subido (en storage/): se deja tal cual.
 */
export async function deleteInventoryDocument(
  sourceDocumentId: string,
): Promise<DeleteDocumentResult> {
  const published = await getPublishedInventoryByDocument(sourceDocumentId);
  if (published.accommodationCount + published.activityCount > 0) {
    throw new DeleteDocumentValidationError(
      "El documento tiene registros publicados en el inventario. Retíralos primero (pestaña Publicados) y vuelve a intentarlo.",
    );
  }

  const staging = await countInventoryDocumentStaging(sourceDocumentId);

  await prisma.sourceDocument.delete({ where: { id: sourceDocumentId } });

  return {
    stagingAccommodationsRemoved: staging.accommodations,
    stagingActivitiesRemoved: staging.activities,
  };
}

/**
 * Retirada granular: elimina del inventario operativo UN registro publicado
 * concreto por su id. Soporta quitar un alojamiento o actividad completo (sus
 * tarifas caen por onDelete: Cascade) o una sola tarifa. Devuelve null si el id
 * no existe (la ruta responde 404). Solo borra el registro indicado; el resto
 * del inventario y los candidatos staging se conservan.
 */
export async function unpublishPublishedItem(
  kind: PublishedItemKind,
  id: string,
): Promise<UnpublishItemResult | null> {
  if (kind === "accommodation") {
    const existing = await prisma.accommodation.findUnique({
      where: { id },
      include: { rates: true },
    });
    if (!existing) return null;
    await prisma.accommodation.delete({ where: { id } });
    return {
      kind,
      removedAccommodations: 1,
      removedAccommodationRates: existing.rates.length,
      removedActivities: 0,
      removedActivityRates: 0,
    };
  }

  if (kind === "activity") {
    const existing = await prisma.activity.findUnique({
      where: { id },
      include: { rates: true },
    });
    if (!existing) return null;
    await prisma.activity.delete({ where: { id } });
    return {
      kind,
      removedAccommodations: 0,
      removedAccommodationRates: 0,
      removedActivities: 1,
      removedActivityRates: existing.rates.length,
    };
  }

  if (kind === "accommodation-rate") {
    const existing = await prisma.accommodationRate.findUnique({ where: { id } });
    if (!existing) return null;
    await prisma.accommodationRate.delete({ where: { id } });
    return {
      kind,
      removedAccommodations: 0,
      removedAccommodationRates: 1,
      removedActivities: 0,
      removedActivityRates: 0,
    };
  }

  // activity-rate
  const existing = await prisma.activityRate.findUnique({ where: { id } });
  if (!existing) return null;
  await prisma.activityRate.delete({ where: { id } });
  return {
    kind,
    removedAccommodations: 0,
    removedAccommodationRates: 0,
    removedActivities: 0,
    removedActivityRates: 1,
  };
}

/** Periodo legible de una tarifa operativa (rango de fechas o temporada). */
function catalogPeriod(rate: {
  dateFrom: Date | null;
  dateTo: Date | null;
  seasonName?: string | null;
}): string | null {
  const fmt = (date: Date | null) =>
    date ? date.toISOString().slice(0, 10) : null;
  const from = fmt(rate.dateFrom);
  const to = fmt(rate.dateTo);
  if (from && to) return `${from} → ${to}`;
  if (from) return `desde ${from}`;
  return rate.seasonName ?? null;
}

/**
 * Catálogo global del inventario operativo publicado: TODOS los alojamientos y
 * actividades (incluidas filas heredadas de Excel sin documento), con sus
 * tarifas y el nombre del documento de origen resuelto. Solo lectura.
 */
export async function getPublishedInventoryCatalog(): Promise<PublishedInventoryCatalog> {
  const [accommodations, activities] = await Promise.all([
    prisma.accommodation.findMany({
      include: { rates: { orderBy: [{ year: "asc" }] } },
      orderBy: [{ locality: "asc" }, { accommodationName: "asc" }],
    }),
    prisma.activity.findMany({
      include: { rates: { orderBy: [{ year: "asc" }] } },
      orderBy: [{ locationMain: "asc" }, { activityName: "asc" }],
    }),
  ]);

  // Resolver nombres de los documentos de origen en una sola consulta.
  const documentIds = [
    ...new Set(
      [...accommodations, ...activities]
        .map((item) => item.sourceDocumentId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const documents = documentIds.length
    ? await prisma.sourceDocument.findMany({
        where: { id: { in: documentIds } },
        select: { id: true, controlName: true },
      })
    : [];
  const documentNames = new Map(documents.map((doc) => [doc.id, doc.controlName]));

  const mappedAccommodations = accommodations.map((accommodation) => ({
    id: accommodation.id,
    accommodationName: accommodation.accommodationName,
    locality: accommodation.locality,
    categoryType: accommodation.categoryType,
    sourceDocumentId: accommodation.sourceDocumentId,
    sourceDocumentName: accommodation.sourceDocumentId
      ? documentNames.get(accommodation.sourceDocumentId) ?? null
      : null,
    rates: accommodation.rates.map((rate) => ({
      id: rate.id,
      year: rate.year,
      label: rate.boardType,
      period: catalogPeriod(rate),
      currency: rate.currency,
      amount: decimalToNumber(rate.pvpAmount) ?? decimalToNumber(rate.netSaleAmount),
    })),
  }));

  const mappedActivities = activities.map((activity) => ({
    id: activity.id,
    activityName: activity.activityName,
    supplierName: activity.supplierName,
    locationMain: activity.locationMain,
    sourceDocumentId: activity.sourceDocumentId,
    sourceDocumentName: activity.sourceDocumentId
      ? documentNames.get(activity.sourceDocumentId) ?? null
      : null,
    rates: activity.rates.map((rate) => ({
      id: rate.id,
      year: rate.year,
      label: rate.ageLabel,
      period: catalogPeriod({ dateFrom: null, dateTo: null }),
      currency: rate.currency,
      amount: decimalToNumber(rate.salePvpAmount),
    })),
  }));

  return {
    accommodations: mappedAccommodations,
    activities: mappedActivities,
    accommodationCount: mappedAccommodations.length,
    activityCount: mappedActivities.length,
    accommodationRateCount: mappedAccommodations.reduce((t, a) => t + a.rates.length, 0),
    activityRateCount: mappedActivities.reduce((t, a) => t + a.rates.length, 0),
  };
}