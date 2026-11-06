import fs from "node:fs/promises";
import path from "node:path";
import { getAiProviderConfig } from "./aiDocumentAnalysis";
import { preguntarAlModelo } from "./cotizacionDelProveedor";
import { listarClientesEspeciales } from "./clientesEspeciales";
import { CLIENTES_ESPECIALES, type ClienteEspecial } from "../src/domain/documentImportTypes";
import {
  FILA_A_CLAVE,
  instruccionesAuditoria,
  normalizarAuditoria,
  SISTEMA_AUDITORIA_IA,
  type ResultadoAuditoria,
  type ValorAuditado,
} from "../src/domain/auditoriaIa";
import {
  instruccionesLecturaIa,
  normalizarLecturaIa,
  SISTEMA_LECTURA_IA,
  type LecturaIa,
  type TextoParaLaIa,
} from "../src/domain/lecturaIa";

/**
 * La IA que lee la solicitud (reunión con Oravia, 05/11/2026). Ver
 * `src/domain/lecturaIa.ts` para las reglas del juego: solo rellena huecos y
 * cada dato lleva una cita que tiene que estar en el texto.
 *
 * Va detrás de un interruptor, SOLICITUD_IA, apagado por defecto: con él
 * apagado la app se comporta exactamente como antes y no se llama a ningún
 * modelo. Usa un modelo ligero (Haiku) y no el del resto del servidor, porque
 * la tarea es corta y de extracción; SOLICITUD_IA_MODEL lo cambia.
 *
 * Cada lectura se anota en `solicitud-ia/lecturas.jsonl` (lo que se le pasó, lo
 * que contestó el modelo, lo que se descartó y lo que habían leído las reglas).
 * Es el material para medir si la IA gana a las reglas ANTES de dejarla
 * encendida en producción, y para armar el banco de mensajes reales.
 */

const RAIZ = path.resolve(process.env.ORAVIA_STORAGE_DIR || path.join(process.cwd(), "storage"), "solicitud-ia");
const MAX_TEXTO_TOTAL = 30000;
/**
 * Es leer y extraer datos con su cita, no razonar: un modelo ligero basta y
 * cuesta una fracción. Se sube a otro solo con SOLICITUD_IA_MODEL, y solo si
 * las lecturas anotadas demuestran que el ligero se queda corto.
 */
const MODELO_POR_DEFECTO = "claude-haiku-5-5";

function modeloDeLaLectura(): string {
  return (process.env.SOLICITUD_IA_MODEL ?? "").trim() || MODELO_POR_DEFECTO;
}

export function laIaEstaActiva(): boolean {
  return ["1", "true", "si", "sí", "on", "yes"].includes((process.env.SOLICITUD_IA ?? "").trim().toLowerCase());
}

export interface RespuestaDeLaIa {
  activa: boolean;
  lectura: LecturaIa | null;
  /** Por qué no hay lectura (apagada, sin clave, el modelo falló…). */
  motivo: string | null;
  /** Los clientes especiales con los que se ha leído, para poner su nombre en pantalla. */
  clientes: ClienteEspecial[];
}

export async function leerSolicitudConIa(entrada: {
  textos: TextoParaLaIa[];
  /** Lo que habían leído las reglas, solo para anotarlo en el registro. */
  reglas: unknown;
  usuario: string | null;
}): Promise<RespuestaDeLaIa> {
  if (!laIaEstaActiva()) return { activa: false, lectura: null, motivo: "La lectura con IA está apagada (SOLICITUD_IA).", clientes: [] };

  const textos = entrada.textos
    .map((t) => ({ origen: t.origen === "chat" ? ("chat" as const) : ("colegio" as const), texto: String(t.texto ?? "").trim() }))
    .filter((t) => t.texto !== "");
  if (textos.length === 0) return { activa: true, lectura: null, motivo: "No hay texto que leer.", clientes: [] };
  if (textos.reduce((n, t) => n + t.texto.length, 0) > MAX_TEXTO_TOTAL) {
    return { activa: true, lectura: null, motivo: "Hay demasiado texto para leerlo con IA.", clientes: [] };
  }

  const config = getAiProviderConfig();
  if (config.provider !== "anthropic" || !config.anthropicApiKey) {
    return { activa: true, lectura: null, motivo: "Falta la clave del modelo en este servidor (AI_PROVIDER / ANTHROPIC_API_KEY).", clientes: [] };
  }

  const inicio = Date.now();
  let bruto: unknown = null;
  let lectura: LecturaIa | null = null;
  let motivo: string | null = null;
  const modelo = modeloDeLaLectura();
  // Los clientes especiales de verdad (los que da de alta Oravia), para que el
  // modelo reconozca a quien contrata. Sin base de datos, los de partida.
  let clientes: ClienteEspecial[] = CLIENTES_ESPECIALES;
  try {
    clientes = await listarClientesEspeciales();
  } catch (error) {
    console.error("[solicitud IA] no se pudo leer la lista de clientes especiales", error);
  }
  const uso: { tokensEntrada?: number; tokensSalida?: number } = {};
  try {
    bruto = await preguntarAlModelo([], instruccionesLecturaIa(textos, new Date(), clientes), SISTEMA_LECTURA_IA, modelo, uso);
    lectura = normalizarLecturaIa(bruto, textos.map((t) => t.texto), clientes.map((c) => c.codigo));
  } catch (error) {
    motivo = error instanceof Error ? error.message : String(error);
    console.error("[solicitud IA] no se pudo leer", error);
  }

  try {
    await fs.mkdir(RAIZ, { recursive: true });
    await fs.appendFile(
      path.join(RAIZ, "lecturas.jsonl"),
      JSON.stringify({
        fecha: new Date().toISOString(),
        usuario: entrada.usuario,
        modelo,
        milisegundos: Date.now() - inicio,
        tokensEntrada: uso.tokensEntrada ?? null,
        tokensSalida: uso.tokensSalida ?? null,
        textos,
        reglas: entrada.reglas ?? null,
        modeloDijo: bruto,
        validada: lectura,
        error: motivo,
      }) + "\n",
    );
  } catch (error) {
    // Que no se pueda anotar no debe estropear una lectura correcta.
    console.error("[solicitud IA] no se pudo anotar la lectura", error);
  }

  return { activa: true, lectura, motivo, clientes };
}

