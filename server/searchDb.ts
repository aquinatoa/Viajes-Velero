import "./loadEnv";
import { PrismaClient } from "@prisma/client";
import type {
  AccommodationSearchMatch,
  ActivitySearchMatch,
  MissingField,
  SearchAccommodationsResult,
  SearchActivitiesResult,
  SearchFilters,
  WarningItem
} from "../src/domain/types";

const prisma = new PrismaClient();

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseRequestedCategories(categoryRequested?: string) {
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
      return { min: Number(range[1]), max: Number(range[2]) };
    }
  }

  const average = filters.averageAgeText?.match(/(\d{1,2})/);
  if (average) {
    const age = Number(average[1]);
    return { min: age, max: age };
  }

  return null;
}

function buildGuard(filters: SearchFilters) {
  const missingFields: MissingField[] = [];
  const warnings: WarningItem[] = [];

  if (!filters.destinationText.trim()) {
    missingFields.push({
      field: "destinationText",
      label: "Destino",
      reason: "Hace falta un destino para consultar la base de datos.",
      severity: "critical"
    });
  }

  if (!filters.dateFrom || !filters.dateTo) {
    warnings.push({
      code: "missing_dates",
      message: "La búsqueda se hará sin validar temporada exacta porque faltan fechas."
    });
  }

  return { missingFields, warnings };
}

