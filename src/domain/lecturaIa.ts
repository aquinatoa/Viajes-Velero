/**
 * La lectura con IA de una solicitud, y cómo se suma a la de las reglas.
 *
 * Reunión con Oravia, 05/11/2026. Las reglas leen bien lo previsible («48
 * alumnos», «del 12 al 16 de mayo») y fallan con lo que cada colegio cuenta a su
 * manera. La IA entiende el lenguaje libre, pero se inventa cosas con seguridad.
 * Por eso aquí NO manda: se suma a las reglas con tres condiciones.
 *
 *   1. Solo rellena HUECOS. Lo que las reglas ya leyeron, o lo que una persona
 *      fijó a mano, no se toca. Si la IA lee otra cosa, queda como DUDA a la
 *      vista, no como cambio.
 *   2. Cada dato trae la CITA literal de donde sale, y esa cita tiene que estar
 *      de verdad en lo escrito. Sin cita comprobable, el dato se descarta. Es lo
 *      que frena que invente un correo o una fecha.
 *   3. Todo lo que añade se cuenta en el chat, con su cita, para poder corregirlo.
 *
 * Es lógica pura (sin red): el servidor llama al modelo y esto valida y funde.
 */
import { nombreDelCanal } from "./clientesEspeciales";
import { mismoRequisito, sumarRequisitos } from "./requisitos";
import type { ClienteEspecial } from "./documentImportTypes";
import type { NormalizedRequestDraft } from "./types";

export type DepartamentoIa = "GROUPS" | "SPORTS";

/** Lo que de un cliente especial necesita el modelo para reconocerlo. */
export type ClienteParaLaIa = Pick<ClienteEspecial, "codigo" | "nombre" | "detalle">;

const NOMBRE_DEL_GENERAL = "Colegio, club o agencia";
const nombreDeDepartamento = (d: DepartamentoIa) => (d === "SPORTS" ? "Turismo Deportivo" : "Grupos");

/** Los campos de «lo entendido» que la IA puede proponer. */
export const CAMPOS_IA = [
  "language",
  "destinationText",
  "dateFrom",
  "dateTo",
  "participants",
  "teachers",
  "ageRangeText",
  "groupType",
  "regimeRequested",
  "categoryRequested",
] as const satisfies ReadonlyArray<keyof NormalizedRequestDraft>;
export type CampoIa = (typeof CAMPOS_IA)[number];

export const ETIQUETAS_IA: Record<CampoIa | "firstName" | "lastName" | "email" | "centreName" | "departamento" | "topePorAlumno" | "requisitos", string> = {
  language: "el idioma",
  destinationText: "el destino",
  dateFrom: "la fecha de llegada",
  dateTo: "la fecha de salida",
  participants: "los alumnos",
  teachers: "los profesores",
  ageRangeText: "las edades",
  groupType: "el tipo de grupo",
  regimeRequested: "el régimen",
  categoryRequested: "la categoría",
  firstName: "el nombre del contacto",
  lastName: "los apellidos del contacto",
  email: "el correo del contacto",
  centreName: "el centro",
  departamento: "el departamento",
  topePorAlumno: "el presupuesto por alumno",
  requisitos: "los requisitos",
};

export interface TextoParaLaIa {
  texto: string;
  /** «colegio» es lo que mandó el cliente; «chat» lo que escribió quien cotiza. */
  origen: "colegio" | "chat";
}

/** Lo que la IA ha leído, ya validado. Todo lo que no se pudo comprobar está vacío. */
export interface LecturaIa {
  contacto: { firstName: string; lastName: string; email: string };
  centreName: string;
  departamento: DepartamentoIa | "";
  /**
   * Para quién se cotiza: el código de un cliente especial (con cita), «GENERIC»
   * si nada apunta a uno, o vacío si no se puede saber. Cambia las tarifas.
   */
  canal: string;
  campos: Partial<Record<CampoIa, string | number>>;
  topePorAlumno: number | null;
  requisitos: string[];
  /** De dónde sale cada dato, copiado del texto. La clave es el campo. */
  citas: Record<string, string>;
  avisos: string[];
  /** Lo que se descartó por no poder comprobarlo, para el registro. */
  descartado: string[];
}

