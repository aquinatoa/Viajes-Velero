/**
 * Lo que cuesta una estancia en un hotel, noche a noche y por tipo de persona.
 *
 * Ruth, 19/10/2026, al probar con el 4R:
 * - «no se están aplicando los suplementos de habitación individual y doble»:
 *   el Excel dice «Individual +75 % s/múltiple · Doble profes +10 %» y a los
 *   profesores se les cobraba la múltiple («sin tarifa individual: mismo
 *   precio»);
 * - «que el cotizador dé opción a tener MP y PC mezcladas» en la estancia;
 * - «modificar tipos de habitación en función de la fecha y/o si son para
 *   profesores / chófer (que también pueden pedir pensión distinta)».
 *
 * Hasta ahora un hotel se cotizaba con UNA tarifa para toda la estancia. Aquí
 * cada noche tiene su pensión, se busca la tarifa de ese hotel para esa
 * pensión, esa fecha y ese tramo de noches, y cada tipo de persona tiene su
 * habitación y, si quiere, su propia pensión. La habitación sale de la tarifa
 * propia del hotel (individual, doble) si la tiene; si no, de su suplemento; y
 * si tampoco, al precio de la múltiple, avisando.
 *
 * Cálculo puro: la pantalla lo pinta, la propuesta lo guarda y Servicios
 * Contratados lo lee del desglose.
 */

export type Habitacion = "MULTIPLE" | "DOBLE" | "INDIVIDUAL";

export interface Acompanantes {
  habitacion: Habitacion;
  /** PC, MP, AD, SA; vacío = la del grupo esa noche. */
  regimen: string;
}

export interface ComposicionDeLaEstancia {
  /** Una por noche, en orden. Vacío = todas con la pensión de la tarifa elegida. */
  regimenPorNoche: string[];
  profesores: Acompanantes;
  chofer: Acompanantes & { cantidad: number };
}

export const COMPOSICION_POR_DEFECTO: ComposicionDeLaEstancia = {
  regimenPorNoche: [],
  // Lo de siempre: los profesores en individual cuando el hotel lo cotiza.
  profesores: { habitacion: "INDIVIDUAL", regimen: "" },
  chofer: { cantidad: 0, habitacion: "INDIVIDUAL", regimen: "" },
};

/** Lo mínimo de una tarifa que hace falta para la cuenta. */
export interface TarifaDeHotel {
  /** Para saber qué tarifa se usó cada noche (el detalle del hotel la marca). */
  id?: string | null;
  boardType?: string | null;
  occupancyLabel?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  minNights?: number | null;
  /** Precio de venta por persona y noche. */
  precio: number;
}

export interface SuplementoDeHabitacion {
  tipo: "PCT" | "EUR";
  valor: number;
}

export interface SuplementosDeHabitacion {
  individual?: SuplementoDeHabitacion | null;
  doble?: SuplementoDeHabitacion | null;
}

const redondear = (n: number) => Math.round(n * 100) / 100;
const normal = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function ocupacionDe(etiqueta: string | null | undefined): Habitacion {
  const t = normal(etiqueta);
  // «Múltiple (doble/triple/cuádruple)» es la de los alumnos del Hotel Planas:
  // dice «doble», pero no es la doble de los profesores (20/10/2026).
  if (/multiple|triple|cuadruple|quadruple/.test(t)) return "MULTIPLE";
  if (/individual|single|\bsgl\b/.test(t)) return "INDIVIDUAL";
  if (/doble|double|\bdbl\b/.test(t)) return "DOBLE";
  return "MULTIPLE";
}

/**
 * Los suplementos de habitación de un hotel, de los que trae su documento:
 * «Habitación individual · 75 porcentaje», «Habitación doble profesores · 10
 * porcentaje». Uno de «estudiantes en doble» no es de los profesores: se deja.
 */
