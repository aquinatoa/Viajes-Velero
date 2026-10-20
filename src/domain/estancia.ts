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

import { coberturaDeTarifa, leerNombreDeTemporada, type CoberturaDeTarifa } from "./fechasDeTarifa";

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
  /** «Sin campo (acompañante)», «Campo natural»…: otro eje del precio. */
  includedService?: string | null;
  /** El nombre de la temporada: muchas veces trae las fechas (ver `fechasDeTarifa.ts`). */
  seasonName?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  minNights?: number | null;
  /** Precio de venta por persona y noche. */
  precio: number;
  /** Coste por persona y noche, si el documento lo trae. */
  coste?: number | null;
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

/**
 * La clase de habitación de una etiqueta del documento. Las hay de todo tipo:
 * «Múltiple (doble/triple/cuádruple)» (Planas, de alumnos), «1 PAX X HAB»
 * (Fútbol Salou, individual), «Apartamento ocupado por 1 persona», «DUI»,
 * «Individual/DUI (+50% incl.)», «Estudiantes en doble (+25% incl.)»…
 */
export function ocupacionDe(etiqueta: string | null | undefined): Habitacion {
  const t = normal(etiqueta);
  if (/multiple|triple|cuadruple|quadruple/.test(t)) return "MULTIPLE";
  if (/individual|single|\bsgl\b|\bdui\b|uso indiv|\b1 ?pax\b|\b1 persona\b/.test(t)) return "INDIVIDUAL";
  if (/doble|double|\bdbl\b|\b2 ?pax\b|\b2 personas\b/.test(t)) return "DOBLE";
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

/**
 * La pensión como código: «PC (PRECIO FINAL: alojamiento + régimen)» es PC,
 * «SA (solo alojamiento)» es SA. «MP + Picnic» es otra cosa (lleva el
 * almuerzo de pícnic) y no se mezcla con la MP.
 */
export function codigoDePension(texto: string | null | undefined): string {
  const t = normal(texto).trim();
  if (/picnic|picnick/.test(t)) return "MP+PICNIC";
  const codigo = /^(pc|mp|ad|sa)\b/.exec(t)?.[1];
  if (codigo) return codigo.toUpperCase();
  if (/completa/.test(t)) return "PC";
  if (/media/.test(t)) return "MP";
  if (/desayuno/.test(t)) return "AD";
  if (/solo aloj/.test(t)) return "SA";
  return t.toUpperCase();
}

/** «Adultos», «+14 años»: una tarifa que no es para los alumnos. */
function esDeAdultos(t: TarifaDeHotel): boolean {
  const s = normal(`${t.occupancyLabel ?? ""} ${t.seasonName ?? ""} ${t.includedService ?? ""}`);
  return /\badult/.test(s) && !/escolar|estudiant|junior|infantil/.test(s);
}

/**
 * Si la tarifa vale para la edad del grupo: «-14 años» (hasta 13), «+14 años»
 * (desde 14), «≤16 años», «menores de 18». Sin edad en la tarifa, vale.
 */
function encajaConLaEdad(t: TarifaDeHotel, edad: { min: number | null; max: number | null } | null | undefined): boolean {
  if (!edad || (edad.min === null && edad.max === null)) return true;
  const s = normal(`${t.occupancyLabel ?? ""} ${t.seasonName ?? ""} ${t.includedService ?? ""}`);
  const hasta = /(?:-|menores de|hasta|<)\s*(\d{1,2})\s*an/.exec(s);
  if (hasta && edad.max !== null && edad.max >= Number(hasta[1])) return false;
  const hastaIncl = /(?:≤|<=)\s*(\d{1,2})\s*an/.exec(s);
  if (hastaIncl && edad.max !== null && edad.max > Number(hastaIncl[1])) return false;
  const desde = /(?:\+|desde|a partir de|mayores de|>=?)\s*(\d{1,2})\s*an/.exec(s);
  if (desde && edad.min !== null && edad.min < Number(desde[1])) return false;
  return true;
}

/** La clave de una ocupación tal como la escribe el documento: «Doble», «1 PAX X HAB»… */
const claveDeOcupacion = (s: string | null | undefined) => normal(s).replace(/\s+/g, " ").trim();
/**
 * El servicio incluido como eje de la tarifa («Sin campo», «Campo natural»).
 * Si lo que hay ahí es la temporada (Viella: «Junio · Septiembre 2027»), no
 * es un servicio y no separa tarifas.
 */
const claveDeServicio = (s: string | null | undefined) => {
  const n = leerNombreDeTemporada(s);
  if (n.tramos.length || n.sueltos.size || n.meses.size || n.semanaSanta || n.diasSemana) return "";
  return normal(s).replace(/\s+/g, " ").trim();
};

function aplicarSuplemento(base: number, s: SuplementoDeHabitacion): number {
  return redondear(s.tipo === "PCT" ? base * (1 + s.valor / 100) : base + s.valor);
}

const NOMBRE_REGIMEN: Record<string, string> = {
  PC: "pensión completa",
  MP: "media pensión",
  AD: "alojamiento y desayuno",
  SA: "solo alojamiento",
  "MP+PICNIC": "media pensión con pícnic",
};
const NOMBRE_HABITACION: Record<Habitacion, string> = {
  MULTIPLE: "múltiple",
  DOBLE: "doble",
  INDIVIDUAL: "individual",
};
const nombreDePension = (c: string) => NOMBRE_REGIMEN[c] ?? c.toLowerCase();

export interface PrecioDePersona {
  precio: number;
  /** «individual», «doble (suplemento +10 %)», «múltiple: sin individual»… */
  como: string;
  regimen: string;
  /** La tarifa de la que sale el precio (con suplemento, la múltiple). */
  tarifaId?: string | null;
  /** El coste de esa tarifa (con el suplemento aplicado), si se conoce. */
  coste?: number | null;
}

export interface NocheDeLaEstancia {
  fecha: string;
  regimen: string;
  alumno: PrecioDePersona;
  profesor: PrecioDePersona;
  chofer: PrecioDePersona | null;
  /** No hay tarifa del hotel para esa fecha: se ha puesto otra y se avisa. */
  sinTarifa?: boolean;
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
  /** «MP», «PC» o «MP + PC»: las pensiones que de verdad se cobran. */
  regimenes: string;
}

export interface EntradaDeLaEstancia {
  fechaEntrada: string;
  noches: number;
  alumnos: number;
  profesores: number;
  composicion: ComposicionDeLaEstancia;
  /** La edad del grupo: Jaca cobra distinto a «-14 años (tarifa escolar)» y «+14 años». */
  edadGrupo?: { min: number | null; max: number | null } | null;
  /** La tarifa que eligió la búsqueda: marca la habitación y el servicio de los alumnos. */
  elegida: TarifaDeHotel;
  /** Las demás del hotel (otras pensiones, habitaciones, temporadas). */
  otras: TarifaDeHotel[];
  suplementos: SuplementosDeHabitacion;
}

/** Avisos agrupados: «las noches del 05, 06 y 07/06» en vez de tres avisos. */
class Avisos {
  private porClave = new Map<string, { fechas: string[]; texto: (cuando: string) => string }>();
  private sueltos = new Set<string>();
  porNoche(clave: string, fecha: string, texto: (cuando: string) => string) {
    const a = this.porClave.get(clave) ?? { fechas: [], texto };
    if (!a.fechas.includes(fecha)) a.fechas.push(fecha);
    this.porClave.set(clave, a);
  }
  suelto(texto: string) {
    this.sueltos.add(texto);
  }
  lista(): string[] {
    const grupos = [...this.porClave.values()].map((a) => a.texto(cuandoSon(a.fechas)));
    return [...grupos, ...this.sueltos];
  }
}

/** «la noche del 05/06», «las noches del 05, 06 y 07/06», «las noches del 30/05 y 01/06». */
function cuandoSon(fechas: string[]): string {
  const f = [...fechas].sort();
  if (f.length === 1) return `la noche del ${fechaCorta(f[0])}`;
  const mismoMes = f.every((x) => x.slice(5, 7) === f[0].slice(5, 7));
  const partes = mismoMes ? f.map((x) => x.slice(8, 10)) : f.map(fechaCorta);
  const ultima = partes.pop()!;
  return `las noches del ${partes.join(", ")} y ${ultima}${mismoMes ? `/${f[0].slice(5, 7)}` : ""}`;
}

export function precioDeLaEstancia(e: EntradaDeLaEstancia): ResultadoDeLaEstancia {
  const nochesTotales = Math.max(e.noches, 0);
  const todas = [e.elegida, ...e.otras.filter((t) => !t.id || t.id !== e.elegida.id)];
  const cobertura = new Map<TarifaDeHotel, CoberturaDeTarifa>(todas.map((t) => [t, coberturaDeTarifa(t)]));
  const pensionBase = codigoDePension(e.elegida.boardType);
  const ocupacionAlumnos = claveDeOcupacion(e.elegida.occupancyLabel);
  const claseAlumnos = ocupacionDe(e.elegida.occupancyLabel);
  const servicioAlumnos = claveDeServicio(e.elegida.includedService);
  const avisos = new Avisos();
  const cantidadChofer = Math.max(e.composicion.chofer?.cantidad ?? 0, 0);

  /**
   * De unas tarifas candidatas, la que vale esa noche: primero las que dicen
   * que valen ese día (la más concreta manda: Semana Santa sobre T. Baja);
   * si ninguna lo dice, las que no tienen fechas en ningún sitio. Dentro, el
   * tramo por noches que toca y, a igualdad, la más barata.
   */
  const laQueVale = (candidatas: TarifaDeHotel[], fecha: string, soloConFechas = false): TarifaDeHotel | null => {
    const conFechas = candidatas.filter((t) => cobertura.get(t)!.vale(fecha) === true);
    if (soloConFechas && conFechas.length === 0) return null;
    let grupo: TarifaDeHotel[];
    if (conFechas.length > 0) {
      const minimo = Math.min(...conFechas.map((t) => cobertura.get(t)!.dias));
      grupo = conFechas.filter((t) => cobertura.get(t)!.dias === minimo);
    } else {
      grupo = candidatas.filter((t) => cobertura.get(t)!.vale(fecha) === null);
      if (grupo.length === 0) return null;
      const temporadas = new Set(grupo.map((t) => t.seasonName ?? ""));
      if (temporadas.size > 1) {
        // Varias temporadas sin fechas: la de la búsqueda, si está, y se avisa.
        const deLaElegida = grupo.filter((t) => (t.seasonName ?? "") === (e.elegida.seasonName ?? ""));
        if (deLaElegida.length) grupo = deLaElegida;
        avisos.suelto(
          `Las temporadas de este hotel no tienen fechas («${[...temporadas].filter(Boolean).slice(0, 3).join("», «")}»): se ha cobrado «${grupo[0].seasonName ?? "sin nombre"}» sin poder comprobar que sea la de estas fechas. Revísalo en el documento.`,
        );
      }
    }
    const tramos = grupo.filter((t) => (t.minNights ?? 1) <= Math.max(nochesTotales, 1));
    const conTramo = tramos.length ? tramos : grupo;
    const tramo = Math.max(...conTramo.map((t) => t.minNights ?? 1));
    return conTramo.filter((t) => (t.minNights ?? 1) === tramo).sort((a, b) => a.precio - b.precio)[0] ?? null;
  };

  /**
   * Las tarifas de los alumnos, por niveles: su misma habitación y servicio;
   * su misma clase y servicio; su misma clase. Se prueba cada nivel con la
   * fecha: Canada Palace tiene la T. Alta con «Agua en las comidas» y las
   * demás sin, y con un solo nivel las noches de Semana Santa quedaban «sin
   * tarifa» (verificación del 20/10/2026). Y las de la edad del grupo: el
   * Albergue de Jaca cobra distinto «-14 años» y «+14 años».
   */
  const nivelesDeAlumnos = (pension: string): TarifaDeHotel[][] => {
    let dePension = todas.filter((t) => codigoDePension(t.boardType) === pension && !esDeAdultos(t));
    const deSuEdad = dePension.filter((t) => encajaConLaEdad(t, e.edadGrupo));
    if (deSuEdad.length) dePension = deSuEdad;
    const exactas = dePension.filter(
      (t) => claveDeOcupacion(t.occupancyLabel) === ocupacionAlumnos && claveDeServicio(t.includedService) === servicioAlumnos,
    );
    const misma = dePension.filter(
      (t) => ocupacionDe(t.occupancyLabel) === claseAlumnos && claveDeServicio(t.includedService) === servicioAlumnos,
    );
    const clase = dePension.filter((t) => ocupacionDe(t.occupancyLabel) === claseAlumnos);
    return [exactas, misma, clase].filter((l) => l.length > 0);
  };

  /** De varios niveles, la primera con fechas que cubra la noche; si ninguna, la primera sin fechas. */
  const laQueValePorNiveles = (niveles: TarifaDeHotel[][], fecha: string): TarifaDeHotel | null => {
    for (const nivel of niveles) {
      const r = laQueVale(nivel, fecha, true);
      if (r) return r;
    }
    for (const nivel of niveles) {
      const r = laQueVale(nivel, fecha);
      if (r) return r;
    }
    return null;
  };

  /** El precio de los alumnos esa noche con esa pensión, o null si el hotel no la tiene ese día. */
  const precioAlumno = (pension: string, fecha: string): TarifaDeHotel | null =>
    laQueValePorNiveles(nivelesDeAlumnos(pension), fecha);

  const persona = (
    habitacion: Habitacion,
    pension: string,
    fecha: string,
    quien: "los profesores" | "el chófer",
  ): PrecioDePersona => {
    // La tarifa de los alumnos con esa pensión esa noche; si no la hay, la de la noche del grupo.
    const baseAlumnos = precioAlumno(pension, fecha);
    // Si el hotel distingue a los adultos (Jaca), el suplemento de individual
    // va sobre su precio, no sobre el de los escolares.
    const deAdultosMismaClase = todas.filter(
      (t) => codigoDePension(t.boardType) === pension && ocupacionDe(t.occupancyLabel) === claseAlumnos && esDeAdultos(t),
    );
    const baseAdultos = deAdultosMismaClase.length ? laQueValePorNiveles([deAdultosMismaClase], fecha) : null;
    const base = baseAdultos ?? baseAlumnos;
    const pensionCobrada = base ? pension : null;
    // Jaca cobra a los adultos distinto que a los escolares, en la misma
    // habitación: para profesores y chófer manda la tarifa de adultos.
    const deAdultosEn = (clase: Habitacion) =>
      todas.filter((t) => codigoDePension(t.boardType) === pension && ocupacionDe(t.occupancyLabel) === clase && esDeAdultos(t));
    if (habitacion === claseAlumnos || habitacion === "MULTIPLE") {
      const adultos = laQueValePorNiveles([deAdultosEn(claseAlumnos)], fecha);
      if (adultos) {
        return { precio: adultos.precio, como: `${NOMBRE_HABITACION[claseAlumnos]} (tarifa de adultos)`, regimen: pension, tarifaId: adultos.id ?? null, coste: adultos.coste ?? null };
      }
      if (base) return { precio: base.precio, como: NOMBRE_HABITACION[claseAlumnos], regimen: pension, tarifaId: base.id ?? null, coste: base.coste ?? null };
    } else {
      // Su propia tarifa de esa habitación, si el hotel la tiene (de adultos si
      // las distingue; con el mismo servicio, si puede), probando cada nivel con la fecha.
      const deHabitacion = todas.filter(
        (t) => codigoDePension(t.boardType) === pension && ocupacionDe(t.occupancyLabel) === habitacion,
      );
      const mismoServicio = deHabitacion.filter((t) => claveDeServicio(t.includedService) === servicioAlumnos);
      const propia = laQueValePorNiveles([deAdultosEn(habitacion), mismoServicio, deHabitacion].filter((l) => l.length), fecha);
      if (propia) return { precio: propia.precio, como: NOMBRE_HABITACION[habitacion], regimen: pension, tarifaId: propia.id ?? null, coste: propia.coste ?? null };
      const sup = habitacion === "INDIVIDUAL" ? e.suplementos.individual : e.suplementos.doble;
      if (sup && base) {
        const cuanto = sup.tipo === "PCT" ? `+${String(sup.valor).replace(".", ",")} %` : `+${String(sup.valor).replace(".", ",")} €`;
        return {
          precio: aplicarSuplemento(base.precio, sup),
          como: `${NOMBRE_HABITACION[habitacion]} (suplemento ${cuanto})`,
          regimen: pension,
          tarifaId: base.id ?? null,
          coste: base.coste == null ? null : aplicarSuplemento(base.coste, sup),
        };
      }
      if (base) {
        const van = quien === "los profesores" ? "van" : "va";
        // Si el hotel no tiene esa habitación en ninguna fecha, un solo aviso; si
        // la tiene en otras, se dice qué noches faltan.
        const habitacionesDelHotel = todas.filter((x) => ocupacionDe(x.occupancyLabel) === habitacion);
        if (habitacionesDelHotel.length === 0) {
          avisos.suelto(
            `El hotel no tiene tarifa ni suplemento de habitación ${NOMBRE_HABITACION[habitacion]}: ${quien} ${van} a precio de ${NOMBRE_HABITACION[claseAlumnos]}.`,
          );
        } else {
          avisos.porNoche(`sinhab-${habitacion}-${pension}-${quien}`, fecha, (cuando) =>
            `No hay tarifa ${NOMBRE_HABITACION[habitacion]} de ${nombreDePension(pension)} para ${cuando} (ni suplemento): ${quien} ${van} a precio de ${NOMBRE_HABITACION[claseAlumnos]}.`,
          );
        }
        return {
          precio: base.precio,
          como: `${NOMBRE_HABITACION[habitacion]}: sin tarifa, precio de ${NOMBRE_HABITACION[claseAlumnos]}`,
          regimen: pension,
          tarifaId: base.id ?? null,
          coste: base.coste ?? null,
        };
      }
    }
    void pensionCobrada;
    return { precio: NaN, como: "", regimen: pension, tarifaId: null };
  };

  const noches: NocheDeLaEstancia[] = [];
  for (let i = 0; i < nochesTotales; i++) {
    const fecha = sumarDias(e.fechaEntrada, i);
    const pedida = codigoDePension(e.composicion.regimenPorNoche[i] || pensionBase) || pensionBase;
    let pension = pedida;
    let alumno = precioAlumno(pension, fecha);
    let sinTarifa = false;
    if (!alumno && pension !== pensionBase) {
      // El hotel no tiene esa pensión esa noche: se cobra la del grupo, y lo dice.
      const respaldo = precioAlumno(pensionBase, fecha);
      if (respaldo) {
        avisos.porNoche(`sinpension-${pedida}`, fecha, (cuando) =>
          `El hotel no tiene ${nombreDePension(pedida)} para ${cuando}: van en ${nombreDePension(pensionBase)}.`,
        );
        pension = pensionBase;
        alumno = respaldo;
      }
    }
    if (!alumno) {
      // Ninguna tarifa del hotel vale para esa fecha: se pone la de la búsqueda y se avisa.
      sinTarifa = true;
      alumno = e.elegida;
      pension = pensionBase;
      avisos.porNoche("sinfecha", fecha, (cuando) =>
        `No hay tarifa del hotel para ${cuando}: se ha puesto la de «${e.elegida.seasonName ?? "la tarifa elegida"}»${
          e.elegida.dateFrom && e.elegida.dateTo ? ` (${fechaCorta(e.elegida.dateFrom)}–${fechaCorta(e.elegida.dateTo)})` : ""
        }, que no la cubre. Pide precio al hotel antes de enviarlo.`,
      );
    }
    const alumnoPrecio: PrecioDePersona = {
      precio: alumno.precio,
      como: NOMBRE_HABITACION[claseAlumnos],
      regimen: pension,
      tarifaId: alumno.id ?? null,
      coste: alumno.coste ?? null,
    };
    const conRespaldo = (p: PrecioDePersona): PrecioDePersona =>
      Number.isFinite(p.precio) ? p : { ...alumnoPrecio, como: `${p.como || NOMBRE_HABITACION[claseAlumnos]}` };

    const pensionProfesores = codigoDePension(e.composicion.profesores.regimen) || pension;
    const pensionChofer = codigoDePension(e.composicion.chofer?.regimen) || pension;
    // Sin profesores no se calcula ni se avisa nada de ellos.
    let profesor =
      e.profesores > 0
        ? persona(e.composicion.profesores.habitacion, pensionProfesores, fecha, "los profesores")
        : alumnoPrecio;
    if (e.profesores > 0 && !Number.isFinite(profesor.precio) && pensionProfesores !== pension) {
      avisos.porNoche(`sinpension-prof-${pensionProfesores}`, fecha, (cuando) =>
        `El hotel no tiene ${nombreDePension(pensionProfesores)} para ${cuando}: los profesores van en ${nombreDePension(pension)}.`,
      );
      profesor = persona(e.composicion.profesores.habitacion, pension, fecha, "los profesores");
    }
    let chofer: PrecioDePersona | null = null;
    if (cantidadChofer > 0) {
      chofer = persona(e.composicion.chofer.habitacion, pensionChofer, fecha, "el chófer");
      if (!Number.isFinite(chofer.precio) && pensionChofer !== pension) {
        avisos.porNoche(`sinpension-chofer-${pensionChofer}`, fecha, (cuando) =>
          `El hotel no tiene ${nombreDePension(pensionChofer)} para ${cuando}: el chófer va en ${nombreDePension(pension)}.`,
        );
        chofer = persona(e.composicion.chofer.habitacion, pension, fecha, "el chófer");
      }
      chofer = conRespaldo(chofer);
    }
    noches.push({ fecha, regimen: pension, alumno: alumnoPrecio, profesor: conRespaldo(profesor), chofer, sinTarifa });
  }

  // Lo que el documento no deja leer («excepto San Juan y puentes»).
  const usadas = new Set(noches.map((n) => n.alumno.tarifaId));
  for (const t of todas) {
    if (t.id && usadas.has(t.id) && cobertura.get(t)!.conExcepciones) {
      avisos.suelto(`La temporada «${t.seasonName}» tiene excepciones que no se pueden leer: confirma que ninguna noche caiga en ellas.`);
    }
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
      ultimo.profesor.regimen === n.profesor.regimen &&
      (ultimo.chofer?.precio ?? null) === (n.chofer?.precio ?? null) &&
      (ultimo.chofer?.regimen ?? null) === (n.chofer?.regimen ?? null);
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
  const regimenes = [...new Set(noches.map((n) => n.regimen).filter(Boolean))].join(" + ") || pensionBase;
  return { noches, tramos, porAlumno, total, avisos: avisos.lista(), regimenes };
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
