/**
 * Las líneas de una actividad: qué tarifa, cuántas personas, a qué precio.
 *
 * Anthony, 08/10/2026, con PortAventura en pantalla: «si selecciono esa
 * tarifa solo veré que se va a aplicar a todos esa misma tarifa, y eso no es
 * real: no todos son adultos, no todos son discapacitados». Y Javier en la
 * reunión: «adulto y pones la cantidad, joven y pones la cantidad».
 *
 * Una actividad en el programa ya no es UNA tarifa por persona: es una lista
 * de líneas (tarifa × cantidad). El total del grupo es la suma, y lo que se
 * suma al precio por alumno es ese total repartido entre los alumnos, que es
 * como lo paga un colegio.
 *
 * Todo esto es cálculo puro: la pantalla lo pinta y la propuesta lo guarda.
 */

import { profesoresGratis, type GratuidadDeProfesores } from "./gratuidadDeActividad";

export interface LineaDeActividad {
  rateId: string;
  /** La tarifa como la ve quien cotiza: «Joven/Secundaria/Uni (12-17) · Entrada · Periodo C». */
  etiqueta: string;
  /** Por persona. */
  precio: number;
  cantidad: number;
}

export interface TarifaElegible {
  id: string;
  ageLabel: string | null;
  ageMin?: number | null;
  ageMax?: number | null;
  /** PER_PAX, PER_GROUP, PER_HOUR…: cómo se cobra (del Excel, «Unidad de tarifa»). */
  rateUnit?: string | null;
  minPax?: number | null;
  maxPax?: number | null;
  salePvpAmount: number;
}

/** Lo que el esbozo necesita saber del viaje además del grupo. */
export interface ContextoDelEsbozo {
  /** Los periodos de PortAventura de los días del viaje, del más frecuente al menos. */
  periodos?: string[];
  /** Lo que el proveedor da gratis a los profesores. */
  gratuidad?: GratuidadDeProfesores | null;
  /** La entrada que pidió el colegio: «Ticket Plus», «Express»… (26/10/2026). */
  modalidad?: string | null;
}

export type UnidadDeTarifa = "PER_PAX" | "PER_GROUP" | "PER_HOUR" | "PER_DAY" | "PER_SERVICE" | "PER_UNIT";

/**
 * La unidad de la tarifa como código, se haya guardado como se haya guardado.
 *
 * La revisión de cada documento la escribe a su manera: «por persona»,
 * «per_person», «per pax / day», «por equipo», «per match»… Al publicar la
 * unidad (20/10/2026) llegaron tal cual, y «por persona» no era «PER_PAX»: las
 * 386 entradas de PortAventura y Caribe se esbozaban como UNA entrada para
 * todo el grupo. Lo que no se reconoce cuenta como por persona, que es lo que
 * se hacía antes de tener la unidad: nunca se cobra de menos por no entenderla.
 */
export function unidadDeTarifa(rateUnit: string | null | undefined): UnidadDeTarifa | null {
  const u = String(rateUnit ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!u || u === "unknown") return null;
  if (["per pax", "per group", "per hour", "per day", "per service", "per unit"].includes(u)) {
    return `PER_${u.slice(4).toUpperCase()}` as UnidadDeTarifa;
  }
  if (/\b(persona|personas|person|pax|alumno|alumnos|jugador|jugadores|participante|participantes|player)\b/.test(u)) return "PER_PAX";
  if (/\b(equipo|team|grupo|group)\b/.test(u)) return "PER_GROUP";
  if (/\b(hora|horas|hour|hours|h)\b/.test(u)) return "PER_HOUR";
  if (/\b(dia|dias|day|days|jornada)\b/.test(u)) return "PER_DAY";
  if (/\b(servicio|service|sesion|session|partido|match|alquiler|rental|actividad|activity)\b/.test(u)) return "PER_SERVICE";
  if (/\b(unidad|unit|bolsa|bag|balon|ball|botella|bottle|ticket|pack|bici|bike|semana|week)\b/.test(u)) return "PER_UNIT";
  return null;
}

