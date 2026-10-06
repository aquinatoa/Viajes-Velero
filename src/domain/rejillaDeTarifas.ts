/**
 * Las tarifas publicadas de un producto, en forma de tabla.
 *
 * El catálogo enseñaba treinta líneas iguales salvo el precio:
 *
 *     2027 · PC · 2027-03-28 → 2027-05-21 · 35,32 €
 *     2027 · MP · 2027-05-22 → 2027-06-04 · 35,64 €
 *     …
 *
 * Nadie lee eso. Una tarifa de hotel es una tabla —periodos en las filas,
 * régimen y ocupación en las columnas— y a esa forma se devuelve aquí. Y si
 * dos tarifas caen en la misma celda, se enseñan las dos y se avisa: es la
 * señal de que falta la dimensión que las distingue, no algo que esconder.
 *
 * Las actividades no tienen periodo propio: PortAventura lo mete en la
 * etiqueta, «Júnior/Primaria · Entrada · Periodo A». Se parte por « · »: el
 * trozo que habla de periodo o temporada va a las columnas, el primero a las
 * filas, y lo de en medio (el tipo de entrada) agrupa columnas.
 *
 * Todo puro: recibe tarifas, devuelve filas, columnas y celdas.
 */

export interface TarifaDeCatalogo {
  id: string;
  year: number;
  label?: string | null;
  period?: string | null;
  currency?: string | null;
  amount?: number | null;
  seasonName?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  boardType?: string | null;
  occupancyLabel?: string | null;
  includedService?: string | null;
  clientSegment?: string | null;
  minNights?: number | null;
  tariffUnit?: string | null;
  ageLabel?: string | null;
  durationText?: string | null;
}

export interface Celda {
  importes: number[];
  currency: string | null;
  ids: string[];
}

export interface GrupoDeColumnas {
  nombre: string;
  columnas: string[];
}

export interface Rejilla {
  /** Qué hay en las filas, para el encabezado: «Periodo», «Tramo»… */
  ejeFilas: string;
  filas: string[];
  grupos: GrupoDeColumnas[];
  celda: (fila: string, grupo: string, columna: string) => Celda | null;
  /** Celdas con más de un precio: falta lo que las distingue. */
  celdasAmbiguas: number;
  /** Lo que es igual en todas las tarifas y no hace falta repetir en la tabla. */
  comun: string[];
  /** Año de todas las tarifas, cuando es uno solo. */
  year: number | null;
}

