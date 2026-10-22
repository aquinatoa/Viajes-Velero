/**
 * El desglose de una opción de alojamiento, leído del texto en que se guarda.
 *
 * La propuesta es una foto: guarda «43,13 € x 48 alumnos + 60,11 € x 8
 * profesores (uso individual), por noche x 4 noches» como texto, y el total
 * como «9.661,12 €». El formato lo escribe `proposalService` (y desde el
 * 19/10/2026 `textoDelDesglose` de `estancia.ts`), así que se lee sin adivinar.
 * De aquí salen el precio por alumno y por profesor PARA LA ESTANCIA —lo que
 * Javier pidió ver en grande en el PDF el 29/09— y las filas de «Servicios
 * Contratados» del trato.
 *
 * Desde el 19/10/2026 una estancia puede tener tramos (Ruth: «MP y PC
 * mezcladas») y chófer: «MP: … por noche x 2 noches · PC: … por noche x 1
 * noche», y «+ 40,00 € x 1 chófer (individual)».
 */

export interface ParteDelDesglose {
  pax: number;
  /** Por persona y noche. */
  precio: number;
}

export type ParteDeAcompanantes = ParteDelDesglose & {
  individual: boolean;
  habitacion: "INDIVIDUAL" | "DOBLE" | "MULTIPLE";
  regimen?: string | null;
};

export interface TramoDelDesglose {
  /** «MP», «PC»… cuando la estancia mezcla pensiones; null si es una sola. */
  regimen: string | null;
  noches: number;
  alumnos: ParteDelDesglose;
  /** El primer grupo de profesores (con un solo tipo de habitación, todos). */
  profesores: ParteDeAcompanantes | null;
  chofer: (ParteDelDesglose & { habitacion: "INDIVIDUAL" | "DOBLE" | "MULTIPLE"; regimen?: string | null }) | null;
  /** Todos los grupos: profesores o chóferes repartidos en varias habitaciones (21/10/2026). */
  profesoresGrupos?: ParteDeAcompanantes[];
  choferGrupos?: ParteDeAcompanantes[];
}

/** «uso individual, PC» → «PC»: la pensión propia, si la lleva. */
function regimenPropio(texto: string): string | null {
  return /,\s*(PC|MP|AD|SA)\b/.exec(texto)?.[1] ?? null;
}

export interface Desglose {
  /** Los del primer tramo: con un solo tramo, los de siempre. */
  alumnos: ParteDelDesglose;
  profesores: (ParteDelDesglose & { individual: boolean }) | null;
  /** Todas las noches. */
  noches: number;
  total: number | null;
  tramos: TramoDelDesglose[];
}

/** «9.661,12 €» → 9661.12. */
export function importeDesdeTexto(texto: string | null | undefined): number | null {
  const m = /-?[\d.]+(?:,\d+)?/.exec(texto ?? "");
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function habitacionDe(texto: string): "INDIVIDUAL" | "DOBLE" | "MULTIPLE" {
  if (/sin tarifa individual|precio de múltiple|en múltiple|^múltiple/i.test(texto)) return "MULTIPLE";
  if (/individual/i.test(texto)) return "INDIVIDUAL";
  if (/doble/i.test(texto)) return "DOBLE";
  return "MULTIPLE";
}

function leerTramo(segmento: string): TramoDelDesglose | null {
  const regimen = /^([A-Z+]{2,12}):\s/.exec(segmento);
  const alumnos = /([\d.]+,\d{2}) € x (\d+) alumnos(?: \(([^)]*)\))?/.exec(segmento);
  const noches = /por noche x (\d+) noche/.exec(segmento);
  if (!alumnos || !noches) return null;
  const grupos = (quien: "profesores" | "chófer"): ParteDeAcompanantes[] =>
    [...segmento.matchAll(new RegExp(`([\\d.]+,\\d{2}) € x (\\d+) ${quien} \\(([^)]*)\\)`, "g"))].map((m) => ({
      pax: Number(m[2]),
      precio: importeDesdeTexto(m[1]) ?? 0,
      individual: quien === "profesores" ? /uso individual/i.test(m[3]) : /individual/i.test(m[3]),
      habitacion: habitacionDe(m[3]),
      regimen: regimenPropio(m[3]),
    }));
  const profesores = grupos("profesores");
  const chofer = grupos("chófer");
  return {
    regimen: regimen ? regimen[1] : null,
    noches: Number(noches[1]),
    alumnos: { pax: Number(alumnos[2]), precio: importeDesdeTexto(alumnos[1]) ?? 0 },
    profesores: profesores[0] ?? null,
    chofer: chofer[0] ? { pax: chofer[0].pax, precio: chofer[0].precio, habitacion: chofer[0].habitacion, regimen: chofer[0].regimen } : null,
    ...(profesores.length > 1 ? { profesoresGrupos: profesores } : {}),
    ...(chofer.length > 1 ? { choferGrupos: chofer } : {}),
  };
}

/**
 * Lee el desglose tal como lo escribe la propuesta:
 *   «[XX: ]{precio} x {n} alumnos[ + {precio} x {m} profesores (…)][ + {precio}
 *   x {c} chófer (…)], por noche x {k} noches[ · XX: …]»
 */
export function desgloseDeLaOpcion(
  priceBreakdownText: string | null | undefined,
  totalPvpText: string | null | undefined,
): Desglose | null {
  const texto = (priceBreakdownText ?? "").replace(/\s+/g, " ").trim();
  const tramos = texto
    .split(" · ")
    .map((s) => leerTramo(s.trim()))
    .filter((t): t is TramoDelDesglose => t !== null);
  if (tramos.length === 0) return null;
  const primero = tramos[0];
  return {
    alumnos: primero.alumnos,
    profesores: primero.profesores
      ? { pax: primero.profesores.pax, precio: primero.profesores.precio, individual: primero.profesores.individual }
      : null,
    noches: tramos.reduce((s, t) => s + t.noches, 0),
    total: importeDesdeTexto(totalPvpText),
    tramos,
  };
}

/** Lo que paga cada persona por toda la estancia: la suma de cada tramo, por noche × noches. */
export function precioPorEstancia(d: Desglose): { alumno: number; profesor: number | null } {
  const redondear = (n: number) => Math.round(n * 100) / 100;
  const tramos = d.tramos?.length ? d.tramos : [{ noches: d.noches, alumnos: d.alumnos, profesores: d.profesores }];
  const conProfesores = tramos.some((t) => t.profesores);
  return {
    alumno: redondear(tramos.reduce((s, t) => s + t.alumnos.precio * t.noches, 0)),
    profesor: conProfesores ? redondear(tramos.reduce((s, t) => s + (t.profesores?.precio ?? 0) * t.noches, 0)) : null,
  };
}
