import path from "node:path";
import XLSXModule from "xlsx";
import type {
  AiCandidateActivityRate,
  AiCandidatePolicy,
  AiDetectedActivity,
  AiDocumentAnalysisResult,
} from "../src/domain/documentImportTypes";

const XLSX = XLSXModule as typeof import("xlsx");

/**
 * La plantilla de actividades de Oravia, leída sin IA.
 *
 * «PLANTILLA REVISAT COTIZADOR ACTIVITATS» es SU hoja estándar: una fila por
 * actividad, columnas fijas (proveedor, zona, categoría, actividad, grupo,
 * edad, duración, unidad, condiciones, gratuidades, cancelación, pagos,
 * temporada, coste y precio de venta). La v2 del 07/10/2026 trae 130 filas de
 * 14 proveedores. No hay nada que interpretar: es una tabla.
 *
 * Leerla con el modelo era «índice + una llamada por producto», y aquí cada
 * fila es un producto: 130 llamadas, unos 10 $ de la cuenta de Javier, más de
 * diez minutos, y la lectura de la v1 falló dos veces (sin saldo, y después
 * con una respuesta que no era JSON). Este lector la vuelca en un segundo,
 * sin gastar un token, con el número de fila de cada precio.
 *
 * Qué entra y qué no:
 * - `Actividad` → nombre; `Proveedor / Centro` → proveedor; `Zona` → lugar;
 *   `Categoría` → tipo; `Duración`, `Edad`, `Grupo (pax)` → la tarifa.
 * - `neto venta` → precio de venta; `Cost` → coste. `Markup` y `Margen` son
 *   cálculo interno suyo y no se cargan: salen de los dos anteriores.
 * - `Gratuidades`, `Descuento`, `Cancelación`, `Reducción de plazas`, `Pago
 *   reserva/final` y `Ratio monitores` → condiciones DE ESA actividad, no del
 *   documento: cada proveedor tiene las suyas.
 * - `Observaciones` y `Contacto` → descripción de la actividad.
 *
 * Si la hoja no tiene esas columnas, no es la plantilla y se devuelve null:
 * la lectura sigue por el camino de siempre.
 */

/** Cabeceras que identifican la plantilla. Se comparan sin tildes ni mayúsculas. */
const COLUMNAS = {
  proveedor: /^proveedor/,
  zona: /^zona/,
  categoria: /^categoria/,
  actividad: /^actividad/,
  grupo: /^grupo/,
  edad: /^edad/,
  duracion: /^duracion/,
  unidad: /^unidad/,
  observaciones: /^observaciones/,
  gratuidades: /^gratuidades/,
  ratio: /^ratio/,
  descuento: /^descuento/,
  pagoReserva: /^pago reserva/,
  pagoFinal: /^pago final/,
  cancelacion: /^cancelacion/,
  reduccion: /^reduccion/,
  temporada: /^temporada/,
  contacto: /^contacto/,
  coste: /^cost/,
  venta: /^neto venta|^precio venta|^pvp/,
} as const;

type Columna = keyof typeof COLUMNAS;

/** Sin estas tres no es la plantilla. */
const OBLIGATORIAS: Columna[] = ["actividad", "proveedor", "venta"];

