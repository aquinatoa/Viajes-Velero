import path from "node:path";
import XLSXModule from "xlsx";
import type {
  AiCandidatePolicy,
  AiCandidateRate,
  AiCandidateSupplement,
  AiDetectedAccommodation,
  AiDocumentAnalysisResult,
} from "../src/domain/documentImportTypes";
import { normalizarTexto } from "./plantillaDeActividades";

const XLSX = XLSXModule as typeof import("xlsx");

/**
 * La plantilla de hoteles de Oravia («TARIFES REVISADES HOTELS 2027»), leída
 * sin IA.
 *
 * Es SU hoja estándar: una fila por tarifa, 41 columnas fijas (hotel,
 * observaciones, suplementos, tasa turística, bebidas, depósitos, fianza,
 * pagos, descuento/gratuidades, contacto, plazas, ratio de monitores, edad,
 * cancelaciones, periodo, días aplicables, mínimo de noches, temporada,
 * unidad, tipo de alojamiento, capacidad, régimen, habitación, coste y neto
 * de venta). Hasta el 20/10/2026 se leía con el modelo y por el camino se
 * perdían las fechas de los periodos (Planas, Viella, L'Orri), los tramos
 * segundos y terceros de cada temporada (Canada Palace), los días aplicables
 * (Jaca), el tipo de unidad… Anthony: «si el archivo lo tiene, ese dato tiene
 * que estar, ser visible y se tiene que emplear».
 *
 * Qué entra y a dónde:
 * - `Nombre de Hotel` → alojamiento (la localidad y las estrellas, del nombre).
 * - `Periodo` → UNA tarifa por tramo de fechas («15/03–24/03 · 29/03–28/05 ·
 *   03/10–31/10 · 4 noches o más» son tres), con sus fechas y su mínimo de
 *   noches; lo que no son fechas («Enero · Marzo · Abril 2027», «Período A»,
 *   «29/03 · 4, 5 y 9/04») se guarda en el nombre de la temporada y lo lee
 *   `fechasDeTarifa` al cotizar.
 * - `Días aplicables` («Domingo a Jueves», «Noche de viernes o sábado») → al
 *   nombre de la temporada; «Estancia de 2 o 3 noches» → mínimo de noches.
 * - `BOD / Fechas especiales` («Mínimo 2 noches») → mínimo de noches.
 * - `Régimen`, `Habitación`, `Tipo de alojamiento` (unidad), `Unidad de
 *   tarifa`, `Capacidad`, `Cost`, `neto venta` → la tarifa.
 * - `Suplementos`, `Tasa turística`, `Fianza` → suplementos del hotel.
 * - `Descuento` (gratuidades), depósitos y pagos, cancelaciones, bebidas,
 *   ratio de monitores, edad, plazas, release, contacto, observaciones →
 *   condiciones del hotel, cada una con su tipo.
 *
 * Si la hoja no tiene esas columnas, no es la plantilla y se devuelve null.
 */

