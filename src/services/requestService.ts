import { z } from "zod";
import type {
  Client,
  FindCandidateOpportunitiesResult,
  MissingField,
  NormalizedRequestDraft,
  ParseTripRequestInput,
  ParseTripRequestResult,
  TripRequest,
  ValidateTripRequestInput,
  ValidateTripRequestResult,
  WarningItem
} from "../domain/types";
import {
  getClientTripRequestsApi,
  saveTripRequestApi,
  upsertClientApi,
} from "./apiClient";

const intakeSchema = z.object({
  clientType: z.enum(["new", "existing"]),
  email: z.string().trim().min(1, "El email es obligatorio."),
  firstName: z.string().trim().min(1, "El nombre es obligatorio."),
  lastName: z.string().trim().min(1, "Los apellidos son obligatorios."),
  opportunityName: z.string().optional(),
  rawTripRequestText: z.string().trim().min(20, "Describe mejor la solicitud del viaje.")
});

const destinationCatalog = [
  { city: "Valencia", country: "España", aliases: ["valencia"] },
  { city: "Gandia", country: "España", aliases: ["gandia", "gandía"] },
  { city: "Madrid", country: "España", aliases: ["madrid"] },
  { city: "Barcelona", country: "España", aliases: ["barcelona"] },
  { city: "Salou", country: "España", aliases: ["salou"] },
  { city: "Cambrils", country: "España", aliases: ["cambrils"] },
  { city: "La Pineda", country: "España", aliases: ["la pineda", "pineda"] },
  { city: "Tarragona", country: "España", aliases: ["tarragona"] },
  { city: "Costa Daurada", country: "España", aliases: ["costa daurada", "costa dorada"] }
];

const categoryAliases = ["2*", "3*", "4*", "5*", "hostal", "hotel", "residencia"];
const boardAliases = ["pensión completa", "media pensión", "alojamiento y desayuno", "solo alojamiento"];

function emptyDraft(): NormalizedRequestDraft {
  return {
    language: "",
    destinationText: "",
    destinationCountry: "",
    dateFrom: "",
    dateTo: "",
    participants: null,
    teachers: null,
    ageRangeText: "",
    averageAgeText: "",
    groupType: "",
    regimeRequested: "",
    categoryRequested: "",
    requirementsText: ""
  };
}

function detectLanguage(text: string) {
  const lower = text.toLowerCase();
  const spanishSignals = ["hola", "necesitamos", "grupo", "colegio", "profesores", "pensión"];
  const englishSignals = ["hello", "school", "teachers", "students", "half board"];

  if (spanishSignals.some((signal) => lower.includes(signal))) {
    return "Español";
  }

  if (englishSignals.some((signal) => lower.includes(signal))) {
    return "Inglés";
  }

  return "";
}

