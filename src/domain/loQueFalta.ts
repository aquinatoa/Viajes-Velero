/**
 * Qué falta por saber de una petición, y en qué orden preguntarlo.
 *
 * Es el motor del chat de «La petición». Anthony lo pidió así mirando la
 * pantalla: «el bloque de La petición debe ser un chat que interactúe con
 * nosotros o con el cliente preguntando lo mínimo para recomendarle qué
 * alojamientos puede elegir».
 *
 * Lo que había era lo contrario de un chat: pegabas el correo, la app leía lo
 * que podía y, si faltaba algo, lo enseñaba como una lista de campos vacíos.
 * En la reunión del 21/09 eso costó veinte minutos: la petición no traía
 * destino, el aviso mandaba a «revisar el destino o las fechas», y se probaron
 * cuatro combinaciones de fechas antes de caer en que lo que faltaba era el
 * pueblo. Una pregunta —«¿a qué destino?»— lo habría resuelto en diez segundos.
 *
 * Tres reglas que gobiernan todo el fichero:
 *
 *   1. UNA pregunta cada vez. Un formulario de nueve campos no es un chat, y
 *      además nadie los rellena: se rellenan los tres primeros.
 *
 *   2. Cada pregunta dice POR QUÉ se pregunta. «¿Qué régimen?» es un trámite;
 *      «¿qué régimen? en el Santa Mónica hay 5 € de diferencia por alumno y
 *      noche entre media pensión y completa» es una razón para contestar.
 *
 *   3. «No lo han dicho» es una respuesta válida y NO se convierte en un dato.
 *      Si el colegio no dijo el régimen, la petición se queda sin régimen y el
 *      encaje no lo comprueba. Rellenarlo con «PC» porque es lo habitual sería
 *      inventarse lo que pidió un cliente, y eso acaba en un presupuesto que no
 *      corresponde a nada.
 */

/** Lo que se sabe de la petición mientras se va preguntando. */
export interface PeticionEnCurso {
  destinationText?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  participants?: number | null;
  teachers?: number | null;
  regimeRequested?: string | null;
  categoryRequested?: string | null;
  topePorAlumno?: number | null;
  requisitos?: string[] | null;
}

export type ClaveDelHueco =
  | "destinationText"
  | "dateFrom"
  | "dateTo"
  | "participants"
  | "regimeRequested"
  | "topePorAlumno"
  | "categoryRequested"
  | "requisitos"
  | "teachers";

export interface OpcionDeRespuesta {
  valor: string;
  etiqueta: string;
}

export interface Hueco {
  clave: ClaveDelHueco;
  /** La pregunta tal cual se le hace a quien cotiza. */
  pregunta: string;
  /** Por qué se pregunta. Sin esto la pregunta es un campo de formulario. */
  porque: string;
  /**
   * Sin esto no se puede recomendar nada. Se vuelve a preguntar hasta que se
   * conteste; «no lo han dicho» no lo cierra.
   */
  bloquea: boolean;
  tipo: "texto" | "fecha" | "numero" | "opciones" | "varias";
  opciones?: OpcionDeRespuesta[];
  /** Texto de ayuda dentro del campo. */
  ejemplo?: string;
}

const REGIMENES: OpcionDeRespuesta[] = [
  { valor: "Pensión completa", etiqueta: "Pensión completa" },
  { valor: "Media pensión", etiqueta: "Media pensión" },
  { valor: "Alojamiento y desayuno", etiqueta: "Alojamiento y desayuno" },
  { valor: "Solo alojamiento", etiqueta: "Solo alojamiento" },
];

const CATEGORIAS: OpcionDeRespuesta[] = [
  { valor: "2*", etiqueta: "2 estrellas" },
  { valor: "3*", etiqueta: "3 estrellas" },
  { valor: "4*", etiqueta: "4 estrellas" },
];

/**
 * Los requisitos que la app sabe comprobar contra el texto de un hotel.
 *
 * Es la misma lista que lee el mensaje del colegio, a propósito: preguntar por
 * algo que después no se sabe comprobar solo sirve para llenar la pantalla de
 * «no consta».
 */
export const REQUISITOS_QUE_SE_PREGUNTAN: OpcionDeRespuesta[] = [
  { valor: "Alergias / dietas especiales", etiqueta: "Alergias o dietas" },
  { valor: "Habitación adaptada / accesibilidad", etiqueta: "Habitación adaptada" },
  { valor: "Habitaciones de profesores cercanas", etiqueta: "Profesores cerca" },
  { valor: "Picnic / comida para llevar", etiqueta: "Picnic" },
  { valor: "Transporte / autocar", etiqueta: "Autocar" },
];

