import { z } from "zod";
import type {
  Client,
  FindCandidateOpportunitiesResult,
  MissingField,
  NormalizedRequestDraft,
  ParseTripRequestInput,
  ParseTripRequestResult,
  TripRequest,
  ValidateTripRequestInput,
  ValidateTripRequestResult,
  WarningItem
} from "../domain/types";
import {
  getClientTripRequestsApi,
  saveTripRequestApi,
  upsertClientApi,
} from "./apiClient";

const intakeSchema = z.object({
  clientType: z.enum(["new", "existing"]),
  email: z.string().trim().min(1, "El email es obligatorio."),
  firstName: z.string().trim().min(1, "El nombre es obligatorio."),
  lastName: z.string().trim().min(1, "Los apellidos son obligatorios."),
  opportunityName: z.string().optional(),
  rawTripRequestText: z.string().trim().min(20, "Describe mejor la solicitud del viaje.")
});

const destinationCatalog = [
  { city: "Valencia", country: "España", aliases: ["valencia"] },
  { city: "Gandia", country: "España", aliases: ["gandia", "gandía"] },
  { city: "Madrid", country: "España", aliases: ["madrid"] },
  { city: "Barcelona", country: "España", aliases: ["barcelona"] },
  { city: "Salou", country: "España", aliases: ["salou"] },
  { city: "Cambrils", country: "España", aliases: ["cambrils"] },
  { city: "La Pineda", country: "España", aliases: ["la pineda", "pineda"] },
  { city: "Tarragona", country: "España", aliases: ["tarragona"] },
  { city: "Costa Daurada", country: "España", aliases: ["costa daurada", "costa dorada"] }
];

const categoryAliases = ["2*", "3*", "4*", "5*", "hostal", "hotel", "residencia"];
const boardAliases = ["pensión completa", "media pensión", "alojamiento y desayuno", "solo alojamiento"];

function emptyDraft(): NormalizedRequestDraft {
  return {
    language: "",
    destinationText: "",
    destinationCountry: "",
    dateFrom: "",
    dateTo: "",
    participants: null,
    teachers: null,
    ageRangeText: "",
    averageAgeText: "",
    groupType: "",
    regimeRequested: "",
    categoryRequested: "",
    requirementsText: ""
  };
}

function detectLanguage(text: string) {
  const lower = text.toLowerCase();
  const spanishSignals = ["hola", "necesitamos", "grupo", "colegio", "profesores", "pensión"];
  const englishSignals = ["hello", "school", "teachers", "students", "half board"];

  if (spanishSignals.some((signal) => lower.includes(signal))) {
    return "Español";
  }

  if (englishSignals.some((signal) => lower.includes(signal))) {
    return "Inglés";
  }

  return "";
}

