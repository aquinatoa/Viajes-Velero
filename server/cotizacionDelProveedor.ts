import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { simpleParser } from "mailparser";
import {
  DEFAULT_ANTHROPIC_MODEL,
  getAiProviderConfig,
  mapAnthropicError,
  parseModelJson,
} from "./aiDocumentAnalysis";
import { classifyDocument, extractDocumentText } from "./documentTextExtraction";
import {
  normalizarLectura,
  type ContextoDeCotizacion,
  type LecturaDeCotizacion,
} from "../src/domain/cotizacionDelProveedor";

/**
 * Leer la cotización de un proveedor (un PDF, una foto, un Excel, un correo
 * guardado o el texto pegado) y proponer el coste para UN hotel o UNA
 * actividad. Ver `src/domain/cotizacionDelProveedor.ts`.
 *
 * El documento se guarda siempre, se lea bien o no: es el justificante del
 * precio y solo lo ve Oravia (nunca va al PDF ni al correo del colegio). Si la
 * lectura falla, se dice y quien cotiza pone el coste a mano: el documento
 * sigue adjunto.
 */

const prisma = new PrismaClient();

const RAIZ = path.resolve(process.env.ORAVIA_STORAGE_DIR ?? path.join(process.cwd(), "storage"), "cotizaciones-proveedor");

/** Lo mismo que admite la subida de documentos. */
export const TAMANO_MAXIMO_COTIZACION = 25 * 1024 * 1024;
/** Lo que se le manda al modelo de una hoja o un correo largo. Una cotización cabe de sobra. */
const MAX_TEXTO = 60000;
/** Lo que la API admite adjunto, contando el base64. */
const MAX_ADJUNTO = 20 * 1024 * 1024;

export interface FicheroDeCotizacion {
  nombre: string;
  tipo: string;
  contenido: Buffer;
}

export interface ResultadoDeLaLectura {
  /** El id del justificante guardado. Viaja con lo ad hoc hasta la propuesta. */
  id: string;
  documento: string | null;
  lectura: LecturaDeCotizacion;
}

function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
  return limpio || "cotizacion";
}

type Bloque = Anthropic.ContentBlockParam;

const IMAGENES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

function bloqueDeFichero(contenido: Buffer, tipo: string): Bloque | null {
  if (contenido.byteLength > MAX_ADJUNTO) return null;
  if (tipo === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: contenido.toString("base64") } };
  }
  if (IMAGENES.has(tipo)) {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: tipo as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data: contenido.toString("base64"),
      },
    };
  }
  return null;
}

function tipoDeImagenOPdf(nombre: string, tipo: string): string {
  const ext = path.extname(nombre).toLowerCase();
  if (ext === ".pdf" || tipo.includes("pdf")) return "application/pdf";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return tipo;
}

/**
 * Lo que se le enseña al modelo del fichero: el propio fichero si lo puede
 * mirar (PDF, imagen), su texto si no (Excel, texto), y de un correo guardado
 * (.eml) el cuerpo y su primer PDF o imagen adjuntos, que es donde suelen
 * venir los precios.
 */
async function loQueSeLeEnsena(
  fichero: FicheroDeCotizacion,
  ruta: string,
): Promise<{ bloques: Bloque[]; texto: string; problema: string | null }> {
  const ext = path.extname(fichero.nombre).toLowerCase();

  if (ext === ".eml" || fichero.tipo === "message/rfc822") {
    const correo = await simpleParser(fichero.contenido);
    const cabecera = [
      correo.from?.text ? `De: ${correo.from.text}` : "",
      correo.date ? `Fecha: ${correo.date.toISOString().slice(0, 10)}` : "",
      correo.subject ? `Asunto: ${correo.subject}` : "",
    ].filter(Boolean);
    const bloques: Bloque[] = [];
    for (const adjunto of correo.attachments ?? []) {
      if (adjunto.related) continue;
      const bloque = bloqueDeFichero(adjunto.content, tipoDeImagenOPdf(adjunto.filename ?? "", adjunto.contentType));
      if (bloque) {
        bloques.push(bloque);
        break;
      }
    }
    return { bloques, texto: [...cabecera, "", correo.text ?? ""].join("\n"), problema: null };
  }

  const tipo = tipoDeImagenOPdf(fichero.nombre, fichero.tipo);
  const bloque = bloqueDeFichero(fichero.contenido, tipo);
  const clase = classifyDocument(fichero.nombre, fichero.tipo);

  if (clase === "unsupported") {
    return {
      bloques: [],
      texto: "",
      problema:
        ext === ".msg"
          ? "Un correo de Outlook (.msg) no se puede leer: ábrelo, copia el texto y pégalo en «o pega el correo»."
          : ext === ".doc" || ext === ".docx"
            ? "Un Word no se puede leer: guárdalo como PDF o copia el texto y pégalo."
            : `No sé leer un archivo «${ext || fichero.tipo}». Se leen PDF, fotos, Excel, texto y correos guardados (.eml).`,
    };
  }

  const extraido = clase === "image" ? null : await extractDocumentText(ruta, fichero.nombre, fichero.tipo);
  return { bloques: bloque ? [bloque] : [], texto: extraido?.text ?? "", problema: null };
}

