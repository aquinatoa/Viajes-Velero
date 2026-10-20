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

interface SuplementoLeido {
  concept: string;
  amountType: string;
  amount: number;
  conditionText: string | null;
  appliesPer: string | null;
}

/**
 * «Supl. individual +50% s/régimen · estudiantes en doble +25%. Estancia 1-2
 * noches: +10% en todos los períodos, excepto 12/06–25/06 +15%.» → cuatro
 * suplementos: individual 50 %, doble estudiantes 25 %, estancia 1-2 noches
 * 10 % (excepto 12/06–25/06) y estancia 1-2 noches en 12/06–25/06 15 %.
 */
function leerSuplementos(txt: string | null): SuplementoLeido[] {
  if (!txt) return [];
  const trozos = txt
    .split(/\s*·\s*|\.\s+(?=[A-ZÁÉÍÓÚ])|;\s*/)
    .map((t) => t.trim().replace(/\.$/, ""))
    .filter(Boolean);
  const salida: SuplementoLeido[] = [];
  const importe = /([+-]?\d+(?:[.,]\d+)?)\s*(%|€)/g;
  for (const trozo of trozos) {
    const importes = [...trozo.matchAll(importe)];
    if (importes.length === 0) continue;
    const primero = importes[0];
    const concepto = trozo.slice(0, primero.index).replace(/[:\s]+$/, "").replace(/^supl\.?\s*/i, "").trim() || trozo;
    const resto = trozo.slice(primero.index + primero[0].length).replace(/^[\s,:;]+/, "").trim();
    const tipo = primero[2] === "%" ? "porcentaje" : "importe";
    const valor = Math.abs(Number(primero[1].replace(",", ".")));
    const excepto = /^(.*?)\bexcepto\s+([^,;]+?)\s*([+-]?\d+(?:[.,]\d+)?)\s*(%|€)\s*$/i.exec(resto);
    if (excepto && importes.length >= 2) {
      salida.push({ concept: concepto, amountType: tipo, amount: valor, conditionText: `${excepto[1].trim()} excepto ${excepto[2].trim()}`.replace(/^excepto/, "excepto").trim(), appliesPer: aplicaA(trozo) });
      salida.push({
        concept: `${concepto} en ${excepto[2].trim()}`,
        amountType: excepto[4] === "%" ? "porcentaje" : "importe",
        amount: Math.abs(Number(excepto[3].replace(",", "."))),
        conditionText: `Periodo ${excepto[2].trim()}`,
        appliesPer: aplicaA(trozo),
      });
      continue;
    }
    salida.push({ concept: concepto, amountType: tipo, amount: valor, conditionText: resto || null, appliesPer: aplicaA(trozo) });
  }
  return salida;
}

function aplicaA(txt: string): string | null {
  const t = normalizarTexto(txt);
  if (/pax\/noche|persona y noche|por noche|\/noche/.test(t)) return "pax/noche";
  if (/estancia/.test(t)) return "estancia";
  if (/hab(itacion)?\b/.test(t) && /noche/.test(t)) return "habitación/noche";
  if (/pax|persona|alumno|estudiante/.test(t)) return "pax";
  return null;
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
    const regimen = celda("regimen");
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
        occupancyLabel: habitacion,
        // La edad de la fila (Albergue de Jaca: «-14 años (tarifa escolar)» / «+14
        // años») distingue tarifas: va con el tipo de unidad, que es de la tarifa.
        unitName: [tipo, celda("edad"), capacidad ? `Capacidad ${capacidad}` : null].filter(Boolean).join(" · ") || null,
        rateUnit: celda("unidad"),
        minNights: minNoches,
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
          regimen,
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
    for (const s of leerSuplementos(celda("suplementos"))) {
      poner({ adjustmentType: "suplemento", concept: s.concept, amountType: s.amountType, amount: s.amount, appliesPer: s.appliesPer, conditionText: s.conditionText, rawText: celda("suplementos") });
    }
    const tasa = num("tasa");
    if (tasa !== null || celda("tasaCondiciones")) {
      poner({ adjustmentType: "tasa", concept: "Tasa turística", amountType: tasa !== null ? "importe" : null, amount: tasa, appliesPer: "pax/noche", conditionText: celda("tasaCondiciones"), rawText: celda("tasaCondiciones") });
    }
    const fianza = num("fianza");
    if (fianza !== null) {
      poner({ adjustmentType: "fianza", concept: "Fianza/depósito", amountType: "importe", amount: fianza, appliesPer: "pax", conditionText: celda("depositos"), rawText: celda("depositos") });
    }

    // ── Las condiciones del hotel, cada una con su tipo (una vez por hotel) ──
    const condicion = (tipoCond: string, etiqueta: string, valor: string | null) => {
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
    const cancelaciones = [
      celda("cancelacion4530") ? `de 45 a 30 días: ${celda("cancelacion4530")} %` : null,
      celda("cancelacion30"),
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