function findDestination(text: string) {
  const lower = text.toLowerCase();
  const present = destinationCatalog.filter((candidate) =>
    candidate.aliases.some((alias) => lower.includes(alias))
  );

  if (present.length <= 1) {
    return present[0];
  }

  // Si hay varias ciudades en el texto, preferir la que va tras una preposición de
  // DESTINO ("a/en/hacia Salou", "destino: Salou") y penalizar la de ORIGEN
  // ("de Madrid", "colegio de Madrid"), para no confundir el origen con el destino.
  const scored = present.map((candidate) => {
    let score = 0;
    for (const alias of candidate.aliases) {
      const a = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b(?:a|en|hacia|hasta|destino:?)\\s+${a}\\b`).test(lower)) score += 2;
      if (new RegExp(`\\b(?:de|del|desde)\\s+${a}\\b`).test(lower)) score -= 2;
    }
    return { candidate, score };
  });

  scored.sort((x, y) => y.score - x.score);
  return scored[0].candidate;
}

const SPANISH_MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12
};

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function monthNumber(token: string | undefined): number | null {
  if (!token) return null;
  return SPANISH_MONTHS[stripAccents(token).toLowerCase()] ?? null;
}

function toIso(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Extrae el rango de fechas del texto libre. Reconoce, por orden:
 *   1. ISO: "2026-05-18 ... 2026-05-22"
 *   2. Lenguaje natural en español: "del 18 al 22 de mayo de 2026",
 *      "del 2 de mayo al 6 de junio de 2026", "entre el 18 y el 22 de mayo de 2026".
 *   3. Numérico DD/MM/AAAA: "18/05/2026 ... 22/05/2026" (también con - o .).
 */
function extractDates(text: string) {
  const empty = { dateFrom: "", dateTo: "" };

  // 1) ISO (AAAA-MM-DD)
  const isoDates = [...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1]);
  if (isoDates.length >= 2) {
    return { dateFrom: isoDates[0], dateTo: isoDates[1] };
  }

  const lower = text.toLowerCase();

  // 2) Español: D1 [de MES1] (al|a|y|hasta|-) [el] D2 de MES2 [de] AAAA
  const es = lower.match(
    /(\d{1,2})\s*(?:de\s+([a-záéíóúñ]+)\s+)?(?:al|a|y|hasta|–|-)\s*(?:el\s+)?(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+(?:de\s+)?(20\d{2})/
  );
  if (es) {
    const day1 = Number(es[1]);
    const day2 = Number(es[3]);
    const month2 = monthNumber(es[4]);
    const month1 = monthNumber(es[2]) ?? month2;
    const year = Number(es[5]);
    if (month1 && month2) {
      return { dateFrom: toIso(year, month1, day1), dateTo: toIso(year, month2, day2) };
    }
  }

  // 3) Numérico DD/MM/AAAA (o con - o .)
  const numeric = [...text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/g)].map((m) =>
    toIso(Number(m[3]), Number(m[2]), Number(m[1]))
  );
  if (numeric.length >= 2) {
    return { dateFrom: numeric[0], dateTo: numeric[1] };
  }

  return empty;
}

function extractParticipants(text: string) {
  const lower = text.toLowerCase();
  const match =
    lower.match(/(\d{1,3})\s+(estudiantes|alumnos|participantes|students|pax)/) ??
    lower.match(/grupo\s+de\s+(\d{1,3})/) ??
    lower.match(/for\s+(\d{1,3})\s+(students|participants)/);

  return match ? Number(match[1]) : null;
}

function extractTeachers(text: string) {
  const lower = text.toLowerCase();
  const match =
    lower.match(/(\d{1,2})\s+(profesores|profesoras|teachers|monitores|adultos acompañantes)/) ??
    lower.match(/(\d{1,2})\s+(adults|staff)/);

  return match ? Number(match[1]) : null;
}

function extractAgeInfo(text: string) {
  const lower = text.toLowerCase();
  // Acepta "14-17 años", "15 a 16 años", "entre 15 y 16 años", "de 14 a 17 años".
  const range =
    lower.match(/(\d{1,2})\s*(?:-|–|a|y|hasta)\s*(\d{1,2})\s*años/) ??
    lower.match(/ages?\s+(\d{1,2})\s*(?:-|to)\s*(\d{1,2})/);
  const average = lower.match(/media\s+de\s+(\d{1,2})\s*años/) ?? lower.match(/average age\s+(\d{1,2})/);

  return {
    ageRangeText: range ? `${range[1]}-${range[2]}` : "",
    averageAgeText: average ? `${average[1]} años` : ""
  };
}

function extractBoardType(text: string) {
  const lower = stripAccents(text.toLowerCase());
  return boardAliases.find((alias) => lower.includes(stripAccents(alias))) ?? "";
}

function extractCategory(text: string) {
  const lower = text.toLowerCase();
  // "4 estrellas" / "de 4*" → "4*" (prioriza el número de estrellas sobre "hotel").
  const stars = lower.match(/(\d)\s*(?:\*|estrellas?)/);
  if (stars) {
    return `${stars[1]}*`;
  }
  return categoryAliases.find((alias) => lower.includes(alias.toLowerCase())) ?? "";
}

export interface ExtractedClientInfo {
  email: string;
  firstName: string;
  lastName: string;
  opportunityName: string;
}

/**
 * Primer análisis del mensaje del cliente para AUTORRELLENAR los datos de contacto
 * en el paso 1. Heurístico (sin IA, instantáneo). Extrae lo que detecte; lo que no
 * aparezca queda vacío para que el usuario lo complete.
 */
export function extractClientInfo(text: string): ExtractedClientInfo {
  const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? "").replace(/[.,;:]+$/, "");

  let firstName = "";
  let lastName = "";
  const nameMatch = text.match(
    /\b(?:[Ss]oy|[Mm]e llamo|[Mm]i nombre es|[Ll]e saluda|[Aa]tentamente,?)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ'’-]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ'’-]+){0,3})/,
  );
  if (nameMatch) {
    const parts = nameMatch[1].trim().split(/\s+/);
    firstName = parts[0] ?? "";
    lastName = parts.slice(1).join(" ");
  }

  // Nombre de la oportunidad sugerido: tipo de viaje + destino + año.
  const lower = text.toLowerCase();
  let base = "";
  if (lower.includes("fin de curso")) base = "Viaje fin de curso";
  else if (lower.includes("viaje de estudios") || lower.includes("viaje de estudio")) base = "Viaje de estudios";
  else if (lower.includes("viaje cultural")) base = "Viaje cultural";
  else if (lower.includes("viaje escolar") || lower.includes("viaje")) base = "Viaje escolar";

  const destination = findDestination(text)?.city ?? "";
  const year = text.match(/\b(20\d{2})\b/)?.[1] ?? "";
  const opportunityName = [base, destination, year].filter(Boolean).join(" ").trim();

  return { email, firstName, lastName, opportunityName };
}

export interface RequestExtras {
  /** Presupuesto por alumno detectado (€), o null. */
  budgetPerStudent: number | null;
  /** Requisitos especiales a confirmar con el alojamiento. */
  specialRequirements: string[];
}

/**
 * Variables adicionales del mensaje útiles para decidir en el paso 3:
 * presupuesto por alumno y requisitos especiales (dietas, accesibilidad…).
 * Heurístico; no condiciona la búsqueda, solo informa al operador.
 */
export function extractRequestExtras(text: string): RequestExtras {
  const lower = stripAccents(text.toLowerCase());

  // Presupuesto por alumno: "350 € por alumno", "presupuesto de 350 €", "350€/pax".
  const perPax = lower.match(/(\d{2,4})\s*(?:€|eur(?:os)?)\s*(?:\/|por)\s*(?:alumno|persona|pax|estudiante|nino)/);
  const general = lower.match(/presupuesto[^.\n]*?(\d{2,4})\s*(?:€|eur(?:os)?)/);
  const m = perPax ?? general;
  const budgetPerStudent = m ? Number(m[1]) : null;

  const specialRequirements: string[] = [];
  const add = (re: RegExp, label: string) => {
    if (re.test(lower) && !specialRequirements.includes(label)) specialRequirements.push(label);
  };
  add(/alergi|sin gluten|sin lactosa|celiac|intoleran|vegetarian|vegan|halal|dieta/, "Alergias / dietas especiales");
  add(/movilidad reducida|accesibl|adaptad|silla de ruedas|discapacidad/, "Habitación adaptada / accesibilidad");
  add(/(habitacion|cuarto)[^.\n]*(cercan|junt|proxim)|profesor[^.\n]*(cercan|junt|proxim)/, "Habitaciones de profesores cercanas");
  add(/picnic|para llevar/, "Picnic / comida para llevar");
  add(/autobus|autocar|transporte|bus\b/, "Transporte / autocar");

  return { budgetPerStudent, specialRequirements };
}

function extractGroupType(text: string) {
  const lower = text.toLowerCase();

  if (lower.includes("colegio") || lower.includes("school")) {
    return "Grupo escolar";
  }

  if (lower.includes("universidad") || lower.includes("university")) {
    return "Grupo universitario";
  }

  return "";
}

function extractRequirements(text: string) {
  const sentences = text
    .split(/[.!?]/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    return "";
  }

  return sentences.slice(1).join(". ");
}

function buildMissingFields(normalized: NormalizedRequestDraft): MissingField[] {
  const missing: MissingField[] = [];

  const add = (field: string, label: string, reason: string, severity: "critical" | "warning") => {
    missing.push({ field, label, reason, severity });
  };

  if (!normalized.destinationText) {
    add("destinationText", "Destino", "No se detectó un destino de forma fiable.", "critical");
  }

  if (!normalized.dateFrom) {
    add("dateFrom", "Fecha inicio", "Falta la fecha de inicio del viaje.", "critical");
  }

  if (!normalized.dateTo) {
    add("dateTo", "Fecha fin", "Falta la fecha de fin del viaje.", "critical");
  }

  if (normalized.participants === null) {
    add("participants", "Participantes", "No se pudo identificar el número de participantes.", "critical");
  }

  if (normalized.teachers === null) {
    add("teachers", "Profesores", "No se pudo identificar el número de profesores o acompañantes.", "critical");
  }

  if (!normalized.ageRangeText && !normalized.averageAgeText) {
    add("ageRangeText", "Edad o rango de edad", "Hace falta la edad para filtrar actividades.", "critical");
  }

  if (!normalized.regimeRequested) {
    add("regimeRequested", "Régimen solicitado", "No se detectó el régimen solicitado.", "warning");
  }

  if (!normalized.categoryRequested) {
    add("categoryRequested", "Categoría solicitada", "No se detectó la categoría preferida.", "warning");
  }

  return missing;
}

function buildWarnings(normalized: NormalizedRequestDraft): WarningItem[] {
  const warnings: WarningItem[] = [];
  const parsedDates = normalized.dateFrom && normalized.dateTo;

  if (!normalized.language) {
    warnings.push({
      code: "language_unknown",
      message: "No se pudo identificar el idioma del mensaje con suficiente confianza."
    });
  }

  if (parsedDates) {
    const start = new Date(normalized.dateFrom);
    const end = new Date(normalized.dateTo);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      warnings.push({
        code: "date_parse_warning",
        message: "Se detectaron fechas, pero conviene revisarlas manualmente."
      });
    } else if (end <= start) {
      warnings.push({
        code: "date_order_warning",
        message: "La fecha fin no es posterior a la fecha inicio."
      });
    }
  }

  return warnings;
}

/**
 * Lee el mensaje del cliente y saca lo que se entiende, SIN exigir datos de
 * contacto. Entender la petición y saber a quién responder son dos cosas
 * distintas: el correo hace falta para enviar la propuesta, no para leer un
 * texto. El lienzo usa esta función; el asistente antiguo sigue validando el
 * alta completa con `parseTripRequest`.
 */
export const readTripMessage = (rawTripRequestText: string): ParseTripRequestResult => {
  const normalized = emptyDraft();
  const destination = findDestination(rawTripRequestText);
  const dates = extractDates(rawTripRequestText);
  const ages = extractAgeInfo(rawTripRequestText);

  normalized.language = detectLanguage(rawTripRequestText);
  normalized.destinationText = destination?.city ?? "";
  normalized.destinationCountry = destination?.country ?? "";
  normalized.dateFrom = dates.dateFrom;
  normalized.dateTo = dates.dateTo;
  normalized.participants = extractParticipants(rawTripRequestText);
  normalized.teachers = extractTeachers(rawTripRequestText);
  normalized.ageRangeText = ages.ageRangeText;
  normalized.averageAgeText = ages.averageAgeText;
  normalized.groupType = extractGroupType(rawTripRequestText);
  normalized.regimeRequested = extractBoardType(rawTripRequestText);
  normalized.categoryRequested = extractCategory(rawTripRequestText);
  normalized.requirementsText = extractRequirements(rawTripRequestText);

  const missingFields = buildMissingFields(normalized);
  const warnings = buildWarnings(normalized);

  return {
    normalized,
    missingFields,
    warnings,
    requestStatus: missingFields.some((item) => item.severity === "critical")
      ? "PARSED_WITH_GAPS"
      : "READY_FOR_SEARCH"
  };
};

export const parseTripRequest = (input: ParseTripRequestInput): ParseTripRequestResult => {
  intakeSchema.parse(input);
  return readTripMessage(input.rawTripRequestText);
};

export const validateTripRequest = (
  input: ValidateTripRequestInput
): ValidateTripRequestResult => {
  const issues: ValidateTripRequestResult["issues"] = [];
  const emailResult = z.string().email("El email no es válido.").safeParse(input.email);

  if (!emailResult.success) {
    issues.push({
      field: "email",
      label: "Email",
      message: "Introduce un email válido antes de continuar.",
      severity: "error"
    });
  }

  if (!input.clientType) {
    issues.push({
      field: "clientType",
      label: "Tipo de cliente",
      message: "Selecciona si el cliente es nuevo o existente.",
      severity: "error"
    });
  }

  if (input.clientType === "new") {
    if (!input.firstName.trim()) {
      issues.push({
        field: "firstName",
        label: "Nombre",
        message: "El nombre es obligatorio para clientes nuevos.",
        severity: "error"
      });
    }

    if (!input.lastName.trim()) {
      issues.push({
        field: "lastName",
        label: "Apellidos",
        message: "Los apellidos son obligatorios para clientes nuevos.",
        severity: "error"
      });
    }
  }

  if (!input.normalized.destinationText.trim()) {
    issues.push({
      field: "destinationText",
      label: "Destino",
      message: "El destino es obligatorio para buscar inventario.",
      severity: "error"
    });
  }

  if (!input.normalized.dateFrom.trim()) {
    issues.push({
      field: "dateFrom",
      label: "Fecha inicio",
      message: "La fecha de inicio es obligatoria.",
      severity: "error"
    });
  }

  if (!input.normalized.dateTo.trim()) {
    issues.push({
      field: "dateTo",
      label: "Fecha fin",
      message: "La fecha de fin es obligatoria.",
      severity: "error"
    });
  }

  if (input.normalized.participants === null || input.normalized.participants <= 0) {
    issues.push({
      field: "participants",
      label: "Participantes",
      message: "Indica el número de participantes.",
      severity: "error"
    });
  }

  if (input.normalized.teachers === null || input.normalized.teachers < 0) {
    issues.push({
      field: "teachers",
      label: "Profesores",
      message: "Indica el número de profesores o acompañantes.",
      severity: "error"
    });
  }

  if (!input.normalized.ageRangeText.trim() && !input.normalized.averageAgeText.trim()) {
    issues.push({
      field: "ageRangeText",
      label: "Edad o rango de edad",
      message: "Hace falta una edad o rango de edad para filtrar actividades.",
      severity: "error"
    });
  }

  if (input.normalized.dateFrom && input.normalized.dateTo) {
    const start = new Date(input.normalized.dateFrom);
    const end = new Date(input.normalized.dateTo);

    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end <= start) {
      issues.push({
        field: "dateTo",
        label: "Fechas",
        message: "La fecha fin debe ser posterior a la fecha inicio.",
        severity: "error"
      });
    }
  }

  const criticalMissingFields = issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.field);

  return {
    isValid: criticalMissingFields.length === 0,
    issues,
    criticalMissingFields
  };
};

export const upsertClientFromRequest = (input: ParseTripRequestInput): Promise<Client> => {
  return upsertClientApi({
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    clientType: input.clientType,
  });
};

export const saveNormalizedTripRequest = (
  clientId: string,
  source: ParseTripRequestInput,
  parseResult: ParseTripRequestResult
): Promise<TripRequest> => {
  return saveTripRequestApi({
    clientId,
    opportunityName: source.opportunityName ?? null,
    originalMessage: source.rawTripRequestText,
    requestStatus: parseResult.requestStatus,
    ...parseResult.normalized,
  });
};

/**
 * Oportunidades candidatas basadas en datos REALES: las solicitudes previas del
 * mismo cliente en la BD. Si no hay ninguna, se recomienda crear una nueva.
 */
export const findCandidateOpportunities = async (
  client: Client,
  request: NormalizedRequestDraft
): Promise<FindCandidateOpportunitiesResult> => {
  let priorRequests: {
    id: string;
    opportunityName: string | null;
    destinationText: string | null;
    createdAt: string;
  }[] = [];

  try {
    priorRequests = (await getClientTripRequestsApi(client.id)).requests;
  } catch {
    // Si falla la consulta, se trata como cliente sin historial (crear nueva).
  }

  if (priorRequests.length === 0) {
    return {
      recommendation: "create_new",
      opportunities: [],
      rationale: "El cliente no tiene solicitudes previas: se crea una oportunidad nueva.",
    };
  }

  const opportunities = priorRequests.slice(0, 5).map((prior) => {
    const sameDestination =
      !!prior.destinationText &&
      !!request.destinationText &&
      prior.destinationText.toLowerCase() === request.destinationText.toLowerCase();
    return {
      id: prior.id,
      name: prior.opportunityName || `Solicitud previa ${prior.destinationText ?? ""}`.trim(),
      reason: sameDestination
        ? `Solicitud previa del mismo cliente al mismo destino (${prior.destinationText}).`
        : "Solicitud previa del mismo cliente.",
      score: sameDestination ? 80 : 50,
      status: "open" as const,
    };
  });

  return {
    recommendation: "ask_user",
    opportunities,
    rationale:
      "El cliente tiene solicitudes previas. Confirma si actualizar una oportunidad existente o crear una nueva.",
  };
};