const COLUMNAS = {
  hotel: /^nombre de hotel|^hotel$|^alojamiento$/,
  observaciones: /^observaciones/,
  suplementos: /^suplementos/,
  ocupacion: /^ocupacion/,
  release: /^release/,
  tasa: /^tasa turistica \(/,
  tasaCondiciones: /^tasa turistica cond/,
  bebidas: /^bebidas/,
  depositos: /^depositos$/,
  fianza: /^fianza/,
  depositoConfirmacion: /^deposito confirmaci/,
  pago30: /^pago 30/,
  pagoFinal: /^pago final \(%\)/,
  pagoFinalDias: /^pago final \(d/,
  descuento: /^descuento/,
  contacto: /^contacto/,
  banda: /^banda de plazas/,
  minimoPlazas: /^minimo plazas/,
  margenBajada: /^margen bajada/,
  cargoPlaza: /^cargo plaza/,
  confirmacionPlazas: /^confirmacion plazas/,
  ratio: /^ratio/,
  edad: /^edad/,
  cancelacion4530: /^cancelacion 45/,
  modificaciones: /^modificaciones/,
  cancelacion30: /^cancelacion <30|^cancelacion menos/,
  periodo: /^periodo$/,
  dias: /^dias aplicables/,
  bod: /^bod/,
  temporada: /^temporada/,
  unidad: /^unidad de tarifa/,
  tipoAlojamiento: /^tipo de alojamiento/,
  capacidad: /^capacidad/,
  regimen: /^regimen/,
  habitacion: /^habitacion/,
  markup: /^markup/,
  coste: /^cost$|^coste$/,
  netoVenta: /^neto venta/,
  netoAzul: /^neto azul/,
} as const;

type Columna = keyof typeof COLUMNAS;
const OBLIGATORIAS: Columna[] = ["hotel", "temporada", "regimen", "habitacion", "netoVenta"];

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  const limpio = String(valor).replace(/\s+/g, " ").trim();
  return limpio.length > 0 ? limpio : null;
}

function numero(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string") {
    const limpio = valor.replace(/[^0-9.,-]/g, "").replace(",", ".");
    if (!limpio) return null;
    const n = Number(limpio);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

function detectarCabecera(filas: unknown[][]): { fila: number; columnas: Partial<Record<Columna, number>> } | null {
  for (const [indice, fila] of filas.slice(0, 20).entries()) {
    const columnas: Partial<Record<Columna, number>> = {};
    (fila ?? []).forEach((celda, posicion) => {
      const cabecera = normalizarTexto(celda);
      if (!cabecera) return;
      for (const [nombre, patron] of Object.entries(COLUMNAS) as [Columna, RegExp][]) {
        if (columnas[nombre] === undefined && patron.test(cabecera)) {
          columnas[nombre] = posicion;
          return;
        }
      }
    });
    if (OBLIGATORIAS.every((c) => columnas[c] !== undefined)) return { fila: indice, columnas };
  }
  return null;
}

// ── El periodo: tramos de fechas, mínimo de noches y lo que queda en el nombre ──

interface Tramo {
  desde: string | null;
  hasta: string | null;
  /** Lo que se pone en el nombre de la temporada para este tramo. */
  texto: string;
}

const dos = (n: number) => String(n).padStart(2, "0");
const iso = (a: number, m: number, d: number) => `${a}-${dos(m)}-${dos(d)}`;
const anioDe = (txt: string | undefined, porDefecto: number | null): number | null => {
  if (!txt) return porDefecto;
  const n = Number(txt);
  return txt.length === 2 ? 2000 + n : n;
};

/** «4 noches o más» → 4; «3 noches» → 3; «1 y 2 noches» → 1; «Mínimo 2 noches» → 2. */
function minimoDeNoches(txt: string | null | undefined): number | null {
  const t = normalizarTexto(txt);
  if (!t) return null;
  const oMas = /(\d+)\s*noches?\s*o\s*mas|(\d+)\+\s*noches|min(?:imo|\.)?\s*(\d+)\s*noches|a partir de\s*(\d+)\s*noches/.exec(t);
  if (oMas) return Number(oMas[1] ?? oMas[2] ?? oMas[3] ?? oMas[4]);
  const rango = /(\d+)\s*(?:y|o|a|-|–)\s*(\d+)\s*noches/.exec(t);
  if (rango) return Math.min(Number(rango[1]), Number(rango[2]));
  const exacto = /(?:^|\s)(\d+)\s*noches?(?:\s|$)/.exec(t);
  if (exacto) return Number(exacto[1]);
  return null;
}

/** Quita del texto del periodo lo que es el mínimo de noches. */
function sinNoches(txt: string): string {
  return txt
    .replace(/·?\s*\d+\s*noches?\s*o\s*m[aá]s/gi, "")
    .replace(/·?\s*\d+\s*(?:y|o)\s*\d+\s*noches?/gi, "")
    .replace(/·?\s*\d+\s*noches?/gi, "")
    .replace(/\s*·\s*$/, "")
    .replace(/^\s*·\s*/, "")
    .trim();
}

/**
 * Los tramos de fechas del periodo. «15/03–24/03 · 29/03–28/05» (año de
 * control), «01/10/26–31/10/26», «30/09/2026–30/05/2027 (excepto
 * 21/03/2027–28/03/2027)» (se parte en dos). Sin fechas, un tramo sin
 * fechas con el texto entero.
 */
function tramosDelPeriodo(periodo: string, anio: number | null): Tramo[] {
  const patron = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*[–-]\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/g;
  const excepto = /\(?\s*(?:excepto|exc\.)\s*([^)]*)\)?/i.exec(periodo);
  const base = excepto ? periodo.slice(0, excepto.index) : periodo;
  const tramos: Tramo[] = [];
  for (const m of base.matchAll(patron)) {
    const a1 = anioDe(m[3], anio);
    let a2 = anioDe(m[6], a1);
    if (a1 === null || a2 === null) continue;
    const m1 = Number(m[2]), d1 = Number(m[1]), m2 = Number(m[5]), d2 = Number(m[4]);
    if (!m[6] && m2 < m1) a2 = a1 + 1;
    tramos.push({ desde: iso(a1, m1, d1), hasta: iso(a2, m2, d2), texto: m[0].replace(/\s+/g, "") });
  }
  if (tramos.length === 0) return [{ desde: null, hasta: null, texto: periodo.trim() }];

  // Las excepciones con fechas parten el tramo que las contiene.
  if (excepto) {
    const exc = [...excepto[1].matchAll(patron)].map((m) => {
      const a1 = anioDe(m[3], anio), a2 = anioDe(m[6], a1);
      return a1 && a2 ? { desde: iso(a1, Number(m[2]), Number(m[1])), hasta: iso(a2, Number(m[5]), Number(m[4])) } : null;
    });
    for (const e of exc) {
      if (!e) continue;
      for (let i = tramos.length - 1; i >= 0; i--) {
        const t = tramos[i];
        if (!t.desde || !t.hasta || e.hasta < t.desde || e.desde > t.hasta) continue;
        const partes: Tramo[] = [];
        if (e.desde > t.desde) partes.push({ desde: t.desde, hasta: diaAntes(e.desde), texto: `${t.texto} (hasta ${diaAntes(e.desde).slice(8, 10)}/${e.desde.slice(5, 7)})` });
        if (e.hasta < t.hasta) partes.push({ desde: diaDespues(e.hasta), hasta: t.hasta, texto: `${t.texto} (desde ${diaDespues(e.hasta).slice(8, 10)}/${diaDespues(e.hasta).slice(5, 7)})` });
        tramos.splice(i, 1, ...partes);
      }
    }
  }
  return tramos;
}

function diaAntes(isoDia: string): string {
  const d = new Date(`${isoDia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function diaDespues(isoDia: string): string {
  const d = new Date(`${isoDia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ── Suplementos: del texto de la columna, uno por trozo con importe ──

export interface SuplementoLeido {
  tipo: "suplemento" | "descuento";
  concept: string;
  amountType: string;
  amount: number;
  conditionText: string | null;
  appliesPer: string | null;
}

export interface SuplementosLeidos {
  suplementos: SuplementoLeido[];
  /** Frases de la celda sin importe («Sábanas INCLUIDAS, toallas NO incluidas»): son condiciones, no se pierden. */
  notas: string[];
}

const IMPORTE = /([+-]?\d+(?:[.,]\d+)?)\s*(%|€)/g;
const TIENE_IMPORTE = /\d+(?:[.,]\d+)?\s*(?:%|€)/;
const MESES = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/i;
/** Lo que va pegado al importe y dice a qué se aplica: «/pax/noche», «por noche y persona», «/juego», «pax i estada». */
const UNIDAD =
  /^\s*(?:(?:\/|por|y|i|x)?\s*(?:pax|personas?|alumnos?|estudiantes?|ni[ñn][oa]s?|hab(?:itaci[oó]n)?\.?|noches?|d[ií]as?|estada|estancia|servicio|comida|apartamento|bungalow|cama|juego|grupo|merienda|unidad)\b\s*)+/i;

const limpiar = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s,.;:·–-]+|[\s,.;:·–-]+$/g, "").trim();
const sinParentesis = (s: string) => {
  const m = /^\((.*)\)$/.exec(s.trim());
  return m ? m[1].trim() : s.trim();
};
const sinSupl = (s: string) => s.replace(/^supl(?:emento|\.)?\s*/i, "").trim();
const valor = (n: string) => Math.abs(Number(n.replace(",", ".")));
const tipoDe = (signo: string) => (signo === "%" ? "porcentaje" : "importe");

/** «/pax/noche» → pax/noche; «por noche y habitación» → habitación/noche; «/juego» → juego. Sin unidad, null: no se inventa. */
function aplicaA(unidad: string, concepto: string): string | null {
  const u = normalizarTexto(unidad);
  const noche = /noche|\bdia/.test(u);
  const hab = /\bhab/.test(u);
  const persona = /pax|persona|alumno|estudiante|nin/.test(u);
  if (hab && noche) return "habitación/noche";
  if (persona && noche) return "pax/noche";
  if (/servicio|comida|merienda/.test(u)) return "pax/servicio";
  if (/estancia|estada/.test(u)) return "estancia";
  if (persona) return "pax";
  if (noche) return "noche";
  const otra = /apartamento|bungalow|cama|juego|grupo|unidad|hab/.exec(u);
  if (otra) return otra[0] === "hab" ? "habitación" : otra[0];
  const c = normalizarTexto(concepto);
  if (/\(por pax\)|por persona/.test(c)) return /por comida|servicio/.test(c) ? "pax/servicio" : "pax";
  return null;
}

/**
 * Un trozo con importe: «Individual +75% s/múltiple», «2 noches +5€/pax/noche».
 * `prefijo` es la etiqueta de la frase («Corta estancia: 1 noche +7€ · 2 noches +5€»).
 */
function leerTrozo(trozo: string, prefijo: string | null): SuplementoLeido[] {
  // El signo menos de «−8€» es dato (descuento): no se limpia por delante.
  const t = trozo.replace(/−/g, "-").replace(/\s+/g, " ").replace(/^[\s,.;:·–]+|^-\s+/, "").replace(/[\s,.;:·–-]+$/, "").trim();
  const importes = [...t.matchAll(IMPORTE)];
  if (importes.length === 0) return [];
  const primero = importes[0];
  const antes = sinSupl(limpiar(t.slice(0, primero.index)));
  const concept = prefijo ? (antes ? `${prefijo}: ${antes}` : prefijo) : antes || "Suplemento";
  let resto = t.slice((primero.index ?? 0) + primero[0].length);
  const unidad = UNIDAD.exec(resto);
  resto = limpiar(unidad ? resto.slice(unidad[0].length) : resto);
  const tipo: "suplemento" | "descuento" = primero[1].startsWith("-") || /^(dto|descuento)/i.test(concept) ? "descuento" : "suplemento";
  const base = { tipo, concept, amountType: tipoDe(primero[2]), amount: valor(primero[1]), appliesPer: aplicaA(unidad?.[0] ?? "", concept) };

  // «+10% en todos los períodos, excepto 12/06–25/06 +15%» → el general y el del periodo.
  const excepto = /^(.*?)\bexcepto\s+([^,;]+?)\s*([+-]?\d+(?:[.,]\d+)?)\s*(%|€)$/i.exec(resto);
  if (excepto) {
    return [
      { ...base, conditionText: limpiar(`${excepto[1]} excepto ${excepto[2]}`) },
      { ...base, concept: `${concept} en ${excepto[2].trim()}`, amountType: tipoDe(excepto[4]), amount: valor(excepto[3]), conditionText: `Periodo ${excepto[2].trim()}` },
    ];
  }
  // «13 €(esc)/16 €(ad)» → uno para escolares y otro para adultos.
  const dosPublicos = /^\(([^)]+)\)\s*\/\s*(\d+(?:[.,]\d+)?)\s*(€|%)\s*\(([^)]+)\)$/.exec(resto);
  if (dosPublicos) {
    return [
      { ...base, concept: `${concept} (${dosPublicos[1]})`, conditionText: null },
      { ...base, concept: `${concept} (${dosPublicos[4]})`, amountType: tipoDe(dosPublicos[3]), amount: valor(dosPublicos[2]), conditionText: null },
    ];
  }
  // «desayuno: adultos 8 €, niños 4 €» → el segundo público con su importe.
  const segundo = /^([^\d€%]{2,30}?)\s*(\d+(?:[.,]\d+)?)\s*(€|%)$/.exec(resto);
  if (segundo && prefijo) {
    return [
      { ...base, conditionText: null },
      { ...base, concept: `${prefijo}: ${limpiar(segundo[1])}`, amountType: tipoDe(segundo[3]), amount: valor(segundo[2]), conditionText: null },
    ];
  }
  return [{ ...base, conditionText: resto ? sinParentesis(resto) : null }];
}