function findDestination(text: string) {
  const lower = text.toLowerCase();
  const present = destinationCatalog.filter((candidate) =>
    candidate.aliases.some((alias) => lower.includes(alias))
  );

  if (present.length <= 1) {
    return present[0];
  }

  // Si hay varias ciudades en el texto, preferir la que va tras una preposición de
  // DESTINO ("a/en/hacia Salou", "destino: Salou") y penalizar la de ORIGEN
  // ("de Madrid", "colegio de Madrid"), para no confundir el origen con el destino.
  const scored = present.map((candidate) => {
    let score = 0;
    for (const alias of candidate.aliases) {
      const a = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b(?:a|en|hacia|hasta|destino:?)\\s+${a}\\b`).test(lower)) score += 2;
      if (new RegExp(`\\b(?:de|del|desde)\\s+${a}\\b`).test(lower)) score -= 2;
    }
    return { candidate, score };
  });

  scored.sort((x, y) => y.score - x.score);
  return scored[0].candidate;
}

const SPANISH_MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12
};

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function monthNumber(token: string | undefined): number | null {
  if (!token) return null;
  return SPANISH_MONTHS[stripAccents(token).toLowerCase()] ?? null;
}

function toIso(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Extrae el rango de fechas del texto libre. Reconoce, por orden:
 *   1. ISO: "2026-05-18 ... 2026-05-22"
 *   2. Lenguaje natural en español: "del 18 al 22 de mayo de 2026",
 *      "del 2 de mayo al 6 de junio de 2026", "entre el 18 y el 22 de mayo de 2026".
 *   3. Numérico DD/MM/AAAA: "18/05/2026 ... 22/05/2026" (también con - o .).
 *   4. Español SIN año: "del 10 al 14 de mayo" → el próximo mayo que llegue.
 *
 * `hoy` se recibe en vez de mirar el reloj para que el caso 4 sea comprobable:
 * una prueba que dependa de la fecha del día caduca sola.
 */
function extractDates(text: string, hoy: Date) {
  const empty = { dateFrom: "", dateTo: "" };

  // 1) ISO (AAAA-MM-DD)
  const isoDates = [...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((match) => match[1]);
  if (isoDates.length >= 2) {
    return { dateFrom: isoDates[0], dateTo: isoDates[1] };
  }

  const lower = text.toLowerCase();

  // 2) Español: D1 [de MES1] (al|a|y|hasta|-) [el] D2 de MES2 [de] AAAA
  const es = lower.match(
    /(\d{1,2})\s*(?:de\s+([a-záéíóúñ]+)\s+)?(?:al|a|y|hasta|–|-)\s*(?:el\s+)?(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+(?:de\s+)?(20\d{2})/
  );
  if (es) {
    const day1 = Number(es[1]);
    const day2 = Number(es[3]);
    const month2 = monthNumber(es[4]);
    const month1 = monthNumber(es[2]) ?? month2;
    const year = Number(es[5]);
    if (month1 && month2) {
      return { dateFrom: toIso(year, month1, day1), dateTo: toIso(year, month2, day2) };
    }
  }

  // 3) Numérico DD/MM/AAAA (o con - o .)
  const numeric = [...text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/g)].map((m) =>
    toIso(Number(m[3]), Number(m[2]), Number(m[1]))
  );
  if (numeric.length >= 2) {
    return { dateFrom: numeric[0], dateTo: numeric[1] };
  }

  // 4) Español SIN año: "del 10 al 14 de mayo".
  //
  // Un colegio que escribe en septiembre para el viaje de mayo casi nunca pone
  // el año: es obvio para quien escribe. Antes esto no daba fecha ninguna y la
  // solicitud se quedaba con dos huecos críticos.
  const sinAnio = lower.match(
    /(\d{1,2})\s*(?:de\s+([a-záéíóúñ]+)\s+)?(?:al|a|y|hasta|–|-)\s*(?:el\s+)?(\d{1,2})\s+de\s+([a-záéíóúñ]+)\b/
  );
  if (sinAnio) {
    const day1 = Number(sinAnio[1]);
    const day2 = Number(sinAnio[3]);
    const month2 = monthNumber(sinAnio[4]);
    const month1 = monthNumber(sinAnio[2]) ?? month2;
    if (month1 && month2) {
      const year = proximoAnioCon(month1, day1, hoy);
      // Si el viaje cruza el fin de año ("del 28 de diciembre al 3 de enero"),
      // la vuelta cae en el año siguiente.
      const yearFin = month2 < month1 ? year + 1 : year;
      return { dateFrom: toIso(year, month1, day1), dateTo: toIso(yearFin, month2, day2) };
    }
  }

  return empty;
}

/**
 * El primer año en el que ese día y ese mes aún no han pasado.
 *
 * Nadie pide presupuesto para un viaje que ya ocurrió, así que ante una fecha
 * sin año la lectura correcta es la próxima vez que llegue.
 */
function proximoAnioCon(month: number, day: number, referencia: Date): number {
  const year = referencia.getUTCFullYear();
  const esteAnio = Date.UTC(year, month - 1, day);
  const hoySinHora = Date.UTC(
    referencia.getUTCFullYear(),
    referencia.getUTCMonth(),
    referencia.getUTCDate()
  );
  return esteAnio >= hoySinHora ? year : year + 1;
}

function extractParticipants(text: string) {
  const lower = stripAccents(text.toLowerCase());
  const match =
    lower.match(
      /(\d{1,3})\s+(estudiantes|alumnos|alumnas|escolares|participantes|ninos|ninas|chicos|chicas|chavales|jovenes|students|pupils|pax)\b/
    ) ??
    lower.match(/\b(?:somos|seriamos|iriamos|vamos)\s+(\d{1,3})\b/) ??
    lower.match(/grupo\s+de\s+(\d{1,3})/) ??
    lower.match(/(?:for|of)\s+(\d{1,3})\s+(students|participants|pupils)/);

  return match ? Number(match[1]) : null;
}

/**
 * Los acompañantes. La lista corta se quedaba fuera de lo que escribe un
 * colegio: «4 profes» y «3 acompañantes» no se reconocían, y sin ellos la
 * solicitud se queda con un hueco crítico aunque el dato esté en el correo.
 */
function extractTeachers(text: string) {
  const lower = stripAccents(text.toLowerCase());
  const match =
    lower.match(
      /(\d{1,2})\s+(profesores|profesoras|profes|docentes|maestros|maestras|tutores|monitores|monitoras|acompanantes|adultos|teachers|adults|staff|chaperones)\b/
    ) ?? lower.match(/\b(?:van|vamos|iran|iriamos|mas)\s+(\d{1,2})\s+(?:profes|profesores|adultos)\b/);

  return match ? Number(match[1]) : null;
}

/**
 * La edad, que es campo crítico: sin ella no se pueden filtrar las actividades.
 *
 * Se reconocen tres formas, por orden de preferencia:
 *   rango    "de 15 a 17 años", "14-17 años", "aged 14 to 16"
 *   media    "media de 15 años", "average age 15"
 *   una sola "50 alumnos de 15 años", "tienen 14 años", "15 years old"
 *
 * La edad única iba sin reconocer y es la forma más común: de seis correos
 * reales, cuatro se quedaban sin edad y por tanto sin poder buscar actividades.
 * Se rellenan los DOS campos a propósito: `ageRangeText` es lo que se ve y lo
 * que viaja al CRM, y `averageAgeText` es de donde `parseAgeRange` saca el
 * número cuando no hay guion, que es justo este caso.
 *
 * También estaba mal `ages?`, que no casa con «aged» y dejaba sin edad todos
 * los correos en inglés.
 */
function extractAgeInfo(text: string) {
  const lower = stripAccents(text.toLowerCase());

  const range =
    lower.match(/(\d{1,2})\s*(?:-|–|a|y|hasta)\s*(\d{1,2})\s*anos/) ??
    lower.match(/\bage[ds]?\s+(?:from\s+)?(\d{1,2})\s*(?:-|–|to|and)\s*(\d{1,2})/);
  if (range) {
    return { ageRangeText: `${range[1]}-${range[2]}`, averageAgeText: "" };
  }

  const average =
    lower.match(/media\s+de\s+(\d{1,2})\s*anos/) ?? lower.match(/average\s+age\s+(?:of\s+)?(\d{1,2})/);
  if (average) {
    return { ageRangeText: "", averageAgeText: `${average[1]} años` };
  }

  const single =
    lower.match(/\b(?:de|con|tienen|edad(?:es)?\s+de)\s+(\d{1,2})\s*anos\b/) ??
    lower.match(/\b(\d{1,2})\s*anos\s+de\s+edad\b/) ??
    lower.match(/\b(\d{1,2})\s+years\s+old\b/) ??
    lower.match(/\bage[ds]?\s+(\d{1,2})\b/);
  if (single) {
    return { ageRangeText: single[1], averageAgeText: `${single[1]} años` };
  }

  return { ageRangeText: "", averageAgeText: "" };
}

/**
 * El régimen. Se devuelve siempre con la etiqueta española, que es la que
 * entiende la búsqueda, venga el correo en el idioma que venga: el turoperador
 * suizo escribe «half board» y antes eso se quedaba en blanco.
 */
function extractBoardType(text: string) {
  const lower = stripAccents(text.toLowerCase());

  const enIngles: [RegExp, string][] = [
    [/\bfull board\b|\ball[- ]inclusive\b/, "pensión completa"],
    [/\bhalf board\b/, "media pensión"],
    [/\bbed and breakfast\b|\bb&b\b|\bbreakfast included\b/, "alojamiento y desayuno"],
    [/\broom only\b|\bself[- ]catering\b/, "solo alojamiento"],
  ];
  for (const [patron, etiqueta] of enIngles) {
    if (patron.test(lower)) return etiqueta;
  }

  return boardAliases.find((alias) => lower.includes(stripAccents(alias))) ?? "";
}

function extractCategory(text: string) {
  const lower = text.toLowerCase();
  // "4 estrellas" / "de 4*" / "3-star" → "4*" (prioriza las estrellas sobre "hotel",
  // que si no se llevaba la categoría en todo correo en inglés).
  const stars = lower.match(/(\d)\s*[-–\s]?\s*(?:\*|estrellas?|stars?\b)/);
  if (stars) {
    return `${stars[1]}*`;
  }
  return categoryAliases.find((alias) => lower.includes(alias.toLowerCase())) ?? "";
}

export interface ExtractedClientInfo {
  email: string;
  firstName: string;
  lastName: string;
  opportunityName: string;
}

/** Palabras que aparecen en una firma pero no son el nombre de nadie. */
const NO_ES_NOMBRE =
  /^(?:gracias|saludos|atentamente|cordialmente|colegio|instituto|escuela|departamento|secretar|direcci|ampa|tel|m[oó]vil|movil|www|http)/i;

/**
 * El nombre de quien firma, tomado de alrededor de la dirección de correo.
 *
 * Los patrones de presentación («soy X», «me llamo X») cubren un correo de
 * cada tres. El resto firma como se firma de verdad, con el nombre pegado a la
 * dirección: «Luis Peña, lpena@carmen.es» o el nombre en la línea de encima.
 * Sin esto el operador tenía que teclear el contacto a mano casi siempre.
 */
function nombreDeLaFirma(text: string): string {
  const lineas = text.split(/\r?\n/);
  const indice = lineas.findIndex((linea) => /[\w.+-]+@[\w-]+\.[\w.-]+/.test(linea));
  if (indice < 0) return "";

  const enLaMismaLinea = lineas[indice].split(/[\w.+-]+@[\w-]+\.[\w.-]+/)[0];
  const candidatos = [enLaMismaLinea, lineas[indice - 1] ?? ""];

  for (const candidato of candidatos) {
    const limpio = candidato.replace(/[<(\[]/g, " ").replace(/[-–—,;:|]+\s*$/, "").trim();
    if (!limpio || NO_ES_NOMBRE.test(limpio)) continue;

    // Dos a cuatro palabras que empiezan por mayúscula: un nombre y sus
    // apellidos. Con una sola no se arriesga: «Gracias» también lo cumpliría.
    const nombre = limpio.match(
      /\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ'’-]+(?:\s+(?:de|del|la|las|los)\s+)?(?:\s*[A-ZÁÉÍÓÚÑ][a-záéíóúñ'’-]+){1,3})\s*$/
    );
    if (nombre) return nombre[1].trim();
  }

  return "";
}

/**
 * Primer análisis del mensaje del cliente para AUTORRELLENAR los datos de contacto
 * en el paso 1. Heurístico (sin IA, instantáneo). Extrae lo que detecte; lo que no
 * aparezca queda vacío para que el usuario lo complete.
 */
export function extractClientInfo(text: string): ExtractedClientInfo {
  const email = (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? "").replace(/[.,;:]+$/, "");

  let firstName = "";
  let lastName = "";
  const nameMatch = text.match(
    /\b(?:[Ss]oy|[Mm]e llamo|[Mm]i nombre es|[Ll]e saluda|[Aa]tentamente,?)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ'’-]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ'’-]+){0,3})/,
  );
  const nombre = nameMatch ? nameMatch[1] : nombreDeLaFirma(text);
  if (nombre) {
    const parts = nombre.trim().split(/\s+/);
    firstName = parts[0] ?? "";
    lastName = parts.slice(1).join(" ");
  }

  // Nombre de la oportunidad sugerido: tipo de viaje + destino + año.
  const lower = text.toLowerCase();
  let base = "";
  if (lower.includes("fin de curso")) base = "Viaje fin de curso";
  else if (lower.includes("viaje de estudios") || lower.includes("viaje de estudio")) base = "Viaje de estudios";
  else if (lower.includes("viaje cultural")) base = "Viaje cultural";
  else if (lower.includes("viaje escolar") || lower.includes("viaje")) base = "Viaje escolar";

  // Si el destino no está en el catálogo se usa el que diga el correo: el
  // nombre de la oportunidad es para que una persona la reconozca en el CRM,
  // no para buscar inventario.
  const destination = findDestination(text)?.city ?? destinoFueraDeCatalogo(text);
  const year = text.match(/\b(20\d{2})\b/)?.[1] ?? "";
  const opportunityName = [base, destination, year].filter(Boolean).join(" ").trim();

  return { email, firstName, lastName, opportunityName };
}

export interface RequestExtras {
  /** Presupuesto por alumno detectado (€), o null. */
  budgetPerStudent: number | null;
  /** Requisitos especiales a confirmar con el alojamiento. */
  specialRequirements: string[];
}

/**
 * Variables adicionales del mensaje útiles para decidir en el paso 3:
 * presupuesto por alumno y requisitos especiales (dietas, accesibilidad…).
 * Heurístico; no condiciona la búsqueda, solo informa al operador.
 */
export function extractRequestExtras(text: string): RequestExtras {
  const lower = stripAccents(text.toLowerCase());

  // Presupuesto por alumno: "350 € por alumno", "presupuesto de 350 €", "350€/pax".
  const perPax = lower.match(/(\d{2,4})\s*(?:€|eur(?:os)?)\s*(?:\/|por)\s*(?:alumno|persona|pax|estudiante|nino)/);
  const general = lower.match(/presupuesto[^.\n]*?(\d{2,4})\s*(?:€|eur(?:os)?)/);
  const m = perPax ?? general;
  const budgetPerStudent = m ? Number(m[1]) : null;

  const specialRequirements: string[] = [];
  const add = (re: RegExp, label: string) => {
    if (re.test(lower) && !specialRequirements.includes(label)) specialRequirements.push(label);
  };
  add(/alergi|sin gluten|sin lactosa|celiac|intoleran|vegetarian|vegan|halal|dieta/, "Alergias / dietas especiales");
  add(/movilidad reducida|accesibl|adaptad|silla de ruedas|discapacidad/, "Habitación adaptada / accesibilidad");
  add(/(habitacion|cuarto)[^.\n]*(cercan|junt|proxim)|profesor[^.\n]*(cercan|junt|proxim)/, "Habitaciones de profesores cercanas");
  add(/picnic|para llevar/, "Picnic / comida para llevar");
  add(/autobus|autocar|transporte|bus\b/, "Transporte / autocar");

  return { budgetPerStudent, specialRequirements };
}

/**
 * Los centros españoles se llaman de muchas formas y solo se miraba «colegio».
 * El propio correo de ejemplo de la demo, que empieza por «IES», se quedaba sin
 * tipo de grupo.
 */
function extractGroupType(text: string) {
  const lower = stripAccents(text.toLowerCase());

  if (/\buniversidad\b|\buniversitari|\buniversity\b|\bfacultad\b/.test(lower)) {
    return "Grupo universitario";
  }

  if (
    /\bcolegio\b|\binstituto\b|\bies\b|\bceip\b|\bcpi\b|\bescuela\b|\bescola\b|\bcentro educativo\b|\bschool\b|\bschule\b|\balumn|\bescolar/.test(
      lower
    )
  ) {
    return "Grupo escolar";
  }

  return "";
}

/** Fórmulas de cierre: lo que va detrás es la firma, no la petición. */
const CIERRES =
  /^\s*(?:un\s+)?(?:saludos?|cordiales\s+saludos|muchas\s+gracias|gracias|atentamente|atte\.?|un\s+abrazo|best\s+regards|kind\s+regards|regards|thanks|thank\s+you|sincerely)\b/i;

/**
 * Quita la firma del final del mensaje.
 *
 * Se corta en la fórmula de cierre y, si no hay ninguna, se descartan las
 * últimas líneas que solo son nombre y dirección de correo. Sin esto el texto
 * de requisitos acababa siendo la firma: la solicitud guardada de un correo
 * real decía «Marta Sanz, msanz@colegio. cat».
 */
function quitarFirma(text: string): string {
  const lineas = text.split(/\r?\n/);

  const cierre = lineas.findIndex((linea) => CIERRES.test(linea));
  const utiles = cierre >= 0 ? lineas.slice(0, cierre) : [...lineas];

  while (utiles.length > 0) {
    const ultima = utiles[utiles.length - 1].trim();
    // Una línea corta con un correo dentro es la firma, no un requisito.
    if (ultima === "" || (/[\w.+-]+@[\w-]+\.[\w.-]+/.test(ultima) && ultima.length <= 90)) {
      utiles.pop();
      continue;
    }
    break;
  }

  return utiles.join("\n").trim();
}

/** Saludos de apertura: no son parte de la petición. */
const SALUDOS =
  /^\s*(?:hola|buenas|buenos\s+d[ií]as|buenas\s+tardes|estimad[oa]s?|estimad[oa]s?\s+se[ñn]ores|apreciad[oa]s?|hello|hi|dear\s+\w+|good\s+morning)\b/i;

/**
 * El resto del mensaje, que es lo que el operador tiene que leer con sus ojos.
 *
 * Antes era «todas las frases menos la primera», partiendo por cualquier punto.
 * Eso metía la firma dentro y rompía las direcciones de correo por su punto
 * («colegio. cat»). Ahora se quita la firma, se parte solo donde una frase
 * termina de verdad —punto y mayúscula— y se descarta la primera únicamente si
 * es un saludo.
 */
function extractRequirements(text: string) {
  const cuerpo = quitarFirma(text);
  if (!cuerpo) return "";

  const frases = cuerpo
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (frases.length === 0) return "";

  const sinSaludo = SALUDOS.test(frases[0]) ? frases.slice(1) : frases;
  return sinSaludo.join(" ").trim();
}

/**
 * El sitio al que dicen que quieren ir, aunque no lo operemos.
 *
 * El catálogo de destinos son nueve ciudades escritas a mano. Si un colegio
 * pide Benidorm, el destino se quedaba vacío y el aviso decía «no se detectó un
 * destino», que es falso y no ayuda: el destino está en el correo, lo que pasa
 * es que no está en la lista. Nombrarlo convierte el aviso en una decisión.
 */
function destinoFueraDeCatalogo(text: string): string {
  const match = text.match(
    /\b(?:a|hacia|hasta|destino:?|trip to|travel to)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ'’-]+(?:\s+(?:de|del|la|las|los)\s+[A-ZÁÉÍÓÚÑa-záéíóúñ'’-]+)?)/
  );
  return match ? match[1].trim() : "";
}

function buildMissingFields(normalized: NormalizedRequestDraft, rawText = ""): MissingField[] {
  const missing: MissingField[] = [];

  const add = (field: string, label: string, reason: string, severity: "critical" | "warning") => {
    missing.push({ field, label, reason, severity });
  };

  if (!normalized.destinationText) {
    const mencionado = destinoFueraDeCatalogo(rawText);
    add(
      "destinationText",
      "Destino",
      mencionado
        ? `Se pide «${mencionado}», que no está entre los destinos que operamos. Confírmalo o cámbialo.`
        : "No se detectó un destino de forma fiable.",
      "critical",
    );
  }

  if (!normalized.dateFrom) {
    add("dateFrom", "Fecha inicio", "Falta la fecha de inicio del viaje.", "critical");
  }

  if (!normalized.dateTo) {
    add("dateTo", "Fecha fin", "Falta la fecha de fin del viaje.", "critical");
  }

  if (normalized.participants === null) {
    add("participants", "Participantes", "No se pudo identificar el número de participantes.", "critical");
  }

  if (normalized.teachers === null) {
    add("teachers", "Profesores", "No se pudo identificar el número de profesores o acompañantes.", "critical");
  }

  if (!normalized.ageRangeText && !normalized.averageAgeText) {
    // Aviso, no bloqueo: muchas veces el colegio pide precio antes de tener
    // cerrado qué curso viaja. Sin edad se puede cotizar igual, solo que las
    // actividades salen todas y hay que descartar a mano.
    add(
      "ageRangeText",
      "Edad o rango de edad",
      "Sin edad no se pueden descartar las actividades que no correspondan.",
      "warning",
    );
  }

  if (!normalized.regimeRequested) {
    add("regimeRequested", "Régimen solicitado", "No se detectó el régimen solicitado.", "warning");
  }

  if (!normalized.categoryRequested) {
    add("categoryRequested", "Categoría solicitada", "No se detectó la categoría preferida.", "warning");
  }

  return missing;
}

function buildWarnings(normalized: NormalizedRequestDraft): WarningItem[] {
  const warnings: WarningItem[] = [];
  const parsedDates = normalized.dateFrom && normalized.dateTo;

  if (!normalized.language) {
    warnings.push({
      code: "language_unknown",
      message: "No se pudo identificar el idioma del mensaje con suficiente confianza."
    });
  }

  if (parsedDates) {
    const start = new Date(normalized.dateFrom);
    const end = new Date(normalized.dateTo);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      warnings.push({
        code: "date_parse_warning",
        message: "Se detectaron fechas, pero conviene revisarlas manualmente."
      });
    } else if (end <= start) {
      warnings.push({
        code: "date_order_warning",
        message: "La fecha fin no es posterior a la fecha inicio."
      });
    }
  }

  return warnings;
}

/**
 * Lee el mensaje del cliente y saca lo que se entiende, SIN exigir datos de
 * contacto. Entender la petición y saber a quién responder son dos cosas
 * distintas: el correo hace falta para enviar la propuesta, no para leer un
 * texto. El lienzo usa esta función; el asistente antiguo sigue validando el
 * alta completa con `parseTripRequest`.
 */
export const readTripMessage = (
  rawTripRequestText: string,
  hoy: Date = new Date(),
): ParseTripRequestResult => {
  const normalized = emptyDraft();
  const destination = findDestination(rawTripRequestText);
  const dates = extractDates(rawTripRequestText, hoy);
  const ages = extractAgeInfo(rawTripRequestText);

  normalized.language = detectLanguage(rawTripRequestText);
  normalized.destinationText = destination?.city ?? "";
  normalized.destinationCountry = destination?.country ?? "";
  normalized.dateFrom = dates.dateFrom;
  normalized.dateTo = dates.dateTo;
  normalized.participants = extractParticipants(rawTripRequestText);
  normalized.teachers = extractTeachers(rawTripRequestText);
  normalized.ageRangeText = ages.ageRangeText;
  normalized.averageAgeText = ages.averageAgeText;
  normalized.groupType = extractGroupType(rawTripRequestText);
  normalized.regimeRequested = extractBoardType(rawTripRequestText);
  normalized.categoryRequested = extractCategory(rawTripRequestText);
  normalized.requirementsText = extractRequirements(rawTripRequestText);

  const missingFields = buildMissingFields(normalized, rawTripRequestText);
  const warnings = buildWarnings(normalized);

  return {
    normalized,
    missingFields,
    warnings,
    requestStatus: missingFields.some((item) => item.severity === "critical")
      ? "PARSED_WITH_GAPS"
      : "READY_FOR_SEARCH"
  };
};

export const parseTripRequest = (input: ParseTripRequestInput): ParseTripRequestResult => {
  intakeSchema.parse(input);
  return readTripMessage(input.rawTripRequestText);
};

export const validateTripRequest = (
  input: ValidateTripRequestInput
): ValidateTripRequestResult => {
  const issues: ValidateTripRequestResult["issues"] = [];
  const emailResult = z.string().email("El email no es válido.").safeParse(input.email);

  if (!emailResult.success) {
    issues.push({
      field: "email",
      label: "Email",
      message: "Introduce un email válido antes de continuar.",
      severity: "error"
    });
  }

  if (!input.clientType) {
    issues.push({
      field: "clientType",
      label: "Tipo de cliente",
      message: "Selecciona si el cliente es nuevo o existente.",
      severity: "error"
    });
  }

  if (input.clientType === "new") {
    if (!input.firstName.trim()) {
      issues.push({
        field: "firstName",
        label: "Nombre",
        message: "El nombre es obligatorio para clientes nuevos.",
        severity: "error"
      });
    }

    if (!input.lastName.trim()) {
      issues.push({
        field: "lastName",
        label: "Apellidos",
        message: "Los apellidos son obligatorios para clientes nuevos.",
        severity: "error"
      });
    }
  }

  if (!input.normalized.destinationText.trim()) {
    issues.push({
      field: "destinationText",
      label: "Destino",
      message: "El destino es obligatorio para buscar inventario.",
      severity: "error"
    });
  }

  if (!input.normalized.dateFrom.trim()) {
    issues.push({
      field: "dateFrom",
      label: "Fecha inicio",
      message: "La fecha de inicio es obligatoria.",
      severity: "error"
    });
  }

  if (!input.normalized.dateTo.trim()) {
    issues.push({
      field: "dateTo",
      label: "Fecha fin",
      message: "La fecha de fin es obligatoria.",
      severity: "error"
    });
  }

  if (input.normalized.participants === null || input.normalized.participants <= 0) {
    issues.push({
      field: "participants",
      label: "Participantes",
      message: "Indica el número de participantes.",
      severity: "error"
    });
  }

  if (input.normalized.teachers === null || input.normalized.teachers < 0) {
    issues.push({
      field: "teachers",
      label: "Profesores",
      message: "Indica el número de profesores o acompañantes.",
      severity: "error"
    });
  }

  // La edad NO impide enviar una propuesta. Este mensaje en rojo, con
  // `severity: "error"`, era lo que dejaba la solicitud parada por un dato que
  // el colegio muchas veces todavía no tiene decidido.
  if (!input.normalized.ageRangeText.trim() && !input.normalized.averageAgeText.trim()) {
    issues.push({
      field: "ageRangeText",
      label: "Edad o rango de edad",
      message: "Sin edad, las actividades salen todas: revisa que encajen antes de enviar.",
      severity: "warning"
    });
  }

  if (input.normalized.dateFrom && input.normalized.dateTo) {
    const start = new Date(input.normalized.dateFrom);
    const end = new Date(input.normalized.dateTo);

    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end <= start) {
      issues.push({
        field: "dateTo",
        label: "Fechas",
        message: "La fecha fin debe ser posterior a la fecha inicio.",
        severity: "error"
      });
    }
  }

  const criticalMissingFields = issues
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.field);

  return {
    isValid: criticalMissingFields.length === 0,
    issues,
    criticalMissingFields
  };
};

export const upsertClientFromRequest = (input: ParseTripRequestInput): Promise<Client> => {
  return upsertClientApi({
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    clientType: input.clientType,
  });
};

/**
 * Guarda la solicitud. Con `existingId` la actualiza en vez de crear otra: es lo
 * que hace que reintentar el cierre del lienzo no deje solicitudes (ni tratos)
 * duplicados.
 */
export const saveNormalizedTripRequest = (
  clientId: string,
  source: ParseTripRequestInput,
  parseResult: ParseTripRequestResult,
  existingId?: string | null,
): Promise<TripRequest> => {
  return saveTripRequestApi({
    id: existingId ?? null,
    clientId,
    opportunityName: source.opportunityName ?? null,
    originalMessage: source.rawTripRequestText,
    requestStatus: parseResult.requestStatus,
    ...parseResult.normalized,
  });
};

/**
 * Oportunidades candidatas basadas en datos REALES: las solicitudes previas del
 * mismo cliente en la BD. Si no hay ninguna, se recomienda crear una nueva.
 */
export const findCandidateOpportunities = async (
  client: Client,
  request: NormalizedRequestDraft
): Promise<FindCandidateOpportunitiesResult> => {
  let priorRequests: {
    id: string;
    opportunityName: string | null;
    destinationText: string | null;
    createdAt: string;
  }[] = [];

  try {
    priorRequests = (await getClientTripRequestsApi(client.id)).requests;
  } catch {
    // Si falla la consulta, se trata como cliente sin historial (crear nueva).
  }

  if (priorRequests.length === 0) {
    return {
      recommendation: "create_new",
      opportunities: [],
      rationale: "El cliente no tiene solicitudes previas: se crea una oportunidad nueva.",
    };
  }

  const opportunities = priorRequests.slice(0, 5).map((prior) => {
    const sameDestination =
      !!prior.destinationText &&
      !!request.destinationText &&
      prior.destinationText.toLowerCase() === request.destinationText.toLowerCase();
    return {
      id: prior.id,
      name: prior.opportunityName || `Solicitud previa ${prior.destinationText ?? ""}`.trim(),
      reason: sameDestination
        ? `Solicitud previa del mismo cliente al mismo destino (${prior.destinationText}).`
        : "Solicitud previa del mismo cliente.",
      score: sameDestination ? 80 : 50,
      status: "open" as const,
    };
  });

  return {
    recommendation: "ask_user",
    opportunities,
    rationale:
      "El cliente tiene solicitudes previas. Confirma si actualizar una oportunidad existente o crear una nueva.",
  };
};