/** Una tarifa que no es por persona: por grupo, por hora, por día, por servicio, por unidad. */
export function esPorUnidad(rateUnit: string | null | undefined): boolean {
  const u = unidadDeTarifa(rateUnit);
  return u !== null && u !== "PER_PAX";
}

/** «por persona», «por grupo de 8», «por hora», «por partido»… */
export function textoDeLaUnidad(t: Pick<TarifaElegible, "rateUnit" | "minPax" | "maxPax">): string {
  const unidad = unidadDeTarifa(t.rateUnit);
  // Si el documento ya lo dice en castellano («por partido»), se respeta.
  const propio = /^por\s+\S/i.test(String(t.rateUnit ?? "").trim()) ? String(t.rateUnit).trim().toLowerCase() : null;
  switch (unidad) {
    case "PER_GROUP":
      return t.maxPax ? `por grupo de ${t.maxPax}` : "por grupo";
    case "PER_HOUR":
      return "por hora";
    case "PER_DAY":
      return propio ?? "por día";
    case "PER_SERVICE":
      return propio ?? "por servicio";
    case "PER_UNIT":
      return propio ?? "por unidad";
    default:
      return "por persona";
  }
}

export interface TramoDeEdad {
  min: number | null;
  max: number | null;
}

const redondear = (n: number) => Math.round(n * 100) / 100;
const sinTildes = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * «Joven/Secundaria/Uni (12-17)» → 12–17; «Sénior (desde 60)» → 60+; «Adulto
 * (18-59)» → 18–59. Y en palabras, como vienen en PortAventura Park sin
 * paréntesis: Júnior/Primaria 4–11, Joven/Secundaria 12–17, Adulto 18–59,
 * Sénior 60+ (lo dice el pie del PDF); «Desde 15 años», «Adultos».
 */
export function edadDeEtiqueta(etiqueta: string | null | undefined): TramoDeEdad | null {
  const t = etiqueta ?? "";
  const rango = /\((\d{1,2})\s*[-–]\s*(\d{1,2})\)/.exec(t);
  if (rango) return { min: Number(rango[1]), max: Number(rango[2]) };
  const desde = /\((?:desde|a partir de|\+)\s*(\d{1,2})\)|\((\d{1,2})\+\)/i.exec(t);
  if (desde) return { min: Number(desde[1] ?? desde[2]), max: null };
  const hasta = /\((?:hasta|menores de)\s*(\d{1,2})\)/i.exec(t);
  if (hasta) return { min: null, max: Number(hasta[1]) };
  const s = sinTildes(t);
  const suelto = /(\d{1,2})\s*(?:a|-|–)\s*(\d{1,2})\s*anos/.exec(s);
  if (suelto) return { min: Number(suelto[1]), max: Number(suelto[2]) };
  const desdeAnos = /(?:desde|a partir de|mas de|\+)\s*(\d{1,2})\s*anos|(\d{1,2})\s*\+\s*anos/.exec(s);
  if (desdeAnos) return { min: Number(desdeAnos[1] ?? desdeAnos[2]), max: null };
  const hastaAnos = /(?:hasta|menores de)\s*(\d{1,2})\s*anos/.exec(s);
  if (hastaAnos) return { min: null, max: Number(hastaAnos[1]) };
  if (/junior|primaria|infantil/.test(s)) return { min: 4, max: 11 };
  if (/joven|secundaria|\beso\b|bachiller/.test(s)) return { min: 12, max: 17 };
  if (/senior/.test(s)) return { min: 60, max: null };
  if (/adult/.test(s)) return { min: 18, max: 59 };
  return null;
}

