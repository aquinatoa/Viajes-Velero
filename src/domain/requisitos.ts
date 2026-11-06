/**
 * Cuándo dos requisitos son el mismo.
 *
 * El cliente escribe «Natural Grass» y quien cotiza «césped natural»: es lo
 * mismo, y en «Lo que hemos entendido» salían los dos (prueba del 05/11/2026).
 * Comparar el texto exacto no basta. Esto reconoce las formas habituales —
 * inglés/español y «campo de…» delante— sin intentar entender el idioma entero;
 * lo que se escape lo ve el auditor de la IA, que compara por significado.
 */

function plano(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Palabras del mismo concepto en inglés y en español, a una sola forma. */
const EQUIVALENCIAS: Array<[RegExp, string]> = [
  [/\bnatural (?:grass|turf|pitch)\b/g, "cesped natural"],
  [/\bhierba natural\b/g, "cesped natural"],
  [/\bartificial (?:grass|turf|pitch)\b/g, "cesped artificial"],
  [/\bbungalows?\b/g, "bungalow"],
  [/\bcoach\b/g, "autocar"],
  [/\bbus\b/g, "autocar"],
  [/\bwheelchair\b/g, "accesibilidad"],
];

/** Palabras que no cambian de qué requisito se trata. */
const RELLENO = new Set(["campo", "de", "con", "el", "la", "los", "las", "un", "una", "se", "necesita", "necesitan", "quieren", "queremos", "need", "needs"]);

/** El requisito reducido a lo esencial, para compararlo. */
export function claveDeRequisito(texto: string): string {
  let t = plano(texto);
  for (const [patron, forma] of EQUIVALENCIAS) t = t.replace(patron, forma);
  return t
    .split(" ")
    .filter((p) => p && !RELLENO.has(p))
    .join(" ");
}

/** ¿Es el mismo requisito? Igual una vez reducido, o uno contiene entero al otro. */
export function mismoRequisito(a: string, b: string): boolean {
  const x = claveDeRequisito(a);
  const y = claveDeRequisito(b);
  if (!x || !y) return false;
  return x === y || (x.length >= 6 && y.includes(x)) || (y.length >= 6 && x.includes(y));
}

/** Añade los que faltan sin repetir ninguno de los que ya están. */
export function sumarRequisitos(actuales: string[], nuevos: string[]): string[] {
  const salida = [...actuales];
  for (const n of nuevos) {
    if (!salida.some((x) => mismoRequisito(x, n))) salida.push(n);
  }
  return salida;
}
