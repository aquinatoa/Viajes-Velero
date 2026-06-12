import Anthropic from "@anthropic-ai/sdk";
import type {
  AiDocumentAnalysisResult,
  AiAnalysisMode,
  AiDetectedAccommodation,
  AiDetectedActivity,
  AiCandidateRate,
  AiCandidateSupplement,
  AiCandidatePolicy,
  AiCandidateBlackoutDate,
} from "../src/domain/documentImportTypes";

export interface AnalyzeDocumentTextInput {
  /** Texto extraído del documento (TEXT u OCR). */
  text: string;
  /** Contexto de control del SourceDocument para guiar el análisis. */
  context: {
    targetType: string;
    controlName: string;
    controlLocation?: string | null;
    controlYear?: number | null;
    controlCategory?: string | null;
  };
}

/** Error de análisis IA visible para el usuario; el endpoint lo traduce a 502. */
export class AiAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiAnalysisError";
  }
}

interface AiProviderConfig {
  provider: string;
  anthropicApiKey: string;
  openaiApiKey: string;
  model: string;
}

interface ProviderCallConfig {
  apiKey: string;
  model: string;
}

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";
const MAX_TEXT_CHARS = 30000;
const AI_MAX_OUTPUT_TOKENS = 8000;

/**
 * Lee la configuración de IA desde variables de entorno.
 * No expone secretos: solo se usan internamente para decidir el proveedor.
 */
function getAiProviderConfig(): AiProviderConfig {
  return {
    provider: (process.env.AI_PROVIDER ?? "").trim().toLowerCase(),
    anthropicApiKey: (process.env.ANTHROPIC_API_KEY ?? "").trim(),
    openaiApiKey: (process.env.AI_API_KEY ?? "").trim(),
    model: (process.env.AI_MODEL ?? "").trim(),
  };
}

/**
 * Análisis IA del texto extraído.
 *
 * - Si AI_PROVIDER=anthropic y hay ANTHROPIC_API_KEY, llama a la Messages API de
 *   Anthropic (Claude) mediante el SDK oficial. Modelo por defecto:
 *   claude-sonnet-4-5 (configurable con AI_MODEL).
 * - Si AI_PROVIDER=openai y hay AI_API_KEY, llama a la Responses API de OpenAI.
 * - En cualquier otro caso (sin proveedor o sin clave) usa el modo mock
 *   controlado, que no inventa tarifas ni políticas.
 *
 * Nunca publica ni guarda staging: solo devuelve candidatos preliminares.
 */
export async function analyzeDocumentText(
  input: AnalyzeDocumentTextInput,
): Promise<AiDocumentAnalysisResult> {
  const config = getAiProviderConfig();

  if (config.provider === "anthropic") {
    if (!config.anthropicApiKey) {
      return buildMockAnalysis(input, [
        "Falta ANTHROPIC_API_KEY: no se pudo usar Anthropic; se usó el modo mock controlado.",
      ]);
    }
    return analyzeWithAnthropic(input, {
      apiKey: config.anthropicApiKey,
      model: config.model,
    });
  }

  if (config.provider === "openai") {
    if (!config.openaiApiKey) {
      return buildMockAnalysis(input, [
        "Falta AI_API_KEY: no se pudo usar OpenAI; se usó el modo mock controlado.",
      ]);
    }
    return analyzeWithOpenAi(input, {
      apiKey: config.openaiApiKey,
      model: config.model,
    });
  }

  return buildMockAnalysis(input, [
    "No hay un proveedor IA configurado (AI_PROVIDER); se usó el modo mock controlado.",
  ]);
}

// ----------------------------------------------------------------------------
// Proveedor real: Anthropic (Messages API, SDK oficial)
// ----------------------------------------------------------------------------