/** Lo que no encaja entre la tarifa y el grupo: tamaño y edad mínima. Vacío = nada que avisar. */
export function avisosDeLaTarifa(
  t: Pick<TarifaElegible, "ageLabel" | "ageMin" | "ageMax" | "minPax" | "maxPax">,
  alumnos: number,
  profesores: number,
  edadGrupo: TramoDeEdad | null,
): string[] {
  const avisos: string[] = [];
  const personas = alumnos + profesores;
  if (personas > 0) {
    if (t.minPax && personas < t.minPax) avisos.push(`Tarifa para grupos de ${t.minPax} o más: el grupo son ${personas}.`);
    if (t.maxPax && personas > t.maxPax && !(t.minPax && t.minPax === t.maxPax)) {
      avisos.push(`Tarifa para grupos de hasta ${t.maxPax}: el grupo son ${personas}.`);
    }
  }
  const tramo = tramoDeTarifa(t);
  if (edadGrupo && tramo && !esDeAdulto(t.ageLabel)) {
    if (tramo.min !== null && edadGrupo.min !== null && edadGrupo.min < tramo.min) {
      avisos.push(`Desde ${tramo.min} años: en el grupo hay alumnos de ${edadGrupo.min}.`);
    }
    if (tramo.max !== null && edadGrupo.max !== null && edadGrupo.max > tramo.max) {
      avisos.push(`Hasta ${tramo.max} años: en el grupo hay alumnos de ${edadGrupo.max}.`);
    }
  }
  return avisos;
}

/** «14-15», «de 14 a 16 años», «15» → tramo. */
export function tramoDelGrupo(ageRangeText: string | null | undefined, averageAgeText?: string | null): TramoDeEdad | null {
  const texto = `${ageRangeText ?? ""} ${averageAgeText ?? ""}`;
  const dos = /(\d{1,2})\s*(?:-|–|a|y|hasta)\s*(\d{1,2})/.exec(texto);
  if (dos) return { min: Math.min(Number(dos[1]), Number(dos[2])), max: Math.max(Number(dos[1]), Number(dos[2])) };
  const uno = /(\d{1,2})/.exec(texto);
  if (uno) return { min: Number(uno[1]), max: Number(uno[1]) };
  return null;
}

function solapa(a: TramoDeEdad, b: TramoDeEdad): boolean {
  const aMin = a.min ?? 0, aMax = a.max ?? 120, bMin = b.min ?? 0, bMax = b.max ?? 120;
  return aMax >= bMin && aMin <= bMax;
}

function tramoDeTarifa(t: Pick<TarifaElegible, "ageLabel" | "ageMin" | "ageMax">): TramoDeEdad | null {
  if (t.ageMin != null || t.ageMax != null) return { min: t.ageMin ?? null, max: t.ageMax ?? null };
  return edadDeEtiqueta(t.ageLabel);
}

/** La parte de la etiqueta que no es el tramo: «Entrada · Periodo C». */
function variante(etiqueta: string | null): string {
  const partes = (etiqueta ?? "").split("·").map((p) => p.trim()).filter(Boolean);
  return partes.slice(1).join(" · ");
}

/** Sin extras: «Entrada» antes que «Entrada + Ticket Plus», y nada de PROMO. */
function esBasica(etiqueta: string | null): boolean {
  const e = (etiqueta ?? "").toLowerCase();
  return !/promo|plus|express|vip/.test(e);
}

function esDeAdulto(etiqueta: string | null): boolean {
  const e = (etiqueta ?? "").toLowerCase();
  return /adult|profesor|docente/.test(e) && !/promo/.test(e);
}

function esEspecial(etiqueta: string | null): boolean {
  return /discapaci|senior|sénior|infantil|bebe|bebé/i.test(etiqueta ?? "");
}

