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
  salePvpAmount: number;
}

export interface TramoDeEdad {
  min: number | null;
  max: number | null;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

/** «Joven/Secundaria/Uni (12-17)» → 12–17; «Sénior (desde 60)» → 60+; «Adulto (18-59)» → 18–59. */
export function edadDeEtiqueta(etiqueta: string | null | undefined): TramoDeEdad | null {
  const t = etiqueta ?? "";
  const rango = /\((\d{1,2})\s*[-–]\s*(\d{1,2})\)/.exec(t);
  if (rango) return { min: Number(rango[1]), max: Number(rango[2]) };
  const desde = /\((?:desde|a partir de|\+)\s*(\d{1,2})\)|\((\d{1,2})\+\)/i.exec(t);
  if (desde) return { min: Number(desde[1] ?? desde[2]), max: null };
  const hasta = /\((?:hasta|menores de)\s*(\d{1,2})\)/i.exec(t);
  if (hasta) return { min: null, max: Number(hasta[1]) };
  return null;
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

function tramoDeTarifa(t: TarifaElegible): TramoDeEdad | null {
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
): LineaDeActividad[] {
  const conPrecio = tarifas.filter((t) => t.salePvpAmount > 0);
  if (conPrecio.length === 0) return [];

  const porPrecio = (a: TarifaElegible, b: TarifaElegible) => a.salePvpAmount - b.salePvpAmount;
  const preferir = (lista: TarifaElegible[]) => {
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
    const existente = lineas.find((l) => l.rateId === elegida.id);
    if (existente) existente.cantidad += profesores;
    else lineas.push({ rateId: elegida.id, etiqueta: elegida.ageLabel || "Tarifa única", precio: elegida.salePvpAmount, cantidad: profesores });
  }
  return lineas;
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

/** «25 × 17,00 € Joven (12-17) · Entrada · Periodo B + 2 × 23,00 € Adulto (18-59) · Entrada · Periodo B = 471,00 €». */
export function resumenDeLineas(lineas: LineaDeActividad[]): string {
  const activas = lineas.filter((l) => l.cantidad > 0);
  if (activas.length === 0) return "";
  const partes = activas.map((l) => `${l.cantidad} × ${euros(l.precio)} ${l.etiqueta}`);
  return `${partes.join(" + ")} = ${euros(totalDeLineas(activas))}`;
}