const REGIMEN: Record<string, string> = {
  PC: "Pensión completa",
  MP: "Media pensión",
  AD: "Alojamiento y desayuno",
  SA: "Solo alojamiento",
};
const ORDEN_REGIMEN = ["SA", "AD", "MP", "PC"];

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «2027-03-28» → «28 mar». La fecha ISO sale de la API; el año va en la cabecera. */
export function fechaCorta(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1] ?? m[2]}`;
}

/** La etiqueta de un periodo: temporada si la hay, y las fechas cortas. */
export function etiquetaDePeriodo(t: TarifaDeCatalogo): string {
  const desde = fechaCorta(t.dateFrom);
  const hasta = fechaCorta(t.dateTo);
  const fechas = desde && hasta ? `${desde} → ${hasta}` : desde ? `desde ${desde}` : hasta ? `hasta ${hasta}` : null;
  const temporada = (t.seasonName ?? "").trim();
  // La temporada que ya es un rango de fechas ISO no aporta nada sobre las fechas.
  const temporadaUtil = temporada && !/^\d{4}-\d{2}-\d{2}/.test(temporada) ? temporada : null;
  if (temporadaUtil && fechas) return `${temporadaUtil} · ${fechas}`;
  if (temporadaUtil) return temporadaUtil;
  if (fechas) return fechas;
  if (temporada) return temporada;
  return t.period?.trim() || "Todo el año";
}

export function etiquetaDeRegimen(codigo: string | null | undefined): string {
  const c = (codigo ?? "").trim();
  return REGIMEN[c.toUpperCase()] ?? c;
}

function texto(v: unknown): string {
  return String(v ?? "").trim();
}

function unicos(valores: string[]): string[] {
  const out: string[] = [];
  for (const v of valores) if (!out.includes(v)) out.push(v);
  return out;
}

/** Orden de las filas de periodo: por fecha de inicio si se puede, si no como vienen. */
function ordenarPeriodos(tarifas: TarifaDeCatalogo[], etiquetas: string[]): string[] {
  const inicio = new Map<string, string>();
  for (const t of tarifas) {
    const e = etiquetaDePeriodo(t);
    if (!inicio.has(e)) inicio.set(e, t.dateFrom ?? "");
  }
  return [...etiquetas].sort((a, b) => {
    const ia = inicio.get(a) ?? "";
    const ib = inicio.get(b) ?? "";
    if (ia && ib && ia !== ib) return ia < ib ? -1 : 1;
    return 0;
  });
}

interface Clasificada {
  fila: string;
  grupo: string;
  columna: string;
  t: TarifaDeCatalogo;
}

/** Rejilla de un alojamiento: periodos × (régimen × ocupación / servicio). */
export function rejillaDeAlojamiento(tarifas: TarifaDeCatalogo[]): Rejilla | null {
  if (tarifas.length === 0) return null;

  const regimenes = unicos(tarifas.map((t) => texto(t.boardType)));
  const ocupaciones = unicos(tarifas.map((t) => texto(t.occupancyLabel)));
  const servicios = unicos(tarifas.map((t) => texto(t.includedService)));
  const canales = unicos(tarifas.map((t) => texto(t.clientSegment)));

  // Lo que no varía no merece columna: va a «comun».
  const comun: string[] = [];
  if (regimenes.length === 1 && regimenes[0]) comun.push(etiquetaDeRegimen(regimenes[0]));
  if (ocupaciones.length === 1 && ocupaciones[0]) comun.push(ocupaciones[0]);
  if (servicios.length === 1 && servicios[0]) comun.push(servicios[0]);
  if (canales.length === 1 && canales[0] && canales[0] !== "GENERIC") comun.push(`canal ${canales[0]}`);
  const unidades = unicos(tarifas.map((t) => texto(t.tariffUnit))).filter(Boolean);
  if (unidades.length === 1) comun.push(unidades[0]);
  const noches = unicos(tarifas.map((t) => texto(t.minNights))).filter(Boolean);
  if (noches.length === 1) comun.push(`mínimo ${noches[0]} noche${noches[0] === "1" ? "" : "s"}`);

  const clasificadas: Clasificada[] = tarifas.map((t) => {
    const partesColumna: string[] = [];
    if (ocupaciones.length > 1) partesColumna.push(texto(t.occupancyLabel) || "sin ocupación");
    if (servicios.length > 1) partesColumna.push(texto(t.includedService) || "sin servicio");
    if (canales.length > 1) partesColumna.push(texto(t.clientSegment) || "sin canal");
    return {
      fila: etiquetaDePeriodo(t),
      grupo: regimenes.length > 1 ? etiquetaDeRegimen(t.boardType) || "sin régimen" : "",
      columna: partesColumna.join(" · ") || "Precio",
      t,
    };
  });

  return construir("Periodo", clasificadas, {
    ordenarFilas: (f) => ordenarPeriodos(tarifas, f),
    ordenarGrupos: (g) =>
      [...g].sort((a, b) => {
        const codigo = (nombre: string) => Object.entries(REGIMEN).find(([, v]) => v === nombre)?.[0] ?? nombre;
        const ia = ORDEN_REGIMEN.indexOf(codigo(a));
        const ib = ORDEN_REGIMEN.indexOf(codigo(b));
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      }),
    comun,
  });
}

const PERIODO = /periodo|temporada|^t\.\s*(baja|media|alta)/i;

/**
 * Rejilla de una actividad. La etiqueta suele llevar varias cosas separadas
 * por « · »: «Júnior/Primaria · Entrada · Periodo A». Filas: el primer trozo.
 * Columnas: el trozo de periodo. Grupo: lo que quede en medio.
 */
export function rejillaDeActividad(tarifas: TarifaDeCatalogo[]): Rejilla | null {
  if (tarifas.length === 0) return null;

  const clasificadas: Clasificada[] = tarifas.map((t) => {
    const etiqueta = texto(t.ageLabel) || texto(t.label);
    const partes = etiqueta.split("·").map((p) => p.trim()).filter(Boolean);
    const iPeriodo = partes.findIndex((p) => PERIODO.test(p));
    const periodo = iPeriodo >= 0 ? partes[iPeriodo] : "";
    const resto = partes.filter((_, i) => i !== iPeriodo);
    const fila = resto[0] ?? etiqueta ?? "Precio";
    const grupo = resto.slice(1).join(" · ");
    const periodoDeFechas = etiquetaDePeriodo({ ...t, period: null });
    return {
      fila,
      grupo,
      columna: periodo || (periodoDeFechas !== "Todo el año" ? periodoDeFechas : "") || "Precio",
      t,
    };
  });

  const comun: string[] = [];
  const duraciones = unicos(tarifas.map((t) => texto(t.durationText))).filter(Boolean);
  if (duraciones.length === 1) comun.push(duraciones[0]);
  const canales = unicos(tarifas.map((t) => texto(t.clientSegment))).filter(Boolean);
  if (canales.length === 1 && canales[0] !== "GENERIC") comun.push(`canal ${canales[0]}`);

  return construir("Tramo", clasificadas, { comun });
}

function construir(
  ejeFilas: string,
  clasificadas: Clasificada[],
  opciones: {
    ordenarFilas?: (filas: string[]) => string[];
    ordenarGrupos?: (grupos: string[]) => string[];
    comun: string[];
  },
): Rejilla {
  let filas = unicos(clasificadas.map((c) => c.fila));
  if (opciones.ordenarFilas) filas = opciones.ordenarFilas(filas);

  let nombresDeGrupo = unicos(clasificadas.map((c) => c.grupo));
  if (opciones.ordenarGrupos) nombresDeGrupo = opciones.ordenarGrupos(nombresDeGrupo);
  const grupos: GrupoDeColumnas[] = nombresDeGrupo.map((nombre) => ({
    nombre,
    columnas: unicos(clasificadas.filter((c) => c.grupo === nombre).map((c) => c.columna)),
  }));

  const celdas = new Map<string, Celda>();
  for (const c of clasificadas) {
    const clave = `${c.fila}||${c.grupo}||${c.columna}`;
    const celda = celdas.get(clave) ?? { importes: [], currency: c.t.currency ?? null, ids: [] };
    if (typeof c.t.amount === "number") celda.importes.push(c.t.amount);
    celda.ids.push(c.t.id);
    celdas.set(clave, celda);
  }
  for (const celda of celdas.values()) celda.importes.sort((a, b) => a - b);

  const years = unicos(clasificadas.map((c) => String(c.t.year)));

  return {
    ejeFilas,
    filas,
    grupos,
    celda: (fila, grupo, columna) => celdas.get(`${fila}||${grupo}||${columna}`) ?? null,
    celdasAmbiguas: [...celdas.values()].filter((c) => c.importes.length > 1).length,
    comun: opciones.comun,
    year: years.length === 1 ? Number(years[0]) : null,
  };
}
