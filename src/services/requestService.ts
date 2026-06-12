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
import { findClientByEmail, saveClient, saveTripRequest } from "../data/mockDb";
import { createId } from "./utils";

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
  { city: "Barcelona", country: "España", aliases: ["barcelona"] }
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
  return destinationCatalog.find((candidate) =>
    candidate.aliases.some((alias) => lower.includes(alias))
  );
}

function extractDates(text: string) {
  const isoDates = [...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1]);

  if (isoDates.length >= 2) {
    return {
      dateFrom: isoDates[0],
      dateTo: isoDates[1]
    };
  }

  return {
    dateFrom: "",
    dateTo: ""
  };
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
  const range = lower.match(/(\d{1,2})\s*[-a]\s*(\d{1,2})\s*años/) ?? lower.match(/ages?\s+(\d{1,2})\s*[-to]+\s*(\d{1,2})/);
  const average = lower.match(/media\s+de\s+(\d{1,2})\s*años/) ?? lower.match(/average age\s+(\d{1,2})/);

  return {
    ageRangeText: range ? `${range[1]}-${range[2]}` : "",
    averageAgeText: average ? `${average[1]} años` : ""
  };
}

function extractBoardType(text: string) {
  const lower = text.toLowerCase();
  return boardAliases.find((alias) => lower.includes(alias)) ?? "";
}

function extractCategory(text: string) {
  const lower = text.toLowerCase();
  return categoryAliases.find((alias) => lower.includes(alias.toLowerCase())) ?? "";
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

function buildWarnings(input: ParseTripRequestInput, normalized: NormalizedRequestDraft): WarningItem[] {
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

  if (input.clientType === "existing" && !findClientByEmail(input.email)) {
    warnings.push({
      code: "existing_client_not_found",
      message: "El cliente se marcó como existente, pero no hay coincidencia previa por email."
    });
  }

  return warnings;
}

export const parseTripRequest = (input: ParseTripRequestInput): ParseTripRequestResult => {
  intakeSchema.parse(input);

  const normalized = emptyDraft();
  const destination = findDestination(input.rawTripRequestText);
  const dates = extractDates(input.rawTripRequestText);
  const ages = extractAgeInfo(input.rawTripRequestText);

  normalized.language = detectLanguage(input.rawTripRequestText);
  normalized.destinationText = destination?.city ?? "";
  normalized.destinationCountry = destination?.country ?? "";
  normalized.dateFrom = dates.dateFrom;
  normalized.dateTo = dates.dateTo;
  normalized.participants = extractParticipants(input.rawTripRequestText);
  normalized.teachers = extractTeachers(input.rawTripRequestText);
  normalized.ageRangeText = ages.ageRangeText;
  normalized.averageAgeText = ages.averageAgeText;
  normalized.groupType = extractGroupType(input.rawTripRequestText);
  normalized.regimeRequested = extractBoardType(input.rawTripRequestText);
  normalized.categoryRequested = extractCategory(input.rawTripRequestText);
  normalized.requirementsText = extractRequirements(input.rawTripRequestText);

  const missingFields = buildMissingFields(normalized);
  const warnings = buildWarnings(input, normalized);

  return {
    normalized,
    missingFields,
    warnings,
    requestStatus: missingFields.some((item) => item.severity === "critical")
      ? "PARSED_WITH_GAPS"
      : "READY_FOR_SEARCH"
  };
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

  if (input.clientType === "existing" && !findClientByEmail(input.email)) {
    issues.push({
      field: "email",
      label: "Cliente existente",
      message: "No se encontró un cliente existente con ese email. Revisa el dato o márcalo como nuevo.",
      severity: "error"
    });
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

export const upsertClientFromRequest = (input: ParseTripRequestInput): Client => {
  const existing = findClientByEmail(input.email);

  if (existing) {
    return saveClient({
      ...existing,
      firstName: input.firstName || existing.firstName,
      lastName: input.lastName || existing.lastName,
      fullName: `${input.firstName || existing.firstName} ${input.lastName || existing.lastName}`,
      isReturningCustomer: true
    });
  }

  return saveClient({
    id: createId("client"),
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    fullName: `${input.firstName} ${input.lastName}`.trim(),
    isReturningCustomer: input.clientType === "existing"
  });
};

export const saveNormalizedTripRequest = (
  clientId: string,
  source: ParseTripRequestInput,
  parseResult: ParseTripRequestResult
): TripRequest => {
  return saveTripRequest({
    id: createId("request"),
    clientId,
    opportunityName: source.opportunityName,
    originalMessage: source.rawTripRequestText,
    requestStatus: parseResult.requestStatus,
    missingFields: parseResult.missingFields,
    warnings: parseResult.warnings,
    ...parseResult.normalized
  });
};

export const findCandidateOpportunities = (
  client: Client,
  request: NormalizedRequestDraft
): FindCandidateOpportunitiesResult => {
  const opportunities = [];

  if (client.isReturningCustomer) {
    opportunities.push(
      {
        id: "opp_open_2026_valencia",
        name: `Grupo escolar ${request.destinationText || "pendiente"} 2026`,
        reason: "Mismo contacto y destino similar en una oportunidad abierta reciente.",
        score: 92,
        status: "open" as const
      },
      {
        id: "opp_won_2025_spring",
        name: "Viaje escolar primavera 2025",
        reason: "Referencia útil para comparar, pero ya está cerrada como ganada.",
        score: 61,
        status: "won" as const
      }
    );
  }

  if (!client.isReturningCustomer && request.destinationText) {
    opportunities.push({
      id: "opp_review_destination_only",
      name: `Nueva oportunidad ${request.destinationText}`,
      reason: "Solo hay coincidencia por destino; no hay suficiente contexto para actualizar algo existente.",
      score: 34,
      status: "open" as const
    });
  }

  if (client.isReturningCustomer && opportunities[0]?.status === "open") {
    return {
      recommendation: "update_existing",
      opportunities,
      rationale: "Existe una oportunidad abierta razonablemente compatible con este contacto."
    };
  }

  if (opportunities.length > 0) {
    return {
      recommendation: "ask_user",
      opportunities,
      rationale: "Hay coincidencias parciales, pero conviene que operaciones confirme si se actualiza o se crea una nueva."
    };
  }

  return {
    recommendation: "create_new",
    opportunities: [],
    rationale: "No se encontraron oportunidades candidatas suficientemente fiables."
  };
};
