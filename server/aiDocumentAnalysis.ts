import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import type {
  AiDocumentAnalysisResult,
  AiAnalysisMode,
  AiDetectedAccommodation,
  AiDetectedActivity,
  AiCandidateRate,
  AiCandidateActivityRate,
  AiCandidateSupplement,
  AiCandidatePolicy,
  AiCandidateBlackoutDate,
} from "../src/domain/documentImportTypes";

export interface AnalyzeDocumentTextInput {
  /** Texto extraído del documento (TEXT u OCR). */
  text: string;
  /**
   * Ruta del PDF original, cuando la haya. Se le manda al modelo tal cual.
   *
   * El porqué: la capa de texto de un PDF se lee en el orden interno del
   * fichero, no en el orden en que se ve. En una tabla eso destruye la
   * información — en la tarifa de grupos de PortAventura (26/08/2026) los
   * precios salían intercalados con los días del calendario, y de los 386
   * importes de la página el modelo colocó 128, la mayoría bajo el producto
   * equivocado. Viendo el PDF sabe qué precio está en qué fila y en qué
   * columna. El texto se sigue enviando como apoyo, no como única fuente.
   */
  attachmentPath?: string | null;
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
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

/**
 * Techo de salida de cada modelo, en tokens.
 *
 * No es una preferencia: pedir más de lo que el modelo admite es un error 400 y
 * el documento no se lee. Producción arrancó con `AI_MODEL=claude-sonnet-4-5`,
 * que admite 64.000; los modelos actuales admiten 128.000. Con esta tabla se
 * puede cambiar el modelo por el `.env` sin tocar código y sin romper nada: lo
 * que no esté aquí usa el techo conservador.
 */
const MODEL_OUTPUT_CEILINGS: Record<string, number> = {
  "claude-opus-5": 128000,
  "claude-fable-5": 128000,
  "claude-sonnet-5": 128000,
  "claude-opus-4-8": 128000,
  "claude-opus-4-7": 128000,
  "claude-opus-4-6": 128000,
  "claude-sonnet-4-6": 128000,
  "claude-sonnet-4-5": 64000,
  "claude-haiku-4-5": 64000,
};
const CONSERVATIVE_OUTPUT_CEILING = 64000;

function outputCeilingFor(model: string): number {
  return MODEL_OUTPUT_CEILINGS[model] ?? CONSERVATIVE_OUTPUT_CEILING;
}
/**
 * Cuánto texto del documento se le manda al modelo.
 *
 * Los 30.000 de antes eran para la capa de texto de un PDF. Una hoja de cálculo
 * es otra cosa: el maestro de hoteles de Oravia son 646 filas y 731.000
 * caracteres, y con el techo viejo se habría leído el 4% de la temporada sin
 * más aviso que una nota al pie. El modelo tiene 1M de contexto; el límite está
 * para que un fichero absurdo no reviente la petición, no para recortar trabajo.
 */
const MAX_TEXT_CHARS = 900000;
/**
 * Techo del fichero que se adjunta (PDF o imagen). La API admite 32 MB por petición contando el
 * base64, que infla el fichero un tercio; con 20 MB de PDF quedan ~27 MB y
 * sobra sitio para el prompt. Un documento de tarifas real pesa cientos de KB
 * (el de PortAventura, 253 KB), así que este límite no lo toca nadie: está
 * para que un PDF absurdo degrade a solo texto en vez de reventar la petición.
 */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
/**
 * Techo de salida por lectura: el máximo que admita el modelo configurado, no
 * una cifra elegida. Un documento de tarifas real no cabía en los 16.000 de
 * antes y la respuesta se cortaba a media frase — el JSON quedaba inválido y el
 * documento no se podía leer en absoluto. Con la tarifa de grupos de
 * PortAventura (386 importes en una página) volvió a pasar con 64.000. A esta
 * altura hay que ir en streaming: una petición normal se cae por timeout antes
 * de terminar.
 *
 * Aun así el techo no es la solución al volumen: para eso está la lectura por
 * bloques (fase 2 de `analyzeWithAnthropic`), que parte el documento en varias
 * pequeñas. Esto es solo el margen de cada una.
 */
function maxOutputTokensFor(model: string): number {
  return outputCeilingFor(model);
}

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
 *   el de DEFAULT_ANTHROPIC_MODEL (configurable con AI_MODEL).
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

/** Lo que se le adjunta al modelo: el fichero en base64 y de qué tipo es. */
interface AdjuntoParaModelo {
  base64: string | null;
  /** Tipo MIME, para decidir si va como documento (PDF) o como imagen. */
  mediaType: string | null;
  warning: string | null;
}

const MEDIA_POR_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** Un producto del documento: un alojamiento o una actividad con tabla propia. */
interface ProductoDelDocumento {
  kind: "ACCOMMODATION" | "ACTIVITY";
  name: string;
  /** Cuántas tarifas dice el modelo que tiene. Sirve para detectar si falta algo. */
  expectedRateCount: number | null;
  /**
   * En qué filas de la hoja de cálculo está este producto, cuando el documento
   * es un Excel. Permite mandarle al modelo solo su trozo en vez de las 646
   * filas enteras del maestro de hoteles: menos ruido y muchísimo menos gasto.
   */
  sourceRowFrom: number | null;
  sourceRowTo: number | null;
}

/** Lo que devuelve una llamada al modelo, ya parseado y con su consumo. */
interface RespuestaModelo {
  parsed: unknown;
  rawOutput: string;
  inputTokens: number;
  outputTokens: number;
  truncated: boolean;
}

/** Cuántas lecturas de producto van a la vez. */
const PRODUCT_CONCURRENCY = 4;

/**
 * Lee el fichero original y lo prepara para adjuntarlo a la petición.
 *
 * Solo tiene sentido con lo que el modelo puede MIRAR: PDF e imágenes. Una hoja
 * de cálculo no se adjunta, porque ya se convierte a texto tabulado y ese texto
 * es mejor fuente que una captura de la hoja.
 *
 * Nunca lanza: si el fichero no está, no es de un tipo que se pueda mirar o pesa
 * demasiado, devuelve un aviso y el análisis sigue con el texto extraído. Leer
 * peor es malo; no leer es peor.
 */
async function readAttachmentForModel(
  filePath: string | null | undefined,
): Promise<AdjuntoParaModelo> {
  if (!filePath) {
    return { base64: null, mediaType: null, warning: null };
  }

  const extension = (filePath.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
  const mediaType = MEDIA_POR_EXTENSION[extension];
  if (!mediaType) {
    // Hoja de cálculo, CSV, texto: no se adjuntan, y no es un problema.
    return { base64: null, mediaType: null, warning: null };
  }

  try {
    const buffer = await fs.readFile(filePath);

    if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      return {
        base64: null,
        mediaType: null,
        warning:
          `El archivo pesa ${Math.round(buffer.byteLength / 1024 / 1024)} MB y no se le pudo enviar al modelo ` +
          "(máximo 20 MB). Se analizó solo el texto extraído, que en documentos con tablas pierde la " +
          "correspondencia entre filas y columnas. Revisa las tarifas con especial cuidado.",
      };
    }

    return { base64: buffer.toString("base64"), mediaType, warning: null };
  } catch {
    return {
      base64: null,
      mediaType: null,
      warning:
        "No se pudo leer el archivo original para enviárselo al modelo. Se analizó solo el texto extraído; " +
        "si el documento trae tablas, revisa las tarifas con especial cuidado.",
    };
  }
}

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
  const model = config.model || DEFAULT_ANTHROPIC_MODEL;