// ---------------------------------------------------------------------------
// El auditor de «Lo que hemos entendido»
// ---------------------------------------------------------------------------

export interface RespuestaDeLaAuditoria {
  activa: boolean;
  auditoria: ResultadoAuditoria | null;
  motivo: string | null;
  clientes: ClienteEspecial[];
}

/**
 * La IA revisa el resumen ENTERO contra lo escrito (ver `domain/auditoriaIa.ts`).
 * Mismo interruptor y mismo modelo ligero que la lectura. Cada revisión se anota
 * en `auditorias.jsonl`, con lo que dijo el modelo y lo que pasó la comprobación.
 */
export async function auditarSolicitudConIa(entrada: {
  textos: TextoParaLaIa[];
  valores: ValorAuditado[];
  usuario: string | null;
}): Promise<RespuestaDeLaAuditoria> {
  const vacia = (activa: boolean, motivo: string): RespuestaDeLaAuditoria => ({ activa, auditoria: null, motivo, clientes: [] });
  if (!laIaEstaActiva()) return vacia(false, "La lectura con IA está apagada (SOLICITUD_IA).");

  const textos = entrada.textos
    .map((t) => ({ origen: t.origen === "chat" ? ("chat" as const) : ("colegio" as const), texto: String(t.texto ?? "").trim() }))
    .filter((t) => t.texto !== "");
  if (textos.length === 0) return vacia(true, "No hay texto que revisar.");
  if (textos.reduce((n, t) => n + t.texto.length, 0) > MAX_TEXTO_TOTAL) return vacia(true, "Hay demasiado texto para revisarlo con IA.");

  const claves = new Set<string>(Object.values(FILA_A_CLAVE));
  const valores = entrada.valores
    .filter((v) => v && claves.has(v.clave))
    .map((v) => ({
      clave: v.clave,
      que: String(v.que ?? "").slice(0, 60),
      valor: String(v.valor ?? "").slice(0, 600),
      ...(v.codigo !== undefined ? { codigo: String(v.codigo).slice(0, 60) } : {}),
    }));
  if (valores.length === 0) return vacia(true, "No hay datos que revisar.");

  const config = getAiProviderConfig();
  if (config.provider !== "anthropic" || !config.anthropicApiKey) {
    return vacia(true, "Falta la clave del modelo en este servidor (AI_PROVIDER / ANTHROPIC_API_KEY).");
  }

  const inicio = Date.now();
  const modelo = modeloDeLaLectura();
  let clientes: ClienteEspecial[] = CLIENTES_ESPECIALES;
  try {
    clientes = await listarClientesEspeciales();
  } catch (error) {
    console.error("[solicitud IA] no se pudo leer la lista de clientes especiales", error);
  }
  const uso: { tokensEntrada?: number; tokensSalida?: number } = {};
  let bruto: unknown = null;
  let auditoria: ResultadoAuditoria | null = null;
  let motivo: string | null = null;
  try {
    bruto = await preguntarAlModelo(
      [],
      instruccionesAuditoria(textos, valores, new Date(), clientes),
      SISTEMA_AUDITORIA_IA,
      modelo,
      uso,
    );
    auditoria = normalizarAuditoria(bruto, textos.map((t) => t.texto), valores, clientes.map((c) => c.codigo));
  } catch (error) {
    motivo = error instanceof Error ? error.message : String(error);
    console.error("[solicitud IA] no se pudo auditar", error);
  }

  try {
    await fs.mkdir(RAIZ, { recursive: true });
    await fs.appendFile(
      path.join(RAIZ, "auditorias.jsonl"),
      JSON.stringify({
        fecha: new Date().toISOString(),
        usuario: entrada.usuario,
        modelo,
        milisegundos: Date.now() - inicio,
        tokensEntrada: uso.tokensEntrada ?? null,
        tokensSalida: uso.tokensSalida ?? null,
        textos,
        valores,
        modeloDijo: bruto,
        validada: auditoria,
        error: motivo,
      }) + "\n",
    );
  } catch (error) {
    console.error("[solicitud IA] no se pudo anotar la auditoría", error);
  }

  return { activa: true, auditoria, motivo, clientes };
}