function noches(desde: string, hasta: string): number | null {
  const a = Date.parse(desde);
  const b = Date.parse(hasta);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.round((b - a) / 86400000);
}

const SISTEMA = [
  "Lees cotizaciones que los proveedores (hoteles, empresas de actividades) mandan a Oravia, una agencia de viajes escolares y deportivos.",
  "Oravia ya sabe para qué hotel o actividad, fechas, régimen y grupo pide precio: tú solo buscas en el documento LO QUE COBRA EL PROVEEDOR por ese servicio.",
  "Nunca inventes un precio. Si el documento no lo dice claro, deja el campo a null y explícalo en «avisos».",
  "Responde SOLO con un objeto JSON, sin texto antes ni después.",
].join(" ");

function instrucciones(contexto: ContextoDeCotizacion, texto: string, pegado: string): string {
  const n = noches(contexto.fechaEntrada, contexto.fechaSalida);
  const peticion = [
    `- Qué: ${contexto.tipo === "hotel" ? "alojamiento" : "actividad"}${contexto.nombre ? ` «${contexto.nombre}»` : " (el nombre lo dice el documento)"}`,
    contexto.destino ? `- Destino: ${contexto.destino}` : "",
    contexto.tipo === "hotel" && contexto.regimen ? `- Régimen pedido: ${contexto.regimen} (PC pensión completa, MP media pensión, AD alojamiento y desayuno, SA solo alojamiento)` : "",
    contexto.fechaEntrada ? `- Fechas: del ${contexto.fechaEntrada} al ${contexto.fechaSalida}${n ? ` (${n} noches)` : ""}` : "",
    contexto.alumnos ? `- Alumnos: ${contexto.alumnos}` : "",
    contexto.profesores ? `- Profesores: ${contexto.profesores}` : "",
  ].filter(Boolean);

  const campos =
    contexto.tipo === "hotel"
      ? [
          '  "nombre": nombre del hotel,',
          '  "dondeOProveedor": localidad del hotel,',
          '  "regimen": "PC" | "MP" | "AD" | "SA" | null — el del precio que das,',
          '  "coste": número — POR ALUMNO Y NOCHE, en euros,',
          '  "costeProfesor": número | null — por profesor y noche si el documento le da otro precio (habitación individual); null si no lo distingue,',
        ]
      : [
          '  "nombre": nombre de la actividad,',
          '  "dondeOProveedor": nombre de la empresa que la ofrece,',
          '  "regimen": null,',
          '  "coste": número — POR ALUMNO, en euros,',
          '  "costeProfesor": null,',
        ];

  return [
    "La petición:",
    ...peticion,
    "",
    "Devuelve este JSON:",
    "{",
    ...campos,
    '  "iva": "incluido" | "no incluido" | "no lo dice",',
    `  "condiciones": ${contexto.tipo === "hotel" ? "gratuidades, depósito, cancelación, mínimo de noches… en una o dos frases" : "qué incluye, duración, mínimo de participantes… en una o dos frases"},`,
    '  "cita": el trozo del documento de donde sale el coste, copiado tal cual (una o dos líneas),',
    '  "avisos": [lista de frases cortas con lo que hay que comprobar]',
    "}",
    "",
    "Reglas:",
    "- Si el precio viene por habitación, por estancia o para todo el grupo, pásalo a la unidad pedida SOLO si el documento da lo necesario para hacerlo (ocupación, noches, número de personas), y di en «avisos» la cuenta que has hecho.",
    "- Si hay varios precios (temporadas, regímenes, ocupaciones), elige el que corresponde a la petición y di en «avisos» cuáles has descartado.",
    "- Si las fechas o el régimen del documento no coinciden con la petición, avísalo.",
    "- Las gratuidades («1 gratis cada 25») no se restan del precio: van en «condiciones».",
    "- Si dice que el IVA va aparte, no lo sumes: márcalo en «iva».",
    texto.trim() ? `\nTexto del documento:\n${texto.slice(0, MAX_TEXTO)}` : "",
    pegado.trim() ? `\nCorreo o texto pegado por quien cotiza:\n${pegado.slice(0, MAX_TEXTO)}` : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

async function preguntarAlModelo(bloques: Bloque[], prompt: string): Promise<unknown> {
  const config = getAiProviderConfig();
  if (config.provider !== "anthropic" || !config.anthropicApiKey) {
    throw new Error("La lectura automática no está configurada en este servidor (AI_PROVIDER / ANTHROPIC_API_KEY).");
  }
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  try {
    const stream = client.messages.stream({
      model: config.model || DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 4000,
      system: SISTEMA,
      messages: [{ role: "user", content: [...bloques, { type: "text", text: prompt }] }],
    });
    const mensaje = await stream.finalMessage();
    const salida = mensaje.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return parseModelJson(salida);
  } catch (error) {
    if (error instanceof Anthropic.APIError) throw mapAnthropicError(error);
    throw error;
  }
}

/** Lectura vacía con un aviso: el documento queda guardado y el coste se pone a mano. */
function sinLectura(aviso: string): LecturaDeCotizacion {
  const vacia = normalizarLectura({}, "hotel");
  return { ...vacia, avisos: [aviso, "El documento queda adjunto igualmente: pon el coste a mano."] };
}

export async function leerCotizacionDelProveedor(entrada: {
  fichero: FicheroDeCotizacion | null;
  textoPegado: string;
  contexto: ContextoDeCotizacion;
  usuario: string | null;
}): Promise<ResultadoDeLaLectura> {
  const { fichero, contexto } = entrada;
  const textoPegado = entrada.textoPegado.trim();
  if (!fichero && !textoPegado) {
    throw new Error("Adjunta la cotización del proveedor o pega su correo.");
  }

  const fila = await prisma.cotizacionProveedor.create({
    data: {
      tipo: contexto.tipo,
      nombre: fichero?.nombre ?? null,
      tipoFichero: fichero?.tipo ?? null,
      tamano: fichero?.contenido.length ?? null,
      textoPegado: textoPegado || null,
      creadoPor: entrada.usuario,
    },
  });

  let ruta: string | null = null;
  if (fichero) {
    const carpeta = path.join(RAIZ, fila.id);
    await fs.mkdir(carpeta, { recursive: true });
    ruta = path.join(carpeta, nombreSeguro(fichero.nombre));
    await fs.writeFile(ruta, fichero.contenido);
    await prisma.cotizacionProveedor.update({ where: { id: fila.id }, data: { ruta } });
  }

  let lectura: LecturaDeCotizacion;
  try {
    const visto = fichero && ruta ? await loQueSeLeEnsena(fichero, ruta) : { bloques: [], texto: "", problema: null };
    if (visto.problema && !textoPegado) {
      lectura = sinLectura(visto.problema);
    } else {
      const bruto = await preguntarAlModelo(visto.bloques, instrucciones(contexto, visto.texto, textoPegado));
      lectura = normalizarLectura(bruto, contexto.tipo);
      if (visto.problema) lectura.avisos.push(visto.problema);
    }
  } catch (error) {
    console.error(`[cotización proveedor] ${fila.id}: no se pudo leer`, error);
    lectura = sinLectura(`No se ha podido leer: ${error instanceof Error ? error.message : String(error)}`);
  }

  await prisma.cotizacionProveedor.update({ where: { id: fila.id }, data: { lecturaJson: JSON.stringify(lectura) } });
  return { id: fila.id, documento: fichero?.nombre ?? null, lectura };
}

/** El justificante para descargarlo, o null si no hay fichero (solo texto pegado) o se ha perdido. */
export async function leerJustificante(
  id: string,
): Promise<{ nombre: string; tipo: string; ruta: string } | { texto: string } | null> {
  const fila = await prisma.cotizacionProveedor.findUnique({ where: { id } });
  if (!fila) return null;
  if (fila.ruta) {
    try {
      await fs.access(fila.ruta);
      return { nombre: fila.nombre ?? "cotizacion", tipo: fila.tipoFichero ?? "application/octet-stream", ruta: fila.ruta };
    } catch {
      // Sin fichero: si hay texto pegado, eso es el justificante.
    }
  }
  return fila.textoPegado ? { texto: fila.textoPegado } : null;
}
