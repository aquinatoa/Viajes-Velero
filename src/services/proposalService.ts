import type {
  ApproveProposalInput,
  BuildProposalInput,
  TripProposal
} from "../domain/types";
import { approveTripProposalApi, saveTripProposalApi } from "./apiClient";
import { diffNights, formatCurrency } from "./utils";

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

export const buildProposal = (input: BuildProposalInput): Promise<TripProposal> => {
  ensureProposalInputs(input);

  const participants = input.normalized.participants as number;
  const teachers = input.normalized.teachers as number;
  const nights = diffNights(input.normalized.dateFrom, input.normalized.dateTo);
  const accommodationMap = new Map(input.accommodationMatches.map((item) => [item.accommodation.id, item]));
  const activityMap = new Map(input.activityMatches.map((item) => [item.activity.id, item]));

  // El precio sale de la tarifa REAL del match de búsqueda (BD). Si la tarifa
  // trae el importe como neto en vez de PVP, se usa el neto.
  const accommodationOptions = input.builderState.selectedAccommodationIds.slice(0, 3).map((id, index) => {
    const selected = accommodationMap.get(id);

    if (!selected) {
      throw new Error("Uno de los alojamientos seleccionados ya no está disponible en la búsqueda actual.");
    }

    const rate = selected.rate;
    const unitPrice = rate.pvpAmount || rate.netSaleAmount || 0;
    const total = unitPrice * participants * nights;

    return {
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
      priceBreakdownText: `${formatCurrency(unitPrice)} por pax y noche x ${participants} participantes x ${nights} noches`,
      conditionsText: selected.accommodation.conditionsText,
      observationsText: selected.accommodation.observations,
      isSelected: false
    };
  });

  const activityOptions = accommodationOptions.flatMap((option) => {
    const activityIds = input.builderState.activitiesByOption[option.optionNumber] ?? [];

    return activityIds.map((activityId, index) => {
      const selected = activityMap.get(activityId);

      if (!selected) {
        throw new Error("Una de las actividades seleccionadas ya no es válida para los filtros actuales.");
      }

      const rate = selected.rate;

      return {
        optionNumber: option.optionNumber,
        activityId: selected.activity.id,
        displayOrder: index + 1,
        activityNameSnapshot: selected.activity.activityName,
        providerSnapshot: selected.activity.supplierName,
        durationSnapshot: selected.activity.durationText,
        pvpSnapshot: rate.salePvpAmount > 0 ? formatCurrency(rate.salePvpAmount) : "A consultar",
        descriptionSnapshot: selected.activity.descriptionText,
        isSelected: false
      };
    });
  });

  const uniqueActivities = new Set(activityOptions.map((a) => a.activityId)).size;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const summaryText = `${plural(accommodationOptions.length, "opción", "opciones")}, ${plural(
    nights,
    "noche",
    "noches",
  )}, ${participants} participantes y ${plural(uniqueActivities, "actividad", "actividades")}.`;

  return saveTripProposalApi({
    tripRequestId: input.tripRequestId,
    versionNumber: 1,
    proposalStatus: "READY_FOR_APPROVAL",
    summaryText,
    accommodationOptions,
    activityOptions
  });
};

export const approveProposal = ({
  proposal,
  approvedOptionNumber
}: ApproveProposalInput): Promise<TripProposal> => {
  return approveTripProposalApi(proposal.id, approvedOptionNumber);
};

export const confirmFinalSelection = (proposal: TripProposal, optionNumber: number) => {
  return approveProposal({ proposal, approvedOptionNumber: optionNumber });
};
