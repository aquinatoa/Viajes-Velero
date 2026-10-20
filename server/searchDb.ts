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
import { comprobar } from "./encajeConLaPeticion";
import { deriveSalePrice } from "./pricing";
import { textoDelPeriodo, valeParaElViaje } from "../src/domain/periodosDeActividad";
import { precioParaElCliente } from "../src/domain/precioClienteEspecial";
import { listarClientesEspeciales } from "./clientesEspeciales";
import { suplementosDeHabitacion } from "../src/domain/estancia";
import { coberturaDeTarifa } from "../src/domain/fechasDeTarifa";
import { edadDeEtiqueta } from "../src/domain/lineasDeActividad";
import { periodoDeLaTarifa, periodosDelViaje } from "../src/domain/calendarioPortAventura";

/**
 * Cuántas noches del viaje cubre una tarifa, con las fechas guardadas y las que
 * trae el nombre de su temporada («T. Media (T2: 12/03-24/03 · 05/06-18/06)»,
 * «T. Alta · 9, 10 y 14/06», «Domingo a Jueves»…). `sinSaber`: la tarifa no
 * dice en ningún sitio qué días vale.
 */
export function nochesCubiertas(
  tarifa: { seasonName?: string | null; dateFrom?: Date | string | null; dateTo?: Date | string | null },
  desde: string | null | undefined,
  hasta: string | null | undefined,
): { cubiertas: number; total: number; sinSaber: boolean } {
  if (!desde || !hasta) return { cubiertas: 0, total: 0, sinSaber: true };
  const iso = (d: Date | string | null | undefined) =>
    d ? (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10) : null;
  const c = coberturaDeTarifa({ seasonName: tarifa.seasonName, dateFrom: iso(tarifa.dateFrom), dateTo: iso(tarifa.dateTo) });
  const inicio = new Date(`${String(desde).slice(0, 10)}T12:00:00Z`);
  const fin = new Date(`${String(hasta).slice(0, 10)}T12:00:00Z`);
  const total = Math.max(1, Math.round((fin.getTime() - inicio.getTime()) / 86400000));
  let cubiertas = 0;
  let sinSaber = false;
  for (let i = 0; i < total; i++) {
    const fecha = new Date(inicio.getTime() + i * 86400000).toISOString().slice(0, 10);
    const v = c.vale(fecha);
    if (v === true) cubiertas++;
    if (v === null) sinSaber = true;
  }
  return { cubiertas, total, sinSaber };
}

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

/** El departamento de cada documento (GROUPS, SPORTS o null = los dos). */
async function loadSourceDocumentDepartments(
  ids: (string | null | undefined)[]
): Promise<Map<string, string | null>> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (uniqueIds.length === 0) return new Map();
  const documents = await prisma.sourceDocument.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, department: true }
  });
  return new Map(documents.map((document) => [document.id, document.department ?? null]));
}

/**
 * La localidad de control de cada documento. Es el respaldo de la actividad
 * que no trae la suya: las entradas de PortAventura viven en «PortAventura
 * Park, Ferrari Land y Caribe Aquatic Park» y nadie escribe eso en el destino;
 * su documento dice «Vila-seca / Salou», que es donde se busca. Sin esto, un
 * viaje a Salou no encontraba ni una entrada (Javier, 08/10/2026, en directo).
 */
async function loadSourceDocumentLocations(
  ids: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (uniqueIds.length === 0) {
    return new Map();
  }
  const documents = await prisma.sourceDocument.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, controlLocation: true }
  });
  return new Map(
    documents
      .filter((document) => (document.controlLocation ?? "").trim())
      .map((document) => [document.id, String(document.controlLocation)])
  );
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

/**
 * La zona de un sitio compuesto: «Vila-seca / Salou» no está en ninguna lista,
 * pero Vila-seca sí. Se prueba cada localidad del texto.
 */