export function suplementosDeHabitacion(
  ajustes: Array<{ concept?: string | null; amountType?: string | null; amount?: number | string | null }>,
): SuplementosDeHabitacion {
  const resultado: SuplementosDeHabitacion = {};
  for (const a of ajustes) {
    const concepto = normal(a.concept);
    const valor = Number(a.amount);
    if (!Number.isFinite(valor) || valor <= 0) continue;
    const tipoTexto = normal(a.amountType);
    const tipo: "PCT" | "EUR" = /porc|percent|%|pct/.test(tipoTexto) ? "PCT" : "EUR";
    if (/individual|single/.test(concepto) && !resultado.individual) resultado.individual = { tipo, valor };
    else if (/doble|double/.test(concepto) && !/estudiant|alumn/.test(concepto) && !resultado.doble) {
      resultado.doble = { tipo, valor };
    }
  }
  return resultado;
}

const dia = (iso: string) => iso.slice(0, 10);

function sumarDias(iso: string, n: number): string {
  const d = new Date(`${dia(iso)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Si la tarifa vale para la noche que empieza ese día. Sin fechas, vale. */
function valeEseDia(t: TarifaDeHotel, fecha: string): boolean {
  if (!t.dateFrom || !t.dateTo) return true;
  return dia(t.dateFrom) <= fecha && fecha <= dia(t.dateTo);
}

/**
 * La tarifa que toca: esa pensión, esa habitación, esa noche y el tramo por
 * duración que corresponde (el 4R: 1-2 noches, 3, 4 y más → la de mayor mínimo
 * que no pase de las noches del viaje). A igualdad, la más barata.
 */
function tarifaPara(
  tarifas: TarifaDeHotel[],
  regimen: string,
  habitacion: Habitacion,
  fecha: string,
  nochesTotales: number,
): TarifaDeHotel | null {
  const validas = tarifas.filter(
    (t) =>
      (t.boardType ?? "").toUpperCase() === regimen.toUpperCase() &&
      ocupacionDe(t.occupancyLabel) === habitacion &&
      valeEseDia(t, fecha) &&
      (t.minNights ?? 1) <= Math.max(nochesTotales, 1),
  );
  if (validas.length === 0) return null;
  const tramo = Math.max(...validas.map((t) => t.minNights ?? 1));
  return validas.filter((t) => (t.minNights ?? 1) === tramo).sort((a, b) => a.precio - b.precio)[0];
}

function aplicarSuplemento(base: number, s: SuplementoDeHabitacion): number {
  return redondear(s.tipo === "PCT" ? base * (1 + s.valor / 100) : base + s.valor);
}

const NOMBRE_REGIMEN: Record<string, string> = {
  PC: "pensión completa",
  MP: "media pensión",
  AD: "alojamiento y desayuno",
  SA: "solo alojamiento",
};
const NOMBRE_HABITACION: Record<Habitacion, string> = {
  MULTIPLE: "múltiple",
  DOBLE: "doble",
  INDIVIDUAL: "individual",
};

export interface PrecioDePersona {
  precio: number;
  /** «individual», «doble (suplemento +10 %)», «múltiple: sin individual»… */
  como: string;
  regimen: string;
  /** La tarifa de la que sale el precio (con suplemento, la múltiple). */
  tarifaId?: string | null;
}

export interface NocheDeLaEstancia {
  fecha: string;
  regimen: string;
  alumno: PrecioDePersona;
  profesor: PrecioDePersona;
  chofer: PrecioDePersona | null;
}

/** Noches seguidas con los mismos precios: así se escribe y se lee el desglose. */
export interface TramoDeLaEstancia {
  regimen: string;
  noches: number;
  alumno: PrecioDePersona;
  profesor: PrecioDePersona;
  chofer: PrecioDePersona | null;
}

export interface ResultadoDeLaEstancia {
  noches: NocheDeLaEstancia[];
  tramos: TramoDeLaEstancia[];
  /** Por alumno, toda la estancia. */
  porAlumno: number;
  total: number;
  avisos: string[];
  /** «MP», «PC» o «MP + PC». */
  regimenes: string;
}

export interface EntradaDeLaEstancia {
  fechaEntrada: string;
  noches: number;
  alumnos: number;
  profesores: number;
  composicion: ComposicionDeLaEstancia;
  /** La tarifa que eligió la búsqueda: la de respaldo si no hay otra. */
  elegida: TarifaDeHotel;
  /** Todas las del hotel que valen para el viaje (otras pensiones, habitaciones, temporadas). */
  otras: TarifaDeHotel[];
  suplementos: SuplementosDeHabitacion;
}

export function precioDeLaEstancia(e: EntradaDeLaEstancia): ResultadoDeLaEstancia {
  const nochesTotales = Math.max(e.noches, 0);
  const tarifas = [e.elegida, ...e.otras];
  const regimenBase = (e.elegida.boardType ?? "").toUpperCase();
  const avisos = new Set<string>();
  const cantidadChofer = Math.max(e.composicion.chofer?.cantidad ?? 0, 0);

  /** La múltiple para esa pensión y noche: su precio y de qué tarifa sale. */
  const multiple = (regimen: string, fecha: string): { precio: number; id: string | null } => {
    const t = tarifaPara(tarifas, regimen, "MULTIPLE", fecha, nochesTotales);
    if (t) return { precio: t.precio, id: t.id ?? null };
    if (regimen !== regimenBase) {
      avisos.add(
        `No hay tarifa de ${NOMBRE_REGIMEN[regimen] ?? regimen} para la noche del ${fechaCorta(fecha)}: se cobra la de ${NOMBRE_REGIMEN[regimenBase] ?? regimenBase}.`,
      );
    }
    return { precio: e.elegida.precio, id: e.elegida.id ?? null };
  };

  const persona = (habitacion: Habitacion, regimen: string, fecha: string, quien: string): PrecioDePersona => {
    const base = multiple(regimen, fecha);
    if (habitacion === "MULTIPLE") return { precio: base.precio, como: "múltiple", regimen, tarifaId: base.id };
    const propia = tarifaPara(tarifas, regimen, habitacion, fecha, nochesTotales);
    if (propia) return { precio: propia.precio, como: NOMBRE_HABITACION[habitacion], regimen, tarifaId: propia.id ?? null };
    const sup = habitacion === "INDIVIDUAL" ? e.suplementos.individual : e.suplementos.doble;
    if (sup) {
      const cuanto = sup.tipo === "PCT" ? `+${String(sup.valor).replace(".", ",")} %` : `+${String(sup.valor).replace(".", ",")} €`;
      return {
        precio: aplicarSuplemento(base.precio, sup),
        como: `${NOMBRE_HABITACION[habitacion]} (suplemento ${cuanto})`,
        regimen,
        tarifaId: base.id,
      };
    }
    avisos.add(
      `El hotel no tiene tarifa ni suplemento de habitación ${NOMBRE_HABITACION[habitacion]}: ${quien} se cobra${quien.endsWith("es") ? "n" : ""} a precio de múltiple.`,
    );
    return { precio: base.precio, como: `${NOMBRE_HABITACION[habitacion]}: sin tarifa, precio de múltiple`, regimen, tarifaId: base.id };
  };

  const noches: NocheDeLaEstancia[] = [];
  for (let i = 0; i < nochesTotales; i++) {
    const fecha = sumarDias(e.fechaEntrada, i);
    const regimen = (e.composicion.regimenPorNoche[i] || regimenBase || "").toUpperCase();
    const regProf = (e.composicion.profesores.regimen || regimen).toUpperCase();
    const regChof = (e.composicion.chofer?.regimen || regimen).toUpperCase();
    noches.push({
      fecha,
      regimen,
      alumno: (() => {
        const m = multiple(regimen, fecha);
        return { precio: m.precio, como: "múltiple", regimen, tarifaId: m.id };
      })(),
      profesor: persona(e.composicion.profesores.habitacion, regProf, fecha, "los profesores"),
      chofer: cantidadChofer > 0 ? persona(e.composicion.chofer.habitacion, regChof, fecha, "el chófer") : null,
    });
  }

  // Noches seguidas iguales, un tramo.
  const tramos: TramoDeLaEstancia[] = [];
  for (const n of noches) {
    const ultimo = tramos[tramos.length - 1];
    const igual =
      ultimo &&
      ultimo.regimen === n.regimen &&
      ultimo.alumno.precio === n.alumno.precio &&
      ultimo.profesor.precio === n.profesor.precio &&
      ultimo.profesor.como === n.profesor.como &&
      (ultimo.chofer?.precio ?? null) === (n.chofer?.precio ?? null);
    if (igual) ultimo.noches += 1;
    else tramos.push({ regimen: n.regimen, noches: 1, alumno: n.alumno, profesor: n.profesor, chofer: n.chofer });
  }

  const porAlumno = redondear(noches.reduce((s, n) => s + n.alumno.precio, 0));
  const total = redondear(
    noches.reduce(
      (s, n) =>
        s + n.alumno.precio * e.alumnos + n.profesor.precio * e.profesores + (n.chofer ? n.chofer.precio * cantidadChofer : 0),
      0,
    ),
  );
  const regimenes = [...new Set(noches.map((n) => n.regimen).filter(Boolean))].join(" + ") || regimenBase;
  return { noches, tramos, porAlumno, total, avisos: [...avisos], regimenes };
}

function fechaCorta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

const euros = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 })
    .format(n)
    .replace(/ /g, " ");

/**
 * El desglose como texto, el que guarda la propuesta y leen el PDF y
 * Servicios Contratados. Con un solo tramo y sin chófer, el formato de
 * siempre; si no, un tramo por régimen separado por « · », cada uno con su
 * «por noche x N noches».
 */
export function textoDelDesglose(r: ResultadoDeLaEstancia, alumnos: number, profesores: number, chofer: number): string {
  const tramo = (t: TramoDeLaEstancia, conRegimen: boolean) => {
    const partes = [`${euros(t.alumno.precio)} x ${alumnos} alumnos`];
    if (profesores > 0) {
      partes.push(
        `${euros(t.profesor.precio)} x ${profesores} profesores (${comoProfesor(t.profesor)}${t.profesor.regimen !== t.regimen ? `, ${t.profesor.regimen}` : ""})`,
      );
    }
    if (chofer > 0 && t.chofer) partes.push(`${euros(t.chofer.precio)} x ${chofer} chófer (${comoProfesor(t.chofer).replace("uso individual", "individual")}${t.chofer.regimen !== t.regimen ? `, ${t.chofer.regimen}` : ""})`);
    const noches = `por noche x ${t.noches} ${t.noches === 1 ? "noche" : "noches"}`;
    return `${conRegimen ? `${t.regimen}: ` : ""}${partes.join(" + ")}, ${noches}`;
  };
  const varios = r.tramos.length > 1;
  return r.tramos.map((t) => tramo(t, varios)).join(" · ");
}

/** Lo de los profesores como lo leía Servicios Contratados: «uso individual» o «sin tarifa individual: mismo precio». */
function comoProfesor(p: PrecioDePersona): string {
  if (p.como.includes("sin tarifa")) {
    // La doble sin tarifa ni suplemento no es «sin tarifa individual»: lo
    // que se cobra es la múltiple, y así lo lee Servicios Contratados.
    return p.como.startsWith("doble") ? "sin tarifa de doble: precio de múltiple" : "sin tarifa individual: mismo precio";
  }
  // Sin paréntesis dentro: el lector del desglose corta en el primero que cierra.
  const sup = /suplemento [^)]*/.exec(p.como)?.[0];
  if (p.como.startsWith("individual")) return `uso individual${sup ? `, ${sup}` : ""}`;
  if (p.como.startsWith("doble")) return `en doble${sup ? `, ${sup}` : ""}`;
  return "en múltiple";
}