  // El PDF, cuando lo hay, va delante del texto: es la fuente buena.
  const adjunto = await readAttachmentForModel(input.attachmentPath);
  if (adjunto.warning) {
    extraWarnings.push(adjunto.warning);
  }
  const hasPdf = Boolean(adjunto.base64);

  const uso = { inputTokens: 0, outputTokens: 0 };
  const acumular = (r: RespuestaModelo) => {
    uso.inputTokens += r.inputTokens;
    uso.outputTokens += r.outputTokens;
  };

  // ── Fase 1: el índice del documento ──────────────────────────────────────
  const indice = await callAnthropic(client, model, {
    adjunto,
    system: buildSystemPrompt(hasPdf),
    prompt: buildInventoryPrompt(input, text, hasPdf),
  });
  acumular(indice);

  const productos = readProductIndex(indice.parsed);

  // Un solo producto (o ninguno reconocible) no se gana nada troceándolo: se
  // lee entero de una vez, que además sale más barato.
  if (productos.length <= 1) {
    const completo = await callAnthropic(client, model, {
      adjunto,
      system: buildSystemPrompt(hasPdf),
      prompt: buildUserPrompt(input, text, hasPdf),
    });
    acumular(completo);
    if (completo.truncated) {
      extraWarnings.push(
        "La respuesta de la IA alcanzó el límite de longitud; algunos candidatos pueden faltar.",
      );
    }
    const unico = normalizeAnalysis(completo.parsed, "ai", completo.rawOutput, extraWarnings);
    unico.usage = { ...uso, model };
    return unico;
  }

  // ── Fase 2: una lectura por producto ─────────────────────────────────────
  const base = normalizeAnalysis(indice.parsed, "ai", indice.rawOutput, extraWarnings);

  const porProducto = await mapWithConcurrency(productos, PRODUCT_CONCURRENCY, async (producto) => {
    const respuesta = await callAnthropic(client, model, {
      adjunto,
      system: buildSystemPrompt(hasPdf),
      prompt: buildProductPrompt(
        input,
        recortarTextoAlProducto(text, producto),
        hasPdf,
        producto,
        productos,
      ),
    });
    return { producto, respuesta };
  });

  for (const { producto, respuesta } of porProducto) {
    acumular(respuesta);
    const trozo = normalizeAnalysis(respuesta.parsed, "ai", respuesta.rawOutput, []);

    base.candidateRates.push(...trozo.candidateRates);
    base.candidateActivityRates.push(...trozo.candidateActivityRates);
    base.candidateSupplements.push(...trozo.candidateSupplements);
    base.candidateBlackoutDates.push(...trozo.candidateBlackoutDates);
    for (const aviso of trozo.warnings) {
      base.warnings.push(`${producto.name}: ${aviso}`);
    }

    if (respuesta.truncated) {
      base.warnings.push(
        `${producto.name}: la respuesta se cortó por longitud, pueden faltar tarifas de este producto.`,
      );
    }

    // Contraste con lo que el propio modelo dijo que había en la fase 1. Va en
    // los dos sentidos: que falten tarifas significa media tabla sin leer, y que
    // sobren, que se ha traído filas de otro producto. El 26/08/2026 «1 día
    // Caribe Aquatic Park» volvió con 32 tarifas en vez de 27, y las 32 eran las
    // de Ferrari Land. Mirando solo si faltaban, aquello pasaba desapercibido.
    const obtenidas = trozo.candidateRates.length + trozo.candidateActivityRates.length;
    if (producto.expectedRateCount !== null && obtenidas !== producto.expectedRateCount) {
      base.warnings.push(
        `${producto.name}: se esperaban ${producto.expectedRateCount} tarifas y se extrajeron ${obtenidas}. Revisa este producto contra el documento.`,
      );
    }
  }

  base.warnings.push(...avisosDeProductosDuplicados(base));
  base.warnings.push(...avisosDePreciosEnConflicto(base));
  base.usage = { ...uso, model };
  return base;
}

