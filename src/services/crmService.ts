import type {
  Client,
  CrmOpportunityRecord,
  CrmPayload,
  CrmSyncLog,
  FindCandidateOpportunitiesResult,
  NormalizedRequestDraft,
  PrepareCrmPayloadInput,
  TripProposal
} from "../domain/types";
import {
  findClientByEmail,
  findCrmOpportunitiesByEmail,
  saveCrmOpportunity,
  saveCrmSyncLog
} from "../data/mockDb";
import { createId } from "./utils";

function buildCommonContact(client: Client) {
  return {
    email: client.email,
    first_name: client.firstName,
    last_name: client.lastName,
    full_name: client.fullName,
    is_returning_customer: client.isReturningCustomer,
    crm_contact_id: client.crmContactId ?? null
  };
}

function buildCommonAccount(client: Client) {
  return {
    crm_account_id: client.crmAccountId ?? null,
    account_lookup_strategy: client.crmAccountId ? "use_existing" : "resolve_or_create"
  };
}

export const prepareCrmPayload = ({
  client,
  request,
  proposal,
  opportunityRecommendation
}: PrepareCrmPayloadInput): CrmPayload => {
  const approvedAccommodation = proposal.accommodationOptions.find((option) => option.isSelected);
  const approvedActivities = proposal.activityOptions.filter((activity) => activity.isSelected);

  return {
    contact: buildCommonContact(client),
    account: buildCommonAccount(client),
    opportunity: {
      recommendation: opportunityRecommendation?.recommendation ?? "create_new",
      rationale: opportunityRecommendation?.rationale ?? "Sin evaluación previa de oportunidades.",
      candidate_ids: opportunityRecommendation?.opportunities.map((item) => item.id) ?? [],
      destination: request.destinationText,
      destination_country: request.destinationCountry,
      date_from: request.dateFrom,
      date_to: request.dateTo,
      participants: request.participants,
      teachers: request.teachers,
      age_range_text: request.ageRangeText,
      average_age_text: request.averageAgeText,
      group_type: request.groupType,
      regime_requested: request.regimeRequested,
      category_requested: request.categoryRequested,
      requirements_text: request.requirementsText,
      approved_option_number: proposal.approvedOptionNumber ?? null
    },
    approved_option: approvedAccommodation
      ? {
          option_number: approvedAccommodation.optionNumber,
          accommodation_name: approvedAccommodation.accommodationNameSnapshot,
          board_type: approvedAccommodation.boardType,
          date_from: approvedAccommodation.dateFrom,
          date_to: approvedAccommodation.dateTo,
          nights: approvedAccommodation.nights,
          participants: approvedAccommodation.participants,
          teachers: approvedAccommodation.teachers,
          total_pvp_text: approvedAccommodation.totalPvpText,
          price_breakdown_text: approvedAccommodation.priceBreakdownText,
          conditions_text: approvedAccommodation.conditionsText,
          observations_text: approvedAccommodation.observationsText
        }
      : null,
    activities: approvedActivities.map((activity) => ({
      option_number: activity.optionNumber,
      name: activity.activityNameSnapshot,
      provider: activity.providerSnapshot,
      duration: activity.durationSnapshot,
      price: activity.pvpSnapshot,
      description: activity.descriptionSnapshot
    }))
  };
};

export const prepareNewOpportunityPayload = ({
  client,
  request,
  proposal,
  opportunityRecommendation
}: PrepareCrmPayloadInput): CrmPayload => {
  const groupedActivities = proposal.accommodationOptions.map((option) => ({
    option_number: option.optionNumber,
    accommodation_name: option.accommodationNameSnapshot,
    board_type: option.boardType,
    total_pvp_text: option.totalPvpText,
    price_breakdown_text: option.priceBreakdownText,
    activities: proposal.activityOptions
      .filter((activity) => activity.optionNumber === option.optionNumber)
      .map((activity) => ({
        name: activity.activityNameSnapshot,
        provider: activity.providerSnapshot,
        duration: activity.durationSnapshot,
        price: activity.pvpSnapshot
      }))
  }));

  return {
    contact: buildCommonContact(client),
    account: buildCommonAccount(client),
    opportunity: {
      action: "create_new_opportunity",
      recommendation: opportunityRecommendation?.recommendation ?? "create_new",
      rationale: opportunityRecommendation?.rationale ?? "Nueva oportunidad preparada desde solicitud nueva.",
      destination: request.destinationText,
      destination_country: request.destinationCountry,
      date_from: request.dateFrom,
      date_to: request.dateTo,
      participants: request.participants,
      teachers: request.teachers,
      group_type: request.groupType,
      opportunity_name:
        proposal.summaryText || `Grupo ${request.destinationText} ${request.dateFrom || "pendiente"}`
    },
    approved_option: null,
    activities: groupedActivities
  };
};

export const saveOpportunityToCrmMock = (
  client: Client,
  request: NormalizedRequestDraft,
  proposal: TripProposal,
  payload: CrmPayload
) => {
  const record: CrmOpportunityRecord = {
    id: createId("crm_opp"),
    clientEmail: client.email,
    clientName: client.fullName,
    opportunityName:
      `${request.destinationText || "Destino pendiente"} ${request.dateFrom || ""}`.trim() ||
      "Oportunidad sin nombre",
    destination: request.destinationText,
    status: "sent",
    proposalId: proposal.id,
    proposalOptions: proposal.accommodationOptions.map((option) => ({
      optionNumber: option.optionNumber,
      accommodationName: option.accommodationNameSnapshot,
      totalPvpText: option.totalPvpText,
      boardType: option.boardType
    })),
    payload: payload as unknown as Record<string, unknown>
  };

  return saveCrmOpportunity(record);
};

export const searchExistingOpportunities = (email: string) => {
  const client = findClientByEmail(email);
  return {
    client,
    opportunities: findCrmOpportunitiesByEmail(email)
  };
};

export const prepareExistingOpportunityApprovalPayload = (
  opportunity: CrmOpportunityRecord,
  approvedOptionNumber: number
) => {
  const selectedOption = opportunity.proposalOptions.find(
    (option) => option.optionNumber === approvedOptionNumber
  );

  if (!selectedOption) {
    throw new Error("La opción seleccionada no existe en la oportunidad.");
  }

  const updatedOpportunity = {
    ...opportunity,
    status: "approved" as const,
    approvedOptionNumber
  };

  saveCrmOpportunity(updatedOpportunity);

  return {
    opportunity_id: opportunity.id,
    action: "update_existing_opportunity",
    approved_option: selectedOption,
    client_email: opportunity.clientEmail
  };
};

export const logCrmSyncAttempt = (payload: CrmPayload | Record<string, unknown>): CrmSyncLog => {
  return saveCrmSyncLog({
    id: createId("crm"),
    entityType: "trip_proposal",
    actionType: "prepare_payload",
    requestPayload: payload as Record<string, unknown>,
    responsePayload: { queued: true },
    syncStatus: "PENDING"
  });
};
