import type {
  AccommodationRate,
  ActivityRate,
  MissingField,
  SearchAccommodationsResult,
  SearchActivitiesResult,
  SearchFilters,
  WarningItem
} from "../domain/types";
import {
  accommodationRates,
  accommodations,
  activities,
  activityRates
} from "../data/mockData";
import { diffNights } from "./utils";

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function extractRequestedCategories(categoryRequested?: string) {
  if (!categoryRequested) {
    return [];
  }

  return [...categoryRequested.matchAll(/\b([2-5]\*)\b/g)].map((match) => match[1]);
}

function parseAgeRange(filters: SearchFilters) {
  const raw = filters.ageRangeText?.trim();

  if (raw) {
    const range = raw.match(/(\d{1,2})\s*-\s*(\d{1,2})/);

    if (range) {
      return {
        min: Number(range[1]),
        max: Number(range[2])
      };
    }
  }

  const average = filters.averageAgeText?.match(/(\d{1,2})/);

  if (average) {
    const age = Number(average[1]);
    return { min: age, max: age };
  }

  return null;
}

function evaluateAccommodationRate(
  rate: AccommodationRate,
  filters: SearchFilters,
  requestedCategories: string[]
) {
  const reasons: string[] = [];
  let score = 0;

  if (normalizeText(rate.boardType) === normalizeText(filters.boardType ?? "")) {
    score += 35;
    reasons.push("Coincide el régimen solicitado.");
  } else if (!filters.boardType) {
    score += 10;
  }

  if (requestedCategories.length === 0) {
    score += 10;
  }

  const nights =
    filters.dateFrom && filters.dateTo ? diffNights(filters.dateFrom, filters.dateTo) : null;

  if (nights !== null && nights >= rate.minNights) {
    score += 20;
    reasons.push(`Cumple la estancia mínima de ${rate.minNights} noches.`);
  }

  if (filters.dateFrom && filters.dateTo) {
    const from = new Date(filters.dateFrom);
    const to = new Date(filters.dateTo);
    const rateFrom = new Date(rate.dateFrom);
    const rateTo = new Date(rate.dateTo);

    if (from >= rateFrom && to <= rateTo) {
      score += 25;
      reasons.push(`Tarifa disponible en temporada ${rate.seasonName}.`);
    }
  }

  return { score, reasons };
}

function evaluateActivityRate(rate: ActivityRate, filters: SearchFilters) {
  const reasons: string[] = [];
  let score = 0;
  const ageRange = parseAgeRange(filters);

  if (ageRange) {
    const overlaps = ageRange.max >= rate.ageMin && ageRange.min <= rate.ageMax;

    if (overlaps) {
      score += 40;
      reasons.push(`Compatible con el tramo de edad ${rate.ageLabel}.`);
    }
  } else {
    score += 5;
  }

  return { score, reasons };
}

function buildSearchGuard(filters: SearchFilters) {
  const missingFields: MissingField[] = [];
  const warnings: WarningItem[] = [];

  if (!filters.destinationText.trim()) {
    missingFields.push({
      field: "destinationText",
      label: "Destino",
      reason: "Hace falta un destino para consultar inventario estructurado.",
      severity: "critical"
    });
  }

  if (!filters.dateFrom || !filters.dateTo) {
    warnings.push({
      code: "travel_dates_missing",
      message: "Sin fechas exactas la búsqueda se basa solo en coincidencias estructurales."
    });
  }

  return { missingFields, warnings };
}