/**
 * «Supl. individual +50% s/régimen · estudiantes en doble +25%. Estancia 1-2
 * noches: +10% en todos los períodos, excepto 12/06–25/06 +15%.» → cuatro
 * suplementos: individual 50 %, doble estudiantes 25 %, estancia 1-2 noches
 * 10 % (excepto 12/06–25/06) y estancia 1-2 noches en 12/06–25/06 15 %.
 * Lo que no lleva importe («Tarifa ya incluye…», «Sábanas INCLUIDAS») sale
 * como nota.
 */
export function leerSuplementos(txt: string | null): SuplementosLeidos {
  if (!txt) return { suplementos: [], notas: [] };
  if (txt.includes("////")) return leerSuplementosConBarras(txt);
  const suplementos: SuplementoLeido[] = [];
  const notas: string[] = [];
  const frases = txt.replace(/\s+/g, " ").split(/\.\s+(?=[A-ZÁÉÍÓÚ(·])/).map(limpiar).filter(Boolean);
  for (const frase of frases) {
    // Avisos, no suplementos: «Tarifa ya incluye…», «ACTUALIZADO…», «Desglose…».
    if (/^(tarifa ya incluye|ya incluye|actualizado|desglose)/i.test(frase) || !TIENE_IMPORTE.test(frase)) {
      notas.push(frase);
      continue;
    }
    const partes = frase.split(/\s*·\s*|;\s*/).map(limpiar).filter(Boolean);
    // «Corta estancia: 1 noche +7€/pax · 2 noches +5€/pax/noche»: la etiqueta
    // de la primera parte vale para las que empiezan por número.
    let prefijo: string | null = null;
    const etiqueta = /^([^:+€%]{3,60}?):\s*(.+)$/.exec(partes[0]);
    if (etiqueta && !TIENE_IMPORTE.test(etiqueta[1])) {
      prefijo = sinSupl(limpiar(etiqueta[1])) || null;
      partes[0] = etiqueta[2];
    }
    partes.forEach((parte, k) => {
      const suyo = k === 0 || /^\d/.test(parte) ? prefijo : null;
      if (!TIENE_IMPORTE.test(parte)) {
        notas.push(suyo ? `${suyo}: ${parte}` : parte);
        return;
      }
      suplementos.push(...leerTrozo(parte, suyo));
    });
  }
  return { suplementos, notas };
}

/**
 * Camping Platja: «Sábanas (opcional) (por pax) -- ABRIL / MAYO / OCTUBRE (…)
 * -- 6€ //// JUNIO / SEPTIEMBRE (…) -- 6€ //// Toallas …». Cada importe lleva
 * delante su periodo y, si cambia, su concepto.
 */
function leerSuplementosConBarras(txt: string): SuplementosLeidos {
  const [cuerpo, ...notasExtra] = txt.replace(/\s+/g, " ").split(/\s*·\s*(?=ACTUALIZADO)/i);
  const suplementos: SuplementoLeido[] = [];
  let concepto = "";
  for (const pieza of cuerpo.split(/\s*\/\/\/\/\s*/)) {
    const re = /(.*?)(\d+(?:[.,]\d+)?)\s*€/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(pieza))) {
      const texto = m[1].replace(/\s*--\s*/g, " -- ").trim();
      const mes = MESES.exec(texto);
      const antes = limpiar((mes ? texto.slice(0, mes.index) : texto).replace(/--/g, " "));
      const periodo = mes ? limpiar(texto.slice(mes.index).replace(/--/g, " ")) : "";
      if (antes) concepto = antes;
      const unidad = /\((por [^)]*)\)/i.exec(concepto);
      suplementos.push({
        tipo: "suplemento",
        concept: concepto.replace(/\s*\(por [^)]*\)/gi, "").trim(),
        amountType: "importe",
        amount: valor(m[2]),
        conditionText: periodo || null,
        appliesPer: aplicaA(unidad?.[1] ?? "", concepto),
      });
    }
  }
  return { suplementos, notas: notasExtra.map(limpiar).filter(Boolean) };
}