export function lecturaIaVacia(): LecturaIa {
  return {
    contacto: { firstName: "", lastName: "", email: "" },
    centreName: "",
    departamento: "",
    canal: "",
    campos: {},
    topePorAlumno: null,
    requisitos: [],
    citas: {},
    avisos: [],
    descartado: [],
  };
}

// ---------------------------------------------------------------------------
// Lo que se le pide al modelo
// ---------------------------------------------------------------------------

export const SISTEMA_LECTURA_IA = [
  "Lees solicitudes de viaje que llegan a Oravia, una agencia de viajes escolares (Grupos) y deportivos (Turismo Deportivo).",
  "Te paso los mensajes en orden: los del cliente y, entre ellos, lo que ha escrito quien cotiza en el chat. Lo posterior corrige a lo anterior.",
  "Tu trabajo es extraer datos, no opinar. NUNCA inventes: si un dato no está escrito, déjalo a null.",
  "Cada dato que des debe ir con su «cita»: el trozo del texto, copiado tal cual, de donde lo has sacado. Sin cita, no hay dato.",
  "Responde SOLO con un objeto JSON, sin texto antes ni después.",
].join(" ");

export function instruccionesLecturaIa(
  textos: TextoParaLaIa[],
  hoy: Date = new Date(),
  clientes: ClienteParaLaIa[] = [],
): string {
  const mensajes = textos.map((t, i) => `[${i + 1}] (${t.origen === "chat" ? "escrito por quien cotiza" : "del cliente"})\n${t.texto}`).join("\n\n");
  const listaDeClientes =
    clientes.length > 0
      ? clientes.map((c) => `  - ${c.codigo}: ${c.nombre}${c.detalle ? ` (${c.detalle})` : ""}`).join("\n")
      : "  (ninguno)";
  return [
    `Hoy es ${hoy.toISOString().slice(0, 10)}. Las fechas sin año son de la próxima vez que ocurran.`,
    "",
    "Clientes especiales (turoperadores o agencias con tarifas propias pactadas, distintas de las generales):",
    listaDeClientes,
    "",
    "Devuelve este JSON (cada valor es null si el texto no lo dice):",
    "{",
    '  "contactoNombre": nombre de pila de la persona que escribe (el contacto), no del centro,',
    '  "contactoApellidos": sus apellidos,',
    '  "contactoEmail": su correo,',
    '  "centro": nombre del colegio, club o entidad,',
    '  "departamento": "GROUPS" si es un colegio, instituto o grupo escolar; "SPORTS" si es un club, equipo o torneo deportivo; null si no está claro,',
    '  "cotizamosPara": el CÓDIGO de un cliente especial de la lista si quien escribe ES ese cliente o lo nombra como el que contrata el viaje (su nombre, su empresa, su firma); "GENERIC" si es un colegio, club, equipo o agencia corriente y nada apunta a un cliente especial; null si no se puede saber. Equivocarse aquí hace que salgan las tarifas que no son: ante la duda, null,',
    '  "destino": localidad de destino (p. ej. Salou, Cambrils),',
    '  "fechaEntrada": "AAAA-MM-DD",',
    '  "fechaSalida": "AAAA-MM-DD",',
    '  "alumnos": número entero de alumnos o jugadores (participantes que no son adultos acompañantes),',
    '  "profesores": número entero de profesores, entrenadores o acompañantes,',
    '  "edades": texto, p. ej. "15-17 años",',
    '  "tipoDeGrupo": "Grupo escolar" | "Grupo universitario" | "Club deportivo" | null,',
    '  "regimen": "pensión completa" | "media pensión" | "alojamiento y desayuno" | "solo alojamiento" | null,',
    '  "categoria": p. ej. "3*" o "4*" | null,',
    '  "idioma": "Español" | "Inglés" | otro idioma en que escribe el cliente,',
    '  "presupuestoPorAlumno": número en euros | null,',
    '  "requisitos": [peticiones concretas que NO caben en los demás campos: autocar, accesibilidad, alergias, césped natural, bungalows… No repitas el destino, las fechas, el número de personas ni el nombre del alojamiento],',
    '  "citas": { "<campo>": "trozo del texto copiado tal cual" } — una por cada campo no nulo, con la clave igual al nombre del campo de arriba,',
    '  "avisos": [frases cortas con lo que habría que comprobar o contradicciones entre mensajes]',
    "}",
    "",
    "Reglas:",
    "- «departamento» y «cotizamosPara» deciden qué tarifas de hotel se ofrecen: léelos con cuidado y, si das un cliente especial, la cita tiene que ser el trozo donde aparece su nombre o el de su empresa.",
    "- El contacto es quien escribe o firma, no el centro ni el alojamiento. Si solo hay un correo y un nombre sueltos en un mensaje de quien cotiza, son del contacto.",
    "- Si dos mensajes dicen cosas distintas del mismo dato, vale el más reciente y lo dices en «avisos».",
    "- Un número de «pax» o «personas» es el total de participantes: ponlo en «alumnos» y deja «profesores» a null, avisando de que no hay desglose. Si dan jugadores y entrenadores por separado, sepáralos.",
    "- «MSH», «Mediterranean Sports Hub» y «Cambrils Park» son el mismo sitio, en Cambrils: si el cliente lo nombra como lugar donde quiere estar, el destino es Cambrils.",
    "- Las fechas pueden venir como «12.03.-16.03.2027», «17-21 February» o «del 12 al 16 de mayo»: pásalas siempre a AAAA-MM-DD.",
    "",
    "Mensajes:",
    mensajes,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Validar lo que devuelve el modelo
// ---------------------------------------------------------------------------

/** Para comparar una cita con el texto: sin mayúsculas, sin acentos y con los espacios colapsados. */
export function plano(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const EMAIL = /^[\w.+-]+@[\w-]+\.[\w.-]+$/;

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function entero(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function fechaIso(v: unknown): string {
  const s = texto(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? "" : s;
}

/** Cada palabra del nombre tiene que estar escrita en alguna parte del texto. */
function estaEscrito(valor: string, textoPlano: string): boolean {
  const palabras = plano(valor).split(" ").filter(Boolean);
  return palabras.length > 0 && palabras.every((p) => textoPlano.includes(p));
}

/**
 * Lo que devolvió el modelo, comprobado contra lo que de verdad se escribió.
 * Un dato sin cita, con una cita que no está en el texto, o imposible
 * (30 de febrero, un correo mal formado), no pasa.
 */
export function normalizarLecturaIa(bruto: unknown, textos: string[], codigosEspeciales: string[] = []): LecturaIa {
  const salida = lecturaIaVacia();
  if (!bruto || typeof bruto !== "object") return salida;
  const b = bruto as Record<string, unknown>;
  const todo = plano(textos.join("\n"));
  const citasBrutas = (b.citas && typeof b.citas === "object" ? b.citas : {}) as Record<string, unknown>;

  /** La cita de un campo, si está de verdad en el texto. */
  const citaDe = (campo: string): string => {
    const cita = texto(citasBrutas[campo]);
    return cita && todo.includes(plano(cita)) ? cita : "";
  };
  const conCita = (campo: string, valor: string | number | null): boolean => {
    if (valor === null || valor === "") return false;
    const cita = citaDe(campo);
    if (!cita) {
      salida.descartado.push(`${campo}: sin cita que esté en el texto (${String(valor)})`);
      return false;
    }
    salida.citas[campo] = cita;
    return true;
  };

  const email = texto(b.contactoEmail).toLowerCase();
  if (email) {
    if (!EMAIL.test(email) || !todo.includes(email)) salida.descartado.push(`contactoEmail: no está escrito tal cual (${email})`);
    else {
      salida.contacto.email = email;
      salida.citas.email = email;
    }
  }
  for (const [clave, campo] of [["contactoNombre", "firstName"], ["contactoApellidos", "lastName"]] as const) {
    const valor = texto(b[clave]);
    if (!valor) continue;
    if (!estaEscrito(valor, todo)) salida.descartado.push(`${clave}: no está escrito (${valor})`);
    else {
      salida.contacto[campo] = valor;
      salida.citas[campo] = citaDe(clave) || valor;
    }
  }
  const centro = texto(b.centro);
  if (centro && conCita("centro", centro)) {
    salida.centreName = centro;
    salida.citas.centreName = salida.citas.centro;
  }

  const departamento = texto(b.departamento).toUpperCase();
  if ((departamento === "GROUPS" || departamento === "SPORTS") && conCita("departamento", departamento)) {
    salida.departamento = departamento;
  }

  // Para quién se cotiza. Un cliente especial solo pasa si el código existe y
  // su nombre o su empresa está escrito (la cita): un código inventado, o uno
  // real sin prueba, daría tarifas que no son. «GENERIC» no lleva cita porque
  // es la ausencia de pistas.
  const canal = texto(b.cotizamosPara);
  if (canal.toUpperCase() === "GENERIC") salida.canal = "GENERIC";
  else if (canal) {
    const codigo = codigosEspeciales.find((c) => c === canal || c.toUpperCase() === canal.toUpperCase());
    if (!codigo) salida.descartado.push(`cotizamosPara: no es un cliente especial que exista (${canal})`);
    else if (conCita("cotizamosPara", codigo)) {
      salida.canal = codigo;
      salida.citas.canal = salida.citas.cotizamosPara;
    }
  }

  const propuestos: Array<[CampoIa, string, string | number | null]> = [
    ["destinationText", "destino", texto(b.destino)],
    ["dateFrom", "fechaEntrada", fechaIso(b.fechaEntrada)],
    ["dateTo", "fechaSalida", fechaIso(b.fechaSalida)],
    ["participants", "alumnos", entero(b.alumnos, 1, 5000)],
    ["teachers", "profesores", entero(b.profesores, 0, 500)],
    ["ageRangeText", "edades", texto(b.edades)],
    ["groupType", "tipoDeGrupo", texto(b.tipoDeGrupo)],
    ["regimeRequested", "regimen", texto(b.regimen).toLowerCase()],
    ["categoryRequested", "categoria", texto(b.categoria)],
    ["language", "idioma", texto(b.idioma)],
  ];
  for (const [campo, clave, valor] of propuestos) {
    if (valor !== null && valor !== "" && conCita(clave, valor)) {
      salida.campos[campo] = valor;
      salida.citas[campo] = salida.citas[clave];
    }
  }

  const tope = typeof b.presupuestoPorAlumno === "number" && b.presupuestoPorAlumno > 0 && b.presupuestoPorAlumno < 100000 ? b.presupuestoPorAlumno : null;
  if (tope !== null && conCita("presupuestoPorAlumno", tope)) {
    salida.topePorAlumno = tope;
    salida.citas.topePorAlumno = salida.citas.presupuestoPorAlumno;
  }

  if (Array.isArray(b.requisitos)) {
    for (const r of b.requisitos) {
      const t = texto(r);
      if (t && t.length <= 160 && !salida.requisitos.some((x) => mismoRequisito(x, t))) salida.requisitos.push(t);
    }
  }
  if (Array.isArray(b.avisos)) {
    for (const a of b.avisos) {
      const t = texto(a);
      if (t) salida.avisos.push(t);
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Sumar la IA a lo que entendieron las reglas
// ---------------------------------------------------------------------------

export interface DatoAnadido {
  /** «el nombre del contacto», «los alumnos»… */
  etiqueta: string;
  valor: string;
  cita: string;
}

export interface DudaDeLaIa {
  etiqueta: string;
  reglas: string;
  ia: string;
  cita: string;
  /** Quién tiene el otro valor: «las reglas» (por defecto) o «lo elegido». */
  quien?: string;
}

export interface EntradaDeSuma {
  /** Lo que entendieron las reglas (una lectura vacía si aún no hay ninguna). */
  entendido: NormalizedRequestDraft;
  tope: number | null;
  requisitos: string[];
  contacto: { firstName: string; lastName: string; email: string; centreName: string };
  departamento: DepartamentoIa | "";
  /** Para quién se cotiza ahora: «GENERIC» o el código de un cliente especial. */
  canal?: string;
  /** Los clientes especiales, para decir su nombre en vez de su código. */
  clientes?: ClienteEspecial[];
  /** Campos que una persona ha fijado a mano: la IA no los toca ni los discute. */
  fijados: string[];
}

export interface SumaDeLaIa {
  /** `null` si la IA no cambia nada de lo entendido. */
  entendido: NormalizedRequestDraft | null;
  tope: number | null;
  requisitos: string[];
  /** Solo lo que estaba vacío y la IA rellena. */
  contacto: Partial<{ firstName: string; lastName: string; email: string; centreName: string }>;
  departamento: DepartamentoIa | "";
  /** Solo si la IA cambia «Cotizamos para»: el código nuevo. Vacío = se queda como está. */
  canal: string;
  anadidos: DatoAnadido[];
  dudas: DudaDeLaIa[];
  /**
   * Lo que la IA ha contrastado con el mensaje y coincide con lo elegido
   * («Cotizamos para», departamento). Se le dice a quien cotiza: es la
   * comprobación que pidió Anthony, porque de esto depende qué tarifas salen.
   */
  comprobado: string[];
  /** ¿Cambia algo que afecta a la búsqueda de hoteles? */
  cambiaLaBusqueda: boolean;
}

function hayValor(v: unknown): boolean {
  return v !== null && v !== undefined && String(v).trim() !== "";
}

export function sumarLecturaIa(entrada: EntradaDeSuma, ia: LecturaIa): SumaDeLaIa {
  const fijados = new Set(entrada.fijados);
  const anadidos: DatoAnadido[] = [];
  const dudas: DudaDeLaIa[] = [];
  const cita = (campo: string) => ia.citas[campo] ?? "";

  let entendido: NormalizedRequestDraft | null = null;
  const base = entrada.entendido as unknown as Record<string, unknown>;
  let cambiaLaBusqueda = false;

  for (const campo of CAMPOS_IA) {
    const propuesto = ia.campos[campo];
    if (propuesto === undefined || fijados.has(campo)) continue;
    const actual = base[campo];
    if (!hayValor(actual)) {
      entendido = { ...(entendido ?? entrada.entendido), [campo]: propuesto } as NormalizedRequestDraft;
      anadidos.push({ etiqueta: ETIQUETAS_IA[campo], valor: String(propuesto), cita: cita(campo) });
      if (campo !== "language" && campo !== "groupType") cambiaLaBusqueda = true;
    } else if (plano(String(actual)) !== plano(String(propuesto))) {
      dudas.push({ etiqueta: ETIQUETAS_IA[campo], reglas: String(actual), ia: String(propuesto), cita: cita(campo) });
    }
  }

  const contacto: SumaDeLaIa["contacto"] = {};
  for (const clave of ["email", "firstName", "lastName"] as const) {
    if (ia.contacto[clave] && !hayValor(entrada.contacto[clave]) && !fijados.has(clave)) {
      contacto[clave] = ia.contacto[clave];
      anadidos.push({ etiqueta: ETIQUETAS_IA[clave], valor: ia.contacto[clave], cita: cita(clave) });
    }
  }
  if (ia.centreName && !hayValor(entrada.contacto.centreName) && !fijados.has("centreName")) {
    contacto.centreName = ia.centreName;
    anadidos.push({ etiqueta: ETIQUETAS_IA.centreName, valor: ia.centreName, cita: cita("centreName") });
  }

  // Departamento y «Cotizamos para» deciden qué tarifas de hotel salen
  // (reunión del 05/11: faltaron alojamientos porque se eligió «grupo» cuando
  // era un operador especial). Aquí la IA los CONTRASTA con el mensaje: rellena
  // el hueco si no hay nada elegido, dice que coincide si coincide, y si no
  // coincide lo AVISA sin cambiarlo (lo elegido por una persona manda).
  const comprobado: string[] = [];
  let departamento: SumaDeLaIa["departamento"] = "";
  if (ia.departamento) {
    if (!entrada.departamento) {
      departamento = ia.departamento;
      anadidos.push({
        etiqueta: ETIQUETAS_IA.departamento,
        valor: nombreDeDepartamento(ia.departamento),
        cita: cita("departamento"),
      });
      cambiaLaBusqueda = true;
    } else if (ia.departamento === entrada.departamento) {
      comprobado.push(`el departamento: ${nombreDeDepartamento(ia.departamento)}${deCita(cita("departamento"))}`);
    } else {
      dudas.push({
        etiqueta: ETIQUETAS_IA.departamento,
        reglas: nombreDeDepartamento(entrada.departamento),
        ia: nombreDeDepartamento(ia.departamento),
        cita: cita("departamento"),
        quien: "lo elegido",
      });
    }
  }

  let canal = "";
  if (entrada.canal !== undefined && ia.canal) {
    const clientes = entrada.clientes ?? [];
    const decir = (c: string) => nombreDelCanal(c, clientes, NOMBRE_DEL_GENERAL);
    const actual = entrada.canal || "GENERIC";
    if (ia.canal === actual) {
      comprobado.push(
        ia.canal === "GENERIC"
          ? `«Cotizamos para»: ${NOMBRE_DEL_GENERAL} (nada en el mensaje apunta a un cliente especial)`
          : `«Cotizamos para»: ${decir(ia.canal)}${deCita(cita("canal"))}`,
      );
    } else if (ia.canal !== "GENERIC" && actual === "GENERIC" && !fijados.has("canal")) {
      // Sin tocar nada a mano y con el nombre del cliente escrito: se pone.
      canal = ia.canal;
      anadidos.push({ etiqueta: "para quién cotizamos", valor: decir(ia.canal), cita: cita("canal") });
      cambiaLaBusqueda = true;
    } else {
      dudas.push({ etiqueta: "para quién cotizamos", reglas: decir(actual), ia: decir(ia.canal), cita: cita("canal"), quien: "lo elegido" });
    }
  }

  let tope = entrada.tope;
  if (ia.topePorAlumno !== null && entrada.tope === null && !fijados.has("topePorAlumno")) {
    tope = ia.topePorAlumno;
    anadidos.push({ etiqueta: ETIQUETAS_IA.topePorAlumno, valor: `${ia.topePorAlumno} €`, cita: cita("topePorAlumno") });
    cambiaLaBusqueda = true;
  }

  let requisitos = entrada.requisitos;
  if (!fijados.has("requisitos")) {
    const nuevos = ia.requisitos.filter((r) => !entrada.requisitos.some((x) => mismoRequisito(x, r)));
    if (nuevos.length > 0) {
      requisitos = sumarRequisitos(entrada.requisitos, nuevos);
      anadidos.push({ etiqueta: ETIQUETAS_IA.requisitos, valor: nuevos.join(", "), cita: "" });
      cambiaLaBusqueda = true;
    }
  }

  return { entendido, tope, requisitos, contacto, departamento, canal, anadidos, dudas, comprobado, cambiaLaBusqueda };
}

function deCita(c: string): string {
  return c ? ` (de «${c.length > 70 ? `${c.slice(0, 70)}…` : c}»)` : "";
}

/** El mensaje del chat: qué ha añadido la IA, de dónde, qué ha comprobado y en qué no está de acuerdo. */
export function frasesDeLaIa(suma: SumaDeLaIa): string {
  const partes: string[] = [];
  if (suma.anadidos.length > 0) {
    partes.push("La IA ha añadido: " + suma.anadidos.map((a) => `${a.etiqueta} → ${a.valor}${deCita(a.cita)}`).join("; ") + ".");
  }
  if (suma.comprobado.length > 0) {
    partes.push("He comprobado con el mensaje que coincide lo elegido en " + suma.comprobado.join("; ") + ".");
  }
  if (suma.dudas.length > 0) {
    partes.push(
      "Ojo, lee distinto: " +
        suma.dudas
          .map((d) => `${d.etiqueta}, ${d.quien ?? "las reglas"} ${d.reglas} y la IA ${d.ia}${deCita(d.cita)}`)
          .join("; ") +
        ". No lo he cambiado: mira «Lo que hemos entendido», porque de esto dependen las tarifas que salen.",
    );
  }
  return partes.join(" ");
}