async function analyzeWithAnthropic(
  input: AnalyzeDocumentTextInput,
  config: ProviderCallConfig,
): Promise<AiDocumentAnalysisResult> {
  const extraWarnings: string[] = [];

  let text = input.text;
  if (text.length > MAX_TEXT_CHARS) {
    text = text.slice(0, MAX_TEXT_CHARS);
    extraWarnings.push(
      `El texto se truncó a ${MAX_TEXT_CHARS} caracteres para el análisis IA; puede faltar contenido del final.`,
    );
  }

  const client = new Anthropic({ apiKey: config.apiKey });

  let message;
  try {
    message = await client.messages.create({
      model: config.model || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: AI_MAX_OUTPUT_TOKENS,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: buildUserPrompt(input, text) }],
    });
  } catch (error) {
    throw mapAnthropicError(error);
  }

  const blocks = (message?.content ?? []) as Array<{ type?: string; text?: string }>;
  const outputText = blocks
    .map((block) => (block.type === "text" ? block.text ?? "" : ""))
    .join("");

  if (!outputText.trim()) {
    throw new AiAnalysisError("La respuesta del proveedor IA no contenía texto analizable.");
  }

  const parsed = parseModelJson(outputText);
  return normalizeAnalysis(parsed, "ai", outputText, extraWarnings);
}

function mapAnthropicError(error: unknown): AiAnalysisError {
  if (error instanceof Anthropic.AuthenticationError) {
    return new AiAnalysisError("La clave de API de Anthropic no es válida o no tiene permisos.");
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new AiAnalysisError(
      "La clave de API de Anthropic no tiene permiso para el modelo solicitado.",
    );
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new AiAnalysisError(
      "El modelo indicado en AI_MODEL no existe o no está disponible en Anthropic.",
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiAnalysisError(
      "Se alcanzó el límite de uso o de frecuencia del proveedor IA. Inténtalo más tarde.",
    );
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AiAnalysisError(
      "La solicitud al proveedor IA no es válida (revisa el modelo o el tamaño del documento).",
    );
  }
  if (error instanceof Anthropic.APIError) {
    return new AiAnalysisError(
      `El proveedor IA devolvió un error (${error.status ?? "desconocido"}).`,
    );
  }
  return new AiAnalysisError(
    "No se pudo conectar con el proveedor IA (Anthropic). Revisa la conexión.",
  );
}

/**
 * Parsea el JSON devuelto por el modelo de forma tolerante: intenta JSON.parse
 * directo y, si falla, extrae el primer objeto { ... } del texto.
 */
function parseModelJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        // continúa al error final
      }
    }
    throw new AiAnalysisError("El proveedor IA devolvió un JSON inválido.");
  }
}

// ----------------------------------------------------------------------------
// Proveedor real: OpenAI (Responses API)
// ----------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return [
    "Eres un analista experto en extracción de datos de documentos de tarifas turísticas",
    "(alojamientos y actividades) para un operador de viajes de grupos.",
    "Extrae ÚNICAMENTE datos presentes en el texto. No inventes nada.",
    "Cuando un dato no aparezca en el texto, usa null (o un array vacío).",
    "Responde solo con un objeto JSON válido, sin texto adicional ni explicaciones.",
  ].join(" ");
}