function vacio(valor: string | null | undefined): boolean {
  return !valor || !String(valor).trim();
}

/** Una fecha que se puede usar para buscar tarifas. */
function fechaUsable(valor: string | null | undefined): boolean {
  if (vacio(valor)) return false;
  const t = new Date(String(valor)).getTime();
  return !Number.isNaN(t);
}

/**
 * Todo lo que queda por preguntar, en el orden en que se pregunta.
 *
 * El orden no es el del formulario: es el de lo que bloquea. Primero lo que
 * impide buscar —destino y fechas—, después lo que impide cotizar —cuántos
 * alumnos—, y solo entonces lo que mejora la recomendación.
 *
 * `yaPreguntado` son las claves que ya se preguntaron y el colegio no supo
 * contestar. Las que no bloquean se preguntan UNA vez: insistir con el tope por
 * alumno cuando ya han dicho que no lo tienen es lo que hace que la gente deje
 * de leer lo que pone la pantalla.
 */
export function loQueFalta(peticion: PeticionEnCurso, yaPreguntado: string[] = []): Hueco[] {
  const huecos: Hueco[] = [];
  const pendiente = (clave: ClaveDelHueco) => !yaPreguntado.includes(clave);

  if (vacio(peticion.destinationText)) {
    huecos.push({
      clave: "destinationText",
      pregunta: "¿A qué destino quieren ir?",
      // El aviso de antes decia «revisa el destino o las fechas» cuando el
      // sistema sabia perfectamente cual de los dos faltaba.
      porque: "Sin el destino no se puede buscar ningún alojamiento: es lo primero que filtra.",
      bloquea: true,
      tipo: "texto",
      ejemplo: "Salou, Cambrils, Andorra…",
    });
  }

  if (!fechaUsable(peticion.dateFrom)) {
    huecos.push({
      clave: "dateFrom",
      pregunta: "¿Qué día llegan?",
      porque: "Los hoteles tienen un precio distinto por temporada; sin la fecha no hay tarifa que aplicar.",
      bloquea: true,
      tipo: "fecha",
    });
  }

  if (!fechaUsable(peticion.dateTo)) {
    huecos.push({
      clave: "dateTo",
      pregunta: "¿Y qué día se van?",
      porque: "De aquí salen las noches, y el precio por alumno es el de una noche multiplicado por ellas.",
      bloquea: true,
      tipo: "fecha",
    });
  } else if (
    fechaUsable(peticion.dateFrom) &&
    new Date(String(peticion.dateTo)).getTime() <= new Date(String(peticion.dateFrom)).getTime()
  ) {
    // No es un hueco, es una fecha imposible. Se pregunta igual, porque con
    // esto el viaje sale de cero noches y todos los precios salen a cero.
    huecos.push({
      clave: "dateTo",
      pregunta: "La fecha de salida no puede ser anterior a la de llegada. ¿Qué día se van?",
      porque: "Tal como está, el viaje son cero noches y todos los precios saldrían a cero.",
      bloquea: true,
      tipo: "fecha",
    });
  }

  if (!peticion.participants || peticion.participants <= 0) {
    huecos.push({
      clave: "participants",
      pregunta: "¿Cuántos alumnos son?",
      porque:
        "Muchos hoteles piden un mínimo de plazas para dar tarifa de grupo, y el total del presupuesto sale de aquí.",
      bloquea: true,
      tipo: "numero",
      ejemplo: "48",
    });
  }

  // — A partir de aquí ya se puede recomendar. Lo que sigue afina.

  if (vacio(peticion.regimeRequested) && pendiente("regimeRequested")) {
    huecos.push({
      clave: "regimeRequested",
      pregunta: "¿Qué régimen quieren?",
      porque: "Es lo que más mueve el precio: entre media pensión y completa hay varios euros por alumno y noche.",
      bloquea: false,
      tipo: "opciones",
      opciones: REGIMENES,
    });
  }

  if ((peticion.topePorAlumno ?? null) === null && pendiente("topePorAlumno")) {
    huecos.push({
      clave: "topePorAlumno",
      pregunta: "¿Han dicho cuánto pueden gastar por alumno?",
      porque: "Con el tope, cada alojamiento dice si cabe o cuánto se pasa. Sin él, hay que mirarlo a ojo.",
      bloquea: false,
      tipo: "numero",
      ejemplo: "300",
    });
  }

  if (vacio(peticion.categoryRequested) && pendiente("categoryRequested")) {
    huecos.push({
      clave: "categoryRequested",
      pregunta: "¿Pidieron alguna categoría?",
      porque: "Si piden 3 estrellas, los de menos se descartan solos y dejan de estorbar en la lista.",
      bloquea: false,
      tipo: "opciones",
      opciones: CATEGORIAS,
    });
  }

  // Los requisitos son el caso raro: que el mensaje no los mencione puede
  // significar que no los hay. Por eso se pregunta una vez y «nada especial» es
  // una respuesta de verdad, no un salto.
  if ((peticion.requisitos?.length ?? 0) === 0 && pendiente("requisitos")) {
    huecos.push({
      clave: "requisitos",
      pregunta: "¿Hay algo especial que deba cumplir el alojamiento?",
      porque:
        "Es lo que se comprueba hotel por hotel. Sin esto, dos celíacos o una alumna en silla de ruedas no influyen en nada.",
      bloquea: false,
      tipo: "varias",
      opciones: REQUISITOS_QUE_SE_PREGUNTAN,
    });
  }

  if ((peticion.teachers ?? null) === null && pendiente("teachers")) {
    huecos.push({
      clave: "teachers",
      pregunta: "¿Cuántos profesores van?",
      porque:
        "Los profesores se alojan y se cobran, muchas veces en habitación individual. Sin contarlos, el total se queda corto.",
      bloquea: false,
      tipo: "numero",
      ejemplo: "4",
    });
  }

  return huecos;
}

