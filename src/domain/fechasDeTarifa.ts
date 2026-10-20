/**
 * Qué días vale una tarifa de hotel, leído de todo lo que trae el documento.
 *
 * Anthony, 20/10/2026: «si el archivo lo tiene, ese dato tiene que estar, ser
 * visible y se tiene que emplear». Las fechas de muchas tarifas no están (o no
 * enteras) en `dateFrom`/`dateTo`, pero sí en el nombre de la temporada:
 *
 * - Canada Palace: «T. Media (T2: 12/03-24/03 · 05/06-18/06 · 06/09-25/09)»,
 *   y solo se guardó el primer tramo.
 * - Cesar Augustus: «T. Alta · 9, 10, 14, 15, 16 y 17/06», días sueltos.
 * - Camping Platja: «T. alta – JUNIO / SEPTIEMBRE (Excepto San Juan y puentes)».
 * - Hotel Viella: «Febrero 2027 · Semana Santa».
 * - Ciudad de Jaca: «Única (2026–27) · Domingo a Jueves» / «Viernes a Sábado»:
 *   el precio va por el día de la semana en que empieza la noche.
 *
 * Aquí se juntan las fechas guardadas y las del nombre, y se dice si la tarifa
 * vale para una noche, si no vale, o si no se sabe (no hay fechas en ningún
 * sitio). Cálculo puro: lo usan la estancia y la búsqueda.
 */

export interface TarifaConFechas {
  seasonName?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface CoberturaDeTarifa {
  /** true / false, o null si la tarifa no dice qué días vale. */
  vale: (fechaISO: string) => boolean | null;
  /** Cuántos días del año cubre: la más específica manda (Semana Santa sobre T. Baja). */
  dias: number;
  /** De dónde salen las fechas. */
  origen: "fechas" | "nombre" | "sin fechas";
  /** El nombre dice «excepto…» y eso no se puede leer: hay que confirmarlo. */
  conExcepciones: boolean;
}

const normal = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const dia = (iso: string) => iso.slice(0, 10);

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// 0 = domingo, como getUTCDay.
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

/** Domingo de Pascua (algoritmo de Meeus/Butcher). */
function domingoDePascua(anio: number): Date {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), diaMes = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anio, mes - 1, diaMes));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Un tramo [desde, hasta] de mes-día; si desde > hasta, cruza el año. */
interface TramoMesDia {
  desde: [number, number];
  hasta: [number, number];
  /** Si el nombre trae el año, solo vale ese año. */
  anioDesde?: number;
  anioHasta?: number;
}

function enTramo(t: TramoMesDia, fecha: string): boolean {
  const anio = Number(fecha.slice(0, 4));
  const md = Number(fecha.slice(5, 7)) * 100 + Number(fecha.slice(8, 10));
  if (t.anioDesde && t.anioHasta) {
    const desde = `${t.anioDesde}-${String(t.desde[0]).padStart(2, "0")}-${String(t.desde[1]).padStart(2, "0")}`;
    const hasta = `${t.anioHasta}-${String(t.hasta[0]).padStart(2, "0")}-${String(t.hasta[1]).padStart(2, "0")}`;
    return desde <= dia(fecha) && dia(fecha) <= hasta;
  }
  void anio;
  const a = t.desde[0] * 100 + t.desde[1];
  const b = t.hasta[0] * 100 + t.hasta[1];
  return a <= b ? a <= md && md <= b : md >= a || md <= b;
}

function diasDeTramo(t: TramoMesDia): number {
  const base = (m: number, d: number) => Date.UTC(2027, m - 1, d);
  if (t.anioDesde && t.anioHasta) {
    return Math.round((Date.UTC(t.anioHasta, t.hasta[0] - 1, t.hasta[1]) - Date.UTC(t.anioDesde, t.desde[0] - 1, t.desde[1])) / 864e5) + 1;
  }
  const n = Math.round((base(t.hasta[0], t.hasta[1]) - base(t.desde[0], t.desde[1])) / 864e5) + 1;
  return n > 0 ? n : n + 365;
}