function buildUserPrompt(input: AnalyzeDocumentTextInput, text: string): string {
  const { context } = input;

  return [
    "Analiza el siguiente documento de tarifas y devuelve un objeto JSON con esta estructura exacta:",
    "",
    "{",
    '  "documentSummary": string,',
    '  "detectedAccommodation": { "accommodationName": string|null, "providerName": string|null, "locality": string|null, "province": string|null, "country": string|null, "categoryType": string|null, "accommodationType": string|null } | null,',
    '  "detectedActivities": [ { "activityName": string, "supplierName": string|null, "locationMain": string|null, "activityType": string|null, "durationText": string|null, "descriptionText": string|null } ],',
    '  "candidateRates": [ { "seasonName": string|null, "year": number|null, "dateFrom": string|null, "dateTo": string|null, "boardType": string|null, "unitName": string|null, "rateUnit": string|null, "occupancyLabel": string|null, "minNights": number|null, "currency": string|null, "pvpAmount": number|null, "netAmount": number|null, "costAmount": number|null, "rawText": string|null } ],',
    '  "candidateSupplements": [ { "adjustmentType": string|null, "concept": string, "amountType": string|null, "amount": number|null, "appliesPer": string|null, "conditionText": string|null, "rawText": string|null } ],',
    '  "candidatePolicies": [ { "policyType": string|null, "policyText": string, "rawText": string|null } ],',
    '  "candidateBlackoutDates": [ { "dateFrom": string|null, "dateTo": string|null, "availabilityStatus": string|null, "reason": string|null, "rawText": string|null } ],',
    '  "warnings": [ string ],',
    '  "confidence": number',
    "}",
    "",
    "Reglas de extracción:",
    "- No inventes datos. Usa null cuando algo no aparezca explícitamente en el texto.",
    "- Conserva en 'rawText' el fragmento literal del texto de origen de cada candidato cuando sea posible.",
    "- Detecta regímenes y normalízalos en 'boardType': MP (media pensión), PC (pensión completa), AD (alojamiento y desayuno), SA (solo alojamiento) si aparecen.",
    "- Detecta periodos de fechas; usa formato ISO YYYY-MM-DD en dateFrom/dateTo cuando puedas inferirlo.",
    "- Detecta precios netos y PVP: 'pvpAmount' precio de venta, 'netAmount' precio neto, 'costAmount' coste si aparece.",
    "- 'currency' debe ser el código de moneda (p. ej. EUR) si se deduce; si no, null.",
    "- Suplementos/ajustes: para porcentajes usa amountType='PERCENT' y amount con el valor; para importes fijos amountType='FIXED'. Incluye condiciones en conditionText.",
    "- Detecta condiciones y conviértelas en candidatePolicies: IVA incluido, impuesto turístico, depósitos, rooming list, gratuidades, cancelaciones. Usa policyType como categoría corta en mayúsculas (p. ej. TAX, DEPOSIT, ROOMING_LIST, GRATUITY, CANCELLATION) y policyText con el texto.",
    "- Suplementos detectables del texto van en candidateSupplements.",
    "- Fechas bloqueadas o de disponibilidad especial van en candidateBlackoutDates.",
    "- 'confidence' es un número entre 0 y 1 que refleja tu seguridad global.",
    "",
    "Contexto de control (referencia, no es el documento):",
    `- Tipo de registro: ${context.targetType}`,
    `- Nombre de control: ${context.controlName}`,
    `- Ubicación: ${context.controlLocation ?? "(desconocida)"}`,
    `- Año/temporada: ${context.controlYear ?? "(desconocido)"}`,
    `- Categoría: ${context.controlCategory ?? "(desconocida)"}`,
    "",
    "Texto del documento:",
    '"""',
    text,
    '"""',
  ].join("\n");
}

async function analyzeWithOpenAi(
  input: AnalyzeDocumentTextInput,
  config: ProviderCallConfig,
): Promise<AiDocumentAnalysisResult> {
  const extraWarnings: string[] = [];

  let text = input.text;
  if (text.length > MAX_TEXT_CHARS) {
    text = text.slice(0, MAX_TEXT_CHARS);
    extraWarnings.push(
      `El texto se truncó a ${MAX_TEXT_CHARS} caracteres para el análisis IA; puede faltar contenido del final.`,
    );
  }

  const body = {
    model: config.model || DEFAULT_OPENAI_MODEL,
    input: [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: buildUserPrompt(input, text) },
    ],
    text: { format: { type: "json_object" } },
  };

  let response: Response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AiAnalysisError("No se pudo conectar con el proveedor IA (OpenAI). Revisa la conexión.");
  }

  if (!response.ok) {
    let detail = "";
    try {
      const errorJson = (await response.json()) as { error?: { message?: string } };
      detail = errorJson?.error?.message ?? "";
    } catch {
      // sin cuerpo de error legible
    }
    throw new AiAnalysisError(mapOpenAiError(response.status, detail));
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new AiAnalysisError("El proveedor IA devolvió una respuesta no legible.");
  }

  const outputText = extractOutputText(data);
  if (!outputText) {
    throw new AiAnalysisError("La respuesta del proveedor IA no contenía texto analizable.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new AiAnalysisError("El proveedor IA devolvió un JSON inválido.");
  }

  return normalizeAnalysis(parsed, "ai", outputText, extraWarnings);
}

function mapOpenAiError(status: number, detail: string): string {
  if (status === 401) {
    return "La clave de API de OpenAI no es válida o no tiene permisos.";
  }
  if (status === 429) {
    return "Se alcanzó el límite de uso o de frecuencia del proveedor IA. Inténtalo más tarde.";
  }
  if (status === 400 && /context|length|token|too\s*long/i.test(detail)) {
    return "El documento es demasiado largo para el modelo (límite de contexto).";
  }
  if (status >= 500) {
    return "El proveedor IA tuvo un error temporal. Inténtalo de nuevo.";
  }
  return "El proveedor IA rechazó la solicitud de análisis.";
}