/**
 * Avisa cuando una misma combinacion vuelve con varios precios distintos.
 *
 * Un alojamiento con un regimen, una ocupacion, un servicio incluido y una
 * temporada tiene UN precio. Si salen varios, el documento no es una tarifa:
 * suele ser una hoja de control con varios escenarios (coste, venta a un canal,
 * venta a otro) o con el desglose por proveedor. Publicar eso deja al cotizador
 * eligiendo a ciegas entre precios que no son alternativas.
 *
 * Paso el 26/08/2026 con el desglose COSTE-VENTA de MSH: Villa Bonita en
 * artificial/doble/pension completa salio con nueve importes (43, 22, 65, 44,
 * 22, 66, 51, 22, 73) donde solo hay uno. La lectura era correcta; el documento,
 * no. Y sin este aviso eso entra al catalogo sin que nadie lo note.
 */
function avisosDePreciosEnConflicto(analisis: AiDocumentAnalysisResult): string[] {
  const grupos = new Map<string, { etiqueta: string; importes: Set<number> }>();

  for (const tarifa of analisis.candidateRates) {
    const importe = tarifa.pvpAmount ?? tarifa.netAmount ?? tarifa.costAmount;
    const nombre = (tarifa.accommodationName ?? "").trim();
    if (!nombre || importe === null || importe === undefined) continue;

    const ejes = [
      nombre,
      tarifa.boardType ?? "",
      tarifa.occupancyLabel ?? "",
      tarifa.includedService ?? "",
      tarifa.seasonName ?? "",
      tarifa.dateFrom ?? "",
      tarifa.unitName ?? "",
    ];
    const clave = ejes.join("|").toLowerCase();
    const grupo = grupos.get(clave) ?? {
      etiqueta: ejes.filter(Boolean).join(" · "),
      importes: new Set<number>(),
    };
    grupo.importes.add(Number(importe));
    grupos.set(clave, grupo);
  }

  const conflictivos = [...grupos.values()].filter((g) => g.importes.size > 1);
  if (conflictivos.length === 0) return [];

  const muestra = conflictivos
    .slice(0, 3)
    .map((g) => `${g.etiqueta} → ${[...g.importes].sort((a, b) => a - b).join(", ")}`);

  return [
    `Hay ${conflictivos.length} combinacion(es) con varios precios distintos para lo mismo. ` +
      `Por ejemplo: ${muestra.join(" ; ")}. ` +
      "Suele significar que el documento no es una tarifa sino una hoja con varios escenarios " +
      "(coste y venta, o varios canales) o con el desglose por proveedor. Antes de publicar, " +
      "comprueba que cada alojamiento se queda con UN precio por regimen y ocupacion.",
  ];
}

/**
 * Avisa cuando dos productos vuelven con exactamente los mismos precios.
 *
 * Que dos productos distintos cuesten lo mismo importe a importe no es
 * imposible, pero es raro; que uno se haya leído en el sitio del otro, no. Y es
 * el error que más caro sale: un precio plausible bajo el nombre equivocado se
 * publica sin que nadie lo mire dos veces. Pasó con Caribe Aquatic Park, que
 * volvió con la tabla entera de Ferrari Land.
 */
function avisosDeProductosDuplicados(analisis: AiDocumentAnalysisResult): string[] {
  const huella = new Map<string, string[]>();

  const registrar = (nombre: string | null | undefined, importes: Array<number | null>) => {
    const limpio = (nombre ?? "").trim();
    if (!limpio || importes.length < 3) return;
    const clave = importes.map((n) => (n === null ? "-" : String(n))).join(",");
    const productos = huella.get(clave) ?? [];
    if (!productos.includes(limpio)) productos.push(limpio);
    huella.set(clave, productos);
  };

  const agrupar = <T,>(filas: T[], nombreDe: (f: T) => string | null | undefined, importeDe: (f: T) => number | null) => {
    const porProducto = new Map<string, Array<number | null>>();
    for (const fila of filas) {
      const nombre = (nombreDe(fila) ?? "").trim();
      if (!nombre) continue;
      const lista = porProducto.get(nombre) ?? [];
      lista.push(importeDe(fila));
      porProducto.set(nombre, lista);
    }
    for (const [nombre, importes] of porProducto) registrar(nombre, importes);
  };

  agrupar(analisis.candidateActivityRates, (r) => r.activityName, (r) => r.salePvpAmount ?? r.costNetAmount ?? null);
  agrupar(analisis.candidateRates, (r) => r.accommodationName, (r) => r.pvpAmount ?? r.netAmount ?? r.costAmount ?? null);

  const avisos: string[] = [];
  for (const productos of huella.values()) {
    if (productos.length > 1) {
      avisos.push(
        `${productos.join(" y ")} han salido con exactamente los mismos precios. Casi seguro que uno se ha leído en el sitio del otro: compruébalos contra el documento antes de aprobar nada.`,
      );
    }
  }
  return avisos;
}

/**
 * Una llamada al modelo: monta el mensaje, lo pide en streaming y parsea.
 *
 * Si la respuesta se corta por longitud, reintenta UNA vez pidiéndola compacta
 * (sin las citas de origen, que es lo que más ocupa). Antes esto era un error
 * duro y el documento se quedaba sin leer; más vale una lectura sin citas que
 * ninguna lectura.
 */
