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

/** Importe (€) en número a partir del total formateado de una opción ("6.528 €" → 6528). */
function amountFromText(text: string | undefined): number | null {
  if (!text) return null;
  const digits = text.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

/**
 * Texto legible del viaje para el campo Description de Zoho (en vez de un JSON
 * crudo): cabecera con los datos del grupo y, debajo, cada opción con su precio
 * y actividades.
 */
function buildOpportunityDescription(
  request: PrepareCrmPayloadInput["request"],
  proposal: PrepareCrmPayloadInput["proposal"]
): string {
  const lines: string[] = [];
  const group = [
    request.participants ? `${request.participants} alumnos` : null,
    request.teachers ? `${request.teachers} profesores` : null
  ]
    .filter(Boolean)
    .join(" · ");

  lines.push("SOLICITUD DE VIAJE");
  if (request.destinationText) lines.push(`Destino: ${request.destinationText}`);
  if (request.dateFrom && request.dateTo) lines.push(`Fechas: ${request.dateFrom} → ${request.dateTo}`);
  if (group) lines.push(`Grupo: ${group}`);
  if (request.regimeRequested) lines.push(`Régimen: ${request.regimeRequested}`);
  if (request.categoryRequested) lines.push(`Categoría: ${request.categoryRequested}`);
  if (request.ageRangeText) lines.push(`Edades: ${request.ageRangeText}`);
  if (request.requirementsText) lines.push(`Requisitos: ${request.requirementsText}`);

  lines.push("", "OPCIONES DE ALOJAMIENTO");
  for (const option of proposal.accommodationOptions) {
    lines.push(
      `${option.optionNumber}) ${option.accommodationNameSnapshot}` +
        (option.boardType ? ` (${option.boardType})` : "")
    );
    lines.push(`   Total: ${option.totalPvpText} — ${option.priceBreakdownText}`);
    const acts = proposal.activityOptions.filter((a) => a.optionNumber === option.optionNumber);
    if (acts.length > 0) {
      lines.push(
        `   Actividades: ${acts.map((a) => `${a.activityNameSnapshot} (${a.pvpSnapshot})`).join(", ")}`
      );
    }
  }

  return lines.join("\n");
}

export const prepareNewOpportunityPayload = ({
  client,
  request,
  proposal,
  opportunityRecommendation,
  opportunityName
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

  // Deal_Name = nombre de oportunidad escrito por el operador (con respaldos).
  const dealName =
    opportunityName?.trim() ||
    proposal.summaryText ||
    `Grupo ${request.destinationText} ${request.dateFrom || "pendiente"}`;

  // Importe del trato = total de la opción 1 (la principal/mejor).
  const amount = amountFromText(proposal.accommodationOptions[0]?.totalPvpText);

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
      opportunity_name: dealName,
      amount,
      description: buildOpportunityDescription(request, proposal)
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
