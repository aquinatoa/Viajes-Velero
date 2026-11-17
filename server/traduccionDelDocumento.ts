/**
 * La traducción de lo que cambia en cada propuesta: el desglose, las condiciones
 * de cada hotel, las notas de quien cotiza.
 *
 * Decisión de Oravia (23/09/2026): idiomas «por IA, con un modelo barato para
 * traducir», el presupuesto «en el idioma en que llegó la solicitud» y las
 * condiciones de hotel en catalán, traducidas. Los rótulos fijos no pasan por
 * aquí: están traducidos a mano en `src/domain/idiomaDelDocumento.ts`.
 *
 * Cómo se hace para que no dé sustos:
 *   · Cada texto se traduce UNA vez y se guarda (`storage/traducciones/<idioma>.json`).
 *     El PDF, la página del enlace y cualquier versión posterior dicen lo mismo,
 *     y abrir el enlace no vuelve a llamar al modelo.
 *   · Una traducción solo se acepta si conserva todas las cifras del original
 *     (precios, noches, personas). La que no, se vuelve a pedir una vez; si sigue
 *     sin conservarlas, ese texto sale en castellano y se apunta para no volver a
 *     preguntarlo: mejor una frase sin traducir que un precio cambiado.
 *   · Los nombres de alojamientos y actividades no se traducen.
 *   · Si el modelo no está configurado o falla, el documento ENTERO sale en
 *     castellano y se dice por qué: nunca a medias.
 */
import fs from "node:fs";
import path from "node:path";

import {
  NOMBRE_DEL_IDIOMA,
  conTextosTraducidos,
  conservaLasCifras,
  textosTraducibles,
  type IdiomaDelDocumento,
} from "../src/domain/idiomaDelDocumento";
import { preguntarAlModelo } from "./cotizacionDelProveedor";

/** Los nombres propios del documento: el alojamiento y la actividad. */
const NO_SE_TRADUCE = ["nombre"];
/** Traducir es una tarea corta: basta un modelo ligero. TRADUCCION_IA_MODEL lo cambia. */
const MODELO_POR_DEFECTO = "claude-haiku-5-5";
const POR_LLAMADA = 14;

const carpetaPorDefecto = () => path.resolve(process.env.ORAVIA_STORAGE_DIR || path.join(process.cwd(), "storage"), "traducciones");

/** Quien traduce: recibe los textos y devuelve sus traducciones, en el mismo orden. */
export type Traductor = (textos: string[], idioma: IdiomaDelDocumento) => Promise<string[]>;

/** En el fichero de traducciones, un texto que se intentó y no se pudo traducir: no se vuelve a preguntar. */
const SIN_TRADUCCION = "";

const SISTEMA =
  "Eres traductor profesional de una agencia de viajes de grupos escolares y deportivos. Traduces del castellano (o del catalán) " +
  "textos de un presupuesto: precios, desgloses, condiciones de hoteles y de actividades. Respondes SOLO con JSON válido.";

async function traducirConElModelo(textos: string[], idioma: IdiomaDelDocumento): Promise<string[]> {
  const prompt = [
    `Traduce al ${NOMBRE_DEL_IDIOMA[idioma]} cada uno de estos ${textos.length} textos de un presupuesto de viaje.`,
    "",
    "Reglas:",
    "- Devuelve exactamente el mismo número de textos y en el mismo orden.",
    "- No cambies NINGUNA cifra: precios, importes, número de personas, de noches, fechas, porcentajes. Deja los importes con su formato («8.971,04 €»).",
    "- Escribe las cantidades con cifras, igual que el original: «4 nights», «25 pax», no «four nights».",
    "- No traduzcas nombres propios: hoteles, campings, parques, actividades con nombre comercial, localidades, referencias.",
    "- Las siglas de pensión se explican en el idioma: PC = pensión completa, MP = media pensión, AD = alojamiento y desayuno, SA = solo alojamiento.",
    "- Registro formal y natural, como lo escribiría una agencia. Sin añadir ni quitar información, sin comentarios.",
    "- Si un texto ya está en ese idioma, devuélvelo igual.",
    "",
    'Formato de la respuesta: {"traducciones": ["…", "…"]}',
    "",
    "Textos:",
    JSON.stringify(textos, null, 1),
  ].join("\n");
  const respuesta = (await preguntarAlModelo([], prompt, SISTEMA, (process.env.TRADUCCION_IA_MODEL ?? "").trim() || MODELO_POR_DEFECTO)) as { traducciones?: unknown };
  const lista = Array.isArray(respuesta?.traducciones) ? respuesta.traducciones : null;
  if (!lista || lista.length !== textos.length) throw new Error("El traductor no devolvió todos los textos.");
  return lista.map((t) => (typeof t === "string" ? t : ""));
}

