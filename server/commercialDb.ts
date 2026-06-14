import { PrismaClient } from "@prisma/client";
import type {
  Client,
  TripProposal,
  TripRequest,
} from "../src/domain/types";

const prisma = new PrismaClient();

function toDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateStr(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

// ----------------------------------------------------------------------------
// Clientes
// ----------------------------------------------------------------------------

interface UpsertClientInput {
  email: string;
  firstName: string;
  lastName: string;
  clientType: "new" | "existing";
}

function mapClient(row: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  isReturningCustomer: boolean;
  crmContactId: string | null;
  crmAccountId: string | null;
}): Client {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: row.fullName,
    isReturningCustomer: row.isReturningCustomer,
    crmContactId: row.crmContactId ?? undefined,
    crmAccountId: row.crmAccountId ?? undefined,
  };
}

export async function findClientByEmailDb(email: string): Promise<Client | null> {
  const row = await prisma.client.findUnique({ where: { email: email.toLowerCase() } });
  return row ? mapClient(row) : null;
}

/**
 * Crea o actualiza un cliente por email (clave única). Si ya existía, se marca
 * como cliente recurrente y se actualizan nombre/apellidos si vienen.
 */
export async function upsertClientFromIntakeDb(input: UpsertClientInput): Promise<Client> {
  const email = input.email.toLowerCase();
  const existing = await prisma.client.findUnique({ where: { email } });

  const firstName = input.firstName || existing?.firstName || "";
  const lastName = input.lastName || existing?.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();

  const row = await prisma.client.upsert({
    where: { email },
    update: {
      firstName,
      lastName,
      fullName,
      isReturningCustomer: true,
    },
    create: {
      email,
      firstName,
      lastName,
      fullName,
      isReturningCustomer: input.clientType === "existing",
    },
  });

  return mapClient(row);
}

// ----------------------------------------------------------------------------
// Solicitudes de viaje
// ----------------------------------------------------------------------------

export interface SaveTripRequestInput {
  clientId: string;
  opportunityName?: string | null;
  originalMessage: string;
  language?: string | null;
  destinationText?: string | null;
  destinationCountry?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  participants?: number | null;
  teachers?: number | null;
  ageRangeText?: string | null;
  averageAgeText?: string | null;
  groupType?: string | null;
  regimeRequested?: string | null;
  categoryRequested?: string | null;
  requirementsText?: string | null;
  requestStatus: string;
}

/**
 * Persiste una solicitud de viaje normalizada. Devuelve el TripRequest del
 * dominio (los `missingFields`/`warnings` son derivados y no se almacenan).
 */
export async function saveTripRequestDb(input: SaveTripRequestInput): Promise<TripRequest> {
  const row = await prisma.tripRequest.create({
    data: {
      clientId: input.clientId,
      opportunityName: input.opportunityName ?? null,
      originalMessage: input.originalMessage,
      language: input.language ?? null,
      destinationText: input.destinationText ?? null,
      destinationCountry: input.destinationCountry ?? null,
      dateFrom: toDate(input.dateFrom),
      dateTo: toDate(input.dateTo),
      participants: input.participants ?? null,
      teachers: input.teachers ?? null,
      ageRangeText: input.ageRangeText ?? null,
      averageAgeText: input.averageAgeText ?? null,
      groupType: input.groupType ?? null,
      regimeRequested: input.regimeRequested ?? null,
      categoryRequested: input.categoryRequested ?? null,
      requirementsText: input.requirementsText ?? null,
      requestStatus: input.requestStatus as never,
    },
  });

  return {
    id: row.id,
    clientId: row.clientId,
    opportunityName: row.opportunityName ?? undefined,
    originalMessage: row.originalMessage,
    language: row.language ?? "",
    destinationText: row.destinationText ?? "",
    destinationCountry: row.destinationCountry ?? "",
    dateFrom: dateStr(row.dateFrom),
    dateTo: dateStr(row.dateTo),
    participants: row.participants,
    teachers: row.teachers,
    ageRangeText: row.ageRangeText ?? "",
    averageAgeText: row.averageAgeText ?? "",
    groupType: row.groupType ?? "",
    regimeRequested: row.regimeRequested ?? "",
    categoryRequested: row.categoryRequested ?? "",
    requirementsText: row.requirementsText ?? "",
    requestStatus: row.requestStatus as TripRequest["requestStatus"],
    missingFields: [],
    warnings: [],
  };
}