async function callAnthropic(
  client: Anthropic,
  model: string,
  opciones: { adjunto: AdjuntoParaModelo; system: string; prompt: string },
  esReintento = false,
): Promise<RespuestaModelo> {
  const content: Anthropic.ContentBlockParam[] = [];
  const { base64, mediaType } = opciones.adjunto;

  if (base64 && mediaType === "application/pdf") {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
      // El fichero es idéntico en todas las llamadas de este documento: se marca
      // como cacheable para pagarlo entero una vez y no en cada producto.
      cache_control: { type: "ephemeral" },
    });
  } else if (base64 && mediaType) {
    // Una tarifa que llega como foto o captura de pantalla. El modelo la lee
    // igual que un PDF; sin esto, ese documento no se podia cargar de ninguna
    // manera.
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: base64,
      },
      cache_control: { type: "ephemeral" },
    });
  }

  content.push({ type: "text", text: opciones.prompt });

  let message;
  try {
    // En streaming, no por gusto: con un techo de salida alto una petición
    // normal se queda esperando y revienta por timeout antes de contestar.
    const stream = client.messages.stream({
      model,
      max_tokens: maxOutputTokensFor(model),
      system: opciones.system,
      messages: [{ role: "user", content }],
    });
    message = await stream.finalMessage();
  } catch (error) {
    throw mapAnthropicError(error);
  }

  const stopReason = (message as { stop_reason?: string | null })?.stop_reason ?? null;
  const truncated = stopReason === "max_tokens";
  const blocks = (message?.content ?? []) as Array<{ type?: string; text?: string }>;
  const rawOutput = blocks
    .map((block) => (block.type === "text" ? block.text ?? "" : ""))
    .join("");

  const usage = (message as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage;
  const inputTokens = Number(usage?.input_tokens ?? 0);
  const outputTokens = Number(usage?.output_tokens ?? 0);

  if (!rawOutput.trim()) {
    console.error("Análisis IA Anthropic: respuesta sin texto.", { stopReason });
    throw new AiAnalysisError("La respuesta del proveedor IA no contenía texto analizable.");
  }

  try {
    return { parsed: parseModelJson(rawOutput), rawOutput, inputTokens, outputTokens, truncated };
  } catch (parseError) {
    // Log de diagnóstico (no contiene secretos): estado y vista previa de la salida.
    console.error("Análisis IA Anthropic: JSON inválido del proveedor.", {
      stopReason,
      outputLength: rawOutput.length,
      preview: rawOutput.slice(0, 600),
    });

    if (truncated && !esReintento) {
      const compacto = await callAnthropic(
        client,
        model,
        {
          ...opciones,
          prompt: `${opciones.prompt}\n\nAVISO: tu respuesta anterior se cortó por longitud. Repítela COMPACTA: deja 'rawText' a null en todos los candidatos y no repitas texto innecesario. No te dejes tarifas por el camino.`,
        },
        true,
      );
      // El consumo del intento fallido también se pagó: se suma.
      return {
        ...compacto,
        inputTokens: compacto.inputTokens + inputTokens,
        outputTokens: compacto.outputTokens + outputTokens,
      };
    }

    if (truncated) {
      throw new AiAnalysisError(
        "La respuesta de la IA se truncó por longitud incluso pidiéndola compacta. El documento es demasiado denso para leerlo de una vez.",
      );
    }
    throw parseError;
  }
}

/**
 * Recorta el texto de una hoja de cálculo a las filas de un producto.
 *
 * El maestro de hoteles de Oravia son 646 filas y 731.000 caracteres. Mandarlas
 * enteras en cada una de las 29 lecturas por hotel es lento y caro, y encima
 * mete ruido: el modelo tiene delante 28 tablas que no le tocan. Con el rango
 * de filas que dio la fase 1 recibe solo la suya, mas la cabecera, que es lo
 * que da sentido a las columnas.
 *
 * Si el rango no viene o no cuadra, se devuelve el texto entero: mejor gastar
 * de mas que leer de menos.
 */
function recortarTextoAlProducto(text: string, producto: ProductoDelDocumento): string {
  const { sourceRowFrom, sourceRowTo } = producto;
  if (sourceRowFrom === null || sourceRowTo === null || sourceRowTo < sourceRowFrom) {
    return text;
  }

  const lineas = text.split("\n");
  const esFila = (linea: string) => /^\s*(\d+)\s\|/.exec(linea);
  if (!lineas.some(esFila)) {
    return text;
  }

  // Un margen por si el bloque empieza o acaba una fila antes o despues de lo
  // que dijo la fase 1: perder la primera fila de precios seria peor que leer
  // dos de mas.
  const MARGEN = 2;
  const desde = Math.max(1, sourceRowFrom - MARGEN);
  const hasta = sourceRowTo + MARGEN;

  const salida: string[] = [];
  for (const linea of lineas) {
    const coincidencia = esFila(linea);
    if (!coincidencia) {
      // Cabeceras de hoja y notas de formato: se conservan siempre.
      salida.push(linea);
      continue;
    }
    const numero = Number(coincidencia[1]);
    // La fila 1 es la cabecera de columnas: sin ella los valores no significan nada.
    if (numero === 1 || (numero >= desde && numero <= hasta)) {
      salida.push(linea);
    }
  }

  const recortado = salida.join("\n").trim();
  if (recortado.length === 0) {
    return text;
  }

  return [
    recortado,
    "",
    `(Se han dejado solo las filas ${desde}-${hasta} de la hoja, que son las de este producto.)`,
  ].join("\n");
}

/** Saca de la fase 1 la lista de productos a leer uno a uno. */
function readProductIndex(parsed: unknown): ProductoDelDocumento[] {
  const root = (parsed ?? {}) as Record<string, unknown>;
  const productos: ProductoDelDocumento[] = [];
  const vistos = new Set<string>();

  for (const item of asArray(root.productIndex)) {
    const fila = (item ?? {}) as Record<string, unknown>;
    const name = toStr(fila.name);
    if (!name || vistos.has(name)) continue;
    vistos.add(name);

    const esperadas = toNum(fila.expectedRateCount);
    const desde = toNum(fila.sourceRowFrom);
    const hasta = toNum(fila.sourceRowTo);
    productos.push({
      kind: toStr(fila.kind) === "ACTIVITY" ? "ACTIVITY" : "ACCOMMODATION",
      name,
      expectedRateCount: esperadas !== null && esperadas > 0 ? Math.round(esperadas) : null,
      sourceRowFrom: desde !== null && desde > 0 ? Math.round(desde) : null,
      sourceRowTo: hasta !== null && hasta > 0 ? Math.round(hasta) : null,
    });
  }

  return productos;
}

