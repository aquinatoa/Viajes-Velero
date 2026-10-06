/**
 * La cita de origen por número de fila, para hojas de cálculo.
 *
 * Cada precio del catálogo abre «el fragmento literal del que salió», y la
 * máquina comprueba que el importe esté en ese fragmento. Eso es `rawText`, y
 * en un PDF no hay otra forma de tenerlo: el texto extraído sale en el orden
 * interno del fichero, con los precios intercalados con los días del
 * calendario, así que el modelo tiene que ver la página y citar.
 *
 * En una hoja de cálculo pasa lo contrario. El texto extraído ya es una tabla
 * con filas numeradas y estables:
 *
 *     12 | Club Nàutic Salou | Salou · Puerto deportivo | Pack 2 actividades | Vela + kayak | …
 *
 * Ahí la cita puede ser el NÚMERO de fila, y el literal se reconstruye desde la
 * extracción que ya está guardada. La persona que revisa ve exactamente lo
 * mismo; el modelo deja de copiarnos lo que ya tenemos.
 *
 * Este módulo no decide nada sobre el modelo: solo sabe leer filas por número
 * y rellenar `rawText` donde venga `sourceRow` y falte el literal. Se aplica
 * siempre que el texto tenga filas; sin filas no hace nada.
 */

import type { AiDocumentAnalysisResult } from "../src/domain/documentImportTypes";

/** Una fila del texto tabulado: «12 | celda | celda». */
const FILA = /^\s*(\d+)\s*\|\s?(.*)$/;

/** Cuánto literal se guarda como cita. El prompt pide 60; aquí cabe algo más. */
const MAX_LITERAL = 160;

/** ¿El texto extraído tiene forma de hoja con filas numeradas? */
export function tieneFilas(texto: string): boolean {
  let encontradas = 0;
  for (const linea of texto.split("\n")) {
    if (FILA.test(linea) && ++encontradas >= 2) return true;
  }
  return false;
}

/**
 * Índice número de fila → literal de la fila, sin el número ni el separador
 * inicial. Se construye una vez por documento; leer el texto entero por cada
 * candidato sería cuadrático con 700 tarifas.
 */
export function indiceDeFilas(texto: string): Map<number, string> {
  const filas = new Map<number, string>();
  for (const linea of texto.split("\n")) {
    const m = FILA.exec(linea);
    if (!m) continue;
    const numero = Number(m[1]);
    if (!Number.isInteger(numero) || filas.has(numero)) continue;
    filas.set(numero, m[2].trim());
  }
  return filas;
}

/**
 * El literal de una fila, compactado para servir de cita: celdas vacías
 * fuera, espacios normalizados, y recortado con «…» si se pasa.
 */
export function literalDeFila(filas: Map<number, string>, numero: number): string | null {
  const cruda = filas.get(numero);
  if (cruda === undefined) return null;
  const celdas = cruda
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);
  const literal = celdas.join(" · ").replace(/\s+/g, " ").trim();
  if (!literal) return null;
  return literal.length > MAX_LITERAL ? literal.slice(0, MAX_LITERAL - 1) + "…" : literal;
}

interface ConCita {
  rawText?: string | null;
  sourceRow?: number | null;
}

/**
 * Rellena `rawText` desde `sourceRow` en todo candidato que traiga fila y no
 * traiga literal. No pisa un `rawText` que el modelo ya haya puesto: si citó
 * algo, eso manda. Devuelve cuántos ha rellenado, para poder contarlo.
 */
export function completarCitasDesdeFilas(
  analisis: AiDocumentAnalysisResult,
  textoExtraido: string,
): number {
  if (!tieneFilas(textoExtraido)) return 0;
  const filas = indiceDeFilas(textoExtraido);
  let rellenados = 0;

  const completar = (candidatos: ConCita[]) => {
    for (const c of candidatos) {
      if (c.rawText && c.rawText.trim()) continue;
      if (c.sourceRow === null || c.sourceRow === undefined) continue;
      const literal = literalDeFila(filas, c.sourceRow);
      if (!literal) continue;
      c.rawText = literal;
      rellenados += 1;
    }
  };

  completar(analisis.candidateRates);
  completar(analisis.candidateActivityRates);
  completar(analisis.candidateSupplements);
  completar(analisis.candidateBlackoutDates);
  return rellenados;
}
