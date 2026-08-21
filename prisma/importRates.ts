import "../server/loadEnv";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import XLSXModule from "xlsx";

const prisma = new PrismaClient();
const XLSX = XLSXModule as typeof import("xlsx");

type AccommodationRow = Record<string, string | number | null | undefined>;
type ActivityRow = Record<string, string | number | null | undefined>;

const DEFAULT_ACCOMMODATION_PATH =
  process.env.ACCOMMODATION_RATES_XLSX ??
  "/Users/anthony/Downloads/Viajes Velero/OK TARIFAS Costes.xlsx";
const DEFAULT_ACTIVITY_PATH =
  process.env.ACTIVITY_RATES_XLSX ??
  "/Users/anthony/Downloads/Viajes Velero/TARIFAS GRUPOS 2026.xlsx";
const DEFAULT_IMPORT_DIRECTORY = "/Users/anthony/Downloads/Viajes Velero";

/**
 * Transacciones que recorren el catalogo entero fila a fila. Con SQLite cada
 * consulta era un acceso a fichero local y sobraba el limite de 5 s que Prisma
 * pone por defecto a las transacciones interactivas; contra PostgreSQL cada una
 * es una ida y vuelta por red, y con unos cientos de tarifas el import se pasa
 * del limite y muere con P2028.
 */
const BULK_TX_OPTIONS = { timeout: 120_000, maxWait: 10_000 };

export interface ImportRatesOptions {
  accommodationPath?: string;
  activityPath?: string;
}

export interface ImportRatesResult {
  accommodations: number;
  accommodationRates: number;
  activities: number;
  activityRates: number;
  accommodationSource: string;
  activitySource: string;
}

function resolveImportPath(inputPath: string | undefined, fallbackPath: string) {
  const trimmed = inputPath?.trim();

  if (!trimmed) {
    return fallbackPath;
  }

  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }

  return path.join(DEFAULT_IMPORT_DIRECTORY, trimmed);
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDecimal(value: unknown) {
  const text = normalizeText(value).replace(",", ".");
  if (!text) {
    return null;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseYearFromPeriod(period: string) {
  const match = period.match(/20\d{2}|\b\d{2}\b/);
  if (!match) {
    return 2026;
  }

  const value = match[0];
  return value.length === 4 ? Number(value) : Number(`20${value}`);
}

function parseDateRanges(periodText: string) {
  const normalized = normalizeText(periodText).replace(/[–—]/g, "-");
  const matches = [...normalized.matchAll(/(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})/g)];

  return matches.map((match) => {
    const year = Number(`20${match[5]}`);

    return {
      year,
      dateFrom: new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[1]))),
      dateTo: new Date(Date.UTC(year, Number(match[4]) - 1, Number(match[3])))
    };
  });
}

function parseMinNights(periodText: string) {
  const normalized = normalizeText(periodText).replace(/[–—]/g, "-");
  const plus = normalized.match(/(\d+)\+\s*noches/i);
  if (plus) {
    return Number(plus[1]);
  }

  const range = normalized.match(/(\d+)-(\d+)\s*noches/i);
  if (range) {
    return Number(range[1]);
  }

  return null;
}

