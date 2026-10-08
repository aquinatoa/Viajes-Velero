/**
 * El rango de fechas de la pantalla de Viajes.
 *
 * Javier, 07/10/2026: «el filtro son las fechas y tienen que ser editables.
 * Por defecto, del 01-01-2027 a 31-12-2027». Y en la reunión del 08/10: el
 * filtro es para ver los importes de los viajes de un periodo. Hasta ahora
 * Viajes traía los 200 últimos tratos modificados, sin fechas, así que el
 * «Importe en curso» no era el de ningún periodo concreto.
 *
 * Las fechas que mandan son las de LLEGADA del grupo (`Fecha_llegada_actividad`
 * en su CRM, rellena en el 93 % de los tratos); si un trato no la tiene, la de
 * cierre. El calendario usa llegada y salida.
 */

export interface RangoDeViajes {
  /** AAAA-MM-DD */
  desde: string;
  /** AAAA-MM-DD */
  hasta: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** El año que viene entero: los colegios cotizan con un curso de antelación. */
export function rangoPorDefecto(hoy: Date = new Date()): RangoDeViajes {
  const anio = hoy.getFullYear() + 1;
  return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
}

/** Dos fechas bien escritas, reales y en orden. */
export function rangoValido(r: Partial<RangoDeViajes> | null | undefined): r is RangoDeViajes {
  if (!r || typeof r.desde !== "string" || typeof r.hasta !== "string") return false;
  if (!ISO.test(r.desde) || !ISO.test(r.hasta)) return false;
  const a = new Date(`${r.desde}T00:00:00Z`);
  const b = new Date(`${r.hasta}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false;
  // «2027-02-30» se convierte solo en marzo: no es una fecha que alguien quiso.
  if (a.toISOString().slice(0, 10) !== r.desde || b.toISOString().slice(0, 10) !== r.hasta) return false;
  return a.getTime() <= b.getTime();
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function corta(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
}

/** «del 1 ene 2027 al 31 dic 2027», o «todo 2027» si es el año entero. */
export function etiquetaDeRango(r: RangoDeViajes): string {
  const anioDesde = r.desde.slice(0, 4);
  if (r.desde === `${anioDesde}-01-01` && r.hasta === `${anioDesde}-12-31`) return `todo ${anioDesde}`;
  return `del ${corta(r.desde)} al ${corta(r.hasta)}`;
}

/** El mes con el que abre el calendario: el de hoy si cae dentro del rango; si no, el primero del rango. */
export function mesInicialDelCalendario(r: RangoDeViajes, hoy: Date = new Date()): Date {
  const hoyIso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  if (hoyIso >= r.desde && hoyIso <= r.hasta) return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const [a, m] = r.desde.split("-").map(Number);
  return new Date(a, m - 1, 1);
}
