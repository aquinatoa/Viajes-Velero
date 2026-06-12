import type {
  ApproveProposalInput,
  BuildProposalInput,
  ProposalActivityOption,
  TripProposal
} from "../domain/types";
import { saveTripProposal } from "../data/mockDb";
import { findAccommodationRate, findActivityRate } from "./searchService";
import { createId, diffNights, formatCurrency } from "./utils";

function ensureProposalInputs(input: BuildProposalInput) {
  if (input.builderState.selectedAccommodationIds.length === 0) {
    throw new Error("Selecciona al menos un alojamiento para construir la propuesta.");
  }

  if (input.builderState.selectedAccommodationIds.length > 3) {
    throw new Error("Solo se permiten hasta 3 alojamientos por propuesta.");
  }

  if (!input.normalized.dateFrom || !input.normalized.dateTo) {
    throw new Error("La propuesta necesita fechas válidas.");
  }

  if (input.normalized.participants === null || input.normalized.teachers === null) {
    throw new Error("La propuesta necesita participantes y profesores informados.");
  }
}

export const buildProposal = (input: BuildProposalInput): TripProposal => {
  ensureProposalInputs(input);

  const participants = input.normalized.participants as number;
  const teachers = input.normalized.teachers as number;
  const nights = diffNights(input.normalized.dateFrom, input.normalized.dateTo);
  const accommodationMap = new Map(input.accommodationMatches.map((item) => [item.accommodation.id, item]));
  const activityMap = new Map(input.activityMatches.map((item) => [item.activity.id, item]));

  const accommodationOptions = input.builderState.selectedAccommodationIds.slice(0, 3).map((id, index) => {
    const selected = accommodationMap.get(id);

    if (!selected) {
      throw new Error("Uno de los alojamientos seleccionados ya no está disponible en la búsqueda actual.");
    }

    const rate =
      findAccommodationRate(selected.accommodation.id, {
        destinationText: input.normalized.destinationText,
        destinationCountry: input.normalized.destinationCountry,
        boardType: input.normalized.regimeRequested,
        categoryRequested: input.normalized.categoryRequested,
        dateFrom: input.normalized.dateFrom,
        dateTo: input.normalized.dateTo
      }) ?? selected.rate;

    const total = rate.pvpAmount * participants * nights;

    return {
      id: createId("pao"),
      optionNumber: index + 1,
      accommodationId: selected.accommodation.id,
      accommodationNameSnapshot: selected.accommodation.accommodationName,
      boardType: rate.boardType,
      dateFrom: input.normalized.dateFrom,
      dateTo: input.normalized.dateTo,
      nights,
      participants,
      teachers,
      totalPvpText: formatCurrency(total),
      priceBreakdownText: `${formatCurrency(rate.pvpAmount)} por pax y noche x ${participants} participantes x ${nights} noches`,
      conditionsText: selected.accommodation.conditionsText,
      observationsText: selected.accommodation.observations,
      isSelected: false
    };
  });

  const activityOptions: ProposalActivityOption[] = accommodationOptions.flatMap((option) => {
    const activityIds = input.builderState.activitiesByOption[option.optionNumber] ?? [];

    return activityIds.map((activityId, index) => {
      const selected = activityMap.get(activityId);

      if (!selected) {
        throw new Error("Una de las actividades seleccionadas ya no es válida para los filtros actuales.");
      }

      const rate =
        findActivityRate(selected.activity.id, {
          destinationText: input.normalized.destinationText,
          destinationCountry: input.normalized.destinationCountry,
          ageRangeText: input.normalized.ageRangeText,
          averageAgeText: input.normalized.averageAgeText
        }) ?? selected.rate;

      return {
        id: createId("pact"),
        optionNumber: option.optionNumber,
        activityId: selected.activity.id,
        displayOrder: index + 1,
        activityNameSnapshot: selected.activity.activityName,
        providerSnapshot: selected.activity.supplierName,
        durationSnapshot: selected.activity.durationText,
        pvpSnapshot: formatCurrency(rate.salePvpAmount),
        descriptionSnapshot: selected.activity.descriptionText,
        isSelected: false
      };
    });
  });

  const summaryText = `${accommodationOptions.length} opciones, ${nights} noches, ${participants} participantes y ${activityOptions.length} actividades asignadas.`;

  return saveTripProposal({
    id: createId("proposal"),
    tripRequestId: input.tripRequestId,
    versionNumber: 1,
    proposalStatus: "READY_FOR_APPROVAL",
    summaryText,
    accommodationOptions,
    activityOptions
  });
};

export const approveProposal = ({ proposal, approvedOptionNumber }: ApproveProposalInput): TripProposal => {
  const nextProposal = {
    ...proposal,
    proposalStatus: "APPROVED" as const,
    approvedOptionNumber,
    accommodationOptions: proposal.accommodationOptions.map((option) => ({
      ...option,
      isSelected: option.optionNumber === approvedOptionNumber
    })),
    activityOptions: proposal.activityOptions.map((activity) => ({
      ...activity,
      isSelected: activity.optionNumber === approvedOptionNumber
    }))
  };

  return saveTripProposal(nextProposal);
};

export const confirmFinalSelection = (proposal: TripProposal, optionNumber: number) => {
  return approveProposal({ proposal, approvedOptionNumber: optionNumber });
};