export const searchAccommodations = (filters: SearchFilters): SearchAccommodationsResult => {
  const { missingFields, warnings } = buildSearchGuard(filters);

  if (missingFields.length > 0) {
    return {
      filters,
      matches: [],
      warnings,
      missingFields,
      status: "insufficient_filters"
    };
  }

  const destination = normalizeText(filters.destinationText);
  const requestedCategories = extractRequestedCategories(filters.categoryRequested);

  const matches = accommodations
    .flatMap((accommodation) => {
      const localityMatch = normalizeText(accommodation.locality) === destination;

      if (!localityMatch) {
        return [];
      }

      const categoryOk =
        requestedCategories.length === 0 || requestedCategories.includes(accommodation.categoryType);

      if (!categoryOk) {
        return [];
      }

      return accommodationRates
        .filter((rate) => rate.accommodationId === accommodation.id)
        .map((rate) => {
          const evaluation = evaluateAccommodationRate(rate, filters, requestedCategories);

          return {
            accommodation,
            rate,
            score:
              evaluation.score +
              (requestedCategories.includes(accommodation.categoryType) ? 20 : 0) +
              (filters.destinationCountry?.trim() ? 5 : 0),
            matchReasons: [
              `Localidad: ${accommodation.locality}.`,
              ...evaluation.reasons,
              ...(requestedCategories.includes(accommodation.categoryType)
                ? [`Encaja con la categoría ${accommodation.categoryType}.`]
                : [])
            ]
          };
        });
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);

  return {
    filters,
    matches,
    warnings:
      matches.length === 0
        ? [
            ...warnings,
            {
              code: "no_accommodation_matches",
              message: "No hay alojamientos que cumplan destino, categoría y disponibilidad tarifaria con los datos actuales."
            }
          ]
        : warnings,
    missingFields,
    status: matches.length > 0 ? "ok" : "no_matches"
  };
};

export const searchActivities = (filters: SearchFilters): SearchActivitiesResult => {
  const { missingFields, warnings } = buildSearchGuard(filters);

  if (!filters.ageRangeText?.trim() && !filters.averageAgeText?.trim()) {
    missingFields.push({
      field: "ageRangeText",
      label: "Edad o rango de edad",
      reason: "Hace falta la edad del grupo para filtrar actividades con criterio.",
      severity: "critical"
    });
  }

  if (missingFields.some((item) => item.severity === "critical")) {
    return {
      filters,
      matches: [],
      warnings,
      missingFields,
      status: "insufficient_filters"
    };
  }

  const destination = normalizeText(filters.destinationText);

  const matches = activities
    .flatMap((activity) => {
      const locationMatch = normalizeText(activity.locationMain) === destination;

      if (!locationMatch) {
        return [];
      }

      return activityRates
        .filter((rate) => rate.activityId === activity.id)
        .map((rate) => {
          const evaluation = evaluateActivityRate(rate, filters);

          return {
            activity,
            rate,
            score: evaluation.score + 20,
            matchReasons: [`Ubicación principal: ${activity.locationMain}.`, ...evaluation.reasons]
          };
        });
    })
    .filter((match) => match.score >= 40)
    .sort((left, right) => right.score - left.score);

  return {
    filters,
    matches,
    warnings:
      matches.length === 0
        ? [
            ...warnings,
            {
              code: "no_activity_matches",
              message: "No hay actividades compatibles con el destino y rango de edad informado."
            }
          ]
        : warnings,
    missingFields,
    status: matches.length > 0 ? "ok" : "no_matches"
  };
};

export const findAccommodationRate = (accommodationId: string, filters: SearchFilters) => {
  const candidates = accommodationRates.filter((rate) => rate.accommodationId === accommodationId);

  if (candidates.length === 0) {
    return null;
  }

  return (
    candidates
      .map((rate) => ({
        rate,
        score: evaluateAccommodationRate(rate, filters, extractRequestedCategories(filters.categoryRequested)).score
      }))
      .sort((left, right) => right.score - left.score)[0]?.rate ?? null
  );
};

export const findActivityRate = (activityId: string, filters: SearchFilters) => {
  const candidates = activityRates.filter((rate) => rate.activityId === activityId);

  if (candidates.length === 0) {
    return null;
  }

  return (
    candidates
      .map((rate) => ({
        rate,
        score: evaluateActivityRate(rate, filters).score
      }))
      .sort((left, right) => right.score - left.score)[0]?.rate ?? null
  );
};

export const importRates = async () => {
  return {
    importedAt: new Date().toISOString(),
    accommodationRates: accommodationRates.length,
    activityRates: activityRates.length,
    sources: [
      "hoteles_valencia_2026.xlsx",
      "grupos_costa_2026.xlsx",
      "activities_valencia_2026.xlsx"
    ]
  };
};