/**
 * «SA (solo alojamiento)» → SA; «ALOJAMIENTO CON MP (menores ≤16)» → MP y
 * «menores ≤16» como servicio incluido; «MP + Picnic» se queda como está.
 */
export function regimenYExtra(celdaRegimen: string | null): { codigo: string | null; extra: string | null } {
  if (!celdaRegimen) return { codigo: null, extra: null };
  const m = /^(?:alojamiento\s+(?:con|amb)\s+)?(PC|MP|AD|SA)\s*(?:\((.*)\))?$/i.exec(celdaRegimen.trim());
  if (!m) return { codigo: celdaRegimen, extra: null };
  const extra = (m[2] ?? "").trim();
  const expansion = /^(solo alojamiento|media pensi[oó]n|pensi[oó]n completa|alojamiento y desayuno)$/i.test(extra);
  return { codigo: m[1].toUpperCase(), extra: extra && !expansion ? extra : null };
}

/** «Fianza de 75 € por apartamento» → apartamento; «Depósito 20€/pax» → pax. */
function fianzaPor(texto: string | null): string | null {
  const n = normalizarTexto(texto ?? "");
  if (/apartament|bungalow/.test(n)) return "apartamento";
  if (/grupo/.test(n)) return "grupo";
  if (/pax|alumno|persona/.test(n)) return "pax";
  return null;
}

