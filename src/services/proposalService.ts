import { porAlumno, totalDeLineas } from "../domain/lineasDeActividad";
import { textoDelDescuento } from "../domain/descuentoDeActividad";
import { textoDelDesglose } from "../domain/estancia";
import type {
  ApproveProposalInput,
  BuildProposalInput,
  TripProposal
} from "../domain/types";
import { approveTripProposalApi, saveTripProposalApi } from "./apiClient";
import { applyDefaultMarkup, totalAlojamiento } from "./pricing";
import { diffNights, formatCurrencyExact } from "./utils";

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
    // El PVP publicado ya incluye el margen (regla del 8% al publicar). Si por
    // datos antiguos solo hubiera neto, se aplica el 8% para no vender a coste.
    const precioDe = (item: { pvpAmount: number; netSaleAmount: number }) =>
      item.pvpAmount || (item.netSaleAmount ? applyDefaultMarkup(item.netSaleAmount) : 0);

    const unitPrice = precioDe(rate);
    const costeDe = (item: { netSaleAmount: number }) => (item.netSaleAmount > 0 ? item.netSaleAmount : null);
    // Los profesores duermen en habitación individual y cuestan más. Antes no
    // se cobraban en absoluto: el total era solo alumnos, y en un grupo de 40 +
    // 4 profesores eso son cuatro personas alojadas gratis toda la semana.
    const teacherPrice = selected.singleRate ? precioDe(selected.singleRate) : unitPrice;
    const total = totalAlojamiento({ unitPrice, teacherPrice, participants, teachers, nights });

    const desglose = [`${formatCurrencyExact(unitPrice)} x ${participants} alumnos`];
    if (teachers > 0) {
      desglose.push(
        selected.singleRate
          ? `${formatCurrencyExact(teacherPrice)} x ${teachers} profesores (uso individual)`
          : `${formatCurrencyExact(teacherPrice)} x ${teachers} profesores (sin tarifa individual: mismo precio)`,
      );
    }

    // Con la estancia calculada en el lienzo (pensión por noche, profesores y
    // chófer: Ruth, 19/10/2026), manda ella: total, desglose y pensiones.
    const estancia = selected.estancia ?? null;
    return {
      optionNumber: index + 1,
      accommodationId: selected.accommodation.id,
      accommodationNameSnapshot: selected.accommodation.accommodationName,
      boardType: estancia ? estancia.regimenes : rate.boardType,
      dateFrom: input.normalized.dateFrom,
      dateTo: input.normalized.dateTo,
      nights,
      participants,
      teachers,
      totalPvpText: formatCurrencyExact(estancia ? estancia.total : total),
      priceBreakdownText: estancia
        ? textoDelDesglose(estancia, participants, teachers, estancia.chofer)
        : `${desglose.join(" + ")}, por noche x ${nights} ${nights === 1 ? "noche" : "noches"}`,
      conditionsText: selected.accommodation.conditionsText,
      observationsText: selected.accommodation.observations,
      // Las gratuidades: «1 gratuidad en base doble por cada 25 de pago». Están
      // en el catálogo y no llegaban a la propuesta, así que el documento que
      // ve el colegio no las decía. Es información que cambia el precio.
      freePolicyText: selected.accommodation.freePolicy,
      // El coste de la tarifa elegida: lo que el CRM necesita para saber el
      // margen. Antes se buscaba después en el catálogo por el precio; un
      // alojamiento ad hoc no está en el catálogo y se quedaba sin coste.
      // Con la estancia, el de su primer tramo (lo que había hasta ahora) y,
      // aparte, el de cada tramo: con dos temporadas o pensiones no es uno.
      studentCostAmount: estancia ? estancia.tramos[0]?.alumno.coste ?? null : costeDe(rate),
      teacherCostAmount: estancia
        ? estancia.tramos[0]?.profesor.coste ?? null
        : selected.singleRate
          ? costeDe(selected.singleRate)
          : costeDe(rate),
      costsJson: estancia
        ? JSON.stringify(
            estancia.tramos.map((t) => ({
              alumno: t.alumno.coste ?? null,
              profesor: t.profesor.coste ?? null,
              chofer: t.chofer?.coste ?? null,
            })),
          )
        : null,
      supplierQuoteId: selected.cotizacionId ?? null,
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
      // Las líneas (tarifa × cantidad) que puso quien cotiza. Con ellas, lo
      // que se suma por alumno es el total del grupo repartido entre los
      // alumnos; sin ellas, el precio por persona de la tarifa, como antes.
      const activas = (input.builderState.activityLines?.[activityId] ?? []).filter((l) => l.cantidad > 0);
      const total = activas.length ? totalDeLineas(activas) : null;
      const importePorAlumno = activas.length ? porAlumno(activas, participants) : null;

      return {
        optionNumber: option.optionNumber,
        activityId: selected.activity.id,
        displayOrder: index + 1,
        activityNameSnapshot: selected.activity.activityName,
        providerSnapshot: selected.activity.supplierName,
        durationSnapshot: selected.activity.durationText,
        // Con céntimos, como el resto del documento: el precio de una actividad
        // entra en el total del viaje, así que redondearlo aquí hacía que la
        // suma del resumen no cuadrara con lo que se ve arriba.
        pvpSnapshot:
          importePorAlumno !== null
            ? formatCurrencyExact(importePorAlumno)
            : rate.salePvpAmount > 0
              ? formatCurrencyExact(rate.salePvpAmount)
              : "A consultar",
        // El descuento se dice en el documento: Oravia lo usa para promocionar
        // que el colegio contrate también el alojamiento (19/10/2026).
        descriptionSnapshot: selected.descuento
          ? [selected.activity.descriptionText, `Precio con descuento: ${textoDelDescuento(selected.descuento)}.`]
              .filter(Boolean)
              .join("\n")
          : selected.activity.descriptionText,
        lines: activas.length ? activas : null,
        amountTotal: total,
        // Con líneas (varias tarifas × cantidad) no hay un coste por alumno.
        unitCostAmount: !activas.length && rate.costNetAmount > 0 ? rate.costNetAmount : null,
        supplierQuoteId: selected.cotizacionId ?? null,
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
    // El estado del lienzo que no está en las opciones: lo lee «Rehacer la
    // propuesta» para que la versión nueva salga igual que la enviada.
    stayJson: JSON.stringify({
      composicion: input.builderState.composicion ?? null,
      canal: input.builderState.canal ?? null,
      tope: input.builderState.tope ?? null,
      requisitos: input.builderState.requisitos ?? [],
      descuentos: input.builderState.descuentos ?? {},
      preciosFijados: input.builderState.preciosFijados ?? {},
      lineas: input.builderState.lineasSinDescuento ?? {},
    }),
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
