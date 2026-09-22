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

/**
 * Carga, en una sola consulta, los nombres de control de los documentos de
 * origen referenciados por un conjunto de registros operativos. Devuelve un
 * mapa id → controlName para resolver la trazabilidad sin N+1.
 */
async function loadSourceDocumentNames(
  ids: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const documents = await prisma.sourceDocument.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, controlName: true }
  });

  return new Map(documents.map((document) => [document.id, document.controlName]));
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Normaliza un régimen (texto libre o sigla) a un código canónico MP/PC/AD/SA. */
const BOARD_PATTERNS: [RegExp, string][] = [
  [/pension completa|full board|\bp ?\.? ?c\b/, "PC"],
  [/media pension|half board|\bm ?\.? ?p\b/, "MP"],
  [/aloj.*desayuno|bed.*breakfast|\ba ?\.? ?d\b|desayuno/, "AD"],
  [/solo alojamiento|room only|\bs ?\.? ?a\b/, "SA"],
];
function boardCode(text?: string | null): string {
  if (!text) return "";
  const n = normalizeText(text);
  for (const [re, code] of BOARD_PATTERNS) {
    if (re.test(n)) return code;
  }
  return n.toUpperCase().slice(0, 4);
}

/** Nº de estrellas de una categoría ("4*" → 4), o null si no aplica. */
function starsOf(category?: string | null): number | null {
  const m = (category ?? "").match(/([2-5])\s*\*/);
  return m ? Number(m[1]) : null;
}

/** Estrellas solicitadas en el filtro ("4 estrellas"/"4*" → 4). */
function requestedStars(categoryRequested?: string): number | null {
  const m = (categoryRequested ?? "").match(/([2-5])\s*\*?/);
  return m ? Number(m[1]) : null;
}

/** Zonas turísticas para puntuar destinos cercanos (misma comarca). */
const ZONES: Record<string, string[]> = {
  "costa daurada": [
    "salou", "cambrils", "la pineda", "tarragona", "vila-seca", "reus", "calafell",
    "coma-ruga", "l'ampolla", "l'ametlla de mar", "mont-roig", "miami platja", "tamarit",
    "deltebre", "riumar", "la canonja", "el delta de l'ebre", "delta del ebro", "amposta",
    "sant carles de la rapita", "port aventura",
  ],
  "costa brava": [
    "lloret de mar", "tossa de mar", "calella", "palamos", "empuriabrava", "pals",
    "blanes", "platja d'aro", "roses", "l'estartit",
  ],
  pirineo: ["jaca", "caspe", "mequinenza", "vall d'aran", "vielha", "baqueira"],
  barcelona: ["barcelona", "sitges", "castelldefels"],
};
/**
 * Una tarifa sin canal, o marcada como «cualquier cliente», se ofrece siempre.
 *
 * El filtro anterior era `!rate.clientSegment || rate.clientSegment === wantedSegment`,
 * y con eso una tarifa guardada como GENERIC solo aparecia si la busqueda pedia
 * GENERIC explicitamente. Como el cotizador no manda canal salvo que sea el
 * turoperador suizo, "cualquier cliente" acababa significando "ningun cliente":
 * las 386 tarifas de PortAventura se publicaron asi y no salian al cotizar.
 *
 * Solo las tarifas de un canal concreto (p. ej. SWISS_TTOO) siguen reservadas a
 * ese canal, que es justo lo que hay que proteger.
 */
function esParaCualquierCliente(segment?: string | null): boolean {
  const valor = (segment ?? "").trim();
  return valor === "" || valor === "GENERIC";
}

/**
 * Un alojamiento puede estar en varias localidades a la vez.
 *
 * En el maestro de Oravia hay «4R Hotels 3* – Salou & Calafell», «Hotel Cesar
 * Augustus (Salou/Cambrils)» o «PortAventura World Roulette (Vila-seca/Salou)»:
 * cadenas con establecimientos repartidos por la costa. La localidad que se
 * guarda es fiel al documento —«Salou / Calafell»— pero comparada entera nunca
 * es igual a «Salou», asi que esos hoteles NO aparecian al cotizar para Salou.
 * Siete de treinta y cinco, con 128 tarifas entre ellos.
 *
 * Se parte por los separadores habituales y se compara cada trozo.
 */