export function normalizarTexto(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function texto(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
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

/** Encuentra la fila de cabecera y qué columna es cada cosa. */
export function detectarCabecera(
  filas: unknown[][],
): { fila: number; columnas: Partial<Record<Columna, number>> } | null {
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
    if (OBLIGATORIAS.every((c) => columnas[c] !== undefined)) {
      return { fila: indice, columnas };
    }
  }
  return null;
}

/** «pax/actividad», «grupo de 8 pax», «por hora»… → la unidad de la app. */
export function unidadDeTarifa(valor: string | null): string {
  const u = normalizarTexto(valor);
  if (!u) return "PER_PAX";
  if (/grupo|equipo|team/.test(u)) return "PER_GROUP";
  if (/hora/.test(u)) return "PER_HOUR";
  if (/dia/.test(u)) return "PER_DAY";
  if (/pax|persona|alumno/.test(u)) return "PER_PAX";
  if (/servicio|sesion/.test(u)) return "PER_SERVICE";
  return "UNKNOWN";
}

/**
 * «Hasta 10 pax», «De 25 a 50 pax», «Mínimo 25 pax», «Grupos de 8 pax»,
 * «Mín. 8 - máx. 20 pax», «Menos de 30 pax», «20 a 60 alumnos».
 */
export function tamanoDeGrupo(valor: string | null): { minPax: number | null; maxPax: number | null } {
  const g = normalizarTexto(valor);
  if (!g) return { minPax: null, maxPax: null };
  const numeros = (g.match(/\d+/g) ?? []).map(Number);
  if (numeros.length === 0) return { minPax: null, maxPax: null };

  // «De 10 a 25-30 pax»: el menor es el mínimo y el mayor, el máximo.
  if (numeros.length >= 2) {
    return { minPax: Math.min(...numeros), maxPax: Math.max(...numeros) };
  }
  const [n] = numeros;
  if (/hasta|max|menos de/.test(g)) return { minPax: null, maxPax: /menos de/.test(g) ? n - 1 : n };
  if (/min|desde|a partir|mas de/.test(g)) return { minPax: n, maxPax: null };
  if (/grupos? de|equipos? de/.test(g)) return { minPax: n, maxPax: n };
  return { minPax: n, maxPax: null };
}

/** El año de vigencia: «2027», «Curso escolar 2026-2027», «Del 01/05/2027 al…». */
export function anoDeTemporada(valor: string | null): number | null {
  const anos = (valor ?? "").match(/20\d\d/g);
  if (!anos || anos.length === 0) return null;
  return Math.max(...anos.map(Number));
}

function recortar(valor: string, max: number): string {
  return valor.length <= max ? valor : valor.slice(0, max - 1) + "…";
}

interface FilaLeida {
  numero: number;
  proveedor: string;
  actividad: string;
  celda: (c: Columna) => string | null;
  venta: number | null;
  coste: number | null;
}

/**
 * Lee la plantilla. Devuelve null si el fichero no es una hoja de cálculo o
 * no tiene la forma de la plantilla; nunca lanza por eso.
 */
export function leerPlantillaDeActividades(
  filePath: string | null | undefined,
  controlName: string,
  /** El año de control del documento: vale para las filas sin temporada. */
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
    const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
      header: 1,
      blankrows: true,
      defval: "",
      raw: true,
    });
    const cabecera = detectarCabecera(filas);
    if (!cabecera) continue;
    return volcarHoja(filas, cabecera, nombreHoja, controlName, controlYear);
  }
  return null;
}

