import type {
  Client,
  CrmPayload,
  CrmSyncLog,
  PrepareCrmPayloadInput
} from "../domain/types";
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

/**
 * Registro local del intento de sincronización con CRM (solo en memoria de la
 * sesión; el envío real lo hace Zoho vía apiClient). No se persiste.
 */
export const logCrmSyncAttempt = (payload: CrmPayload | Record<string, unknown>): CrmSyncLog => {
  return {
    id: createId("crm"),
    entityType: "trip_proposal",
    actionType: "prepare_payload",
    requestPayload: payload as Record<string, unknown>,
    responsePayload: { queued: true },
    syncStatus: "PENDING"
  };
};
