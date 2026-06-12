import type {
  AiDocumentAnalysisResult,
  AiDetectedAccommodation,
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

interface AiProviderConfig {
  provider: string;
  apiKey: string;
  model: string;
  configured: boolean;
}

/**
 * Lee la configuración de IA desde variables de entorno.
 * No expone secretos: solo informa de si hay configuración suficiente.
 */
function getAiProviderConfig(): AiProviderConfig {
  const provider = (process.env.AI_PROVIDER ?? "").trim();
  const apiKey = (process.env.AI_API_KEY ?? "").trim();
  const model = (process.env.AI_MODEL ?? "").trim();

  return {
    provider,
    apiKey,
    model,
    configured: provider.length > 0 && apiKey.length > 0,
  };
}

/**
 * Análisis IA del texto extraído.
 *
 * En esta fase NO se llama a ningún proveedor real: aunque existan variables
 * AI_*, la integración con el proveedor todavía no está implementada, por lo
 * que siempre se devuelve un resultado en modo mock controlado. El modo mock
 * no inventa tarifas ni políticas; solo deriva un resumen y un candidato de
 * alojamiento a partir del contexto de control, para que la revisión humana
 * tenga un punto de partida seguro.
 */
export async function analyzeDocumentText(
  input: AnalyzeDocumentTextInput,
): Promise<AiDocumentAnalysisResult> {
  const config = getAiProviderConfig();
  return buildMockAnalysis(input, config);
}

function buildMockAnalysis(
  input: AnalyzeDocumentTextInput,
  config: AiProviderConfig,
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
  ];

  if (config.configured) {
    warnings.push(
      "Se detectó configuración AI_*, pero la integración con el proveedor real aún no está implementada; se usó el modo mock.",
    );
  } else {
    warnings.push(
      "No hay configuración AI_PROVIDER/AI_API_KEY; se usó el modo mock controlado.",
    );
  }

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