interface LecturaDelNombre {
  tramos: TramoMesDia[];
  /** Días sueltos «mes*100+día». */
  sueltos: Set<number>;
  meses: Set<number>;
  semanaSanta: boolean;
  /** Días de la semana en que empieza la noche; null = todos. */
  diasSemana: Set<number> | null;
  conExcepciones: boolean;
}

/** Lee del nombre de la temporada los tramos, días, meses y días de la semana. */
export function leerNombreDeTemporada(nombre: string | null | undefined): LecturaDelNombre {
  const t = normal(nombre);
  const r: LecturaDelNombre = {
    tramos: [],
    sueltos: new Set(),
    meses: new Set(),
    // «(Excepto Semana Santa y puentes)» no es Semana Santa: fuera paréntesis.
    semanaSanta: /semana santa/.test(t.replace(/\(.*?\)/g, " ")),
    diasSemana: null,
    conExcepciones: /excepto|salvo|menos /.test(t),
  };
  if (!t) return r;

  // «12/03-24/03», «30/09/2026–30/05/2027», «05/06 - 18/06».
  const rango = /(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*[-–]\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/g;
  let m: RegExpExecArray | null;
  let sinRangos = t;
  while ((m = rango.exec(t))) {
    r.tramos.push({
      desde: [Number(m[2]), Number(m[1])],
      hasta: [Number(m[5]), Number(m[4])],
      anioDesde: m[3] ? Number(m[3]) : undefined,
      anioHasta: m[6] ? Number(m[6]) : undefined,
    });
    sinRangos = sinRangos.replace(m[0], " ");
  }

  // «8–31 ene», «1–18 mar», «19 mar–31 ago»: con el mes escrito.
  const rangoMes = /(\d{1,2})\s*(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)?[a-z]*\s*[-–]\s*(\d{1,2})\s*(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*/g;
  // Se busca sobre una copia: quitar lo leído movería las posiciones de la búsqueda.
  const conMeses = sinRangos;
  while ((m = rangoMes.exec(conMeses))) {
    const mesHasta = MESES_CORTOS.indexOf(m[4]) + 1;
    const mesDesde = m[2] ? MESES_CORTOS.indexOf(m[2]) + 1 : mesHasta;
    r.tramos.push({ desde: [mesDesde, Number(m[1])], hasta: [mesHasta, Number(m[3])] });
    sinRangos = sinRangos.replace(m[0], " ");
  }

  // Días sueltos con su mes al final: «4, 5, 9 y 26/04», «29/03», «02/07».
  for (const trozo of sinRangos.split(/[·|;]/)) {
    const s = /^\s*((?:\d{1,2}\s*(?:,|y)\s*)*\d{1,2})\s*\/\s*(\d{1,2})(?:\/\d{2,4})?\s*$/.exec(trozo.replace(/^.*?(?=\d)/, ""));
    if (!s) continue;
    const mes = Number(s[2]);
    // «Curso 26/27» no es el 26 del mes 27.
    if (mes < 1 || mes > 12) continue;
    for (const d of s[1].split(/\s*(?:,|y)\s*/)) {
      if (d && Number(d) >= 1 && Number(d) <= 31) r.sueltos.add(mes * 100 + Number(d));
    }
  }

  // Meses enteros: «JUNIO / SEPTIEMBRE», «Enero · Marzo · Abril 2027», «sep–dic».
  const mesesSueltos = sinRangos.replace(/\(.*?\)/g, " ");
  MESES.forEach((mes, i) => {
    if (new RegExp(`\\b${mes}\\b`).test(mesesSueltos)) r.meses.add(i + 1);
  });
  const rangoMeses = /\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*\s*[-–]\s*(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*/g;
  while ((m = rangoMeses.exec(mesesSueltos))) {
    const a = MESES_CORTOS.indexOf(m[1]) + 1, b = MESES_CORTOS.indexOf(m[2]) + 1;
    for (let k = a; ; k = (k % 12) + 1) {
      r.meses.add(k);
      if (k === b) break;
    }
  }
  // «· feb ·» suelto (L'Orri: «1–7 ene · feb · 19 mar–31 ago»).
  for (const trozo of mesesSueltos.split(/[·|;]/)) {
    const solo = /^\s*(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\s*(\d{4})?\s*$/.exec(trozo);
    if (solo) r.meses.add(MESES_CORTOS.indexOf(solo[1]) + 1);
  }

  // Días de la semana: «Domingo a Jueves», «Viernes a Sábado», «Todos los días».
  const semana = /(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\s+a\s+(domingo|lunes|martes|miercoles|jueves|viernes|sabado)/.exec(t);
  if (semana) {
    const a = DIAS_SEMANA.indexOf(semana[1]), b = DIAS_SEMANA.indexOf(semana[2]);
    r.diasSemana = new Set();
    for (let k = a; ; k = (k + 1) % 7) {
      r.diasSemana.add(k);
      if (k === b) break;
    }
  }
  return r;
}

/** Qué días vale la tarifa: fechas guardadas + lo que dice el nombre. */
export function coberturaDeTarifa(t: TarifaConFechas): CoberturaDeTarifa {
  const nombre = leerNombreDeTemporada(t.seasonName);
  const tieneFechas = Boolean(t.dateFrom && t.dateTo);
  const delNombre =
    nombre.tramos.length > 0 || nombre.sueltos.size > 0 || nombre.meses.size > 0 || nombre.semanaSanta;

  const enFechasGuardadas = (fecha: string) =>
    tieneFechas && dia(t.dateFrom!) <= dia(fecha) && dia(fecha) <= dia(t.dateTo!);

  const enNombre = (fecha: string): boolean => {
    const mes = Number(fecha.slice(5, 7)), d = Number(fecha.slice(8, 10));
    if (nombre.tramos.some((tr) => enTramo(tr, fecha))) return true;
    if (nombre.sueltos.has(mes * 100 + d)) return true;
    if (nombre.meses.has(mes)) return true;
    if (nombre.semanaSanta) {
      // Del Domingo de Ramos al Lunes de Pascua.
      const pascua = domingoDePascua(Number(fecha.slice(0, 4)));
      const desde = new Date(pascua.getTime() - 7 * 864e5), hasta = new Date(pascua.getTime() + 864e5);
      if (iso(desde) <= dia(fecha) && dia(fecha) <= iso(hasta)) return true;
    }
    return false;
  };

  const enSemana = (fecha: string) =>
    !nombre.diasSemana || nombre.diasSemana.has(new Date(`${dia(fecha)}T12:00:00Z`).getUTCDay());

  let dias = Infinity;
  if (delNombre) {
    dias =
      nombre.tramos.reduce((s, tr) => s + diasDeTramo(tr), 0) +
      nombre.sueltos.size +
      nombre.meses.size * 30 +
      (nombre.semanaSanta ? 9 : 0);
  } else if (tieneFechas) {
    dias = Math.round((Date.parse(dia(t.dateTo!)) - Date.parse(dia(t.dateFrom!))) / 864e5) + 1;
  }
  if (nombre.diasSemana) dias = (Number.isFinite(dias) ? dias : 365) * (nombre.diasSemana.size / 7);

  return {
    vale: (fecha: string) => {
      if (!enSemana(fecha)) return false;
      if (delNombre) return enNombre(fecha) || enFechasGuardadas(fecha);
      if (tieneFechas) return enFechasGuardadas(fecha);
      // Sin fechas en ningún sitio: solo el día de la semana, si lo dice.
      return nombre.diasSemana ? true : null;
    },
    dias,
    origen: delNombre || nombre.diasSemana ? "nombre" : tieneFechas ? "fechas" : "sin fechas",
    conExcepciones: nombre.conExcepciones,
  };
}
