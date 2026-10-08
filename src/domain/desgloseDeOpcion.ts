/**
 * El desglose de una opción de alojamiento, leído del texto en que se guarda.
 *
 * La propuesta es una foto: guarda «43,13 € x 48 alumnos + 60,11 € x 8
 * profesores (uso individual), por noche x 4 noches» como texto, y el total
 * como «9.661,12 €». El formato lo escribe `proposalService`, así que se lee
 * sin adivinar. De aquí salen el precio por alumno y por profesor PARA LA
 * ESTANCIA —lo que Javier pidió ver en grande en el PDF el 29/09— y las
 * filas de «Servicios Contratados» del trato.
 */

export interface ParteDelDesglose {
  pax: number;
  /** Por persona y noche. */
  precio: number;
}

export interface Desglose {
  alumnos: ParteDelDesglose;
  profesores: (ParteDelDesglose & { individual: boolean }) | null;
  noches: number;
  total: number | null;
}

/** «9.661,12 €» → 9661.12. */
export function importeDesdeTexto(texto: string | null | undefined): number | null {
  const m = /-?[\d.]+(?:,\d+)?/.exec(texto ?? "");
  if (!m) return null;
  const n = Number(m[0].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Lee el desglose tal como lo escribe `proposalService`:
 *   «{precio} x {n} alumnos[ + {precio} x {m} profesores (uso individual|sin
 *   tarifa individual: mismo precio)], por noche x {k} noches»
 */
export function desgloseDeLaOpcion(
  priceBreakdownText: string | null | undefined,
  totalPvpText: string | null | undefined,
): Desglose | null {
  const texto = (priceBreakdownText ?? "").replace(/\s+/g, " ").trim();
  const alumnos = /([\d.]+,\d{2}) € x (\d+) alumnos/.exec(texto);
  const noches = /por noche x (\d+) noche/.exec(texto);
  if (!alumnos || !noches) return null;

  const profesores = /([\d.]+,\d{2}) € x (\d+) profesores \(([^)]*)\)/.exec(texto);

  return {
    alumnos: { pax: Number(alumnos[2]), precio: importeDesdeTexto(alumnos[1]) ?? 0 },
    profesores: profesores
      ? {
          pax: Number(profesores[2]),
          precio: importeDesdeTexto(profesores[1]) ?? 0,
          individual: /uso individual/i.test(profesores[3]),
        }
      : null,
    noches: Number(noches[1]),
    total: importeDesdeTexto(totalPvpText),
  };
}

/** Lo que paga cada persona por toda la estancia: por noche × noches. */
export function precioPorEstancia(d: Desglose): { alumno: number; profesor: number | null } {
  const redondear = (n: number) => Math.round(n * 100) / 100;
  return {
    alumno: redondear(d.alumnos.precio * d.noches),
    profesor: d.profesores ? redondear(d.profesores.precio * d.noches) : null,
  };
}
