/**
 * Cómo se llama a la gente del grupo según el departamento.
 *
 * El cotizador nació para colegios y todo lo que ve el cliente dice «alumnos»
 * y «profesores». Para un club deportivo eso confunde (Javier, 16/11/2026:
 * «no nos encaja la nomenclatura de estudiantes y profesores para Sports»):
 *
 *   · Grupos: estudiantes / alumnos y profesores.
 *   · Sports: jugadores y entrenadores.
 *
 * Los textos del documento se montan en muchos sitios y algunos se guardan en
 * la base con las palabras de colegio (el desglose, que además se vuelve a
 * leer buscando «alumnos» y «profesores»). Por eso NO se cambia lo guardado ni
 * cómo se genera: se traduce al final, justo antes de enseñarlo, y solo si la
 * propuesta es de Sports. Las propuestas ya enviadas salen bien sin tocarlas.
 *
 * Es lógica pura, sin pantalla ni base de datos.
 */

export type Departamento = "GROUPS" | "SPORTS" | string | null | undefined;

export interface VocabularioDelGrupo {
  alumno: string;
  alumnos: string;
  profesor: string;
  profesores: string;
}

const DE_COLEGIO: VocabularioDelGrupo = { alumno: "alumno", alumnos: "alumnos", profesor: "profesor", profesores: "profesores" };
const DE_CLUB: VocabularioDelGrupo = { alumno: "jugador", alumnos: "jugadores", profesor: "entrenador", profesores: "entrenadores" };

export function esDeSports(departamento: Departamento): boolean {
  return String(departamento ?? "").trim().toUpperCase() === "SPORTS";
}

/** Las cuatro palabras, en minúscula, para montar un texto nuevo. */
export function vocabularioDelGrupo(departamento: Departamento): VocabularioDelGrupo {
  return esDeSports(departamento) ? DE_CLUB : DE_COLEGIO;
}

// De más larga a más corta, para que «profesores» no se quede en «entrenadores»
// a medias. Con y sin tilde no hace falta: ninguna la lleva.
const CAMBIOS: Array<[RegExp, string]> = [
  [/\b(profesores|profesoras)\b/gi, "entrenadores"],
  [/\b(profesor|profesora)\b/gi, "entrenador"],
  [/\b(alumnos|alumnas|estudiantes)\b/gi, "jugadores"],
  [/\b(alumno|alumna|estudiante)\b/gi, "jugador"],
];

/** Respeta cómo estaba escrita la palabra: «Profesores» → «Entrenadores», «ALUMNOS» → «JUGADORES». */
function comoEstaba(original: string, nueva: string): string {
  if (original.length > 1 && original === original.toUpperCase()) return nueva.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return nueva[0].toUpperCase() + nueva.slice(1);
  return nueva;
}

/** Un texto con las palabras del departamento. Para Grupos (o sin departamento) vuelve tal cual. */
export function conVocabulario(texto: string, departamento: Departamento): string;
export function conVocabulario(texto: string | null, departamento: Departamento): string | null;
export function conVocabulario(texto: string | null | undefined, departamento: Departamento): string | null | undefined;
export function conVocabulario(texto: string | null | undefined, departamento: Departamento): string | null | undefined {
  if (!texto || !esDeSports(departamento)) return texto;
  let salida = texto;
  for (const [patron, nueva] of CAMBIOS) salida = salida.replace(patron, (hallada) => comoEstaba(hallada, nueva));
  return salida;
}

/**
 * Lo mismo sobre una estructura entera (el documento del cliente): traduce
 * todos sus textos, en listas y objetos anidados, y deja lo demás como está.
 * Las claves de `saltar` no se tocan: lo que escribió a mano quien cotiza
 * (las notas) sale con sus palabras.
 */
export function conVocabularioEnTodo<T>(valor: T, departamento: Departamento, saltar: string[] = []): T {
  if (!esDeSports(departamento)) return valor;
  const recorrer = (v: unknown): unknown => {
    if (typeof v === "string") return conVocabulario(v, departamento);
    if (Array.isArray(v)) return v.map(recorrer);
    if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([clave, hijo]) => [clave, saltar.includes(clave) ? hijo : recorrer(hijo)]),
      );
    }
    return v;
  };
  return recorrer(valor) as T;
}
