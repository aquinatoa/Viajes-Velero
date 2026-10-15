/**
 * Los periodos de una tarifa de actividad.
 *
 * Ruth y Javier, 08/10/2026: «dos periodos de aplicación al año». El Tuna Tour
 * Educa de Balfegó vale lo mismo del 1 de abril al 5 de junio y de septiembre a
 * mediados de octubre; el Experience, del 6 de junio al 31 de agosto. Como los
 * hoteles: cada periodo, su tarifa.
 *
 * Una tarifa sin fechas vale todo el año. Una con fechas solo vale si el viaje
 * cae, aunque sea un día, dentro de ellas. Fuera de temporada la actividad se
 * sigue enseñando, marcada: Javier quiere verlas siempre todas.
 */

export interface Periodo {
  /** AAAA-MM-DD */
  desde: string;
  /** AAAA-MM-DD */
  hasta: string;
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const dos = (n: number) => String(n).padStart(2, "0");
const iso = (a: number, m: number, d: number) => `${a}-${dos(m)}-${dos(d)}`;
const ultimoDia = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();

function fechaValida(a: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= ultimoDia(a, m);
}

function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Los periodos que se pueden leer SIN adivinar de la columna «Temporada /
 * Validez» de la plantilla:
 *
 * - Rangos con fecha completa: «Del 01/05/2027 al 31/10/2027», «01/04/2027 -
 *   05/06/2027; 01/09/2027 - 15/10/2027». Uno o varios.
 * - «2027 (excepto julio y agosto)»: el año entero menos esos meses, que son
 *   dos periodos (1/1–30/6 y 1/9–31/12). Lo dicen 21 filas de la plantilla.
 *
 * Lo demás («Temporada 2027», «Curso escolar 2026-2027», «de septiembre a
 * mediados de octubre») devuelve [] y la tarifa vale todo el año: «mediados»
 * no es una fecha, y equivocarse deja una actividad fuera de temporada.
 */
export function leerPeriodos(texto: string | null | undefined, anio: number | null): Periodo[] {
  const t = (texto ?? "").trim();
  if (!t) return [];

  const rangos: Periodo[] = [];
  const fecha = String.raw`(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})`;
  const patron = new RegExp(`${fecha}\\s*(?:al|a|hasta|-|–|—)\\s*${fecha}`, "gi");
  for (const m of t.matchAll(patron)) {
    const [d1, m1, a1, d2, m2, a2] = m.slice(1).map(Number);
    if (!fechaValida(a1, m1, d1) || !fechaValida(a2, m2, d2)) continue;
    const desde = iso(a1, m1, d1);
    const hasta = iso(a2, m2, d2);
    if (desde <= hasta) rangos.push({ desde, hasta });
  }
  if (rangos.length > 0) return rangos;

  const excepto = /excepto\s+([a-z\s,y]+)/.exec(sinTildes(t));
  if (excepto && anio) {
    const fuera = new Set(
      excepto[1]
        .split(/,|\sy\s|\s/)
        .map((p) => MESES[p.trim()])
        .filter((n): n is number => Boolean(n)),
    );
    if (fuera.size === 0 || fuera.size === 12) return [];
    const periodos: Periodo[] = [];
    let inicio: number | null = null;
    for (let mes = 1; mes <= 13; mes += 1) {
      const dentro = mes <= 12 && !fuera.has(mes);
      if (dentro && inicio === null) inicio = mes;
      if (!dentro && inicio !== null) {
        periodos.push({ desde: iso(anio, inicio, 1), hasta: iso(anio, mes - 1, ultimoDia(anio, mes - 1)) });
        inicio = null;
      }
    }
    return periodos;
  }

  return [];
}

function diaIso(valor: string | Date | null | undefined): string | null {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(valor);
  return m ? m[1] : null;
}

/**
 * ¿Vale esta tarifa para un viaje de `viajeDesde` a `viajeHasta`?
 *
 * Sin fechas en la tarifa, sí. Sin fechas del viaje, también: no se puede
 * descartar lo que no se sabe. Con las dos, si se solapan en algún día.
 */
export function valeParaElViaje(
  tarifa: { dateFrom?: string | Date | null; dateTo?: string | Date | null },
  viajeDesde: string | Date | null | undefined,
  viajeHasta: string | Date | null | undefined,
): boolean {
  const desde = diaIso(tarifa.dateFrom);
  const hasta = diaIso(tarifa.dateTo);
  if (!desde && !hasta) return true;
  const ida = diaIso(viajeDesde);
  const vuelta = diaIso(viajeHasta) ?? ida;
  if (!ida || !vuelta) return true;
  return (!desde || vuelta >= desde) && (!hasta || ida <= hasta);
}

const CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «del 1 abr al 5 jun 2027», o «todo el año» si no tiene fechas. */
export function textoDelPeriodo(dateFrom?: string | Date | null, dateTo?: string | Date | null): string {
  const desde = diaIso(dateFrom);
  const hasta = diaIso(dateTo);
  if (!desde && !hasta) return "todo el año";
  const corto = (d: string, conAnio: boolean) => {
    const [a, m, dia] = d.split("-").map(Number);
    return `${dia} ${CORTOS[m - 1]}${conAnio ? ` ${a}` : ""}`;
  };
  if (desde && hasta) {
    const mismoAnio = desde.slice(0, 4) === hasta.slice(0, 4);
    return `del ${corto(desde, !mismoAnio)} al ${corto(hasta, true)}`;
  }
  return desde ? `desde el ${corto(desde, true)}` : `hasta el ${corto(hasta as string, true)}`;
}
