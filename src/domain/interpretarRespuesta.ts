/**
 * Qué hacer con lo que contesta una persona, que casi nunca es lo que se
 * preguntó.
 *
 * El fallo que lo destapa es de manual y estaba en pantalla. A «¿A qué destino
 * quieren ir?» se contestó:
 *
 *     «Seríamos 48 alumnos de entre 15 y 17 años. Nos interesa un hotel de 3
 *      estrellas en pensión completa.»
 *
 * y la app guardó esa frase entera COMO DESTINO, dio la pregunta por
 * contestada y pasó a la siguiente. A partir de ahí todo estaba mal: el destino
 * era un párrafo, y encima volvió a preguntar los alumnos, que estaban ahí
 * escritos.
 *
 * Dos reglas, y las dos importan igual:
 *
 *   1. SE APROVECHA TODO lo que venga, conteste o no a la pregunta. Si en la
 *      respuesta al destino hay 48 alumnos y pensión completa, se apuntan. Que
 *      una persona conteste de más es lo normal; volver a preguntarle algo que
 *      acaba de decir es lo que hace abandonar una conversación.
 *
 *   2. SI NO CONTESTA, SE INSISTE. Con naturalidad —reconociendo lo que sí se
 *      ha entendido— pero se insiste, porque sin el destino no hay nada que
 *      buscar. Dar por buena una respuesta que no responde es peor que no
 *      tener respuesta: deja un dato inventado con aspecto de dato real.
 *
 * Este módulo no lee texto: recibe YA LEÍDO lo que los lectores de siempre han
 * sacado de la respuesta —los mismos que leen el correo del colegio— y decide
 * qué guardar y qué decir. Así se puede comprobar sin arrastrar medio servicio.
 */
import type { ClaveDelHueco, Hueco } from "./loQueFalta";

/** Lo que los lectores han sacado de la respuesta. */
export interface LecturaDeLaRespuesta {
  destinationText?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  participants?: number | null;
  teachers?: number | null;
  ageRangeText?: string | null;
  regimeRequested?: string | null;
  categoryRequested?: string | null;
  topePorAlumno?: number | null;
  requisitos?: string[] | null;
}

export interface Interpretacion {
  /** Lo que hay que guardar, venga de donde venga dentro de la respuesta. */
  aplicar: LecturaDeLaRespuesta;
  /** Si la respuesta contesta de verdad a lo que se estaba preguntando. */
  contesta: boolean;
  /**
   * Lo que dice la app a continuación, o null si no hace falta decir nada.
   * Reconoce lo entendido y, cuando no se ha contestado, insiste.
   */
  dice: string | null;
}

/** Cómo se llama cada cosa cuando la app la repite en voz alta. */
const NOMBRES: Record<keyof LecturaDeLaRespuesta, (v: unknown) => string> = {
  destinationText: (v) => `el destino: ${v}`,
  dateFrom: (v) => `la llegada: ${v}`,
  dateTo: (v) => `la salida: ${v}`,
  participants: (v) => `${v} alumnos`,
  teachers: (v) => `${v} profesores`,
  ageRangeText: (v) => `edades ${v}`,
  regimeRequested: (v) => `${v}`,
  categoryRequested: (v) => `categoría ${v}`,
  topePorAlumno: (v) => `${v} € por alumno`,
  requisitos: (v) => (Array.isArray(v) ? v.join(" y ") : String(v)),
};

/** La clave de la lectura que contesta a cada pregunta. */
const CLAVE_DE_LA_PREGUNTA: Record<ClaveDelHueco, keyof LecturaDeLaRespuesta> = {
  destinationText: "destinationText",
  dateFrom: "dateFrom",
  dateTo: "dateTo",
  participants: "participants",
  teachers: "teachers",
  regimeRequested: "regimeRequested",
  categoryRequested: "categoryRequested",
  topePorAlumno: "topePorAlumno",
  requisitos: "requisitos",
};

