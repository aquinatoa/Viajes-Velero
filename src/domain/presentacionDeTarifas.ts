/**
 * Cómo se presenta una rejilla de tarifas para que el ojo la lea: qué color
 * lleva cada régimen y cada temporada, cómo se parte la etiqueta larga de una
 * fila y cuándo una tabla ancha se reparte en una tabla por régimen.
 *
 * Nace de la captura de Anthony (11/11/2026) del Camping Platja Cambrils: una
 * tabla de 8 columnas casi todas en guiones, que obligaba a desplazarse de lado
 * y en la que «MEDIA PENSIÓN» y «PENSIÓN COMPLETA» no se distinguían.
 *
 * Todo puro: recibe textos y rejillas, devuelve claves. Los colores concretos
 * viven en el CSS; aquí solo se decide QUÉ tono corresponde a cada cosa.
 */
import type { Rejilla } from "./rejillaDeTarifas";

export type TonoDeRegimen = "sa" | "ad" | "mp" | "pc" | "";
export type TonoDeTemporada = "baja" | "media" | "alta" | "";

function sinTildes(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** «Media pensión» → `mp`. Vale con el nombre largo o con el código. */
export function tonoDeRegimen(nombre: string | null | undefined): TonoDeRegimen {
  const n = sinTildes(nombre ?? "");
  if (!n) return "";
  if (/pension completa|^pc$/.test(n)) return "pc";
  if (/media pension|^mp$/.test(n)) return "mp";
  if (/desayuno|^ad$/.test(n)) return "ad";
  if (/solo alojamiento|^sa$/.test(n)) return "sa";
  return "";
}

/** «T. baja», «Temporada alta», «T. Media» → su tono. Lo demás, sin tono. */
export function tonoDeTemporada(texto: string | null | undefined): TonoDeTemporada {
  const n = sinTildes(texto ?? "");
  if (!/^(t\.?|temporada)\s*(baja|media|alta)\b|^(baja|media|alta)$/.test(n)) return "";
  if (/baja/.test(n)) return "baja";
  if (/media/.test(n)) return "media";
  return "alta";
}

export interface PartesDePeriodo {
  /** «T. baja»: va como etiqueta de color. */
  temporada: string | null;
  tono: TonoDeTemporada;
  /** Lo que identifica la fila: «Estancia de 2 o 3 noches», «15 mar → 31 may». */
  principal: string;
  /** Lo que matiza: «ABRIL / MAYO / OCTUBRE (Excepto Semana Santa y puentes)». */
  detalle: string | null;
}

/**
 * Parte la etiqueta de una fila, que llega pegada con « · »:
 * «T. baja · ABRIL / MAYO (Excepto Semana Santa) · Estancia de 2 o 3 noches».
 * Antes salía como un párrafo de cuatro líneas dentro de una celda.
 */
export function partesDePeriodo(etiqueta: string): PartesDePeriodo {
  const partes = etiqueta
    .split(" · ")
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length === 0) return { temporada: null, tono: "", principal: etiqueta, detalle: null };
  const tono = tonoDeTemporada(partes[0]);
  const temporada = tono ? partes[0] : null;
  const resto = tono ? partes.slice(1) : partes;
  if (resto.length === 0) return { temporada: null, tono, principal: partes[0], detalle: null };
  if (resto.length === 1) return { temporada, tono, principal: resto[0], detalle: null };
  return { temporada, tono, principal: resto[resto.length - 1], detalle: resto.slice(0, -1).join(" · ") };
}

/** Más columnas que esto en una tabla con varios regímenes y ya no cabe sin desplazarse. */
export const MAX_COLUMNAS_EN_UNA_TABLA = 8;

/**
 * ¿Se reparte la tabla en una por régimen? Cuando hay varios regímenes y, juntos,
 * demasiadas columnas: cada régimen con su título y su color, sin scroll lateral.
 */
export function debePartirPorRegimen(rejilla: Pick<Rejilla, "grupos">): boolean {
  if (rejilla.grupos.length < 2) return false;
  if (!rejilla.grupos.every((g) => g.nombre)) return false;
  const columnas = rejilla.grupos.reduce((t, g) => t + g.columnas.length, 0);
  return columnas > MAX_COLUMNAS_EN_UNA_TABLA;
}