function volcarHoja(
  filas: unknown[][],
  cabecera: { fila: number; columnas: Partial<Record<Columna, number>> },
  nombreHoja: string,
  controlName: string,
  controlYear: number | null,
): AiDocumentAnalysisResult {
  const warnings: string[] = [];
  const leidas: FilaLeida[] = [];

  for (let i = cabecera.fila + 1; i < filas.length; i += 1) {
    const fila = filas[i] ?? [];
    const celda = (c: Columna) => {
      const posicion = cabecera.columnas[c];
      return posicion === undefined ? null : texto(fila[posicion]);
    };
    const actividad = celda("actividad");
    const proveedor = celda("proveedor");
    const vacia = fila.every((v) => texto(v) === null);
    if (vacia) continue;
    if (!actividad) {
      warnings.push(`Fila ${i + 1}: sin nombre de actividad, se ha saltado.`);
      continue;
    }
    const ventaPos = cabecera.columnas.venta;
    const costePos = cabecera.columnas.coste;
    const venta = ventaPos === undefined ? null : numero(fila[ventaPos]);
    const coste = costePos === undefined ? null : numero(fila[costePos]);
    if (venta === null && coste === null) {
      warnings.push(`Fila ${i + 1} («${actividad}»): sin precio de venta ni coste. Se carga, pero sale «a consultar».`);
    }
    leidas.push({ numero: i + 1, proveedor: proveedor ?? "", actividad, celda, venta, coste });
  }

  // Una actividad es (nombre, proveedor). «Banana» existe en Salou, en
  // Cambrils y en Calella: si se llamaran igual, el staging juntaría sus
  // precios bajo una sola. El proveedor va al nombre solo cuando hace falta.
  const proveedoresPorNombre = new Map<string, Set<string>>();
  for (const f of leidas) {
    const clave = normalizarTexto(f.actividad);
    proveedoresPorNombre.set(clave, (proveedoresPorNombre.get(clave) ?? new Set()).add(f.proveedor));
  }
  const nombreDe = (f: FilaLeida) =>
    (proveedoresPorNombre.get(normalizarTexto(f.actividad))?.size ?? 0) > 1 && f.proveedor
      ? `${f.actividad} · ${f.proveedor}`
      : f.actividad;

  const actividades = new Map<string, AiDetectedActivity>();
  const tarifas: AiCandidateActivityRate[] = [];
  const politicas: AiCandidatePolicy[] = [];
  const politicasVistas = new Set<string>();

  for (const f of leidas) {
    const nombre = nombreDe(f);
    if (!actividades.has(nombre)) {
      const descripcion = [
        f.celda("observaciones"),
        f.celda("contacto") ? `Contacto: ${f.celda("contacto")}` : null,
      ]
        .filter(Boolean)
        .join(" ");
      actividades.set(nombre, {
        activityName: nombre,
        supplierName: f.proveedor || null,
        locationMain: f.celda("zona"),
        activityType: f.celda("categoria"),
        durationText: f.celda("duracion"),
        descriptionText: descripcion || null,
      });
    }

    const grupo = f.celda("grupo");
    const edad = f.celda("edad");
    const temporada = f.celda("temporada");
    const { minPax, maxPax } = tamanoDeGrupo(grupo);
    const variante = [grupo, edad].filter(Boolean).join(" · ");
    tarifas.push({
      activityName: nombre,
      rateUnit: unidadDeTarifa(f.celda("unidad")),
      year: anoDeTemporada(temporada) ?? controlYear,
      seasonName: temporada,
      currency: "EUR",
      salePvpAmount: f.venta,
      costNetAmount: f.coste,
      durationText: f.celda("duracion"),
      ageLabel: variante || null,
      minPax,
      maxPax,
      // La cita de origen, con la fila: «mira la fila 214» es una instrucción.
      // El staging no guarda el número de fila aparte, así que va aquí.
      rawText: `${recortar(
        [f.actividad, variante || null, f.venta !== null ? `${f.venta} €` : null].filter(Boolean).join(" · "),
        60 - ` · fila ${f.numero}`.length,
      )} · fila ${f.numero}`,
      sourceRow: f.numero,
    });

    // Las condiciones son de la actividad. La misma actividad con varias filas
    // (varios tamaños de grupo) las repite: se guardan una vez.
    const condiciones: Array<[string, string | null, string]> = [
      ["SPECIAL_NOTES", f.celda("gratuidades"), "Gratuidades"],
      ["SPECIAL_NOTES", f.celda("descuento"), "Descuento"],
      ["SPECIAL_NOTES", f.celda("ratio"), "Ratio de monitores"],
      ["CANCELLATION", f.celda("cancelacion"), "Cancelación total"],
      ["CANCELLATION", f.celda("reduccion"), "Reducción de plazas"],
    ];
    const reserva = f.celda("pagoReserva");
    const final = f.celda("pagoFinal");
    if (reserva || final) {
      condiciones.push([
        "PAYMENT",
        [reserva ? `${reserva}% al reservar` : null, final ? `${final}% al final` : null].filter(Boolean).join(", "),
        "Pago",
      ]);
    }
    for (const [tipo, valor, etiqueta] of condiciones) {
      if (!valor) continue;
      const policyText = `${etiqueta}: ${valor}`;
      const clave = `${nombre}||${policyText}`;
      if (politicasVistas.has(clave)) continue;
      politicasVistas.add(clave);
      politicas.push({ policyType: tipo, policyText, rawText: null, activityName: nombre });
    }
  }

  const proveedores = new Set(leidas.map((f) => f.proveedor).filter(Boolean));
  const documentSummary =
    `«${controlName}»: plantilla de actividades de Oravia (hoja «${nombreHoja}»), leída sin IA. ` +
    `${leidas.length} fila(s) con precio de ${actividades.size} actividad(es) y ${proveedores.size} proveedor(es).`;

  return {
    mode: "plantilla",
    documentSummary,
    detectedAccommodation: null,
    detectedAccommodations: [],
    detectedActivities: [...actividades.values()],
    candidateRates: [],
    candidateActivityRates: tarifas,
    candidateSupplements: [],
    candidatePolicies: politicas,
    candidateBlackoutDates: [],
    warnings,
    // No es una estimación: cada dato sale de su celda.
    confidence: 1,
    usage: null,
    rawModelOutput: null,
  };
}