function extractOutputText(data: unknown): string {
  const root = data as { output_text?: unknown; output?: unknown };

  if (typeof root?.output_text === "string" && root.output_text.length > 0) {
    return root.output_text;
  }

  const output = Array.isArray(root?.output) ? root.output : [];
  const chunks: string[] = [];

  for (const item of output) {
    const content = Array.isArray((item as { content?: unknown })?.content)
      ? (item as { content: unknown[] }).content
      : [];
    for (const part of content) {
      const typed = part as { type?: string; text?: unknown };
      if (
        (typed?.type === "output_text" || typed?.type === "text") &&
        typeof typed?.text === "string"
      ) {
        chunks.push(typed.text);
      }
    }
  }

  return chunks.join("");
}

// ----------------------------------------------------------------------------
// Normalización defensiva de la salida del modelo al contrato.
// ----------------------------------------------------------------------------

function toStr(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function toNum(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const normalized = value.replace(/[^0-9.,-]/g, "").replace(",", ".");
    if (normalized === "") {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeAnalysis(
  parsed: unknown,
  mode: AiAnalysisMode,
  rawModelOutput: string,
  extraWarnings: string[],
): AiDocumentAnalysisResult {
  const root = (parsed ?? {}) as Record<string, unknown>;
  const warnings: string[] = [...extraWarnings];

  for (const warning of asArray(root.warnings)) {
    const text = toStr(warning);
    if (text) {
      warnings.push(text);
    }
  }

  const detectedAccommodation = normalizeAccommodation(root.detectedAccommodation);
  const detectedActivities = asArray(root.detectedActivities)
    .map(normalizeActivity)
    .filter((activity): activity is AiDetectedActivity => activity !== null);

  const candidateRates = asArray(root.candidateRates).map(normalizeRate);
  const candidateSupplements = asArray(root.candidateSupplements)
    .map(normalizeSupplement)
    .filter((supplement): supplement is AiCandidateSupplement => supplement !== null);
  const candidatePolicies = asArray(root.candidatePolicies)
    .map(normalizePolicy)
    .filter((policy): policy is AiCandidatePolicy => policy !== null);
  const candidateBlackoutDates = asArray(root.candidateBlackoutDates).map(normalizeBlackout);

  const ratesWithoutPrice = candidateRates.filter(
    (rate) => rate.pvpAmount == null && rate.netAmount == null,
  ).length;
  if (ratesWithoutPrice > 0) {
    warnings.push(
      `${ratesWithoutPrice} tarifa(s) candidata(s) sin importe (PVP/neto); revísalas antes de aprobarlas.`,
    );
  }

  const ratesWithoutCurrency = candidateRates.filter(
    (rate) => rate.pvpAmount != null && !rate.currency,
  ).length;
  if (ratesWithoutCurrency > 0) {
    warnings.push(
      `${ratesWithoutCurrency} tarifa(s) candidata(s) con importe pero sin moneda; revísalas antes de aprobarlas.`,
    );
  }

  const confidenceValue = toNum(root.confidence);
  const confidence =
    confidenceValue == null ? 0.5 : Math.min(1, Math.max(0, confidenceValue));

  return {
    mode,
    documentSummary: toStr(root.documentSummary) ?? "",
    detectedAccommodation,
    detectedActivities,
    candidateRates,
    candidateSupplements,
    candidatePolicies,
    candidateBlackoutDates,
    warnings,
    confidence,
    rawModelOutput,
  };
}

function normalizeAccommodation(value: unknown): AiDetectedAccommodation | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;

  return {
    accommodationName: toStr(record.accommodationName),
    providerName: toStr(record.providerName),
    locality: toStr(record.locality),
    province: toStr(record.province),
    country: toStr(record.country),
    categoryType: toStr(record.categoryType),
    accommodationType: toStr(record.accommodationType),
  };
}

function normalizeActivity(value: unknown): AiDetectedActivity | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const activityName = toStr(record.activityName);
  if (!activityName) {
    return null;
  }

  return {
    activityName,
    supplierName: toStr(record.supplierName),
    locationMain: toStr(record.locationMain),
    activityType: toStr(record.activityType),
    durationText: toStr(record.durationText),
    descriptionText: toStr(record.descriptionText),
  };
}

function normalizeRate(value: unknown): AiCandidateRate {
  const record = (value ?? {}) as Record<string, unknown>;

  return {
    seasonName: toStr(record.seasonName),
    year: toNum(record.year),
    dateFrom: toStr(record.dateFrom),
    dateTo: toStr(record.dateTo),
    boardType: toStr(record.boardType),
    unitName: toStr(record.unitName),
    rateUnit: toStr(record.rateUnit),
    occupancyLabel: toStr(record.occupancyLabel),
    minNights: toNum(record.minNights),
    currency: toStr(record.currency),
    pvpAmount: toNum(record.pvpAmount),
    netAmount: toNum(record.netAmount),
    costAmount: toNum(record.costAmount),
    rawText: toStr(record.rawText),
  };
}

function normalizeSupplement(value: unknown): AiCandidateSupplement | null {
  const record = (value ?? {}) as Record<string, unknown>;
  const concept = toStr(record.concept);
  if (!concept) {
    return null;
  }

  return {
    adjustmentType: toStr(record.adjustmentType),
    concept,
    amountType: toStr(record.amountType),
    amount: toNum(record.amount),
    appliesPer: toStr(record.appliesPer),
    conditionText: toStr(record.conditionText),
    rawText: toStr(record.rawText),
  };
}

function normalizePolicy(value: unknown): AiCandidatePolicy | null {
  const record = (value ?? {}) as Record<string, unknown>;
  const policyText = toStr(record.policyText) ?? toStr(record.description);
  if (!policyText) {
    return null;
  }

  return {
    policyType: toStr(record.policyType),
    policyText,
    rawText: toStr(record.rawText),
  };
}

function normalizeBlackout(value: unknown): AiCandidateBlackoutDate {
  const record = (value ?? {}) as Record<string, unknown>;

  return {
    dateFrom: toStr(record.dateFrom) ?? toStr(record.startDate),
    dateTo: toStr(record.dateTo) ?? toStr(record.endDate),
    availabilityStatus: toStr(record.availabilityStatus),
    reason: toStr(record.reason) ?? toStr(record.description),
    rawText: toStr(record.rawText),
  };
}

// ----------------------------------------------------------------------------
// Modo mock controlado (sin proveedor o sin clave)
// ----------------------------------------------------------------------------

function buildMockAnalysis(
  input: AnalyzeDocumentTextInput,
  baseWarnings: string[],
): AiDocumentAnalysisResult {
  const { context } = input;
  const normalizedText = input.text.replace(/\s+/g, " ").trim();
  const preview = normalizedText.slice(0, 280);
  const previewSuffix = normalizedText.length > 280 ? "…" : "";

  const wantsAccommodation =
    context.targetType === "ACCOMMODATION" ||
    context.targetType === "MIXED" ||
    context.targetType === "UNKNOWN";

  const warnings: string[] = [
    "Análisis en modo mock: no se han extraído tarifas, suplementos, políticas ni fechas especiales automáticamente.",
    "Los datos mostrados son candidatos preliminares y requieren revisión humana antes de publicarse.",
    ...baseWarnings,
  ];

  const detectedAccommodation: AiDetectedAccommodation | null = wantsAccommodation
    ? {
        accommodationName: context.controlName,
        providerName: null,
        locality: context.controlLocation ?? null,
        province: null,
        country: null,
        categoryType: context.controlCategory ?? null,
        accommodationType: null,
      }
    : null;

  const locationFragment = context.controlLocation ? ` (${context.controlLocation})` : "";
  const yearFragment = context.controlYear ? `, temporada ${context.controlYear}` : "";

  const documentSummary =
    `Documento "${context.controlName}"${locationFragment}${yearFragment}. ` +
    `Se analizaron ${normalizedText.length} caracteres de texto en modo mock. ` +
    `Vista previa: ${preview}${previewSuffix}`;

  return {
    mode: "mock",
    documentSummary,
    detectedAccommodation,
    detectedActivities: [],
    candidateRates: [],
    candidateSupplements: [],
    candidatePolicies: [],
    candidateBlackoutDates: [],
    warnings,
    confidence: 0.1,
    rawModelOutput: null,
  };
}
