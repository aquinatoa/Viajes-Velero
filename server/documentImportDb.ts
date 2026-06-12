import { PrismaClient } from "@prisma/client";
import type { AiDocumentAnalysisResult } from "../src/domain/documentImportTypes";

const prisma = new PrismaClient();

export interface CreateInventoryDocumentInput {
  targetType: "ACCOMMODATION" | "ACTIVITY" | "MIXED" | "UNKNOWN";
  controlName: string;
  controlLocation?: string;
  controlYear?: number | null;
  controlCategory?: string;
  controlNotes?: string;
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

export async function listInventoryDocuments() {
  return prisma.sourceDocument.findMany({
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
      status: true,
      extractionStatus: true,
      requiresOcr: true,
      aiConfidence: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getInventoryDocumentDetail(documentId: string) {
  return prisma.sourceDocument.findUnique({
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

export async function addInventoryDocumentIssue(input: {
  sourceDocumentId: string;
  severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  issueType: string;
  message: string;
  fieldName?: string;
  rawValue?: string;
  pageNumber?: number;
}) {
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

export async function approveInventoryDocument(documentId: string) {
  return updateInventoryDocumentStatus(documentId, "APPROVED");
}

export async function rejectInventoryDocument(documentId: string) {
  return updateInventoryDocumentStatus(documentId, "REJECTED");
}

export async function markInventoryDocumentAsPendingReview(documentId: string) {
  return updateInventoryDocumentStatus(documentId, "PENDING_REVIEW", "EXTRACTED");
}

export interface StagingCreationContext {
  targetType: string;
  controlName: string;
}

export interface StagingCreationResult {
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
      seasonName: rate.seasonName ?? null,
      year: rate.year ?? null,
      dateFrom: toStagingDate(rate.dateFrom),
      dateTo: toStagingDate(rate.dateTo),
      boardType: rate.boardType ?? null,
      unitName: rate.unitName ?? null,
      rateUnit: rate.rateUnit ?? null,
      occupancyLabel: rate.occupancyLabel ?? null,
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

  if (!analysis.detectedAccommodation && hasAccommodationData) {
    warnings.push(
      "Se detectaron tarifas o condiciones sin un alojamiento claro; se creó un alojamiento provisional a partir del nombre de control.",
    );
  }

  const counts = await prisma.$transaction(async (tx) => {
    let accommodationsCount = 0;

    if (hasAccommodationData) {
      const detected = analysis.detectedAccommodation;

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
          rates: rateData.length > 0 ? { create: rateData } : undefined,
          adjustments: adjustmentData.length > 0 ? { create: adjustmentData } : undefined,
          policies: policyData.length > 0 ? { create: policyData } : undefined,
          blackoutDates: blackoutData.length > 0 ? { create: blackoutData } : undefined,
        },
      });

      accommodationsCount = 1;
    }

    let activitiesCount = 0;

    for (const activity of analysis.detectedActivities) {
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
        },
      });

      activitiesCount += 1;
    }

    return { accommodationsCount, activitiesCount };
  });

  return {
    accommodations: counts.accommodationsCount,
    rates: rateData.length,
    adjustments: adjustmentData.length,
    policies: policyData.length,
    blackoutDates: blackoutData.length,
    activities: counts.activitiesCount,
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
  /** Campo de precio: obliga moneda y no permite aprobar sin precio. */
  priceField?: string;
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
    priceField: "pvpAmount",
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
    priceField: "salePvpAmount",
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

  if (config.priceField) {
    const price = merged[config.priceField];
    const hasPrice = price !== null && price !== undefined;

    if (hasPrice && config.currencyField) {
      const currency = merged[config.currencyField];
      if (!currency || String(currency).trim() === "") {
        throw new StagingValidationError("La moneda es obligatoria cuando la tarifa tiene precio.");
      }
    }

    if (resultingStatus === "APPROVED" && !hasPrice) {
      throw new StagingValidationError("No se puede aprobar una tarifa sin precio.");
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
  warnings: string[];
}

const isApprovedStatus = (status: string) => status === "APPROVED";

export async function publishApprovedInventoryDocument(
  sourceDocumentId: string,
  context: PublishApprovedContext,
): Promise<PublishApprovedResult> {
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

  if (!anyPublishable) {
    throw new PublishValidationError(
      "No hay candidatos aprobados para publicar (se requiere al menos un alojamiento o actividad aprobado).",
    );
  }

  const warnings: string[] = [];
  let skippedAccommodations = 0;
  let skippedRates = 0;
  let skippedActivities = 0;
  let skippedActivityRates = 0;

  const accommodationsToCreate: Record<string, unknown>[] = [];

  for (const accommodation of accommodations) {
    if (!isApprovedStatus(accommodation.reviewStatus)) {
      skippedAccommodations += 1;
      const approvedChildRates = accommodation.rates.filter((rate) =>
        isApprovedStatus(rate.reviewStatus),
      ).length;
      if (approvedChildRates > 0) {
        warnings.push(
          `El alojamiento "${accommodation.accommodationName}" no está aprobado: no se publican sus ${approvedChildRates} tarifa(s) aprobada(s).`,
        );
        skippedRates += approvedChildRates;
      }
      continue;
    }

    const ratePayloads: Record<string, unknown>[] = [];
    for (const rate of accommodation.rates) {
      if (!isApprovedStatus(rate.reviewStatus)) {
        skippedRates += 1;
        continue;
      }

      const year = rate.year ?? context.controlYear ?? null;
      if (rate.pvpAmount === null || rate.pvpAmount === undefined) {
        warnings.push(`Tarifa de "${accommodation.accommodationName}" omitida: sin precio.`);
        skippedRates += 1;
        continue;
      }
      if (!rate.currency || rate.currency.trim() === "") {
        warnings.push(`Tarifa de "${accommodation.accommodationName}" omitida: sin moneda.`);
        skippedRates += 1;
        continue;
      }
      if (year === null) {
        warnings.push(`Tarifa de "${accommodation.accommodationName}" omitida: sin año.`);
        skippedRates += 1;
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
        pvpAmount: rate.pvpAmount,
        netSaleAmount: rate.netAmount,
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

    if (approvedPolicies.length > 0 || approvedAdjustments.length > 0 || approvedBlackouts.length > 0) {
      warnings.push(
        `En "${accommodation.accommodationName}" se plegaron a texto libre ${approvedPolicies.length} política(s), ${approvedAdjustments.length} suplemento(s) y ${approvedBlackouts.length} fecha(s) especial(es); se pierde su estructura.`,
      );
    }

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
      }
      continue;
    }

    const ratePayloads: Record<string, unknown>[] = [];
    for (const rate of activity.rates) {
      if (!isApprovedStatus(rate.reviewStatus)) {
        skippedActivityRates += 1;
        continue;
      }

      const year = rate.year ?? context.controlYear ?? null;
      if (rate.salePvpAmount === null || rate.salePvpAmount === undefined) {
        warnings.push(`Tarifa de "${activity.activityName}" omitida: sin precio.`);
        skippedActivityRates += 1;
        continue;
      }
      if (!rate.currency || rate.currency.trim() === "") {
        warnings.push(`Tarifa de "${activity.activityName}" omitida: sin moneda.`);
        skippedActivityRates += 1;
        continue;
      }
      if (year === null) {
        warnings.push(`Tarifa de "${activity.activityName}" omitida: sin año.`);
        skippedActivityRates += 1;
        continue;
      }

      ratePayloads.push({
        year,
        ageLabel: rate.ageLabel,
        ageMin: rate.ageMin,
        ageMax: rate.ageMax,
        currency: rate.currency,
        salePvpAmount: rate.salePvpAmount,
        costNetAmount: rate.costNetAmount,
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

  await prisma.$transaction(async (tx) => {
    // Idempotencia: borrar lo publicado previamente desde ESTE documento y
    // reinsertar. No afecta a filas de Excel (sourceDocumentId null).
    await tx.accommodation.deleteMany({ where: { sourceDocumentId } });
    await tx.activity.deleteMany({ where: { sourceDocumentId } });

    for (const data of accommodationsToCreate) {
      await tx.accommodation.create({ data: data as never });
    }
    for (const data of activitiesToCreate) {
      await tx.activity.create({ data: data as never });
    }
  });

  const accommodationRates = accommodationsToCreate.reduce(
    (total, item) => total + ((item.rates as { create: unknown[] }).create.length ?? 0),
    0,
  );
  const activityRates = activitiesToCreate.reduce(
    (total, item) => total + ((item.rates as { create: unknown[] }).create.length ?? 0),
    0,
  );

  return {
    accommodations: accommodationsToCreate.length,
    accommodationRates,
    activities: activitiesToCreate.length,
    activityRates,
    skippedAccommodations,
    skippedRates,
    skippedActivities,
    skippedActivityRates,
    warnings,
  };
}