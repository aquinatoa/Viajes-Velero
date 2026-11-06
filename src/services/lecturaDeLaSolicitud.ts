/**
 * Lo que se ha entendido de una solicitud, calculado de TODO lo que se ha dicho.
 *
 * Reunión con Oravia, 05/11/2026: «en el chat de la solicitud se quedan datos
 * sin asignar a lo que se ha entendido». La causa era de diseño. «Lo entendido»
 * era un estado que se iba copiando a mano, campo a campo, desde cuatro sitios
 * (la primera lectura, la respuesta escrita, la respuesta por botón y la edición
 * del formulario). Lo que un sitio no copiaba se perdía, y la respuesta escrita
 * solo copiaba nueve campos: el tipo de grupo, el idioma, las actividades y el
 * texto libre que el colegio contaba en el chat no llegaban a ninguna parte.
 *
 * Aquí hay UNA sola función. Recibe:
 *
 *   · los mensajes que el colegio ha mandado,
 *   · lo que se ha escrito en el chat (que es un mensaje más: da igual que
 *     conteste a la pregunta o cuente otra cosa),
 *   · lo que el operador ha fijado a mano, y que manda siempre,
 *
 * y devuelve lo entendido. Cualquier dato dicho en cualquier momento y de
 * cualquier forma acaba en su sitio sin que nadie escriba código para ese campo.
 *
 * Cada texto se lee POR SEPARADO y en orden, y lo que dice uno posterior manda
 * sobre lo anterior. Es lo que ya hacía `conservarLoContestado` entre mensajes,
 * y lo que se espera de «ahora son 50» después de «somos 48».
 *
 * Es lógica pura: sin pantalla, sin red. Hoy lee con las reglas de siempre; una
 * capa de IA, cuando se enchufe, se suma a estas mismas lecturas.
 */
import { mismoRequisito } from "../domain/requisitos";
import type { NormalizedRequestDraft, ParseTripRequestResult } from "../domain/types";
import {
  extractRequestExtras,
  parecenSoloNombreYApellidos,
  readTripMessage,
  resultadoDeUnaLectura,
} from "./requestService";

/** Algo escrito en el chat, y cuántos mensajes del colegio había cuando se escribió. */
export interface RespuestaLibre {
  texto: string;
  trasMensajes: number;
}

/** Lo que el operador puede fijar a mano: cualquier campo entendido, el tope y los requisitos. */
export type CampoFijado = keyof NormalizedRequestDraft | "topePorAlumno" | "requisitos" | "canal" | "departamento";

export interface EntradaDeLectura {
  /** Los mensajes del colegio, en el orden en que llegaron (incluido el que aún no se ha enviado). */
  mensajes: string[];
  /** Lo escrito en el chat. */
  respuestas: RespuestaLibre[];
  /** Lo entendido hasta ahora: lo que el texto no diga no se borra. */
  previo: NormalizedRequestDraft | null;
  topePrevio: number | null;
  requisitosPrevios: string[];
  /** Campos que el operador ha fijado a mano: ninguna lectura los vuelve a tocar. */
  fijados: CampoFijado[];
  /**
   * Valores que el operador acaba de dar de forma explícita (un botón, un
   * número suelto como respuesta, una edición). Se aplican encima de la lectura
   * y pasan a ser campos fijados.
   */
  explicitos?: Partial<Record<CampoFijado, unknown>>;
  hoy?: Date;
}

/** Un campo fijado a mano que el último texto contradice. */
export interface Discrepancia {
  campo: keyof NormalizedRequestDraft;
  etiqueta: string;
  fijado: unknown;
  leido: unknown;
}

export interface SalidaDeLectura {
  entendido: NormalizedRequestDraft;
  tope: number | null;
  requisitos: string[];
  fijados: CampoFijado[];
  /** Lo fijado que el último texto contradice: se respeta lo fijado, pero se avisa. */
  discrepancias: Discrepancia[];
  /** Lo que falta y los avisos, calculados sobre lo entendido final. */
  resultado: ParseTripRequestResult;
  /** Todo el texto leído, por si hace falta (huecos, actividades pedidas). */
  texto: string;
}

/** Campos que van de la mano: si se fija uno, el otro es su consecuencia. */
const VAN_JUNTOS: Partial<Record<CampoFijado, CampoFijado>> = {
  destinationText: "destinationCountry",
  ageRangeText: "averageAgeText",
};

function hayValor(valor: unknown): boolean {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === "string") return valor.trim() !== "";
  if (Array.isArray(valor)) return valor.length > 0;
  return true;
}

/**
 * Los textos en el orden en que se dijeron: cada respuesta del chat va tras los
 * mensajes que ya había cuando se escribió y antes de los que llegaron después.
 */