/** Ejecuta `tarea` sobre todos los elementos, como mucho `limite` a la vez. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limite: number,
  tarea: (item: T) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(items.length);
  let siguiente = 0;

  const trabajadores = Array.from({ length: Math.min(limite, items.length) }, async () => {
    for (;;) {
      const indice = siguiente++;
      if (indice >= items.length) return;
      resultados[indice] = await tarea(items[indice]);
    }
  });

  await Promise.all(trabajadores);
  return resultados;
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
 * Parsea el JSON devuelto por el modelo de forma tolerante:
 * 1. Quita envoltorios markdown (```json ... ```).
 * 2. Intenta JSON.parse directo.
 * 3. Extrae el primer objeto JSON balanceado (contando llaves, respetando cadenas).
 * 4. Tolera comas finales antes de } o ].
 */
function parseModelJson(text: string): unknown {
  const cleaned = stripCodeFences(text).trim();

  const direct = tryParseJson(cleaned);
  if (direct.ok) {
    return direct.value;
  }

  const candidate = extractFirstJsonObject(cleaned);
  if (candidate) {
    const parsed = tryParseJson(candidate);
    if (parsed.ok) {
      return parsed.value;
    }

    const withoutTrailingCommas = candidate.replace(/,(\s*[}\]])/g, "$1");
    const retried = tryParseJson(withoutTrailingCommas);
    if (retried.ok) {
      return retried.value;
    }
  }

  throw new AiAnalysisError("El proveedor IA devolvió un JSON inválido.");
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** Quita un envoltorio markdown ```json ... ``` (o ``` ... ```) si está presente. */
function stripCodeFences(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenceMatch ? fenceMatch[1] : text;
}

/**
 * Extrae el primer objeto JSON balanceado del texto, contando llaves y
 * respetando las que aparecen dentro de cadenas. Devuelve null si no hay un
 * objeto completo (por ejemplo, si la respuesta quedó truncada).
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

// ----------------------------------------------------------------------------
// Proveedor real: OpenAI (Responses API)
// ----------------------------------------------------------------------------

function buildSystemPrompt(hasPdf: boolean): string {
  return [
    "Eres un analista experto en extracción de datos de documentos de tarifas turísticas",
    "(alojamientos y actividades) para un operador de viajes de grupos.",
    "Extrae ÚNICAMENTE datos presentes en el documento. No inventes nada.",
    "Cuando un dato no aparezca en el documento, usa null (o un array vacío).",
    hasPdf
      ? "El PDF adjunto es la fuente buena: léelo como una página, respetando su maquetación."
      : "",
    "Responde solo con un objeto JSON válido, sin texto adicional ni explicaciones.",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildUserPrompt(
  input: AnalyzeDocumentTextInput,
  text: string,
  hasPdf: boolean,
): string {
  const { context } = input;

  return [
    "Analiza el siguiente documento de tarifas y devuelve un objeto JSON con esta estructura exacta:",
    "",
    "{",
    '  "documentSummary": string,',
    '  "detectedAccommodations": [ { "accommodationName": string, "providerName": string|null, "locality": string|null, "province": string|null, "country": string|null, "categoryType": string|null, "accommodationType": string|null } ],',
    '  "detectedActivities": [ { "activityName": string, "supplierName": string|null, "locationMain": string|null, "activityType": string|null, "durationText": string|null, "descriptionText": string|null } ],',
    '  "candidateRates": [ { "accommodationName": string|null, "seasonName": string|null, "year": number|null, "dateFrom": string|null, "dateTo": string|null, "boardType": string|null, "unitName": string|null, "rateUnit": string|null, "occupancyLabel": string|null, "includedService": string|null, "minNights": number|null, "currency": string|null, "pvpAmount": number|null, "netAmount": number|null, "costAmount": number|null, "rawText": string|null } ],',
    '  "candidateActivityRates": [ { "activityName": string, "rateUnit": string|null, "year": number|null, "currency": string|null, "salePvpAmount": number|null, "costNetAmount": number|null, "durationText": string|null, "ageLabel": string|null, "minPax": number|null, "maxPax": number|null, "rawText": string|null } ],',
    '  "candidateSupplements": [ { "accommodationName": string|null, "adjustmentType": string|null, "concept": string, "amountType": string|null, "amount": number|null, "appliesPer": string|null, "conditionText": string|null, "rawText": string|null } ],',
    '  "candidatePolicies": [ { "policyType": string|null, "policyText": string, "rawText": string|null } ],',
    '  "candidateBlackoutDates": [ { "dateFrom": string|null, "dateTo": string|null, "availabilityStatus": string|null, "reason": string|null, "rawText": string|null } ],',
    '  "warnings": [ string ],',
    '  "confidence": number',
    "}",
    "",
    "Reglas de extracción:",
    "- No inventes datos. Usa null cuando algo no aparezca explícitamente en el texto.",
    "- UN DOCUMENTO PUEDE TRAER VARIOS ALOJAMIENTOS. Devuélvelos TODOS en 'detectedAccommodations', uno por cada establecimiento con tabla de precios propia (p. ej. 'Villa Bonita / Aloha', 'Mediterrània MED2/3' y 'Mediterrània MED1' son TRES). No los fusiones ni te quedes solo con el primero.",
    "- Cada tarifa y cada suplemento llevan 'accommodationName' con el nombre EXACTO del alojamiento de 'detectedAccommodations' al que pertenecen. Si el documento tiene un solo alojamiento, repite su nombre en todas.",
    "- 'year' es el año o temporada de vigencia de la tarifa (p. ej. 2027). NO uses números sueltos de la tabla (códigos, referencias, importes, ocupaciones) como año. Si el documento no dice el año con claridad, devuelve null: el año de control lo pondrá la aplicación.",
    "- Conserva en 'rawText' el fragmento literal del texto de origen de cada candidato cuando sea posible.",
    "- Detecta regímenes y normalízalos en 'boardType': MP (media pensión), PC (pensión completa), AD (alojamiento y desayuno), SA (solo alojamiento) si aparecen.",
    "- Detecta periodos de fechas; usa formato ISO YYYY-MM-DD en dateFrom/dateTo cuando puedas inferirlo.",
    "- LOS PRECIOS DE LAS ACTIVIDADES van en 'candidateActivityRates', NUNCA en 'candidateRates'. Una actividad (alquiler de campo, partido amistoso, clase) se cobra por equipo, por hora o por persona, no por régimen y ocupación. 'activityName' debe coincidir EXACTAMENTE con el nombre en 'detectedActivities'.",
    "- 'rateUnit' de una actividad: PER_GROUP (por equipo o grupo), PER_HOUR (por hora), PER_PAX (por persona), PER_DAY (por día) o PER_SERVICE. Si el documento distingue precios por día de la semana, categoría o duración, crea UNA entrada por cada variante y explica cuál es en 'ageLabel' (p. ej. 'entre semana', 'fin de semana', '90 min').",
    "- 'includedService': qué va INCLUIDO en el precio además del alojamiento, cuando la columna lo indique (p. ej. 'Campo artificial 1,30 h', 'Campo natural / fútbol playa', 'Sin campo', 'Entrenamientos'). Si el precio es solo alojamiento y el documento no distingue, usa null. No lo confundas con la ocupación (doble/individual) ni con el régimen.",
    "- Detecta precios netos y PVP: 'pvpAmount' precio de venta, 'netAmount' precio neto, 'costAmount' coste si aparece.",
    "- 'currency' debe ser el código de moneda (p. ej. EUR) si se deduce; si no, null.",
    "- Suplementos/ajustes: para porcentajes usa amountType='PERCENT' y amount con el valor; para importes fijos amountType='FIXED'. Incluye condiciones en conditionText.",
    "- Detecta condiciones y conviértelas en candidatePolicies: IVA incluido, impuesto turístico, depósitos, rooming list, gratuidades, cancelaciones. Usa policyType como categoría corta en mayúsculas (p. ej. TAX, DEPOSIT, ROOMING_LIST, GRATUITY, CANCELLATION) y policyText con el texto.",
    "- Suplementos detectables del texto van en candidateSupplements.",
    "- Fechas bloqueadas o de disponibilidad especial van en candidateBlackoutDates.",
    "- 'confidence' es un número entre 0 y 1 que refleja tu seguridad global.",
    "",
    buildContextAndSources(input, text, hasPdf),
  ].join("\n");
}

/**
 * Fase 1: qué hay en el documento. No pide ni una tarifa.
 *
 * Es una respuesta corta a propósito. De aquí sale la lista de productos que se
 * leerán uno a uno, y el número de tarifas que el modelo dice que tiene cada
 * uno — que luego se contrasta con lo que realmente se extrajo. Sin esa cifra
 * no habría forma automática de saber si se dejó media tabla sin leer.
 */