/** «Tasa turística 0,88 €/adulto, no incluida» → 0.88. */
function importeEnTexto(texto: string | null): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*€/.exec(texto ?? "");
  return m ? valor(m[1]) : null;
}

/** «Hotel Planas 3* (Salou)» → Salou; «Hotel Cesar Augustus 3* (Salou/Cambrils)» → Salou/Cambrils. */
function localidadDelNombre(nombre: string): string | null {
  const parentesis = [...nombre.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim());
  for (const p of parentesis.reverse()) {
    if (p.length <= 40 && !/\d|resort|park|hotel|apart|playa park|premium|roulette|pax/i.test(p)) return p;
  }
  const guion = /[–-]\s*([A-ZÁÉÍÓÚ][\w' ]+?(?:\s*(?:&|y|\/)\s*[A-ZÁÉÍÓÚ][\w' ]+?)?)\s*\(/.exec(nombre);
  if (guion && guion[1].length <= 40) return guion[1].replace(/\s*&\s*/g, " / ").trim();
  return null;
}

function estrellasDelNombre(nombre: string): string | null {
  const m = /(\d)\s*\*/.exec(nombre);
  return m ? `${m[1]}*` : null;
}

/** Lee la plantilla. Devuelve null si no es una hoja de cálculo con esa forma. */
export function leerPlantillaDeHoteles(
  filePath: string | null | undefined,
  controlName: string,
  controlYear: number | null = null,
): AiDocumentAnalysisResult | null {
  if (!filePath) return null;
  const extension = path.extname(filePath).toLowerCase();
  if (![".xlsx", ".xlsm", ".xls", ".csv"].includes(extension)) return null;
  let libro: ReturnType<typeof XLSX.readFile>;
  try {
    libro = XLSX.readFile(filePath, { cellDates: true });
  } catch {
    return null;
  }
  for (const nombreHoja of libro.SheetNames) {
    const hoja = libro.Sheets[nombreHoja];
    if (!hoja) continue;
    const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, blankrows: true, defval: "", raw: true });
    const cabecera = detectarCabecera(filas);
    if (!cabecera) continue;
    return volcarHoja(filas, cabecera, controlName, controlYear);
  }
  return null;
}