export function textosEnOrden(mensajes: string[], respuestas: RespuestaLibre[]): string[] {
  return textosConOrigen(mensajes, respuestas).map((t) => t.texto);
}

export interface TextoConOrigen {
  texto: string;
  /** «colegio» es lo que mandó el cliente; «chat» lo que escribió quien cotiza. */
  origen: "colegio" | "chat";
}

export function textosConOrigen(mensajes: string[], respuestas: RespuestaLibre[]): TextoConOrigen[] {
  const n = mensajes.length;
  const salida: TextoConOrigen[] = [];
  const tras = (hasta: number) => {
    for (const r of respuestas) {
      if (Math.min(Math.max(r.trasMensajes, 0), n) === hasta) salida.push({ texto: r.texto, origen: "chat" });
    }
  };
  tras(0);
  mensajes.forEach((m, i) => {
    salida.push({ texto: m, origen: "colegio" });
    tras(i + 1);
  });
  return salida
    .map((t) => ({ ...t, texto: t.texto.trim() }))
    .filter((t) => t.texto !== "");
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/**
 * Lo que de una respuesta del chat merece ir a «Información a tener en cuenta».
 *
 * El chat recoge de todo: el correo y el nombre del contacto (que ya tienen su
 * campo), un «48» que contesta a las plazas, un «Salou». Nada de eso es
 * información a tener en cuenta, y volcarlo ahí dejaba el campo con
 * «anthonyquinatoa@gmail.com Anthony Quinatoa Anthony Quinatoa» (05/11/2026).
 * Solo cuentan las frases de verdad, de cinco palabras o más, ya sin correos ni
 * líneas que sean solo un nombre.
 */
function loQueCuentaDeLaRespuesta(texto: string): string {
  const sinCorreos = texto.replace(EMAIL, " ");
  const lineas = sinCorreos
    .split(/\r?\n/)
    .map((l) => l.replace(/\b(?:mi\s+)?(?:correo|email|e-mail|mail)(?:\s+(?:es|de contacto))?\s*:?\s*$/i, "").trim())
    .filter((l) => l && !parecenSoloNombreYApellidos(l));
  const resto = lineas.join(" ").replace(/\s+/g, " ").trim();
  const palabras = resto.split(/\s+/).filter((p) => /[\p{L}\d]/u.test(p));
  return palabras.length >= 5 ? resto : "";
}

const CLAVES_DE_TEXTO_LIBRE: ReadonlyArray<keyof NormalizedRequestDraft> = ["requirementsText"];

export function leerLaSolicitud(entrada: EntradaDeLectura): SalidaDeLectura {
  const hoy = entrada.hoy ?? new Date();
  const conOrigen = textosConOrigen(entrada.mensajes, entrada.respuestas);
  const textos = conOrigen.map((t) => t.texto);

  // 1) Cada texto, por separado y en orden; lo posterior manda.
  const leido = readTripMessage("", hoy).normalized;
  const acumulado: Record<string, unknown> = { ...leido };
  const frases: string[] = [];
  let topeLeido: number | null = null;
  const requisitosLeidos: string[] = [];

  for (const { texto, origen } of conOrigen) {
    const lectura = readTripMessage(texto, hoy).normalized as unknown as Record<string, unknown>;
    for (const [clave, valor] of Object.entries(lectura)) {
      if (CLAVES_DE_TEXTO_LIBRE.includes(clave as keyof NormalizedRequestDraft)) continue;
      if (hayValor(valor)) acumulado[clave] = valor;
    }
    // El resumen del cliente tal cual; de lo escrito en el chat, solo lo que cuenta.
    const paraElResumen =
      origen === "chat"
        ? loQueCuentaDeLaRespuesta(texto)
        : String(lectura.requirementsText ?? "").trim();
    const resumen = origen === "chat" && paraElResumen
      ? String(readTripMessage(paraElResumen, hoy).normalized.requirementsText ?? "").trim()
      : paraElResumen;
    if (resumen && !frases.includes(resumen)) frases.push(resumen);

    const extras = extractRequestExtras(texto);
    if (extras.budgetPerStudent !== null) topeLeido = extras.budgetPerStudent;
    for (const r of extras.specialRequirements) {
      if (!requisitosLeidos.some((x) => mismoRequisito(x, r))) requisitosLeidos.push(r);
    }
  }
  acumulado.requirementsText = frases.join(" ");

  // 2) Lo fijado a mano y lo explícito mandan sobre cualquier lectura.
  const fijados = new Set<CampoFijado>(entrada.fijados);
  for (const clave of Object.keys(entrada.explicitos ?? {}) as CampoFijado[]) {
    fijados.add(clave);
  }
  for (const [clave, acompanante] of Object.entries(VAN_JUNTOS) as [CampoFijado, CampoFijado][]) {
    if (fijados.has(clave)) fijados.add(acompanante);
  }

  // 3) Se funde con lo anterior: lo que el texto dice manda; lo que no dice no borra.
  const previo = (entrada.previo ?? null) as Record<string, unknown> | null;
  const entendido: Record<string, unknown> = { ...acumulado };
  if (previo) {
    for (const clave of Object.keys(entendido)) {
      if (fijados.has(clave as CampoFijado)) {
        // Vaciarlo a propósito también es decidir: se respeta el «vacío».
        if (clave in previo) entendido[clave] = previo[clave];
      } else if (!hayValor(entendido[clave]) && hayValor(previo[clave])) {
        entendido[clave] = previo[clave];
      }
    }
  }
  const explicitos = (entrada.explicitos ?? {}) as Record<string, unknown>;
  for (const [clave, valor] of Object.entries(explicitos)) {
    if (clave === "topePorAlumno" || clave === "requisitos") continue;
    entendido[clave] = valor;
  }

  // 4) El tope y los requisitos viajan aparte del resto de lo entendido.
  let tope = fijados.has("topePorAlumno") ? entrada.topePrevio : (topeLeido ?? entrada.topePrevio);
  if ("topePorAlumno" in explicitos) tope = (explicitos.topePorAlumno as number | null) ?? null;

  // Una lista fijada a mano se respeta, pero lo que diga el ÚLTIMO texto se le
  // suma: es lo que ya hacía contestar en el chat, y evita que «necesitamos
  // autocar» se pierda porque alguien tocó la lista antes.
  const requisitosDelUltimo = textos.length > 0
    ? extractRequestExtras(textos[textos.length - 1]).specialRequirements
    : [];
  let requisitos = fijados.has("requisitos")
    ? [...new Set([...entrada.requisitosPrevios, ...requisitosDelUltimo])]
    : requisitosLeidos.length > 0
      ? requisitosLeidos
      : entrada.requisitosPrevios;
  if ("requisitos" in explicitos) {
    const dado = explicitos.requisitos;
    requisitos = Array.isArray(dado) ? (dado as string[]) : dado ? [String(dado)] : [];
  }

  // Una edad suelta («15») se escribe también como media: el buscador saca el
  // número de `averageAgeText` cuando no hay guion, y solo con `ageRangeText`
  // la edad se vería en pantalla pero no filtraría nada.
  const edad = String(entendido.ageRangeText ?? "").trim();
  if (/^\d{1,2}$/.test(edad) && !hayValor(entendido.averageAgeText)) {
    entendido.averageAgeText = `${edad} años`;
  }

  // 5) Lo fijado manda, pero NO en silencio: si el último texto dice otra cosa
  //    que lo fijado («somos 50» cuando alguien fijó 48), se avisa.
  const discrepancias: Discrepancia[] = [];
  const ultimo = textos[textos.length - 1];
  if (ultimo) {
    const dicho = readTripMessage(ultimo, hoy).normalized as unknown as Record<string, unknown>;
    for (const clave of COMPARABLES) {
      if (!fijados.has(clave) || !hayValor(dicho[clave])) continue;
      const vale = entendido[clave];
      if (!mismoValor(dicho[clave], vale)) {
        discrepancias.push({ campo: clave, etiqueta: ETIQUETAS[clave], fijado: vale, leido: dicho[clave] });
      }
    }
  }

  const final = entendido as unknown as NormalizedRequestDraft;
  const texto = textos.join("\n\n");
  return {
    entendido: final,
    tope,
    requisitos,
    fijados: [...fijados],
    discrepancias,
    resultado: resultadoDeUnaLectura(final, texto),
    texto,
  };
}

/** Los campos que se pueden comparar con lo que dice el último texto. */
const COMPARABLES = [
  "destinationText",
  "dateFrom",
  "dateTo",
  "participants",
  "teachers",
  "regimeRequested",
  "categoryRequested",
  "ageRangeText",
] as const satisfies ReadonlyArray<keyof NormalizedRequestDraft>;

const ETIQUETAS: Record<(typeof COMPARABLES)[number], string> = {
  destinationText: "el destino",
  dateFrom: "la fecha de llegada",
  dateTo: "la fecha de salida",
  participants: "los alumnos",
  teachers: "los profesores",
  regimeRequested: "el régimen",
  categoryRequested: "la categoría",
  ageRangeText: "las edades",
};

function mismoValor(a: unknown, b: unknown): boolean {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

/** Una frase para el aviso: «los alumnos: el texto dice 50 y tienes fijado 48». */
export function frasesDeDiscrepancia(discrepancias: Discrepancia[]): string {
  return discrepancias
    .map((d) => `${d.etiqueta}: el último texto dice ${String(d.leido)} y tienes ${String(d.fijado ?? "—")}`)
    .join("; ");
}