/** Solicitudes previas de un cliente (para detectar oportunidades candidatas). */
export async function getClientTripRequestsDb(clientId: string) {
  const rows = await prisma.tripRequest.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      opportunityName: true,
      destinationText: true,
      createdAt: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    opportunityName: row.opportunityName,
    destinationText: row.destinationText,
    createdAt: row.createdAt.toISOString(),
  }));
}

// ----------------------------------------------------------------------------
// Propuestas
// ----------------------------------------------------------------------------

export interface SaveTripProposalInput {
  tripRequestId: string;
  versionNumber: number;
  proposalStatus: string;
  approvedOptionNumber?: number | null;
  summaryText?: string | null;
  accommodationOptions: {
    optionNumber: number;
    accommodationId: string;
    accommodationNameSnapshot?: string | null;
    boardType?: string | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    nights?: number | null;
    participants?: number | null;
    teachers?: number | null;
    totalPvpText?: string | null;
    priceBreakdownText?: string | null;
    conditionsText?: string | null;
    observationsText?: string | null;
    isSelected?: boolean;
  }[];
  activityOptions: {
    optionNumber: number;
    activityId: string;
    displayOrder: number;
    activityNameSnapshot: string;
    providerSnapshot?: string | null;
    durationSnapshot?: string | null;
    pvpSnapshot?: string | null;
    descriptionSnapshot?: string | null;
    isSelected?: boolean;
  }[];
}

/**
 * Persiste una propuesta con sus opciones (alojamiento y actividad). Los
 * `accommodationId`/`activityId` deben referenciar filas reales del inventario
 * (vienen de la búsqueda en BD), por la FK del esquema.
 */
export async function saveTripProposalDb(input: SaveTripProposalInput): Promise<TripProposal> {
  const row = await prisma.tripProposal.create({
    data: {
      tripRequestId: input.tripRequestId,
      versionNumber: input.versionNumber,
      proposalStatus: input.proposalStatus as never,
      approvedOptionNumber: input.approvedOptionNumber ?? null,
      summaryText: input.summaryText ?? null,
      accommodationOptions: {
        create: input.accommodationOptions.map((option) => ({
          accommodationId: option.accommodationId,
          optionNumber: option.optionNumber,
          accommodationNameSnapshot: option.accommodationNameSnapshot ?? null,
          boardType: option.boardType ?? null,
          dateFrom: toDate(option.dateFrom),
          dateTo: toDate(option.dateTo),
          nights: option.nights ?? null,
          participants: option.participants ?? null,
          teachers: option.teachers ?? null,
          totalPvpText: option.totalPvpText ?? null,
          priceBreakdownText: option.priceBreakdownText ?? null,
          conditionsText: option.conditionsText ?? null,
          observationsText: option.observationsText ?? null,
          isSelected: option.isSelected ?? false,
        })),
      },
      activityOptions: {
        create: input.activityOptions.map((option) => ({
          activityId: option.activityId,
          optionNumber: option.optionNumber,
          displayOrder: option.displayOrder,
          activityNameSnapshot: option.activityNameSnapshot,
          providerSnapshot: option.providerSnapshot ?? null,
          durationSnapshot: option.durationSnapshot ?? null,
          pvpSnapshot: option.pvpSnapshot ?? null,
          descriptionSnapshot: option.descriptionSnapshot ?? null,
          isSelected: option.isSelected ?? false,
        })),
      },
    },
    include: { accommodationOptions: true, activityOptions: true },
  });

  return {
    id: row.id,
    tripRequestId: row.tripRequestId,
    versionNumber: row.versionNumber,
    proposalStatus: row.proposalStatus as TripProposal["proposalStatus"],
    approvedOptionNumber: row.approvedOptionNumber ?? undefined,
    summaryText: row.summaryText ?? "",
    accommodationOptions: row.accommodationOptions.map((option) => ({
      id: option.id,
      optionNumber: option.optionNumber,
      accommodationId: option.accommodationId,
      accommodationNameSnapshot: option.accommodationNameSnapshot ?? "",
      boardType: option.boardType ?? "",
      dateFrom: dateStr(option.dateFrom),
      dateTo: dateStr(option.dateTo),
      nights: option.nights ?? 0,
      participants: option.participants ?? 0,
      teachers: option.teachers ?? 0,
      totalPvpText: option.totalPvpText ?? "",
      priceBreakdownText: option.priceBreakdownText ?? "",
      conditionsText: option.conditionsText ?? "",
      observationsText: option.observationsText ?? "",
      isSelected: option.isSelected,
    })),
    activityOptions: row.activityOptions.map((option) => ({
      id: option.id,
      optionNumber: option.optionNumber,
      activityId: option.activityId,
      displayOrder: option.displayOrder,
      activityNameSnapshot: option.activityNameSnapshot,
      providerSnapshot: option.providerSnapshot ?? "",
      durationSnapshot: option.durationSnapshot ?? "",
      pvpSnapshot: option.pvpSnapshot ?? "",
      descriptionSnapshot: option.descriptionSnapshot ?? "",
      isSelected: option.isSelected,
    })),
  };
}