function volcarHoja(
  filas: unknown[][],
  cabecera: { fila: number; columnas: Partial<Record<Columna, number>> },
  controlName: string,
  controlYear: number | null,
): AiDocumentAnalysisResult {
  const warnings: string[] = [];
  const hoteles = new Map<string, AiDetectedAccommodation>();
  const tarifas: AiCandidateRate[] = [];
  const suplementos: AiCandidateSupplement[] = [];
  const politicas: AiCandidatePolicy[] = [];
  const suplementosVistos = new Set<string>();
  const politicasVistas = new Set<string>();
  let filasLeidas = 0;
  let columnasLeidas = 0;
  const columnasConDato = new Set<Columna>();

  for (let i = cabecera.fila + 1; i < filas.length; i += 1) {
    const fila = filas[i] ?? [];
    const celda = (c: Columna): string | null => {
      const pos = cabecera.columnas[c];
      return pos === undefined ? null : texto(fila[pos]);
    };
    const num = (c: Columna): number | null => {
      const pos = cabecera.columnas[c];
      return pos === undefined ? null : numero(fila[pos]);
    };
    if (fila.every((v) => texto(v) === null)) continue;
    const hotel = celda("hotel");
    if (!hotel) {
      warnings.push(`Fila ${i + 1}: sin nombre de hotel, se ha saltado.`);
      continue;
    }
    filasLeidas += 1;
    for (const c of Object.keys(COLUMNAS) as Columna[]) if (celda(c) !== null) columnasConDato.add(c);

    if (!hoteles.has(hotel)) {
      hoteles.set(hotel, {
        accommodationName: hotel,
        locality: localidadDelNombre(hotel),
        categoryType: estrellasDelNombre(hotel),
        accommodationType: null,
        providerName: null,
      });
    }

    // ── La tarifa: una por tramo de fechas ──
    const periodo = celda("periodo") ?? "";
    const temporada = celda("temporada") ?? "";
    const dias = celda("dias");
    const bod = celda("bod");
    const { codigo: regimen, extra: servicioIncluido } = regimenYExtra(celda("regimen"));
    const habitacion = celda("habitacion");
    const tipo = celda("tipoAlojamiento");
    const capacidad = celda("capacidad");
    const coste = num("coste");
    const neto = num("netoVenta");
    const netoAzul = num("netoAzul");
    const anio = (() => {
      const m = /20\d{2}/.exec(periodo) ?? /20\d{2}/.exec(temporada);
      return m ? Number(m[0]) : controlYear;
    })();
    if (neto === null && coste === null) {
      warnings.push(`Fila ${i + 1} («${hotel}»): sin precio de venta ni coste. Se carga, pero sale «a consultar».`);
    }
    const minNoches = minimoDeNoches(periodo) ?? minimoDeNoches(dias) ?? minimoDeNoches(bod);
    const textoPeriodo = sinNoches(periodo);
    const tramos = tramosDelPeriodo(textoPeriodo, anio);
    const diasTexto = dias && !/^todos?$/i.test(dias) ? dias : null;
    for (const tramo of tramos) {
      const seasonName = [temporada, tramo.texto, diasTexto].filter(Boolean).join(" · ");
      tarifas.push({
        accommodationName: hotel,
        seasonName,
        year: anio,
        dateFrom: tramo.desde,
        dateTo: tramo.hasta,
        boardType: regimen,
        includedService: servicioIncluido,
        occupancyLabel: habitacion,
        // La edad de la fila (Albergue de Jaca: «-14 años (tarifa escolar)» / «+14
        // años») distingue tarifas: va con el tipo de unidad, que es de la tarifa.
        unitName: [tipo, celda("edad"), capacidad ? `Capacidad ${capacidad}` : null].filter(Boolean).join(" · ") || null,
        rateUnit: celda("unidad"),
        minNights: minNoches,
        // «Mínimo plazas a pagar»: 25 en los campings de Salou.
        minPax: num("minimoPlazas"),
        currency: "EUR",
        pvpAmount: null,
        netAmount: neto === null ? null : redondear(neto),
        costAmount: coste === null ? null : redondear(coste),
        rawText: [
          `fila ${i + 1}`,
          temporada,
          periodo,
          diasTexto,
          bod,
          celda("regimen"),
          habitacion,
          tipo,
          capacidad ? `cap. ${capacidad}` : null,
          celda("unidad"),
          coste !== null && neto !== null ? `${coste}/${neto} €` : neto !== null ? `${neto} €` : null,
          netoAzul !== null ? `azul marino ${netoAzul} €` : null,
          celda("markup") ? `markup ${celda("markup")} %` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        sourceRow: i + 1,
      });
    }

    // ── Los suplementos del hotel (una vez por hotel) ──
    const poner = (s: AiCandidateSupplement) => {
      const clave = `${hotel}||${s.concept}||${s.amount ?? ""}||${s.conditionText ?? ""}`;
      if (suplementosVistos.has(clave)) return;
      suplementosVistos.add(clave);
      suplementos.push({ accommodationName: hotel, sourceRow: i + 1, ...s });
    };
    const leidos = leerSuplementos(celda("suplementos"));
    for (const s of leidos.suplementos) {
      poner({ adjustmentType: s.tipo, concept: s.concept, amountType: s.amountType, amount: s.amount, appliesPer: s.appliesPer, conditionText: s.conditionText, rawText: celda("suplementos") });
    }
    // Si la columna del importe está vacía pero el texto lo dice («0,88 €/adulto»), se lee del texto.
    const tasa = num("tasa") ?? importeEnTexto(celda("tasaCondiciones"));
    if (tasa !== null || celda("tasaCondiciones")) {
      poner({ adjustmentType: "tasa", concept: "Tasa turística", amountType: tasa !== null ? "importe" : null, amount: tasa, appliesPer: "pax/noche", conditionText: celda("tasaCondiciones"), rawText: celda("tasaCondiciones") });
    }
    const fianza = num("fianza");
    if (fianza !== null) {
      poner({ adjustmentType: "fianza", concept: "Fianza/depósito", amountType: "importe", amount: fianza, appliesPer: fianzaPor(celda("depositos")), conditionText: celda("depositos"), rawText: celda("depositos") });
    }

    // ── Las condiciones del hotel, cada una con su tipo (una vez por hotel) ──
    const condicion = (tipoCond: string, etiqueta: string, valorCrudo: string | null) => {
      if (!valorCrudo) return;
      // «Gratuidades: Gratuidades: 1 cada 25» → una sola vez.
      const valor = valorCrudo.replace(new RegExp(`^${etiqueta}\\s*:\\s*`, "i"), "").trim();
      if (!valor) return;
      const policyText = `${etiqueta}: ${valor}`;
      const clave = `${hotel}||${policyText}`;
      if (politicasVistas.has(clave)) return;
      politicasVistas.add(clave);
      politicas.push({ policyType: tipoCond, policyText, rawText: null, accommodationName: hotel });
    };
    condicion("GRATUITY", "Gratuidades", celda("descuento"));
    const pagos = [
      celda("depositoConfirmacion") ? `${celda("depositoConfirmacion")} % al confirmar` : null,
      celda("pago30") ? `${celda("pago30")} % a 30 días` : null,
      celda("pagoFinal") ? `${celda("pagoFinal")} % al final${celda("pagoFinalDias") ? ` (${celda("pagoFinalDias")} días antes)` : ""}` : null,
    ].filter(Boolean);
    condicion("PAYMENT", "Pago", pagos.length ? pagos.join(" · ") : null);
    condicion("PAYMENT", "Depósito", celda("depositos"));
    const canc30 = celda("cancelacion30");
    const cancelaciones = [
      celda("cancelacion4530") ? `de 45 a 30 días: ${celda("cancelacion4530")} %` : null,
      // La columna es «Cancelación <30 (%)»: un número solo es ese porcentaje.
      canc30 && /^\d+(?:[.,]\d+)?$/.test(canc30) ? `menos de 30 días: ${canc30} %` : canc30,
    ].filter(Boolean);
    condicion("CANCELLATION", "Cancelación", cancelaciones.length ? cancelaciones.join(" · ") : null);
    condicion("CANCELLATION", "Modificaciones", celda("modificaciones"));
    condicion("SPECIAL_NOTES", "Bebidas incluidas", celda("bebidas"));
    condicion("SPECIAL_NOTES", "Ratio de monitores", celda("ratio"));
    condicion("SPECIAL_NOTES", "Edad", celda("edad"));
    condicion("GROUP_SIZE", "Plazas", [
      celda("banda") ? `banda ${celda("banda")}` : null,
      celda("minimoPlazas") ? `mínimo ${celda("minimoPlazas")} plazas a pagar` : null,
      celda("margenBajada") ? `margen de bajada ${celda("margenBajada")} %` : null,
      celda("cargoPlaza") ? `cargo por plaza no ocupada ${celda("cargoPlaza")} €` : null,
      celda("confirmacionPlazas") ? `confirmación de plazas ${celda("confirmacionPlazas")} días antes` : null,
      celda("release") ? `release ${celda("release")} %` : null,
      celda("ocupacion") ? `ocupación ${celda("ocupacion")}` : null,
    ].filter(Boolean).join(" · ") || null);
    condicion("CONTACT", "Contacto", celda("contacto"));
    condicion("SPECIAL_NOTES", "Condiciones", celda("observaciones"));
    for (const nota of leidos.notas) condicion("SPECIAL_NOTES", "Suplementos", nota);
    columnasLeidas = Math.max(columnasLeidas, Object.keys(cabecera.columnas).length);
  }

  const sinLeer = (Object.keys(COLUMNAS) as Columna[]).filter((c) => cabecera.columnas[c] === undefined);
  const resumen =
    `Plantilla de hoteles de Oravia: ${hoteles.size} hoteles en ${filasLeidas} filas → ${tarifas.length} tarifas ` +
    `(una por tramo de fechas), ${suplementos.length} suplementos y ${politicas.length} condiciones. ` +
    `${columnasLeidas} columnas reconocidas; con dato: ${columnasConDato.size}.` +
    (sinLeer.length ? ` Sin reconocer: ${sinLeer.join(", ")}.` : "");
  const lista = [...hoteles.values()];
  return {
    mode: "plantilla",
    documentSummary: resumen,
    detectedAccommodation: lista[0] ?? null,
    detectedAccommodations: lista,
    detectedActivities: [],
    candidateRates: tarifas,
    candidateActivityRates: [],
    candidateSupplements: suplementos,
    candidatePolicies: politicas,
    candidateBlackoutDates: [],
    warnings,
    confidence: 1,
  };
}