function localidadesDe(loc?: string | null): string[] {
  return String(loc ?? "")
    .split(/[/,&·+]|\s+y\s+|\s+-\s+|\s+–\s+/)
    .map((parte) => normalizeText(parte))
    .filter(Boolean);
}

/** Si el destino buscado es una de las localidades del alojamiento. */
function coincideLocalidad(loc: string | null | undefined, destino: string): boolean {
  const buscado = normalizeText(destino);
  if (!buscado) return false;
  return localidadesDe(loc).includes(buscado);
}

function zoneOf(loc?: string | null): string {
  const n = normalizeText(loc ?? "");
  if (!n) return "";
  for (const [zone, list] of Object.entries(ZONES)) {
    if (list.includes(n)) return zone;
  }
  return "";
}

function parseAgeRange(filters: SearchFilters) {
  const raw = filters.ageRangeText?.trim();
  if (raw) {
    const range = raw.match(/(\d{1,2})\s*-\s*(\d{1,2})/);
    if (range) {
      return { min: Number(range[1]), max: Number(range[2]) };
    }
    // Una edad sola, sin guion. Antes caia aqui sin coincidir y el filtro de
    // edad se quedaba sin aplicar: el aviso de "falta la edad" desaparecia
    // porque el campo tenia texto, pero las actividades no se filtraban por
    // edad. Un hueco que no se ve.
    const unica = raw.match(/^(\d{1,2})$/);
    if (unica) {
      const edad = Number(unica[1]);
      return { min: edad, max: edad };
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

  const reqStars = requestedStars(filters.categoryRequested);
  const hotelStars = starsOf(accommodation.categoryType);

  // Categoría inferior a la pedida → se EXCLUYE (no se cuelan 2★/3★ si piden 4★).
  // Los productos sin estrellas (apartamentos, campings) no se excluyen.
  const excluded = reqStars !== null && hotelStars !== null && hotelStars < reqStars;

  // — Destino: exacto pesa mucho; misma zona/comarca, parcial.
  const locA = normalizeText(accommodation.locality);
  const locF = normalizeText(filters.destinationText);
  if (locA && coincideLocalidad(accommodation.locality, filters.destinationText)) {
    score += 40;
    reasons.push(`Destino: ${accommodation.locality}.`);
  } else {
    const zA = zoneOf(accommodation.locality);
    if (zA && zA === zoneOf(filters.destinationText)) {
      score += 18;
      reasons.push(`Misma zona${accommodation.locality ? `: ${accommodation.locality}` : ""}.`);
    }
  }

  // — Categoría: exacta premia; superior (upgrade) premia menos.
  if (reqStars !== null && hotelStars !== null) {
    if (hotelStars === reqStars) {
      score += 35;
      reasons.push(`Categoría ${accommodation.categoryType}.`);
    } else if (hotelStars > reqStars) {
      score += 20;
      reasons.push(`Categoría superior (${accommodation.categoryType}).`);
    }
  }

  // — Régimen: por código canónico (MP/PC/AD/SA), con afinidad MP↔PC.
  const reqBoard = boardCode(filters.boardType);
  const rateBoard = boardCode(rate.boardType);
  if (reqBoard && rateBoard) {
    if (reqBoard === rateBoard) {
      score += 25;
      reasons.push(`Régimen ${rate.boardType}.`);
    } else if (["MP", "PC"].includes(reqBoard) && ["MP", "PC"].includes(rateBoard)) {
      score += 10;
      reasons.push(`Régimen similar (${rate.boardType}).`);
    }
  } else if (!reqBoard) {
    score += 8;
  }

  // — Fechas: cubre la estancia (mucho); solapa parcial (poco).
  if (filters.dateFrom && filters.dateTo && rate.dateFrom && rate.dateTo) {
    const from = new Date(filters.dateFrom);
    const to = new Date(filters.dateTo);
    if (from >= rate.dateFrom && to <= rate.dateTo) {
      score += 20;
      reasons.push(`Tarifa válida en ${rate.seasonName ?? "temporada"}.`);
    } else if (to >= rate.dateFrom && from <= rate.dateTo) {
      score += 6;
    }
  } else {
    score += 4;
  }

  // — Estancia mínima: cumple suma; no llega penaliza (la tarifa exige más noches).
  if (filters.dateFrom && filters.dateTo && rate.minNights) {
    const nights = Math.max(
      1,
      Math.round(
        (new Date(filters.dateTo).getTime() - new Date(filters.dateFrom).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );
    if (nights >= rate.minNights) {
      score += 8;
      reasons.push(`Cumple estancia mínima (${rate.minNights} noches).`);
    } else {
      score -= 10;
    }
  }

  return { score, reasons, excluded };
}

/**
 * Por dónde se BUSCA una actividad: su pueblo, y si no se sabe, el sitio.
 *
 * `locationMain` es dónde ocurre —«PortAventura Park», «Caribe Aquatic Park»—
 * y eso es lo que se le cuenta al colegio. Pero nadie escribe «PortAventura
 * Park» en el destino: escribe Salou. Buscando por el sitio, las 386 tarifas de
 * PortAventura solo aparecían si se acertaba con el nombre del parque, y por
 * eso Salou, Vila-seca y Cambrils devolvían cero.
 *
 * Se sigue mirando `locationMain` como respaldo para no romper lo que ya
 * estaba publicado antes de existir `locality`.
 */
function dondeSeBusca(activity: { locality?: string | null; locationMain: string | null }): string | null {
  return activity.locality?.trim() || activity.locationMain;
}

function scoreActivityMatch(
  activity: { locality?: string | null; locationMain: string | null },
  rate: { ageLabel: string | null; ageMin: number | null; ageMax: number | null },
  filters: SearchFilters
) {
  const reasons: string[] = [];
  let score = 0;
  const ageRange = parseAgeRange(filters);

  // Ubicación: exacta (+50) o misma zona turística (+18). Sin coincidencia no
  // suma, y el umbral de la búsqueda la dejará fuera (así no se cuelan
  // actividades de otra comarca, p. ej. el Pirineo en un viaje a Salou).
  const donde = dondeSeBusca(activity);
  const locA = normalizeText(donde ?? "");
  if (locA && coincideLocalidad(donde, filters.destinationText)) {
    score += 50;
    // Se nombra el SITIO, no el pueblo: es lo que le interesa a quien cotiza.
    reasons.push(`Ubicación coincidente: ${activity.locationMain ?? donde}.`);
  } else if (locA && zoneOf(donde) && zoneOf(donde) === zoneOf(filters.destinationText)) {
    score += 18;
    reasons.push(`En la misma zona: ${activity.locationMain ?? donde}.`);
  }

  // Edad: si la tarifa tiene tramo y solapa, +40; tarifa de adulto, +20; si la
  // tarifa NO trae edad (dato ausente en la BBDD), no se penaliza: +8 y se marca
  // para confirmar con el proveedor.
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
  } else if (rate.ageMin === null && rate.ageMax === null) {
    score += 8;
    reasons.push("Edad sin especificar (confirmar con el proveedor).");
  }

  return { score, reasons };
}

/**
 * ¿Esta tarifa es de uso individual? Los documentos escriben la ocupación de
 * muchas formas ("INDIVIDUAL", "1 PAX X HAB", "Single"), y la diferencia vale
 * dinero: en Villa Bonita, 73 € en doble contra 92 € en individual.
 */
function esIndividual(occupancyLabel?: string | null): boolean {
  const texto = normalizeText(occupancyLabel ?? "");
  if (!texto) return false;
  return /individual|single|1 ?pax|uso indiv/.test(texto);
}

/**
 * La tarifa de uso individual que acompaña a la elegida: mismo hotel, mismo
 * régimen y mismo servicio incluido. Sin exigir esas tres coincidencias se
 * cotizaría a los profesores el precio de otra cosa (con campo natural cuando
 * el grupo lleva artificial, por ejemplo).
 */
function tarifaIndividualHermana(
  elegida: AccommodationSearchMatch,
  individuales: AccommodationSearchMatch[],
): AccommodationSearchMatch["rate"] | null {
  if (esIndividual(elegida.rate.occupancyLabel)) return null;
  const hermanas = individuales.filter(
    (item) =>
      item.accommodation.id === elegida.accommodation.id &&
      (item.rate.boardType ?? "") === (elegida.rate.boardType ?? "") &&
      (item.rate.includedService ?? "") === (elegida.rate.includedService ?? ""),
  );
  if (hermanas.length === 0) return null;
  // A igualdad de criterios, la más barata: no se encarece la propuesta por
  // haber elegido mal entre dos filas equivalentes.
  return hermanas.sort(
    (a, b) =>
      (a.rate.pvpAmount || a.rate.netSaleAmount) - (b.rate.pvpAmount || b.rate.netSaleAmount),
  )[0].rate;
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

  // Filtro por cliente: una tarifa pactada con un canal concreto NO puede
  // aparecer al cotizar para otro. Las tarifas sin canal valen para todos, que
  // es el caso de todo lo que se cargó antes de existir esta distinción.
  const wantedSegment = (filters.clientSegment ?? "").trim() || null;
  const matchesSegment = (rate: { clientSegment?: string | null }) =>
    esParaCualquierCliente(rate.clientSegment) || rate.clientSegment === wantedSegment;

  const documentNames = await loadSourceDocumentNames(
    accommodations.map((accommodation) => accommodation.sourceDocumentId)
  );

  // Exclusión por categoría: si piden N★ se descartan los de categoría inferior.
  const reqStarsFilter = requestedStars(filters.categoryRequested);
  // Exclusión por zona: si el destino tiene zona conocida (p. ej. Salou → Costa
  // Daurada), se descartan los alojamientos de otra zona; así no se cuelan
  // hoteles de la Costa Brava o el Pirineo en una búsqueda de Salou.
  const destNorm = normalizeText(filters.destinationText);
  const destZone = zoneOf(filters.destinationText);

  const perRateMatches: AccommodationSearchMatch[] = accommodations
    .flatMap((accommodation) => {
      const hotelStars = starsOf(accommodation.categoryType);
      if (reqStarsFilter !== null && hotelStars !== null && hotelStars < reqStarsFilter) {
        return [];
      }
      if (destNorm && destZone) {
        // El descarte mira cada localidad del alojamiento por separado: los que
        // estan en varias -«Salou / Calafell», «Vila-seca/Salou»- se caian aqui
        // antes incluso de puntuarse, y no aparecian al cotizar para Salou.
        if (
          !coincideLocalidad(accommodation.locality, filters.destinationText) &&
          zoneOf(accommodation.locality) !== destZone
        ) {
          return [];
        }
      }
      return accommodation.rates.filter(matchesSegment).map((rate) => {
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
            sourceFile: accommodation.sourceFile ?? "",
            sourceDocumentId: accommodation.sourceDocumentId ?? "",
            sourceDocumentName: accommodation.sourceDocumentId
              ? documentNames.get(accommodation.sourceDocumentId) ?? ""
              : ""
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
            clientSegment: rate.clientSegment ?? "",
            includedService: rate.includedService ?? "",
            occupancyLabel: rate.occupancyLabel ?? "",
            sourceFile: rate.sourceFile ?? "",
            sourceSheet: rate.sourceSheet ?? ""
          },
          score: scored.score,
          matchReasons: scored.reasons
        };
      });
    })
    .filter((item) => item.score >= 45);

  // Una sola tarjeta por ALOJAMIENTO: nos quedamos con su mejor tarifa (mayor
  // score; a igualdad, la más barata). Antes se devolvía una coincidencia por
  // cada tarifa, lo que inflaba los resultados (p. ej. 192) con el mismo hotel
  // repetido decenas de veces y hacía imposible elegir.
  //
  // La tarifa que representa al hotel es la de los ALUMNOS, es decir la de
  // ocupación compartida: son la mayoría del grupo. Las de uso individual no
  // compiten por ese puesto —serían más caras y falsearían la comparación—;
  // se guardan aparte para cotizar a los profesores.
  const compartidas = perRateMatches.filter((item) => !esIndividual(item.rate.occupancyLabel));
  const individuales = perRateMatches.filter((item) => esIndividual(item.rate.occupancyLabel));

  // Si un hotel SOLO tiene tarifas individuales, no se le deja fuera: es lo que
  // hay para ese hotel.
  const conTarifaCompartida = new Set(compartidas.map((item) => item.accommodation.id));
  const candidatas = [
    ...compartidas,
    ...individuales.filter((item) => !conTarifaCompartida.has(item.accommodation.id)),
  ];

  const bestByAccommodation = new Map<string, AccommodationSearchMatch>();
  for (const item of candidatas) {
    const current = bestByAccommodation.get(item.accommodation.id);
    if (
      !current ||
      item.score > current.score ||
      (item.score === current.score &&
        (item.rate.pvpAmount || item.rate.netSaleAmount) <
          (current.rate.pvpAmount || current.rate.netSaleAmount))
    ) {
      bestByAccommodation.set(item.accommodation.id, item);
    }
  }

  const matches: AccommodationSearchMatch[] = [...bestByAccommodation.values()]
    .map((item) => ({ ...item, singleRate: tarifaIndividualHermana(item, individuales) }))
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
    // Aviso, no bloqueo. Un colegio pide presupuesto antes de saber qué curso
    // va: exigir la edad para poder enseñar NADA dejaba la solicitud parada por
    // un dato que todavía no existe. Sin edad se ofrecen todas las actividades
    // y quien cotiza descarta las que no encajen, que es lo que hacía a mano.
    warnings.push({
      code: "age_missing",
      message:
        "Sin edad se muestran todas las actividades, incluidas las que quizá no encajen por edad.",
    });
    missingFields.push({
      field: "ageRangeText",
      label: "Edad o rango de edad",
      reason: "Sin edad no se pueden descartar las actividades que no correspondan.",
      severity: "warning"
    });
  }

  if (missingFields.some((item) => item.severity === "critical")) {
    return { filters, matches: [], warnings, missingFields, status: "insufficient_filters" };
  }

  const activities = await prisma.activity.findMany({
    include: {
      rates: true,
      policies: true
    }
  });

  // Mismo criterio que en alojamientos: sin canal vale para todos.
  const wantedSegment = (filters.clientSegment ?? "").trim() || null;
  const matchesSegment = (rate: { clientSegment?: string | null }) =>
    esParaCualquierCliente(rate.clientSegment) || rate.clientSegment === wantedSegment;

  const documentNames = await loadSourceDocumentNames(
    activities.map((activity) => activity.sourceDocumentId)
  );

  const perRateMatches: ActivitySearchMatch[] = activities
    .flatMap((activity) =>
      activity.rates.filter(matchesSegment).map((rate) => {
        const scored = scoreActivityMatch(activity, rate, filters);
        return {
          activity: {
            id: activity.id,
            activityName: activity.activityName,
            supplierName: activity.supplierName ?? "",
            locationMain: activity.locationMain ?? "",
            durationText: activity.durationText ?? "",
            descriptionText: activity.descriptionText ?? "",
            policies: activity.policies.map((policy) => ({
              id: policy.id,
              policyType: policy.policyType,
              policyText: policy.policyText
            })),
            sourceFile: activity.sourceFile ?? "",
            sourceDocumentId: activity.sourceDocumentId ?? "",
            sourceDocumentName: activity.sourceDocumentId
              ? documentNames.get(activity.sourceDocumentId) ?? ""
              : ""
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
            clientSegment: rate.clientSegment ?? "",
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
    // Umbral bajo: basta con coincidir por ubicación (+30) o zona (+18). La edad
    // suma cuando hay dato, pero no es obligatoria (la BBDD aún no la trae).
    .filter((item) => item.score >= 15);

  // Una sola tarjeta por ACTIVIDAD: su mejor tarifa (mayor score; a igualdad, la
  // más barata con precio > 0). Evita repetir la misma actividad por cada tramo.
  const bestByActivity = new Map<string, ActivitySearchMatch>();
  for (const item of perRateMatches) {
    const current = bestByActivity.get(item.activity.id);
    if (
      !current ||
      item.score > current.score ||
      (item.score === current.score &&
        item.rate.salePvpAmount > 0 &&
        (current.rate.salePvpAmount === 0 || item.rate.salePvpAmount < current.rate.salePvpAmount))
    ) {
      bestByActivity.set(item.activity.id, item);
    }
  }

  const matches: ActivitySearchMatch[] = [...bestByActivity.values()].sort(
    (a, b) => b.score - a.score
  );

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