function scoreAccommodationMatch(
  accommodation: { locality: string; categoryType: string | null },
  rate: {
    boardType: string | null;
    seasonName: string | null;
    minNights: number | null;
    dateFrom: Date | null;
    dateTo: Date | null;
  },
  filters: SearchFilters
) {
  const reasons: string[] = [];
  let score = 0;
  const requestedCategories = parseRequestedCategories(filters.categoryRequested);

  if (normalizeText(accommodation.locality) === normalizeText(filters.destinationText)) {
    score += 35;
    reasons.push(`Destino coincidente: ${accommodation.locality}.`);
  }

  if (
    filters.boardType &&
    rate.boardType &&
    normalizeText(rate.boardType) === normalizeText(filters.boardType)
  ) {
    score += 25;
    reasons.push(`Régimen coincidente: ${rate.boardType}.`);
  } else if (!filters.boardType) {
    score += 10;
  }

  if (
    requestedCategories.length === 0 ||
    requestedCategories.includes(accommodation.categoryType ?? "")
  ) {
    score += 15;
    if (accommodation.categoryType) {
      reasons.push(`Categoría compatible: ${accommodation.categoryType}.`);
    }
  }

  if (filters.dateFrom && filters.dateTo && rate.dateFrom && rate.dateTo) {
    const from = new Date(filters.dateFrom);
    const to = new Date(filters.dateTo);
    if (from >= rate.dateFrom && to <= rate.dateTo) {
      score += 20;
      reasons.push(`Tarifa válida en ${rate.seasonName ?? "temporada informada"}.`);
    }
  }

  if (filters.dateFrom && filters.dateTo && rate.minNights) {
    const nights = Math.max(
      1,
      Math.round(
        (new Date(filters.dateTo).getTime() - new Date(filters.dateFrom).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );
    if (nights >= rate.minNights) {
      score += 10;
      reasons.push(`Cumple estancia mínima de ${rate.minNights} noches.`);
    }
  }

  return { score, reasons };
}

function scoreActivityMatch(
  activity: { locationMain: string | null },
  rate: { ageLabel: string | null; ageMin: number | null; ageMax: number | null },
  filters: SearchFilters
) {
  const reasons: string[] = [];
  let score = 0;
  const ageRange = parseAgeRange(filters);

  if (normalizeText(activity.locationMain ?? "") === normalizeText(filters.destinationText)) {
    score += 30;
    reasons.push(`Ubicación coincidente: ${activity.locationMain}.`);
  }

  if (ageRange && rate.ageMin !== null && rate.ageMax !== null) {
    const overlaps = ageRange.max >= rate.ageMin && ageRange.min <= rate.ageMax;
    if (overlaps) {
      score += 40;
      reasons.push(`Compatible con el tramo ${rate.ageLabel ?? `${rate.ageMin}-${rate.ageMax}`}.`);
    }
  } else if (ageRange && rate.ageMin === 18 && rate.ageMax === null) {
    if (ageRange.max >= 18) {
      score += 20;
      reasons.push("Tarifa válida para adulto.");
    }
  }

  return { score, reasons };
}

export async function searchAccommodationsDb(
  filters: SearchFilters
): Promise<SearchAccommodationsResult> {
  const { missingFields, warnings } = buildGuard(filters);

  if (missingFields.length > 0) {
    return { filters, matches: [], warnings, missingFields, status: "insufficient_filters" };
  }

  const accommodations = await prisma.accommodation.findMany({
    include: {
      rates: true
    }
  });

  const matches: AccommodationSearchMatch[] = accommodations
    .flatMap((accommodation) =>
      accommodation.rates.map((rate) => {
        const scored = scoreAccommodationMatch(accommodation, rate, filters);
        return {
          accommodation: {
            id: accommodation.id,
            accommodationName: accommodation.accommodationName,
            locality: accommodation.locality,
            categoryType: accommodation.categoryType ?? "",
            accommodationType: accommodation.accommodationType ?? "",
            observations: accommodation.observations ?? "",
            conditionsText: accommodation.conditionsText ?? "",
            freePolicy: accommodation.freePolicy ?? "",
            sourceFile: accommodation.sourceFile ?? ""
          },
          rate: {
            id: rate.id,
            accommodationId: rate.accommodationId,
            rateSource: rate.rateSource ?? "",
            year: rate.year,
            seasonName: rate.seasonName ?? "",
            dateFrom: rate.dateFrom ? rate.dateFrom.toISOString().slice(0, 10) : "",
            dateTo: rate.dateTo ? rate.dateTo.toISOString().slice(0, 10) : "",
            minNights: rate.minNights ?? 0,
            boardType: rate.boardType ?? "",
            tariffUnit: rate.tariffUnit ?? "",
            pvpAmount: Number(rate.pvpAmount ?? 0),
            netSaleAmount: Number(rate.netSaleAmount ?? 0),
            netAzulmarinoAmount: Number(rate.netAzulmarinoAmount ?? 0),
            sourceFile: rate.sourceFile ?? "",
            sourceSheet: rate.sourceSheet ?? ""
          },
          score: scored.score,
          matchReasons: scored.reasons
        };
      })
    )
    .filter((item) => item.score >= 45)
    .sort((a, b) => b.score - a.score);

  return {
    filters,
    matches,
    warnings:
      matches.length === 0
        ? [
            ...warnings,
            {
              code: "no_accommodations_found",
              message: "No se encontraron alojamientos compatibles en la base real."
            }
          ]
        : warnings,
    missingFields,
    status: matches.length > 0 ? "ok" : "no_matches"
  };
}

export async function searchActivitiesDb(
  filters: SearchFilters
): Promise<SearchActivitiesResult> {
  const { missingFields, warnings } = buildGuard(filters);

  if (!filters.ageRangeText?.trim() && !filters.averageAgeText?.trim()) {
    missingFields.push({
      field: "ageRangeText",
      label: "Edad o rango de edad",
      reason: "Hace falta la edad para filtrar actividades en la base real.",
      severity: "critical"
    });
  }

  if (missingFields.some((item) => item.severity === "critical")) {
    return { filters, matches: [], warnings, missingFields, status: "insufficient_filters" };
  }

  const activities = await prisma.activity.findMany({
    include: {
      rates: true
    }
  });

  const matches: ActivitySearchMatch[] = activities
    .flatMap((activity) =>
      activity.rates.map((rate) => {
        const scored = scoreActivityMatch(activity, rate, filters);
        return {
          activity: {
            id: activity.id,
            activityName: activity.activityName,
            supplierName: activity.supplierName ?? "",
            locationMain: activity.locationMain ?? "",
            durationText: activity.durationText ?? "",
            descriptionText: activity.descriptionText ?? "",
            sourceFile: activity.sourceFile ?? ""
          },
          rate: {
            id: rate.id,
            activityId: rate.activityId,
            year: rate.year,
            ageLabel: rate.ageLabel ?? "",
            ageMin: rate.ageMin ?? 0,
            ageMax: rate.ageMax ?? 0,
            salePvpAmount: Number(rate.salePvpAmount ?? 0),
            costNetAmount: Number(rate.costNetAmount ?? 0),
            commissionPercent: Number(rate.commissionPercent ?? 0),
            durationText: rate.durationText ?? "",
            sourceFile: rate.sourceFile ?? "",
            sourceSheet: rate.sourceSheet ?? ""
          },
          score: scored.score,
          matchReasons: scored.reasons
        };
      })
    )
    .filter((item) => item.score >= 50)
    .sort((a, b) => b.score - a.score);

  return {
    filters,
    matches,
    warnings:
      matches.length === 0
        ? [
            ...warnings,
            {
              code: "no_activities_found",
              message: "No se encontraron actividades compatibles en la base real."
            }
          ]
        : warnings,
    missingFields,
    status: matches.length > 0 ? "ok" : "no_matches"
  };
}

export async function getInventorySummaryDb() {
  const [accommodations, accommodationRates, activities, activityRates] = await Promise.all([
    prisma.accommodation.count(),
    prisma.accommodationRate.count(),
    prisma.activity.count(),
    prisma.activityRate.count()
  ]);

  return {
    accommodations,
    accommodationRates,
    activities,
    activityRates
  };
}

export async function getImportedCatalogDb() {
  const [accommodations, activities] = await Promise.all([
    prisma.accommodation.findMany({
      include: {
        rates: {
          orderBy: [{ year: "asc" }, { seasonName: "asc" }]
        }
      },
      orderBy: [{ locality: "asc" }, { accommodationName: "asc" }]
    }),
    prisma.activity.findMany({
      include: {
        rates: {
          orderBy: [{ year: "asc" }, { ageMin: "asc" }]
        }
      },
      orderBy: [{ locationMain: "asc" }, { activityName: "asc" }]
    })
  ]);

  return {
    accommodations: accommodations.map((accommodation) => ({
      id: accommodation.id,
      accommodationName: accommodation.accommodationName,
      locality: accommodation.locality,
      categoryType: accommodation.categoryType ?? "",
      accommodationType: accommodation.accommodationType ?? "",
      observations: accommodation.observations ?? "",
      conditionsText: accommodation.conditionsText ?? "",
      freePolicy: accommodation.freePolicy ?? "",
      sourceFile: accommodation.sourceFile ?? "",
      rates: accommodation.rates.map((rate) => ({
        id: rate.id,
        year: rate.year,
        seasonName: rate.seasonName ?? "",
        dateFrom: rate.dateFrom ? rate.dateFrom.toISOString().slice(0, 10) : "",
        dateTo: rate.dateTo ? rate.dateTo.toISOString().slice(0, 10) : "",
        minNights: rate.minNights ?? null,
        boardType: rate.boardType ?? "",
        tariffUnit: rate.tariffUnit ?? "",
        pvpAmount: Number(rate.pvpAmount ?? 0),
        netSaleAmount: Number(rate.netSaleAmount ?? 0),
        netAzulmarinoAmount: Number(rate.netAzulmarinoAmount ?? 0),
        sourceSheet: rate.sourceSheet ?? ""
      }))
    })),
    activities: activities.map((activity) => ({
      id: activity.id,
      activityName: activity.activityName,
      supplierName: activity.supplierName ?? "",
      locationMain: activity.locationMain ?? "",
      durationText: activity.durationText ?? "",
      descriptionText: activity.descriptionText ?? "",
      sourceFile: activity.sourceFile ?? "",
      rates: activity.rates.map((rate) => ({
        id: rate.id,
        year: rate.year,
        ageLabel: rate.ageLabel ?? "",
        ageMin: rate.ageMin,
        ageMax: rate.ageMax,
        salePvpAmount: Number(rate.salePvpAmount ?? 0),
        costNetAmount: Number(rate.costNetAmount ?? 0),
        commissionPercent: Number(rate.commissionPercent ?? 0),
        durationText: rate.durationText ?? "",
        sourceSheet: rate.sourceSheet ?? ""
      }))
    }))
  };
}