function extractHotelName(rawName: string) {
  return rawName.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function extractLocality(rawName: string) {
  const match = rawName.match(/\(([^,)+]+)/);
  return match ? match[1].trim() : "";
}

function extractCategory(rawName: string) {
  const match = rawName.match(/(\d)\*{1,4}/);
  return match ? `${match[1]}*` : "";
}

function parseAccommodationRows(filePath: string) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheet = workbook.Sheets["Tarifas"];

  if (!sheet) {
    throw new Error(`No se encontró la hoja "Tarifas" en ${filePath}.`);
  }

  const rows = XLSX.utils.sheet_to_json<AccommodationRow>(sheet, {
    defval: "",
    raw: false
  });

  const accommodations = new Map<
    string,
    {
      accommodationName: string;
      locality: string;
      categoryType: string;
      accommodationType: string;
      observations: string;
      conditionsText: string;
      freePolicy: string;
      sourceFile: string;
      rates: Array<{
        rateSource: string;
        year: number;
        seasonName: string;
        dateFrom: Date | null;
        dateTo: Date | null;
        minNights: number | null;
        boardType: string;
        tariffUnit: string;
        pvpAmount: number | null;
        netSaleAmount: number | null;
        netAzulmarinoAmount: number | null;
        sourceFile: string;
        sourceSheet: string;
      }>;
    }
  >();

  for (const row of rows) {
    const rawName = normalizeText(row["Nombre de Hotel"]);
    if (!rawName) {
      continue;
    }

    const sourceFile = path.basename(filePath);
    const accommodationName = extractHotelName(rawName);
    const locality = extractLocality(rawName);
    const categoryType = extractCategory(rawName);
    const accommodationType =
      normalizeText(row["Tipo de servicio"]) || normalizeText(row["Tipo de alojamiento"]);
    const observations = normalizeText(row["Observaciones/Condiciones"]);
    const conditionsText = normalizeText(row["Suplementos"]);
    const freePolicy = normalizeText(row["Descuento"]);
    const periodText = normalizeText(row["Periodo"]);
    const boardType = normalizeText(row["Régimen (MP o PC)"]);
    const tariffUnit = normalizeText(row["Unidad de tarifa"]);
    const pvpAmount = parseDecimal(row["Tarifa"]);
    const netSaleAmount = parseDecimal(row["neto venta"]);
    const netAzulmarinoAmount = parseDecimal(row["neto azul marino"]);
    const minNights = parseMinNights(periodText);
    const seasonName = normalizeText(row["Temporada"]) || periodText || "Sin temporada";
    const dateRanges = parseDateRanges(periodText);
    const fallbackYear = parseYearFromPeriod(periodText);
    const key = `${accommodationName}__${locality}`;

    if (!accommodations.has(key)) {
      accommodations.set(key, {
        accommodationName,
        locality,
        categoryType,
        accommodationType,
        observations,
        conditionsText,
        freePolicy,
        sourceFile,
        rates: []
      });
    }

    const target = accommodations.get(key)!;
    const normalizedRanges =
      dateRanges.length > 0
        ? dateRanges
        : [{ year: fallbackYear, dateFrom: null, dateTo: null }];

    for (const range of normalizedRanges) {
      target.rates.push({
        rateSource: "excel_import",
        year: range.year,
        seasonName,
        dateFrom: range.dateFrom,
        dateTo: range.dateTo,
        minNights,
        boardType,
        tariffUnit,
        pvpAmount,
        netSaleAmount,
        netAzulmarinoAmount,
        sourceFile,
        sourceSheet: "Tarifas"
      });
    }
  }

  return [...accommodations.values()];
}

function parseAgeLabel(ageLabel: string) {
  const normalized = normalizeText(ageLabel).toLowerCase();

  if (!normalized) {
    return { label: "", min: null, max: null };
  }

  const explicitRange = normalized.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
  if (explicitRange) {
    return {
      label: ageLabel,
      min: Number(explicitRange[1]),
      max: Number(explicitRange[2])
    };
  }

  const under = normalized.match(/menores?\s+de\s+(\d{1,2})/);
  if (under) {
    return {
      label: ageLabel,
      min: 0,
      max: Number(under[1]) - 1
    };
  }

  if (normalized.includes("adulto")) {
    return {
      label: ageLabel,
      min: 18,
      max: null
    };
  }

  return {
    label: ageLabel,
    min: null,
    max: null
  };
}

function parseActivityRows(filePath: string) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheet = workbook.Sheets["Hoja1"];

  if (!sheet) {
    throw new Error(`No se encontró la hoja "Hoja1" en ${filePath}.`);
  }

  const rows = XLSX.utils.sheet_to_json<ActivityRow>(sheet, {
    defval: "",
    raw: false
  });

  const activities = new Map<
    string,
    {
      activityName: string;
      supplierName: string;
      locationMain: string;
      durationText: string;
      descriptionText: string;
      sourceFile: string;
      rates: Array<{
        year: number;
        ageLabel: string;
        ageMin: number | null;
        ageMax: number | null;
        salePvpAmount: number | null;
        costNetAmount: number | null;
        commissionPercent: number | null;
        durationText: string;
        sourceFile: string;
        sourceSheet: string;
      }>;
    }
  >();

  for (const row of rows) {
    const supplierName = normalizeText(row["Proveedor"]);
    const activityName = normalizeText(row["Actividad"]);
    const locationMain = normalizeText(row["Población"]) || normalizeText(row["Población 2"]);
    const durationText = normalizeText(row["Duración"]);
    const ageText = normalizeText(row["Edades"]);

    if (!supplierName || !activityName) {
      continue;
    }

    const key = `${supplierName}__${activityName}__${locationMain}`;
    const sourceFile = path.basename(filePath);
    const parsedAge = parseAgeLabel(ageText);

    if (!activities.has(key)) {
      activities.set(key, {
        activityName,
        supplierName,
        locationMain,
        durationText,
        descriptionText: normalizeText(row["Tipo"]),
        sourceFile,
        rates: []
      });
    }

    const commission = parseDecimal(row["Comisión"]);

    activities.get(key)!.rates.push({
      year: 2026,
      ageLabel: parsedAge.label,
      ageMin: parsedAge.min,
      ageMax: parsedAge.max,
      salePvpAmount: parseDecimal(row["VENTA PVP"]),
      costNetAmount: parseDecimal(row["COSTE neto"]),
      commissionPercent: commission === null ? null : commission * 100,
      durationText,
      sourceFile,
      sourceSheet: "Hoja1"
    });
  }

  return [...activities.values()];
}