/**
 * Las líneas con las que arranca una actividad recién marcada. Un primer
 * esbozo, no una decisión: quien cotiza las corrige en la ventana.
 *
 * - Alumnos: la tarifa cuyo tramo de edad encaja con el grupo; entre varias,
 *   la básica (sin Plus/Express/PROMO) y la más barata (que suele ser el
 *   primer periodo). Sin edad en el grupo ni en las tarifas, la más barata
 *   que no sea «especial» (discapacidad, sénior…).
 * - Profesores: la tarifa de adulto con la MISMA variante que la de los
 *   alumnos (misma entrada, mismo periodo). Si no la hay, la misma que ellos.
 */
export function lineasPorDefecto(
  tarifas: TarifaElegible[],
  alumnos: number,
  profesores: number,
  edadGrupo: TramoDeEdad | null,
  contexto: ContextoDelEsbozo = {},
): LineaDeActividad[] {
  let conPrecio = tarifas.filter((t) => t.salePvpAmount > 0);
  if (conPrecio.length === 0) return [];

  // PortAventura cobra por periodo del calendario: solo las tarifas del
  // periodo de los días del viaje (el más frecuente). Si ninguna lo lleva, todas.
  const periodos = contexto.periodos ?? [];
  if (periodos.length) {
    const conPeriodo = conPrecio.filter((t) => periodoDeEtiqueta(t.ageLabel));
    if (conPeriodo.length) {
      const delViaje = periodos.map((p) => conPeriodo.filter((t) => periodoDeEtiqueta(t.ageLabel) === p)).find((l) => l.length);
      if (delViaje) conPrecio = delViaje;
    }
  }

  // Lo que no es por persona (por hora, por grupo, por día) no se multiplica
  // por cada alumno: una unidad, o tantos grupos como hagan falta.
  const unidad = conPrecio.find((t) => esPorUnidad(t.rateUnit));
  if (unidad) {
    const personas = alumnos + profesores;
    const cantidad =
      unidadDeTarifa(unidad.rateUnit) === "PER_GROUP" && unidad.maxPax && personas > 0 ? Math.ceil(personas / unidad.maxPax) : 1;
    return [{ rateId: unidad.id, etiqueta: unidad.ageLabel || textoDeLaUnidad(unidad), precio: unidad.salePvpAmount, cantidad }];
  }

  const porPrecio = (a: TarifaElegible, b: TarifaElegible) => a.salePvpAmount - b.salePvpAmount;
  // Si el colegio pidió una modalidad («con ticket plus»), esa; si no, la básica.
  const modalidad = sinTildes(contexto.modalidad ?? "").trim();
  const preferir = (lista: TarifaElegible[]) => {
    const pedidas = modalidad ? lista.filter((t) => sinTildes(t.ageLabel ?? "").includes(modalidad)) : [];
    if (pedidas.length) return [...pedidas].sort(porPrecio)[0];
    const basicas = lista.filter((t) => esBasica(t.ageLabel));
    return [...(basicas.length ? basicas : lista)].sort(porPrecio)[0];
  };

  let deAlumnos: TarifaElegible | undefined;
  if (edadGrupo) {
    const encajan = conPrecio.filter((t) => {
      const tramo = tramoDeTarifa(t);
      return tramo ? solapa(tramo, edadGrupo) && !esEspecial(t.ageLabel) : false;
    });
    if (encajan.length) deAlumnos = preferir(encajan);
  }
  if (!deAlumnos) {
    const normales = conPrecio.filter((t) => !esEspecial(t.ageLabel) && !esDeAdulto(t.ageLabel));
    deAlumnos = preferir(normales.length ? normales : conPrecio.filter((t) => !esEspecial(t.ageLabel)));
  }
  if (!deAlumnos) deAlumnos = preferir(conPrecio);

  const lineas: LineaDeActividad[] = [];
  if (alumnos > 0) {
    lineas.push({ rateId: deAlumnos.id, etiqueta: deAlumnos.ageLabel || "Tarifa única", precio: deAlumnos.salePvpAmount, cantidad: alumnos });
  }
  if (profesores > 0) {
    const v = variante(deAlumnos.ageLabel);
    const deAdulto = conPrecio.filter((t) => esDeAdulto(t.ageLabel) && variante(t.ageLabel) === v);
    const elegida = deAdulto.length ? preferir(deAdulto) : deAlumnos;
    // Los que el proveedor da gratis («1 profesor gratis por cada 15 alumnos»)
    // van en su línea a 0 €, para que se vea y no se cobre.
    const gratis = profesoresGratis(contexto.gratuidad, alumnos, profesores);
    const dePago = profesores - gratis;
    if (dePago > 0) {
      const existente = lineas.find((l) => l.rateId === elegida.id);
      if (existente) existente.cantidad += dePago;
      else lineas.push({ rateId: elegida.id, etiqueta: elegida.ageLabel || "Tarifa única", precio: elegida.salePvpAmount, cantidad: dePago });
    }
    if (gratis > 0) {
      lineas.push({ rateId: idDeGratuidad(elegida.id), etiqueta: `${elegida.ageLabel || "Profesor"} · gratuidad`, precio: 0, cantidad: gratis });
    }
  }
  return lineas;
}