function zonaDeCualquiera(loc?: string | null): string {
  for (const parte of localidadesDe(loc)) {
    const zona = zoneOf(parte);
    if (zona) return zona;
  }
  return "";
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

  // — Fechas: cubre la estancia (mucho); solapa parcial (poco). Con las fechas
  // que trae el nombre de la temporada, no solo las guardadas (20/10/2026).
  if (filters.dateFrom && filters.dateTo) {
    const n = nochesCubiertas(rate, filters.dateFrom, filters.dateTo);
    if (n.cubiertas === n.total) {
      score += 20;
      reasons.push(`Tarifa válida en ${rate.seasonName ?? "temporada"}.`);
    } else if (n.cubiertas > 0) {
      score += 6;
    } else if (n.sinSaber) {
      score += 4;
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
  const localidad = activity.locality?.trim();
  // Una «localidad» que es el nombre de una ZONA no es un pueblo. La plantilla
  // de actividades v2 se subió con ubicación «Costa Daurada» y esa palabra se
  // copió a sus 129 actividades: ninguna coincidía con ningún destino y todas
  // salían «fuera del destino», hasta buscando en Salou las de Salou, y las de
  // Calella (que está en el Maresme) contaban como Costa Daurada (15/10/2026).
  // Si el sitio dice dónde, manda el sitio.
  if (localidad && esNombreDeZona(localidad) && activity.locationMain?.trim()) return activity.locationMain;
  return localidad || activity.locationMain;
}

/** «Costa Daurada», «Costa Brava»…: un nombre de zona, no de pueblo. */
function esNombreDeZona(texto: string | null | undefined): boolean {
  return Object.prototype.hasOwnProperty.call(ZONES, normalizeText(texto ?? ""));
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
  } else {
    // La zona del sitio; si el sitio no está en ninguna lista (Altafulla), la
    // zona que traía el documento como localidad.
    const zona =
      zonaDeCualquiera(donde) || (esNombreDeZona(activity.locality) ? normalizeText(activity.locality ?? "") : "");
    if (locA && zona && zona === zoneOf(filters.destinationText)) {
      score += 18;
      reasons.push(`En la misma zona: ${activity.locationMain ?? donde}.`);
    }
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
    // Sin números, la etiqueta: «Joven/Secundaria (12-17)», «Primaria», «Adulto», «Desde 15 años».
    const tramo = edadDeEtiqueta(rate.ageLabel);
    if (ageRange && tramo) {
      const min = tramo.min ?? 0, max = tramo.max ?? 120;
      if (ageRange.max >= min && ageRange.min <= max) {
        score += 40;
        reasons.push(`Compatible con el tramo ${rate.ageLabel}.`);
      } else {
        reasons.push(`Es para ${rate.ageLabel}: no encaja con un grupo de ${ageRange.min}-${ageRange.max} años.`);
      }
    } else {
      score += 8;
      reasons.push("Edad sin especificar (confirmar con el proveedor).");
    }
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
      rates: true,
      // Los suplementos de habitación («Individual +75 %», «Doble profes
      // +10 %»): la estancia los aplica a profesores y chófer (19/10/2026).
      adjustments: { select: { concept: true, amountType: true, amount: true } },
    }
  });
  const suplementosPorHotel = new Map(
    accommodations.map((a) => [
      a.id,
      suplementosDeHabitacion(a.adjustments.map((s) => ({ ...s, amount: s.amount === null ? null : Number(s.amount) }))),
    ]),
  );

  // Filtro por cliente: una tarifa pactada con un canal concreto NO puede
  // aparecer al cotizar para otro. Las tarifas sin canal valen para todos, que
  // es el caso de todo lo que se cargó antes de existir esta distinción.
  const wantedSegment = (filters.clientSegment ?? "").trim() || null;
  const matchesSegment = (rate: { clientSegment?: string | null }) =>
    esParaCualquierCliente(rate.clientSegment) || rate.clientSegment === wantedSegment;
  // Su porcentaje sobre el PVP general, de la base de datos (19/10/2026).
  const clientesEspeciales = wantedSegment ? await listarClientesEspeciales() : [];

  const documentNames = await loadSourceDocumentNames(
    accommodations.map((accommodation) => accommodation.sourceDocumentId)
  );

  // «Su tarifa propia manda» (Javier, 28/09/2026), por NOMBRE de hotel y no por
  // registro: la tarifa del suizo y la general del mismo hotel vienen de
  // documentos distintos y son alojamientos distintos con el mismo nombre. Sin
  // esto, al cotizar para el suizo «Mediterrània MED1» salía dos veces, con su
  // precio y con el general.
  const especialPedido =
    wantedSegment && !esParaCualquierCliente(wantedSegment) ? wantedSegment : null;
  const hotelesConPropia = new Set(
    especialPedido
      ? accommodations
          .filter((a) => a.rates.some((r) => r.clientSegment === especialPedido))
          .map((a) => normalizeText(a.accommodationName))
      : [],
  );

  // Filtro por departamento. Javier, 08/10/2026: el mismo hotel tiene precios
  // distintos para Grupos y para Turismo Deportivo, y hasta ahora salían
  // mezclados. El departamento es del DOCUMENTO de origen: cambiarlo en Tarifas
  // vale al momento. Sin departamento en la petición, o en el documento, vale.
  const wantedDepartment = (filters.department ?? "").trim() || null;
  const documentDepartments = await loadSourceDocumentDepartments([
    ...accommodations.map((accommodation) => accommodation.sourceDocumentId),
    ...accommodations.flatMap((accommodation) => accommodation.rates.map((rate) => rate.sourceDocumentId)),
  ]);
  const departamentoDe = (rate: { sourceDocumentId: string | null }, accommodation: { sourceDocumentId: string | null }) => {
    const doc = rate.sourceDocumentId ?? accommodation.sourceDocumentId;
    return doc ? documentDepartments.get(doc) ?? null : null;
  };

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
      const tienePropia = hotelesConPropia.has(normalizeText(accommodation.accommodationName));
      return accommodation.rates
        .filter(matchesSegment)
        // Si el cliente especial tiene la suya para este hotel, la general no.
        .filter((rate) => !tienePropia || rate.clientSegment === especialPedido)
        .filter((rate) => {
          const departamento = departamentoDe(rate, accommodation);
          return !wantedDepartment || !departamento || departamento === wantedDepartment;
        })
        .map((rate) => {
        const scored = scoreAccommodationMatch(accommodation, rate, filters);
        // El cliente especial sin tarifa propia en este hotel: la general con
        // su porcentaje, si lo tiene (Javier, 28/09/2026).
        const especial = precioParaElCliente(
          Number(rate.pvpAmount ?? 0),
          wantedSegment,
          rate,
          tienePropia,
          clientesEspeciales,
        );
        if (especial.motivo) scored.reasons.push(especial.motivo);
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
            pvpAmount: especial.precio,
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

  // Las DEMAS tarifas de cada alojamiento, que hasta ahora se calculaban y se
  // tiraban. El 4R tiene cuarenta -media pension y completa, habitacion
  // multiple y doble, por temporada- y quien cotiza veia una sola, elegida por
  // nosotros, sin saber que habia alternativas.
  const porAlojamiento = new Map<string, AccommodationSearchMatch[]>();
  for (const item of perRateMatches) {
    const lista = porAlojamiento.get(item.accommodation.id) ?? [];
    lista.push(item);
    porAlojamiento.set(item.accommodation.id, lista);
  }

  /**
   * Si una tarifa sirve para las fechas del viaje.
   *
   * Las «otras tarifas» de un hotel son casi todas de OTRAS temporadas: el
   * Santa Mónica tiene 42 y solo 6 valen para un viaje del 12 al 16 de mayo.
   * Enseñar las 42 no es enseñar alternativas, es ruido -y peor: invita a
   * elegir un precio de octubre para un viaje de mayo-. Una tarifa sin
   * temporada legible no se descarta: no se puede afirmar que no valga.
   */
  const valeParaEstasFechas = (
    tarifa: { seasonName?: string | null; dateFrom?: Date | string | null; dateTo?: Date | string | null },
    f: SearchFilters,
  ): boolean => {
    if (!f.dateFrom || !f.dateTo) return true;
    // Con las fechas del nombre de la temporada: la T. Media de junio del
    // Canada Palace solo tenía guardado su primer tramo (marzo) y se quedaba fuera.
    const n = nochesCubiertas(tarifa, f.dateFrom, f.dateTo);
    return n.cubiertas > 0 || n.sinSaber;
  };

  const sinTarifaParaLasFechas = (
    alojamientoId: string,
    elegida: { seasonName?: string | null; dateFrom?: Date | string | null; dateTo?: Date | string | null },
  ) => {
    if (!filters.dateFrom || !filters.dateTo) return [];
    const todas = porAlojamiento.get(alojamientoId) ?? [];
    const alguna = todas.some((o) => {
      const n = nochesCubiertas(o.rate, filters.dateFrom, filters.dateTo);
      return n.cubiertas > 0 || n.sinSaber;
    });
    if (alguna) return [];
    const iso = (d: Date | string | null | undefined) =>
      d ? (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "";
    return [
      {
        clave: "fechas" as const,
        que: "Sin tarifa para estas fechas",
        estado: "no_cumple" as const,
        detalle: `Su tarifa es de ${elegida.seasonName ?? "otra temporada"}${
          elegida.dateFrom && elegida.dateTo ? ` (${iso(elegida.dateFrom)}–${iso(elegida.dateTo)})` : ""
        }: pide precio al hotel`,
      },
    ];
  };

  const noches =
    filters.dateFrom && filters.dateTo
      ? Math.max(
          1,
          Math.round(
            (new Date(filters.dateTo).getTime() - new Date(filters.dateFrom).getTime()) / 86400000,
          ),
        )
      : null;

  const matches: AccommodationSearchMatch[] = [...bestByAccommodation.values()]
    .map((item) => {
      // El mismo precio que va a salir en el presupuesto: cuando el documento
      // solo trae el neto, la venta lleva el margen. Sin esto, el «cabe en el
      // tope» de la pantalla se calculaba sobre un precio un 8% menor que el
      // que despues lee el colegio.
      const porNoche = deriveSalePrice(item.rate.netSaleAmount, item.rate.pvpAmount) ?? 0;
      return {
        ...item,
        singleRate: tarifaIndividualHermana(item, individuales),
        // Lo que pidio el centro, comprobado contra ESTE alojamiento.
        encaje: [
          ...comprobar(
          {
            categoryRequested: filters.categoryRequested,
            boardType: filters.boardType,
            destinationText: filters.destinationText,
            requisitos: filters.requisitos,
            topePorAlumno: filters.topePorAlumno,
          },
          {
            locality: item.accommodation.locality,
            categoryType: item.accommodation.categoryType,
            textos: [
              item.accommodation.conditionsText,
              item.accommodation.observations,
              item.accommodation.freePolicy,
            ],
          },
          {
            boardType: item.rate.boardType,
            // El mínimo que exige el hotel en esa pensión: el menor de sus
            // tramos, no el de la tarifa elegida (el 4R tiene precio desde 1 noche).
            minNights: Math.min(
              ...(porAlojamiento.get(item.accommodation.id) ?? [item])
                .filter((o) => (o.rate.boardType ?? "").slice(0, 2) === (item.rate.boardType ?? "").slice(0, 2))
                .map((o) => o.rate.minNights || 1),
            ),
          },
          {
            precioPorAlumno: noches ? porNoche * noches : null,
            noches,
            participantes: filters.participants ?? null,
          },
          ),
          // Ninguna tarifa del hotel vale para estas fechas: sale con el precio
          // de otra temporada. Que no entre en el podio con «Cumple…» (Canada
          // Palace, Terra Àurea; revisión del 20/10/2026).
          ...sinTarifaParaLasFechas(item.accommodation.id, item.rate),
        ],
        suplementosHabitacion: suplementosPorHotel.get(item.accommodation.id) ?? {},
        alternativas: (porAlojamiento.get(item.accommodation.id) ?? [])
          .filter((otra) => otra.rate.id !== item.rate.id)
          .filter((otra) => valeParaEstasFechas(otra.rate, filters))
          .map((otra) => otra.rate),
      };
    })
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
  // Su porcentaje sobre el PVP general, de la base de datos (19/10/2026).
  const clientesEspeciales = wantedSegment ? await listarClientesEspeciales() : [];

  const documentNames = await loadSourceDocumentNames(
    activities.map((activity) => activity.sourceDocumentId)
  );
  // «Su tarifa propia manda», por nombre de actividad (ver alojamientos).
  const especialPedidoAct =
    wantedSegment && !esParaCualquierCliente(wantedSegment) ? wantedSegment : null;
  const actividadesConPropia = new Set(
    especialPedidoAct
      ? activities
          .filter((a) => a.rates.some((r) => r.clientSegment === especialPedidoAct))
          .map((a) => normalizeText(a.activityName))
      : [],
  );
  const documentLocations = await loadSourceDocumentLocations(
    activities.map((activity) => activity.sourceDocumentId)
  );

  const perRateMatchesTodos: ActivitySearchMatch[] = activities
    .flatMap((activity) => {
      const tienePropia = actividadesConPropia.has(normalizeText(activity.activityName));
      return activity.rates
        .filter(matchesSegment)
        .filter((rate) => !tienePropia || rate.clientSegment === especialPedidoAct)
        .map((rate) => {
        const scored = scoreActivityMatch(
          {
            ...activity,
            locality:
              activity.locality ??
              (activity.sourceDocumentId ? documentLocations.get(activity.sourceDocumentId) ?? null : null),
          },
          rate,
          filters,
        );
        const especial = precioParaElCliente(
          Number(rate.salePvpAmount ?? 0),
          wantedSegment,
          rate,
          tienePropia,
          clientesEspeciales,
        );
        if (especial.motivo) scored.reasons.push(especial.motivo);
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
            // Sin edad es sin edad: con «0» el esbozo creía que la tarifa era
            // de 0 años y no leía la edad de la etiqueta (20/10/2026).
            ageMin: rate.ageMin ?? null,
            ageMax: rate.ageMax ?? null,
            rateUnit: rate.rateUnit ?? null,
            minPax: rate.minPax ?? null,
            maxPax: rate.maxPax ?? null,
            seasonName: rate.seasonName ?? null,
            salePvpAmount: especial.precio,
            costNetAmount: Number(rate.costNetAmount ?? 0),
            clientSegment: rate.clientSegment ?? "",
            commissionPercent: Number(rate.commissionPercent ?? 0),
            durationText: rate.durationText ?? "",
            sourceFile: rate.sourceFile ?? "",
            sourceSheet: rate.sourceSheet ?? "",
            dateFrom: rate.dateFrom ? rate.dateFrom.toISOString().slice(0, 10) : null,
            dateTo: rate.dateTo ? rate.dateTo.toISOString().slice(0, 10) : null
          },
          score: scored.score,
          matchReasons: scored.reasons
        };
      });
    });
  // Se enseñan TODAS, siempre. Lo decidió Javier en la reunión del 08/10/2026:
  // «que salgan todas las actividades siempre, que no las filtre, da igual» —
  // a veces no hay disponibilidad en Salou y el grupo se va a Cambrils a hacer
  // la actividad, y PortAventura está en Vila-seca. Las que no están en el
  // destino ni en su zona van marcadas y después de las que sí; el buscador
  // de la pantalla hace el resto. Hasta hoy un umbral (+15) las escondía, y
  // «las actividades no me salen» fue el bloqueo de la semana.
  const enDestino = (item: ActivitySearchMatch) => item.score >= 15;
  const perRateMatches: ActivitySearchMatch[] = perRateMatchesTodos.map((item) =>
    enDestino(item)
      ? item
      : {
          ...item,
          fueraDelDestino: true,
          matchReasons: [
            `Fuera del destino pedido: está en ${item.activity.locationMain || "otra zona"}.`,
            ...item.matchReasons,
          ],
        },
  );
  const fueraDelDestino = perRateMatchesTodos.length > 0 && !perRateMatchesTodos.some(enDestino);

  // El periodo de cada tarifa (Ruth y Javier, 08/10/2026: «dos periodos de
  // aplicación al año»). Si una actividad tiene alguna tarifa que vale en las
  // fechas del viaje, solo cuentan esas. Si no tiene ninguna, se enseña igual,
  // marcada «fuera de temporada» con sus periodos: Javier quiere verlas todas.
  const periodosViaje = periodosDelViaje(filters.dateFrom, filters.dateTo);
  const enTemporada = (item: ActivitySearchMatch) => {
    // Las entradas de PortAventura van por periodo del calendario, no por fechas.
    const periodo = periodoDeLaTarifa(item.rate.ageLabel) ?? periodoDeLaTarifa(item.rate.seasonName);
    if (periodo && !item.rate.dateFrom && periodosViaje.length) return periodosViaje.includes(periodo);
    return valeParaElViaje(item.rate, filters.dateFrom, filters.dateTo);
  };
  const conTemporada = new Set(perRateMatches.filter(enTemporada).map((item) => item.activity.id));
  const periodosDe = new Map<string, string[]>();
  for (const item of perRateMatches) {
    const lista = periodosDe.get(item.activity.id) ?? [];
    const clave = `${item.rate.dateFrom ?? ""}|${textoDelPeriodo(item.rate.dateFrom, item.rate.dateTo)}`;
    if (!lista.includes(clave)) lista.push(clave);
    periodosDe.set(item.activity.id, lista);
  }
  // En orden de calendario y sin la clave de ordenar.
  for (const [id, lista] of periodosDe) {
    periodosDe.set(id, [...lista].sort().map((clave) => clave.slice(clave.indexOf("|") + 1)));
  }
  const perRateVigentes: ActivitySearchMatch[] = perRateMatches
    .filter((item) => enTemporada(item) || !conTemporada.has(item.activity.id))
    .map((item) =>
      enTemporada(item)
        ? item
        : {
            ...item,
            fueraDeTemporada: true,
            matchReasons: [
              `Fuera de temporada en esas fechas: vale ${(periodosDe.get(item.activity.id) ?? []).join(" y ")}.`,
              ...item.matchReasons,
            ],
          },
    );

  // Una sola tarjeta por ACTIVIDAD: su mejor tarifa (mayor score; a igualdad, la
  // más barata con precio > 0). Evita repetir la misma actividad por cada tramo.
  const bestByActivity = new Map<string, ActivitySearchMatch>();
  for (const item of perRateVigentes) {
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

  // Las demás tarifas de cada actividad, para que quien cotiza sepa cuál se
  // ha elegido y entre cuáles. Igual que en los alojamientos.
  const tarifasPorActividad = new Map<string, ActivitySearchMatch["rate"][]>();
  for (const item of perRateVigentes) {
    const lista = tarifasPorActividad.get(item.activity.id) ?? [];
    lista.push(item.rate);
    tarifasPorActividad.set(item.activity.id, lista);
  }

  // Las destacadas, siempre arriba. Javier (08/10/2026): «hay actividades que
  // son tops, te las podría decir yo para que salgan siempre las primeras».
  // Van en ACTIVIDADES_DESTACADAS, separadas por «;», y se comparan por trozo
  // de nombre sin tildes ni mayúsculas.
  const destacadas = (process.env.ACTIVIDADES_DESTACADAS ?? "")
    .split(";")
    .map((t) => normalizeText(t))
    .filter(Boolean);
  const esDestacada = (nombre: string) => {
    const n = normalizeText(nombre);
    return destacadas.some((d) => n.includes(d));
  };
  const matches: ActivitySearchMatch[] = [...bestByActivity.values()]
    .map((item) => ({
      ...item,
      destacada: esDestacada(item.activity.activityName),
      alternativas: (tarifasPorActividad.get(item.activity.id) ?? []).filter((r) => r.id !== item.rate.id),
    }))
    .sort(
      // En Calella, lo de Calella primero: una destacada de Salou no va por
      // delante de las del destino (revisión del 20/10/2026).
      (a, b) =>
        Number(Boolean(a.fueraDelDestino)) - Number(Boolean(b.fueraDelDestino)) ||
        Number(b.destacada) - Number(a.destacada) ||
        Number(Boolean(a.fueraDeTemporada)) - Number(Boolean(b.fueraDeTemporada)) ||
        b.score - a.score ||
        a.activity.activityName.localeCompare(b.activity.activityName, "es"),
    );

  // Las que el catálogo tiene SIN NINGUNA tarifa.
  //
  // Hasta ahora desaparecían: la búsqueda recorre las tarifas de cada actividad,
  // así que una actividad sin tarifas no producía ni un resultado. «Arbitraje»
  // está en el catálogo desde el principio y nunca se pudo ofrecer.
  //
  // No se filtran por destino ni por edad, y es a propósito: una actividad sin
  // tarifa tampoco tiene localidad ni tramo de edad con los que puntuar, así que
  // cualquier filtro la volvería a esconder. Van aparte, marcadas, para que
  // quien cotiza decida — que es justo lo que pidió Oravia: «que salga como
  // opción, diciendo que hay que ponerle precio, y lo marcamos nosotros».
  //
  // Las que SÍ tienen tarifas pero ninguna de este canal no entran aquí: esas
  // están escondidas por una regla que existe, y sacarlas colaría en una
  // cotización genérica los precios pactados con el turoperador suizo.
  const sinTarifa: ActivitySearchMatch[] = activities
    .filter((activity) => activity.rates.length === 0)
    .map((activity) => ({
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
          policyText: policy.policyText,
        })),
        sourceFile: activity.sourceFile ?? "",
        sourceDocumentId: activity.sourceDocumentId ?? "",
        sourceDocumentName: activity.sourceDocumentId
          ? documentNames.get(activity.sourceDocumentId) ?? ""
          : "",
      },
      // Una tarifa de mentira, con importe cero, para que el resto de la
      // pantalla no tenga que preguntarse si hay tarifa o no. Lo que la
      // distingue es `precioAFijar`, no el cero: un cero puede ser un precio.
      rate: {
        id: `sin-tarifa:${activity.id}`,
        activityId: activity.id,
        year: filters.dateFrom ? new Date(filters.dateFrom).getUTCFullYear() : new Date().getUTCFullYear(),
        ageLabel: "",
        ageMin: 0,
        ageMax: 0,
        salePvpAmount: 0,
        costNetAmount: 0,
        clientSegment: "",
        commissionPercent: 0,
        durationText: activity.durationText ?? "",
        sourceFile: activity.sourceFile ?? "",
        sourceSheet: "",
      },
      score: 0,
      matchReasons: ["El catálogo no le pone precio: hay que fijarlo al cotizar."],
      precioAFijar: true,
    }));

  return {
    filters,
    matches,
    sinTarifa,
    warnings: [
      ...warnings,
      ...(fueraDelDestino
        ? [
            {
              code: "activities_outside_destination",
              message: "No hay actividades en el destino pedido: se muestran las de otras zonas, marcadas.",
            },
          ]
        : []),
      ...(matches.length === 0
        ? [
            {
              code: "no_activities_found",
              message: "No se encontraron actividades compatibles en la base real.",
            },
          ]
        : []),
    ],
    missingFields,
    status: matches.length > 0 || sinTarifa.length > 0 ? "ok" : "no_matches"
  };
}
