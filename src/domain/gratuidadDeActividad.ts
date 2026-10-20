/**
 * Las gratuidades de una actividad, leídas de sus condiciones.
 *
 * Vienen en la columna «Gratuidades» del Excel de Oravia y se publican como
 * condición de la actividad («Gratuidades: 1 profesor gratis por cada 15
 * alumnos de pago», «Profesores acompañantes gratis», «2 gratis por cada 10
 * alumnos», «Consultar»). Hasta el 20/10/2026 no se usaban: el esbozo cobraba
 * a todos los profesores aunque el proveedor los diera gratis. Anthony: «si el
 * archivo lo tiene, ese dato tiene que estar, ser visible y se tiene que
 * emplear».
 */

export type GratuidadDeProfesores =
  | { tipo: "todos"; texto: string }
  | { tipo: "porCada"; gratis: number; cada: number; texto: string }
  | { tipo: "consultar"; texto: string };

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** La gratuidad de profesores que dicen las condiciones, o null si no dicen nada. */
export function gratuidadDeProfesores(
  policies: Array<{ policyType?: string | null; policyText: string }> | null | undefined,
): GratuidadDeProfesores | null {
  for (const p of policies ?? []) {
    const texto = p.policyText.trim();
    const t = normal(texto);
    if (!/gratuidad|gratis/.test(t)) continue;
    const m = /gratuidades?\s*:\s*(.*)$/is.exec(texto);
    const frase = (m ? m[1] : texto).trim();
    const f = normal(frase);
    if (/^consultar/.test(f)) return { tipo: "consultar", texto: frase };
    if (/profesor(es)?( acompanantes?)? gratis|gratis (los|para) profesores/.test(f) && !/por cada/.test(f)) {
      return { tipo: "todos", texto: frase };
    }
    const porCada = /(\d+)\s*(?:profesor(?:es)?\s*)?(?:gratis|gratuidad(?:es)?)\s*(?:por\s*)?cada\s*(\d+)/.exec(f);
    if (porCada) return { tipo: "porCada", gratis: Number(porCada[1]), cada: Number(porCada[2]), texto: frase };
    const unaCada = /1\s*gratuidad\s*(?:por\s*)?cada\s*(\d+)/.exec(f);
    if (unaCada) return { tipo: "porCada", gratis: 1, cada: Number(unaCada[1]), texto: frase };
  }
  return null;
}

/** Cuántos profesores van gratis con esa gratuidad y ese grupo. */
export function profesoresGratis(g: GratuidadDeProfesores | null | undefined, alumnos: number, profesores: number): number {
  if (!g || profesores <= 0) return 0;
  if (g.tipo === "todos") return profesores;
  if (g.tipo === "porCada" && g.cada > 0) return Math.min(profesores, Math.floor(alumnos / g.cada) * g.gratis);
  return 0;
}

/** Cómo se explica en pantalla y en el documento. */
export function textoDeLaGratuidad(g: GratuidadDeProfesores | null | undefined, alumnos: number, profesores: number): string {
  if (!g) return "";
  const n = profesoresGratis(g, alumnos, profesores);
  if (g.tipo === "consultar") return "Gratuidades: a consultar con el proveedor.";
  if (g.tipo === "todos") return `El proveedor da gratis a los profesores: ${n} ${n === 1 ? "profesor" : "profesores"} sin coste.`;
  return `El proveedor da ${g.gratis} ${g.gratis === 1 ? "gratis" : "gratis"} por cada ${g.cada} alumnos: ${n} ${n === 1 ? "profesor" : "profesores"} sin coste.`;
}
