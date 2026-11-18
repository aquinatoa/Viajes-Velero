/**
 * Césped natural, artificial y bungalows: lo que pide un club y cómo se lee en
 * las tarifas.
 *
 * Nace de una prueba del 18/11/2026 con una petición real de suizos (FC
 * Weinfelden-Bürglen: «Natural Grass», «Bungalows», MSH). El cotizador cogía en
 * cada hotel la tarifa más barata —campo ARTIFICIAL en doble— y el requisito
 * salía como «— no consta». En Villa Bonita eso es 66 € por noche en vez de los
 * 78 € del campo natural: el presupuesto salía barato y con un campo que no
 * habían pedido. Es, casi seguro, el «Cambrils Park no acaba de subir bien al
 * cotizador» de Javier (16/11/2026).
 *
 * Lógica pura, sin pantalla ni base de datos: la usan la búsqueda (qué tarifa
 * representa al hotel) y «Lo que pidió el centro» (✓ / ✗ / —).
 */
import { claveDeRequisito } from "./requisitos";

export type Campo = "natural" | "artificial";

export interface LoQuePideElClub {
  /** El campo pedido, si lo dice. Si pide los dos, ninguno: no hay preferencia. */
  campo: Campo | null;
  bungalow: boolean;
}

const sinTildes = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** ¿Este requisito es de campo? «Natural Grass», «césped natural», «campo de hierba natural»… */
export function campoDelRequisito(requisito: string | null | undefined): Campo | null {
  // La clave junta inglés y español («natural grass» → «cesped natural»); el
  // texto plano recoge «campo natural», que la clave deja en «natural» a secas.
  const k = claveDeRequisito(requisito ?? "");
  const s = sinTildes(requisito);
  const de = (tipo: Campo) =>
    new RegExp(`\\bcesped ${tipo}\\b`).test(k) ||
    new RegExp(`\\b(campo|cesped|hierba|grass|pitch|turf|terreno)\\b.{0,12}\\b${tipo}\\b|\\b${tipo}\\b.{0,12}\\b(cesped|hierba|grass|pitch|turf)\\b`).test(s);
  const natural = de("natural");
  const artificial = de("artificial");
  if (natural && !artificial) return "natural";
  if (artificial && !natural) return "artificial";
  return null;
}

/** ¿Este requisito es de bungalows? */
export function esRequisitoDeBungalow(requisito: string | null | undefined): boolean {
  return /\bbungalow\b|\bmobil ?home\b/.test(claveDeRequisito(requisito ?? ""));
}

export function loQuePideElClub(requisitos: (string | null | undefined)[] | null | undefined): LoQuePideElClub {
  const campos = new Set((requisitos ?? []).map(campoDelRequisito).filter((c): c is Campo => c !== null));
  return {
    campo: campos.size === 1 ? [...campos][0] : null,
    bungalow: (requisitos ?? []).some(esRequisitoDeBungalow),
  };
}

/**
 * El campo que lleva una tarifa, por su «servicio incluido»: «Aloj + Campo
 * Natural / Fútbol Playa (1.30h)» es natural; «Campo artificial», artificial;
 * «Sin campo (acompañante)», ninguno.
 */
export function campoDeLaTarifa(servicio: string | null | undefined): Campo | "sin campo" | null {
  const s = sinTildes(servicio);
  if (!s.trim()) return null;
  if (/sin campo|acompan/.test(s)) return "sin campo";
  if (/natural|playa|beach/.test(s)) return "natural";
  if (/artificial/.test(s)) return "artificial";
  return null;
}

/** 1 si la tarifa lleva el campo que pide el club; 0 si no, o si no pide ninguno. */
export function afinidadConElCampo(servicio: string | null | undefined, pide: LoQuePideElClub): number {
  return pide.campo !== null && campoDeLaTarifa(servicio) === pide.campo ? 1 : 0;
}

/**
 * Alojamientos que son bungalows aunque su nombre no lo diga. Javier,
 * 17/11/2026: el «Bungalow» del Excel de suizos de Cambrils Park «es lo mismo»
 * que Villa Bonita / Aloha.
 */
const SON_BUNGALOWS = [/villa bonita/, /\baloha\b/];

/** ¿Es un bungalow? Por su nombre, su tipo o lo que dicen sus tarifas («1 PAX X BUNG»). */
export function esBungalow(textos: (string | null | undefined)[]): boolean {
  const t = sinTildes(textos.filter(Boolean).join(" · "));
  return /bungal|\bbung\b|mobil.?home/.test(t) || SON_BUNGALOWS.some((r) => r.test(t));
}