function tieneValor(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/**
 * Formas de decir «no lo sé» que no son un nombre de sitio.
 *
 * Sin esto, contestar «ni idea» al destino guardaría un pueblo llamado «ni
 * idea» y la búsqueda no encontraría nada, sin decir por qué.
 */
const NO_ES_RESPUESTA =
  /^(no|nop|aun|aún|todav[ií]a|ni\s+idea|ns|nada|nose|no\s+lo\s+s[eé]|no\s+s[eé]|sin\s+decidir|por\s+decidir|pendiente|ya|luego|despu[eé]s|ma[ñn]ana|cuando|depende|varios|cualquiera|lo\s+que)\b/i;

/**
 * Si un texto suelto puede ser el nombre de un sitio.
 *
 * Los lectores reconocen «Salou», «a Salou» y «queremos ir a Salou». Esto es
 * para el pueblo que no conocen: se acepta solo si parece un nombre —corto, sin
 * cifras y sin ser una forma de decir que no se sabe—, nunca una frase. Tragarse
 * una frase entera como destino es exactamente lo que pasaba.
 */
export function pareceUnLugar(texto: string): boolean {
  const limpio = (texto ?? "").trim();
  if (limpio.length < 3 || limpio.length > 40) return false;
  if (/\d/.test(limpio)) return false;
  if (NO_ES_RESPUESTA.test(limpio)) return false;
  const palabras = limpio.split(/\s+/).filter(Boolean);
  // «Vilanova i la Geltrú» son cuatro; una frase, muchas más.
  if (palabras.length > 4) return false;
  if (palabras.length === 1) return true;
  // Con varias palabras hace falta una mayúscula: los pueblos se escriben así
  // y las evasivas no. Sin esto, «ya te diré» se guardaba como destino y la
  // búsqueda no encontraba nada sin decir por qué.
  return palabras.some((p) => /^[A-ZÁÉÍÓÚÑÜ]/.test(p));
}

/** Un número dentro de una frase: «unos 48 alumnos» → 48. */
export function numeroDe(texto: string): number | null {
  const m = (texto ?? "").match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function enumerar(partes: string[]): string {
  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/**
 * Qué guardar y qué decir ante una respuesta.
 *
 * `literal` es el texto tal cual lo escribió la persona: se usa solo como
 * último recurso y con muchas condiciones, nunca a la ligera.
 */
export function interpretarRespuesta(
  hueco: Hueco,
  literal: string,
  lectura: LecturaDeLaRespuesta,
): Interpretacion {
  const aplicar: LecturaDeLaRespuesta = {};
  for (const [clave, valor] of Object.entries(lectura) as [keyof LecturaDeLaRespuesta, unknown][]) {
    if (tieneValor(valor)) (aplicar as Record<string, unknown>)[clave] = valor;
  }

  const esperada = CLAVE_DE_LA_PREGUNTA[hueco.clave];
  let contesta = tieneValor(aplicar[esperada]);

  // Lo que los lectores no cazan y una persona sí escribe: un número pelado
  // («48», «300») o el nombre de un pueblo que no está en ninguna lista.
  if (!contesta) {
    if (hueco.tipo === "numero") {
      const n = numeroDe(literal);
      if (n !== null) {
        (aplicar as Record<string, unknown>)[esperada] = n;
        contesta = true;
      }
    } else if (hueco.clave === "destinationText" && pareceUnLugar(literal)) {
      aplicar.destinationText = literal.trim();
      contesta = true;
    } else if (
      (hueco.tipo === "opciones" || hueco.tipo === "varias") &&
      literal.trim() &&
      !NO_ES_RESPUESTA.test(literal.trim())
    ) {
      // Régimen o categoría escritos a mano de otra forma: se admite tal cual.
      (aplicar as Record<string, unknown>)[esperada] =
        hueco.tipo === "varias" ? [literal.trim()] : literal.trim();
      contesta = true;
    }
  }

  // Lo que se ha aprovechado de la respuesta SIN ser lo preguntado. Decirlo en
  // voz alta es lo que hace que la conversación no parezca un formulario.
  const extras = (Object.keys(aplicar) as (keyof LecturaDeLaRespuesta)[])
    .filter((k) => k !== esperada)
    // Las fechas se dicen juntas: «la llegada y la salida» suena a robot.
    .filter((k) => !(k === "dateTo" && aplicar.dateFrom));

  const dichos = extras.map((k) => {
    if (k === "dateFrom" && aplicar.dateTo) return `las fechas: ${aplicar.dateFrom} → ${aplicar.dateTo}`;
    return NOMBRES[k](aplicar[k]);
  });

  if (contesta) {
    return {
      aplicar,
      contesta: true,
      dice: dichos.length ? `Apunto también ${enumerar(dichos)}.` : null,
    };
  }

  // No contesta. Se reconoce lo que sí ha servido y se vuelve a preguntar; con
  // las que bloquean, diciendo por qué no se puede seguir sin eso.
  const reconoce = dichos.length ? `Apunto ${enumerar(dichos)}. ` : "";
  const insiste = hueco.bloquea
    ? `Pero sigo necesitando esto para poder buscar: ${hueco.pregunta}`
    : `Eso no me dice ${hueco.pregunta.replace(/^¿|\?$/g, "").toLowerCase()}. ¿Me lo puedes concretar?`;

  return { aplicar, contesta: false, dice: `${reconoce}${insiste}` };
}