export async function importRatesFromExcel(
  options: ImportRatesOptions = {}
): Promise<ImportRatesResult> {
  const accommodationPath = resolveImportPath(
    options.accommodationPath,
    DEFAULT_ACCOMMODATION_PATH
  );
  const activityPath = resolveImportPath(options.activityPath, DEFAULT_ACTIVITY_PATH);

  if (!existsSync(accommodationPath)) {
    throw new Error(`No existe el fichero de alojamientos: ${accommodationPath}`);
  }

  if (!existsSync(activityPath)) {
    throw new Error(`No existe el fichero de actividades: ${activityPath}`);
  }

  const accommodationData = parseAccommodationRows(accommodationPath);
  const activityData = parseActivityRows(activityPath);

  await prisma.$transaction(async (tx) => {
    // Solo se borran las filas importadas desde Excel (sourceDocumentId null).
    // Las filas publicadas desde documentos (sourceDocumentId no nulo) se
    // preservan para no destruir el inventario publicado en una reimportación.
    await tx.proposalActivityOption.deleteMany({
      where: { activity: { sourceDocumentId: null } },
    });
    await tx.proposalAccommodationOption.deleteMany({
      where: { accommodation: { sourceDocumentId: null } },
    });
    await tx.activityRate.deleteMany({ where: { sourceDocumentId: null } });
    await tx.accommodationRate.deleteMany({ where: { sourceDocumentId: null } });
    await tx.activity.deleteMany({ where: { sourceDocumentId: null } });
    await tx.accommodation.deleteMany({ where: { sourceDocumentId: null } });

    for (const accommodation of accommodationData) {
      await tx.accommodation.create({
        data: {
          accommodationName: accommodation.accommodationName,
          locality: accommodation.locality,
          categoryType: accommodation.categoryType || null,
          accommodationType: accommodation.accommodationType || null,
          observations: accommodation.observations || null,
          conditionsText: accommodation.conditionsText || null,
          freePolicy: accommodation.freePolicy || null,
          sourceFile: accommodation.sourceFile,
          rates: {
            create: accommodation.rates.map((rate) => ({
              rateSource: rate.rateSource,
              year: rate.year,
              seasonName: rate.seasonName || null,
              dateFrom: rate.dateFrom,
              dateTo: rate.dateTo,
              minNights: rate.minNights,
              boardType: rate.boardType || null,
              tariffUnit: rate.tariffUnit || null,
              pvpAmount: rate.pvpAmount,
              netSaleAmount: rate.netSaleAmount,
              netAzulmarinoAmount: rate.netAzulmarinoAmount,
              sourceFile: rate.sourceFile,
              sourceSheet: rate.sourceSheet
            }))
          }
        }
      });
    }

    for (const activity of activityData) {
      await tx.activity.create({
        data: {
          activityName: activity.activityName,
          supplierName: activity.supplierName || null,
          locationMain: activity.locationMain || null,
          durationText: activity.durationText || null,
          descriptionText: activity.descriptionText || null,
          sourceFile: activity.sourceFile,
          rates: {
            create: activity.rates.map((rate) => ({
              year: rate.year,
              ageLabel: rate.ageLabel || null,
              ageMin: rate.ageMin,
              ageMax: rate.ageMax,
              salePvpAmount: rate.salePvpAmount,
              costNetAmount: rate.costNetAmount,
              commissionPercent: rate.commissionPercent,
              durationText: rate.durationText || null,
              sourceFile: rate.sourceFile,
              sourceSheet: rate.sourceSheet
            }))
          }
        }
      });
    }
  }, BULK_TX_OPTIONS);

  const totalAccommodationRates = accommodationData.reduce((sum, item) => sum + item.rates.length, 0);
  const totalActivityRates = activityData.reduce((sum, item) => sum + item.rates.length, 0);

  return {
    accommodations: accommodationData.length,
    accommodationRates: totalAccommodationRates,
    activities: activityData.length,
    activityRates: totalActivityRates,
    accommodationSource: accommodationPath,
    activitySource: activityPath
  };
}

async function main() {
  const result = await importRatesFromExcel();
  console.log("Importación completada");
  console.log(`Alojamientos: ${result.accommodations}`);
  console.log(`Tarifas de alojamiento: ${result.accommodationRates}`);
  console.log(`Actividades: ${result.activities}`);
  console.log(`Tarifas de actividades: ${result.activityRates}`);
  console.log(`Fuente alojamientos: ${result.accommodationSource}`);
  console.log(`Fuente actividades: ${result.activitySource}`);
}

const isDirectExecution =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main()
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