function buildInventoryPrompt(
  input: AnalyzeDocumentTextInput,
  text: string,
  hasPdf: boolean,
): string {
  return [
    "Haz el ÍNDICE de este documento de tarifas. NO extraigas todavía ninguna tarifa.",
    "Devuelve un objeto JSON con esta estructura exacta:",
    "",
    "{",
    '  "documentSummary": string,',
    '  "detectedAccommodations": [ { "accommodationName": string, "providerName": string|null, "locality": string|null, "province": string|null, "country": string|null, "categoryType": string|null, "accommodationType": string|null } ],',
    '  "detectedActivities": [ { "activityName": string, "supplierName": string|null, "locationMain": string|null, "activityType": string|null, "durationText": string|null, "descriptionText": string|null } ],',
    '  "candidatePolicies": [ { "policyType": string|null, "policyText": string, "rawText": string|null } ],',
    '  "candidateBlackoutDates": [ { "dateFrom": string|null, "dateTo": string|null, "availabilityStatus": string|null, "reason": string|null, "rawText": string|null } ],',
    '  "productIndex": [ { "kind": "ACCOMMODATION"|"ACTIVITY", "name": string, "expectedRateCount": number|null, "sourceRowFrom": number|null, "sourceRowTo": number|null } ],',
    '  "warnings": [ string ],',
    '  "confidence": number',
    "}",
    "",
    "Reglas:",
    "- 'productIndex' es la lista de PRODUCTOS con tabla de precios propia: un alojamiento o una actividad",
    "  por cada bloque con nombre propio. 'name' debe ser IDÉNTICO al de 'detectedAccommodations' o",
    "  'detectedActivities'. Es la lista que se va a leer después, producto a producto: si falta uno, sus",
    "  tarifas no se cargarán.",
    "- 'expectedRateCount': CUENTA los importes del bloque de ese producto (filas x columnas con precio,",
    "  sin contar las celdas vacías ni las marcadas con asterisco). Es una cuenta, no una estimación",
    "  redondeada. Si de verdad no puedes contarlas, pon null.",
    "- 'sourceRowFrom' y 'sourceRowTo': SOLO si el documento es una hoja de cálculo (las lineas del texto",
    "  empiezan por el numero de fila del Excel). Son la primera y la ultima fila de ESE producto. Se usan",
    "  para mandarte despues solo su trozo de la hoja, asi que si te equivocas se leeran las filas de otro.",
    "  En un PDF, deja los dos a null.",
    "- 'candidatePolicies' son las condiciones GENERALES del documento (IVA, tasas, depósitos, gratuidades,",
    "  cancelaciones, mínimos de grupo, formas de pago). Las que apliquen a un solo producto déjalas para",
    "  después.",
    "- No inventes. Lo que no aparezca, null o array vacío.",
    "",
    buildContextAndSources(input, text, hasPdf),
  ].join("\n");
}

/**
 * Fase 2: las tarifas de UN producto. El resto del documento se ignora.
 *
 * Acotar la petición a un producto es lo que arregla el reparto: leyendo ocho
 * tablas a la vez, el modelo colgaba los precios del producto de al lado —en la
 * tarifa de PortAventura el bloque de «1 día PortAventura Park» acabó bajo «1
 * día, 2 parques»—. Con una sola tabla delante no hay a qué confundirse.
 */