/** La siguiente pregunta, o null si no queda ninguna. */
export function siguientePregunta(peticion: PeticionEnCurso, yaPreguntado: string[] = []): Hueco | null {
  return loQueFalta(peticion, yaPreguntado)[0] ?? null;
}

/** Si ya hay lo justo para buscar y recomendar. */
export function sePuedeRecomendar(peticion: PeticionEnCurso): boolean {
  return loQueFalta(peticion).every((hueco) => !hueco.bloquea);
}

/**
 * Lo que aún se ignora cuando ya se puede recomendar.
 *
 * Se dice en el chat al terminar de preguntar. Recomendar sin decir sobre qué
 * se está recomendando a ciegas —sin tope, sin régimen— es lo que hace que
 * alguien mande tres hoteles que se pasan del presupuesto del colegio.
 */
export function loQueSeIgnora(peticion: PeticionEnCurso, yaPreguntado: string[] = []): string[] {
  const nombres: Partial<Record<ClaveDelHueco, string>> = {
    regimeRequested: "el régimen",
    topePorAlumno: "el tope por alumno",
    categoryRequested: "la categoría",
    requisitos: "los requisitos especiales",
    teachers: "cuántos profesores van",
  };

  const sinRespuesta: string[] = [];
  for (const clave of Object.keys(nombres) as ClaveDelHueco[]) {
    const sigueVacio =
      clave === "requisitos"
        ? (peticion.requisitos?.length ?? 0) === 0
        : clave === "topePorAlumno"
          ? (peticion.topePorAlumno ?? null) === null
          : clave === "teachers"
            ? (peticion.teachers ?? null) === null
            : vacio(peticion[clave as "regimeRequested" | "categoryRequested"]);
    if (sigueVacio) sinRespuesta.push(nombres[clave] as string);
  }
  // `yaPreguntado` no cambia nada aquí a propósito: que se haya preguntado no
  // quiere decir que se sepa. Lo que no se sabe hay que decirlo igual.
  void yaPreguntado;
  return sinRespuesta;
}

/**
 * Lo leído del mensaje nuevo, sin perder lo que ya se había contestado.
 *
 * Pasa en cuanto el chat funciona: el colegio manda un segundo correo, se pega,
 * y al releerlo el lector devuelve una petición nueva en la que el destino está
 * vacío —porque ese segundo correo no lo repetía—. Sin esta mezcla, la app
 * borraría el «Salou» que acabas de contestar y te lo volvería a preguntar.
 *
 * La regla es simple: lo que el mensaje nuevo SÍ dice manda, y lo que no dice
 * no borra nada.
 */
export function conservarLoContestado<T extends object>(leido: T, anterior: T | null): T {
  if (!anterior) return leido;
  const fundido: Record<string, unknown> = { ...(leido as Record<string, unknown>) };
  for (const [clave, valorAnterior] of Object.entries(anterior)) {
    const nuevo = fundido[clave];
    const nuevoVacio =
      nuevo === null ||
      nuevo === undefined ||
      (typeof nuevo === "string" && !nuevo.trim()) ||
      (Array.isArray(nuevo) && nuevo.length === 0);
    const anteriorVacio =
      valorAnterior === null ||
      valorAnterior === undefined ||
      (typeof valorAnterior === "string" && !String(valorAnterior).trim()) ||
      (Array.isArray(valorAnterior) && valorAnterior.length === 0);
    if (nuevoVacio && !anteriorVacio) fundido[clave] = valorAnterior;
  }
  return fundido as T;
}