/** La línea de los profesores gratis lleva el id de su tarifa con esta marca. */
export const MARCA_GRATUIDAD = "#gratis";
export const idDeGratuidad = (rateId: string) => `${rateId}${MARCA_GRATUIDAD}`;
export const esLineaDeGratuidad = (l: Pick<LineaDeActividad, "rateId">) => l.rateId.endsWith(MARCA_GRATUIDAD);

/** «Periodo C» en la etiqueta → «C». */
function periodoDeEtiqueta(etiqueta: string | null | undefined): string | null {
  const m = /per[ií]odo\s+([a-f])\b/i.exec(etiqueta ?? "");
  return m ? m[1].toUpperCase() : null;
}

export function totalDeLineas(lineas: LineaDeActividad[]): number {
  return redondear(lineas.reduce((suma, l) => suma + l.precio * l.cantidad, 0));
}

/** Lo que se suma al precio por alumno: el total repartido entre los alumnos. */
export function porAlumno(lineas: LineaDeActividad[], alumnos: number): number {
  if (alumnos <= 0) return 0;
  return redondear(totalDeLineas(lineas) / alumnos);
}

// Con espacio normal antes del euro: Intl mete uno «duro» (U+00A0) que luego
// rompe búsquedas y comparaciones sin que se vea.
const euros = (n: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2 })
    .format(n)
    .replace(/ /g, " ");

/**
 * Las líneas para el documento, una por fila: «80 × 52,00 € Joven… · Entrada
 * + Ticket Plus · Periodo C». Partir el resumen por « + » no vale, porque las
 * propias tarifas llevan «+» en el nombre (Ruth, 26/10/2026: el texto continuo
 * no se leía).
 */
export function lineasEnLista(lineas: LineaDeActividad[]): string[] {
  return lineas
    .filter((l) => l.cantidad > 0)
    .map((l) => `${l.precio < 0 ? "− " : ""}${l.cantidad} × ${euros(Math.abs(l.precio))} ${l.etiqueta}`);
}

/** «25 × 17,00 € Joven (12-17) · Entrada · Periodo B + 2 × 23,00 € Adulto (18-59) · Entrada · Periodo B = 471,00 €». */
export function resumenDeLineas(lineas: LineaDeActividad[]): string {
  const activas = lineas.filter((l) => l.cantidad > 0);
  if (activas.length === 0) return "";
  // Una línea en negativo (el descuento) se resta: «− 35 × 4,00 € descuento por alumno».
  const partes = activas.map((l, i) => {
    const texto = `${l.cantidad} × ${euros(Math.abs(l.precio))} ${l.etiqueta}`;
    return i === 0 ? (l.precio < 0 ? `− ${texto}` : texto) : `${l.precio < 0 ? "−" : "+"} ${texto}`;
  });
  return `${partes.join(" ")} = ${euros(totalDeLineas(activas))}`;
}