function buildProductPrompt(
  input: AnalyzeDocumentTextInput,
  text: string,
  hasPdf: boolean,
  producto: ProductoDelDocumento,
  todos: ProductoDelDocumento[],
): string {
  const esActividad = producto.kind === "ACTIVITY";
  const cuantas =
    producto.expectedRateCount !== null
      ? `Deberían salir exactamente ${producto.expectedRateCount}. Si te salen menos, te has dejado parte de la tabla; si te salen más, te has traído filas de otro producto. En los dos casos, vuelve a mirar el bloque.`
      : "";

  // Decirle cuáles son los otros bloques evita el fallo que de verdad ocurre:
  // leer el bloque de al lado y devolverlo con este nombre. El 26/08/2026 «1 día
  // Caribe Aquatic Park» volvió con la tabla entera de «1 día Ferrari Land».
  const otros = todos
    .filter((p) => p.name !== producto.name)
    .map((p) => `  · ${p.name}`)
    .join("\n");

  return [
    `Extrae TODAS las tarifas de UN SOLO producto de este documento: «${producto.name}».`,
    "Ignora por completo los demás productos. Devuelve un objeto JSON con esta estructura exacta:",
    "",
    "{",
    '  "candidateRates": [ { "accommodationName": string|null, "seasonName": string|null, "year": number|null, "dateFrom": string|null, "dateTo": string|null, "boardType": string|null, "unitName": string|null, "rateUnit": string|null, "occupancyLabel": string|null, "includedService": string|null, "minNights": number|null, "currency": string|null, "pvpAmount": number|null, "netAmount": number|null, "costAmount": number|null, "rawText": string|null } ],',
    '  "candidateActivityRates": [ { "activityName": string, "rateUnit": string|null, "year": number|null, "currency": string|null, "salePvpAmount": number|null, "costNetAmount": number|null, "durationText": string|null, "ageLabel": string|null, "minPax": number|null, "maxPax": number|null, "rawText": string|null } ],',
    '  "candidateSupplements": [ { "accommodationName": string|null, "adjustmentType": string|null, "concept": string, "amountType": string|null, "amount": number|null, "appliesPer": string|null, "conditionText": string|null, "rawText": string|null } ],',
    '  "candidateBlackoutDates": [ { "dateFrom": string|null, "dateTo": string|null, "availabilityStatus": string|null, "reason": string|null, "rawText": string|null } ],',
    '  "warnings": [ string ]',
    "}",
    "",
    "Reglas:",
    esActividad
      ? `- Este producto es una ACTIVIDAD. Sus precios van en 'candidateActivityRates' con "activityName": "${producto.name}" EXACTO en todas. Deja 'candidateRates' vacío.`
      : `- Este producto es un ALOJAMIENTO. Sus precios van en 'candidateRates' con "accommodationName": "${producto.name}" EXACTO en todas. Deja 'candidateActivityRates' vacío.`,
    "- UNA ENTRADA POR CADA IMPORTE de su tabla. Si el precio cambia según periodo, temporada, régimen,",
    "  ocupación, tipo de entrada o edad, son tarifas distintas, no una sola: recorre la tabla celda a celda.",
    "- Di en qué variante estás: 'ageLabel' (edad, tipo de entrada, periodo) para actividades;",
    "  'boardType', 'occupancyLabel', 'includedService', 'seasonName' y las fechas para alojamientos.",
    "- Una celda vacía o marcada con asterisco NO es una tarifa: se omite y se explica en 'warnings'.",
    "- Precios: 'pvpAmount' venta, 'netAmount' neto, 'costAmount' coste, 'salePvpAmount'/'costNetAmount' en",
    "  actividades. No conviertas ni sumes nada: copia el número tal cual está impreso.",
    "- 'year' es la temporada de vigencia. Si no está clara, null: no uses números sueltos de la tabla.",
    "- 'rawText' BREVE, 60 caracteres como mucho ('Adulto · Periodo B · 44 €').",
    "- Suplementos y notas de ESTE producto en 'candidateSupplements'; las condiciones generales del",
    "  documento no, que ya están recogidas.",
    cuantas,
    "",
    otros
      ? [
          "NO TE CONFUNDAS DE BLOQUE. En este mismo documento hay estos otros productos, que NO son el tuyo:",
          otros,
          "",
          `Localiza primero el bloque titulado «${producto.name}» y asegúrate de que las filas que estás`,
          "leyendo caen dentro de ese bloque y no en el de otro. Antes de responder, comprueba que los",
          "importes que devuelves no son los de ninguno de los productos de esa lista: si coinciden, te has",
          "equivocado de bloque y hay que volver a buscarlo.",
          "",
        ].join("\n")
      : "",
    buildContextAndSources(input, text, hasPdf),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Contexto de control y las fuentes (PDF + texto). Es idéntico en las tres
 * peticiones —índice, producto y lectura completa—, así que va aparte: si se
 * duplicara, cualquier ajuste habría que hacerlo en tres sitios y el prefijo
 * dejaría de ser el mismo, que es de lo que vive la caché.
 */
function buildContextAndSources(
  input: AnalyzeDocumentTextInput,
  text: string,
  hasPdf: boolean,
): string {
  const { context } = input;

  return [
    "Contexto de control (referencia, no es el documento):",
    `- Tipo de registro: ${context.targetType}`,
    `- Nombre de control: ${context.controlName}`,
    `- Ubicación: ${context.controlLocation ?? "(desconocida)"}`,
    `- Año/temporada: ${context.controlYear ?? "(desconocido)"}`,
    `- Categoría: ${context.controlCategory ?? "(desconocida)"}`,
    "",
    hasPdf
      ? [
          "FUENTES. Tienes dos, y NO valen lo mismo:",
          "1. El PDF adjunto. Es la fuente buena. Léelo mirando la página: qué precio está en qué fila y en qué columna.",
          "2. El texto de abajo, extraído de ese mismo PDF. Va en el orden interno del fichero, no en el que se ve.",
          "   En una tabla ese orden está roto: los importes se mezclan con lo que tengan al lado (números de un",
          "   calendario, referencias, días del mes). Úsalo solo para copiar literales en 'rawText' y para leer",
          "   párrafos de condiciones. SI EL TEXTO Y EL PDF NO COINCIDEN, MANDA EL PDF.",
          "",
          "TABLAS. Cuando el documento sea una rejilla de precios:",
          "- Recórrela celda a celda. Cada celda es UNA tarifa: fila x columna.",
          "- Las cabeceras de columna (tipo de entrada, periodo, temporada, ocupación, régimen) NO son productos.",
          "  No crees un alojamiento ni una actividad a partir de una cabecera de columna.",
          "- Pero cada BLOQUE de filas con nombre propio SÍ es un producto distinto: un alojamiento o una",
          "  actividad por cada uno ('1 día PortAventura Park', '2 días, 3 parques', 'Hotel Planas'...).",
          "  No los fusiones en uno solo. Las variantes de precio dentro del bloque (periodo, tipo de entrada,",
          "  edad, régimen, ocupación) son tarifas de ese producto, y cada una lleva en 'ageLabel' o en",
          "  'occupancyLabel' de qué variante es.",
          "- CUIDADO AL EMPAREJAR NOMBRE Y BLOQUE: el nombre del producto suele ir en una celda combinada a la",
          "  izquierda, centrada verticalmente respecto a SUS filas, de modo que cae a media altura del bloque",
          "  y no en su primera fila. Asígnalo al bloque que lo contiene, mirando las líneas de la tabla, no a",
          "  la fila que tenga enfrente ni al bloque siguiente. Si un producto se te queda sin tarifas o con",
          "  muchas menos de las que ves en su bloque, es que has corrido los nombres: vuelve a emparejarlos.",
          "- Una celda vacía es una celda vacía: no la rellenes con el valor de al lado ni corras los precios.",
          "- Antes de responder, cuenta los importes que has extraído y compáralos con los que ves en la tabla.",
          "  Si te faltan, di cuántos en 'warnings'.",
          "- 'rawText' BREVE, 60 caracteres como mucho: la celda y sus cabeceras ('Adulto · Periodo B · 44 €'),",
          "  no el párrafo entero. Con cientos de tarifas, un 'rawText' largo agota el límite de respuesta y",
          "  se pierde la lectura completa: es preferible una tarifa más y una cita más corta.",
          "",
          "Texto extraído del PDF (apoyo, puede venir desordenado):",
        ].join("\n")
      : "Texto del documento:",
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
      // La rama de OpenAI sigue siendo solo texto: no se le adjunta el PDF.
      { role: "system", content: buildSystemPrompt(false) },
      { role: "user", content: buildUserPrompt(input, text, false) },
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

  // Se acepta la lista nueva y el objeto único de antes: los modelos a veces
  // devuelven el formato viejo, y perder los alojamientos ahí sería silencioso.
  const detectedAccommodations = [
    ...asArray(root.detectedAccommodations).map(normalizeAccommodation),
    normalizeAccommodation(root.detectedAccommodation),
  ].filter(
    (accommodation): accommodation is AiDetectedAccommodation =>
      accommodation !== null && Boolean(accommodation.accommodationName?.trim()),
  );

  // Dos bloques del mismo hotel no son dos hoteles.
  const seenAccommodations = new Set<string>();
  const uniqueAccommodations = detectedAccommodations.filter((accommodation) => {
    const key = accommodation.accommodationName!.trim().toLowerCase();
    if (seenAccommodations.has(key)) return false;
    seenAccommodations.add(key);
    return true;
  });

  const detectedAccommodation = uniqueAccommodations[0] ?? null;
  const detectedActivities = asArray(root.detectedActivities)
    .map(normalizeActivity)
    .filter((activity): activity is AiDetectedActivity => activity !== null);

  const candidateRates = asArray(root.candidateRates).map(normalizeRate);
  const candidateActivityRates = asArray(root.candidateActivityRates)
    .map(normalizeActivityRate)
    .filter((rate): rate is AiCandidateActivityRate => rate !== null);
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
    detectedAccommodations: uniqueAccommodations,
    detectedActivities,
    candidateRates,
    candidateActivityRates,
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
    accommodationName: toStr(record.accommodationName),
    seasonName: toStr(record.seasonName),
    year: toNum(record.year),
    dateFrom: toStr(record.dateFrom),
    dateTo: toStr(record.dateTo),
    boardType: toStr(record.boardType),
    unitName: toStr(record.unitName),
    rateUnit: toStr(record.rateUnit),
    occupancyLabel: toStr(record.occupancyLabel),
    includedService: toStr(record.includedService),
    minNights: toNum(record.minNights),
    currency: toStr(record.currency),
    pvpAmount: toNum(record.pvpAmount),
    netAmount: toNum(record.netAmount),
    costAmount: toNum(record.costAmount),
    rawText: toStr(record.rawText),
  };
}

function normalizeActivityRate(value: unknown): AiCandidateActivityRate | null {
  const record = (value ?? {}) as Record<string, unknown>;
  const activityName = toStr(record.activityName);
  if (!activityName) return null;

  return {
    activityName,
    rateUnit: toStr(record.rateUnit),
    year: toNum(record.year),
    seasonName: toStr(record.seasonName),
    currency: toStr(record.currency),
    salePvpAmount: toNum(record.salePvpAmount),
    costNetAmount: toNum(record.costNetAmount),
    durationText: toStr(record.durationText),
    ageLabel: toStr(record.ageLabel),
    minPax: toNum(record.minPax),
    maxPax: toNum(record.maxPax),
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
    accommodationName: toStr(record.accommodationName),
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
    detectedAccommodations: detectedAccommodation ? [detectedAccommodation] : [],
    detectedActivities: [],
    candidateRates: [],
    candidateActivityRates: [],
    candidateSupplements: [],
    candidatePolicies: [],
    candidateBlackoutDates: [],
    warnings,
    confidence: 0.1,
    rawModelOutput: null,
  };
}
