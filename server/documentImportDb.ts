import { PrismaClient } from "@prisma/client";

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