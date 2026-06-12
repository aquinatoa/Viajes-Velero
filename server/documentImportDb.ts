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