/** Marca una propuesta como aprobada y fija la opción elegida (atómico). */
export async function approveTripProposalDb(
  proposalId: string,
  approvedOptionNumber: number,
): Promise<TripProposal | null> {
  const existing = await prisma.tripProposal.findUnique({ where: { id: proposalId } });
  if (!existing) return null;

  await prisma.$transaction([
    prisma.tripProposal.update({
      where: { id: proposalId },
      data: { proposalStatus: "APPROVED" as never, approvedOptionNumber },
    }),
    prisma.proposalAccommodationOption.updateMany({
      where: { proposalId },
      data: { isSelected: false },
    }),
    prisma.proposalAccommodationOption.updateMany({
      where: { proposalId, optionNumber: approvedOptionNumber },
      data: { isSelected: true },
    }),
    prisma.proposalActivityOption.updateMany({
      where: { proposalId },
      data: { isSelected: false },
    }),
    prisma.proposalActivityOption.updateMany({
      where: { proposalId, optionNumber: approvedOptionNumber },
      data: { isSelected: true },
    }),
  ]);

  const row = await prisma.tripProposal.findUnique({
    where: { id: proposalId },
    include: { accommodationOptions: true, activityOptions: true },
  });
  if (!row) return null;

  return {
    id: row.id,
    tripRequestId: row.tripRequestId,
    versionNumber: row.versionNumber,
    proposalStatus: row.proposalStatus as TripProposal["proposalStatus"],
    approvedOptionNumber: row.approvedOptionNumber ?? undefined,
    summaryText: row.summaryText ?? "",
    accommodationOptions: row.accommodationOptions.map((option) => ({
      id: option.id,
      optionNumber: option.optionNumber,
      accommodationId: option.accommodationId,
      accommodationNameSnapshot: option.accommodationNameSnapshot ?? "",
      boardType: option.boardType ?? "",
      dateFrom: dateStr(option.dateFrom),
      dateTo: dateStr(option.dateTo),
      nights: option.nights ?? 0,
      participants: option.participants ?? 0,
      teachers: option.teachers ?? 0,
      totalPvpText: option.totalPvpText ?? "",
      priceBreakdownText: option.priceBreakdownText ?? "",
      conditionsText: option.conditionsText ?? "",
      observationsText: option.observationsText ?? "",
      isSelected: option.isSelected,
    })),
    activityOptions: row.activityOptions.map((option) => ({
      id: option.id,
      optionNumber: option.optionNumber,
      activityId: option.activityId,
      displayOrder: option.displayOrder,
      activityNameSnapshot: option.activityNameSnapshot,
      providerSnapshot: option.providerSnapshot ?? "",
      durationSnapshot: option.durationSnapshot ?? "",
      pvpSnapshot: option.pvpSnapshot ?? "",
      descriptionSnapshot: option.descriptionSnapshot ?? "",
      isSelected: option.isSelected,
    })),
  };
}