function leerGuardadas(fichero: string): Record<string, string> {
  try {
    const leido = JSON.parse(fs.readFileSync(fichero, "utf8")) as unknown;
    return leido && typeof leido === "object" ? (leido as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export interface TextosTraducidos {
  /** Original → traducción. Solo los que tienen una traducción válida. */
  mapa: Map<string, string>;
  /** Los que se quedan en castellano porque su traducción no conservaba las cifras o vino vacía. */
  sinTraducir: string[];
}

/**
 * Traduce los textos que falten y devuelve todos. Lanza si el traductor falla:
 * quien llama decide (el documento sale entonces en castellano).
 */
export async function traducirTextos(
  textos: string[],
  idioma: IdiomaDelDocumento,
  traductor: Traductor = traducirConElModelo,
  carpeta: string = carpetaPorDefecto(),
): Promise<TextosTraducidos> {
  const mapa = new Map<string, string>();
  const sinTraducir: string[] = [];
  if (idioma === "es" || textos.length === 0) return { mapa, sinTraducir };

  const fichero = path.join(carpeta, `${idioma}.json`);
  const guardadas = leerGuardadas(fichero);
  const faltan: string[] = [];
  for (const t of textos) {
    if (typeof guardadas[t] !== "string") faltan.push(t);
    else if (guardadas[t] === SIN_TRADUCCION) sinTraducir.push(t);
    else mapa.set(t, guardadas[t]);
  }

  let nuevas = 0;
  /** Traduce una lista por tandas y devuelve los que no han pasado la comprobación. */
  const pasada = async (lista: string[]): Promise<string[]> => {
    const fallidos: string[] = [];
    for (let i = 0; i < lista.length; i += POR_LLAMADA) {
      const tanda = lista.slice(i, i + POR_LLAMADA);
      const traducidos = await traductor(tanda, idioma);
      tanda.forEach((original, k) => {
        const traducido = (traducidos[k] ?? "").trim();
        if (traducido && conservaLasCifras(original, traducido)) {
          mapa.set(original, traducido);
          guardadas[original] = traducido;
          nuevas += 1;
        } else {
          fallidos.push(original);
        }
      });
    }
    return fallidos;
  };
  // Lo que no pasa a la primera se pide otra vez; lo que tampoco, se queda en castellano y apuntado.
  const alSegundoIntento = await pasada(faltan);
  for (const original of alSegundoIntento.length ? await pasada(alSegundoIntento) : []) {
    sinTraducir.push(original);
    guardadas[original] = SIN_TRADUCCION;
    nuevas += 1;
  }
  if (nuevas > 0) {
    fs.mkdirSync(carpeta, { recursive: true });
    const provisional = `${fichero}.${process.pid}.tmp`;
    fs.writeFileSync(provisional, JSON.stringify(guardadas, null, 1), "utf8");
    fs.renameSync(provisional, fichero);
  }
  return { mapa, sinTraducir };
}

export interface DocumentoEnIdioma<T> {
  documento: T;
  /** El idioma en que sale de verdad: el pedido o, si no se pudo traducir, castellano. */
  idioma: IdiomaDelDocumento;
  /** Qué ha pasado, cuando no ha salido redondo. Para el registro y para quien cotiza. */
  aviso: string | null;
}

/** El documento del cliente en su idioma. No lanza nunca: si no se puede traducir, sale en castellano. */
export async function documentoEnIdioma<T>(
  documento: T,
  idioma: IdiomaDelDocumento,
  traductor?: Traductor,
  carpeta?: string,
): Promise<DocumentoEnIdioma<T>> {
  if (idioma === "es") return { documento, idioma, aviso: null };
  try {
    const { mapa, sinTraducir } = await traducirTextos(textosTraducibles(documento, NO_SE_TRADUCE), idioma, traductor, carpeta);
    return {
      documento: conTextosTraducidos(documento, mapa, NO_SE_TRADUCE),
      idioma,
      aviso: sinTraducir.length
        ? `${sinTraducir.length} ${sinTraducir.length === 1 ? "texto se queda" : "textos se quedan"} en castellano: su traducción al ${NOMBRE_DEL_IDIOMA[idioma]} cambiaba alguna cifra.`
        : null,
    };
  } catch (error) {
    const motivo = error instanceof Error ? error.message : "error desconocido";
    return { documento, idioma: "es", aviso: `No se pudo traducir al ${NOMBRE_DEL_IDIOMA[idioma]} (${motivo}): el documento sale en castellano.` };
  }
}
