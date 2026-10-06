/**
 * Comparar lo que el modelo extrae de un documento con lo que hay publicado.
 *
 * Los tres documentos publicados son verdad validada por personas: 34
 * alojamientos, 742 tarifas y 402 tarifas de actividad revisadas y aprobadas
 * en el catálogo. Releer esos documentos y contrastar lo extraído contra el
 * catálogo da precisión y cobertura reales, sin inventar nada. Es lo que
 * permite cambiar el prompt, el esfuerzo o el modelo sin fe.
 *
 * La comparación es tolerante a propósito. El catálogo guarda la tarifa como
 * «etiqueta · periodo · importe» y el modelo la devuelve como régimen,
 * ocupación, temporada e importe por separado, así que se comparan dos cosas:
 *
 *   - **Laxa**: mismo producto y mismo importe. Si el modelo pone el precio
 *     bueno en el producto bueno, la lectura sirve aunque etiquete distinto.
 *   - **Estricta**: además, que lo que describe el candidato (régimen,
 *     ocupación, temporada) comparta algo con la etiqueta publicada.
 *
 * Lo que de verdad importa son las dos cifras por documento: cuántas tarifas
 * publicadas aparecen (cobertura) y cuántas de las extraídas existen
 * (precisión). Y el desglose por producto, que es donde se ve si Caribe se ha
 * llevado las tarifas de Ferrari Land.
 */

import type { AiDocumentAnalysisResult } from "../src/domain/documentImportTypes";

export interface TarifaDeReferencia {
  producto: string;
  tipo: "ACCOMMODATION" | "ACTIVITY";
  etiqueta: string | null;
  periodo: string | null;
  importe: number;
}

export interface ResultadoDeComparacion {
  referencia: number;
  extraidas: number;
  /** Mismo producto y mismo importe. */
  laxa: Medida;
  /** Además, descripción compatible con la etiqueta publicada. */
  estricta: Medida;
  porProducto: Array<{
    producto: string;
    referencia: number;
    extraidas: number;
    encontradas: number;
    /** Importes publicados que no han salido. */
    faltan: number[];
    /** Importes extraídos que no están publicados para ese producto. */
    sobran: number[];
  }>;
}

export interface Medida {
  coincidencias: number;
  /** coincidencias / extraídas. 1 = todo lo extraído existe. */
  precision: number;
  /** coincidencias / referencia. 1 = no falta ninguna publicada. */
  cobertura: number;
}

/** Nombre normalizado para emparejar: sin acentos, sin signos, los 20 primeros caracteres. */
export function huella(nombre: string | null | undefined): string {
  return String(nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 20)
    .trim();
}

/** Palabras con las que se describe una tarifa, para la comparación estricta. */
function palabras(...trozos: Array<string | null | undefined>): Set<string> {
  const out = new Set<string>();
  for (const t of trozos) {
    for (const w of huella(t ?? "").split(" ")) if (w.length >= 2) out.add(w);
  }
  return out;
}

function comparten(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return true; // sin descripción no hay nada que contradecir
  for (const w of a) if (b.has(w)) return true;
  return false;
}

interface Candidata {
  producto: string;
  importe: number;
  descripcion: Set<string>;
}

function candidatasDe(analisis: AiDocumentAnalysisResult): Candidata[] {
  const out: Candidata[] = [];
  for (const r of analisis.candidateRates) {
    const importe = r.pvpAmount ?? r.netAmount ?? r.costAmount;
    if (importe === null || importe === undefined || !r.accommodationName) continue;
    out.push({
      producto: huella(r.accommodationName),
      importe: Math.round(importe * 100) / 100,
      descripcion: palabras(r.boardType, r.occupancyLabel, r.seasonName, r.includedService, r.unitName),
    });
  }
  for (const r of analisis.candidateActivityRates) {
    const importe = r.salePvpAmount ?? r.costNetAmount;
    if (importe === null || importe === undefined) continue;
    out.push({
      producto: huella(r.activityName),
      importe: Math.round(importe * 100) / 100,
      descripcion: palabras(r.seasonName, r.ageLabel, r.durationText, r.rateUnit),
    });
  }
  return out;
}

export function compararLectura(
  analisis: AiDocumentAnalysisResult,
  referencia: TarifaDeReferencia[],
): ResultadoDeComparacion {
  const candidatas = candidatasDe(analisis);
  const ref = referencia.map((r) => ({
    producto: huella(r.producto),
    nombre: r.producto,
    importe: Math.round(r.importe * 100) / 100,
    descripcion: palabras(r.etiqueta, r.periodo),
    usada: false,
  }));

  let laxas = 0;
  let estrictas = 0;
  const usadasEstrictas = new Set<number>();

  // Emparejar cada candidata con una referencia libre del mismo producto e
  // importe. Primero la estricta si la hay; si no, cualquiera laxa.
  for (const c of candidatas) {
    let elegida = -1;
    for (let i = 0; i < ref.length; i++) {
      const r = ref[i];
      if (r.usada || r.producto !== c.producto || r.importe !== c.importe) continue;
      if (comparten(c.descripcion, r.descripcion)) {
        elegida = i;
        break;
      }
      if (elegida < 0) elegida = i;
    }
    if (elegida < 0) continue;
    ref[elegida].usada = true;
    laxas += 1;
    if (comparten(c.descripcion, ref[elegida].descripcion)) {
      estrictas += 1;
      usadasEstrictas.add(elegida);
    }
  }

  const medida = (coincidencias: number): Medida => ({
    coincidencias,
    precision: candidatas.length ? Math.round((coincidencias / candidatas.length) * 1000) / 1000 : 0,
    cobertura: ref.length ? Math.round((coincidencias / ref.length) * 1000) / 1000 : 0,
  });

  // Desglose por producto, con los importes concretos que faltan y sobran.
  const productos = new Map<string, { nombre: string; ref: number[]; cand: number[] }>();
  for (const r of ref) {
    if (!productos.has(r.producto)) productos.set(r.producto, { nombre: r.nombre, ref: [], cand: [] });
    productos.get(r.producto)!.ref.push(r.importe);
  }
  for (const c of candidatas) {
    if (!productos.has(c.producto)) productos.set(c.producto, { nombre: c.producto, ref: [], cand: [] });
    productos.get(c.producto)!.cand.push(c.importe);
  }
  const porProducto = [...productos.values()].map((p) => {
    const refRest = [...p.ref];
    const sobran: number[] = [];
    let encontradas = 0;
    for (const importe of p.cand) {
      const i = refRest.indexOf(importe);
      if (i >= 0) {
        refRest.splice(i, 1);
        encontradas += 1;
      } else {
        sobran.push(importe);
      }
    }
    return {
      producto: p.nombre,
      referencia: p.ref.length,
      extraidas: p.cand.length,
      encontradas,
      faltan: refRest.sort((a, b) => a - b),
      sobran: sobran.sort((a, b) => a - b),
    };
  });
  porProducto.sort((a, b) => b.referencia - a.referencia || a.producto.localeCompare(b.producto));

  return {
    referencia: ref.length,
    extraidas: candidatas.length,
    laxa: medida(laxas),
    estricta: medida(estrictas),
    porProducto,
  };
}
