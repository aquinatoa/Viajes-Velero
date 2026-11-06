/**
 * El auditor de «Lo que hemos entendido».
 *
 * Prueba de Anthony del 05/11/2026: en la ventana de validación el régimen era
 * una frase del chat, los requisitos salían repetidos en dos idiomas y nada lo
 * decía. La IA leía el mensaje, pero solo comparaba los datos que ELLA proponía:
 * lo que las reglas dejaban mal y ella no proponía pasaba sin que nadie lo mirara.
 *
 * Aquí la IA hace de auditor del resumen ENTERO. Recibe el texto completo y los
 * valores exactos que se enseñan, y contesta por cada uno:
 *
 *   correcto       con la frase del texto que lo respalda;
 *   no_cuadra      lo que dice el texto, con su frase, y el valor para aplicarlo;
 *   sin_respaldo   no aparece en lo escrito (lo tecleó alguien, o lo inventó una regla).
 *
 * Propone, no cambia: corregir es un clic de quien cotiza. Y no se fía de sí
 * misma: un «correcto» sin frase comprobable baja a «sin respaldo», un «no
 * cuadra» sin frase también, y el correo se comprueba sin IA, letra a letra.
 *
 * Es lógica pura (sin red): el servidor llama al modelo y esto valida.
 */
import { nombreDelCanal } from "./clientesEspeciales";
import type { ClienteEspecial } from "./documentImportTypes";
import { plano, type ClienteParaLaIa, type TextoParaLaIa } from "./lecturaIa";
import { bloquesParaValidar, DEPARTAMENTOS, type PeticionParaValidar } from "./validacionDeLaPeticion";

export type ClaveAuditada =
  | "destino"
  | "fechas"
  | "alumnos"
  | "profesores"
  | "edades"
  | "regimen"
  | "categoria"
  | "presupuesto"
  | "requisitos"
  | "centro"
  | "contacto"
  | "correo"
  | "cotizamosPara"
  | "departamento";

/** Cada fila de la ventana de validación, con la clave con la que se audita. */
export const FILA_A_CLAVE: Record<string, ClaveAuditada> = {
  Destino: "destino",
  Fechas: "fechas",
  Alumnos: "alumnos",
  Profesores: "profesores",
  Edades: "edades",
  "Régimen": "regimen",
  "Categoría": "categoria",
  "Presupuesto por alumno": "presupuesto",
  "Requisitos especiales": "requisitos",
  Centro: "centro",
  Contacto: "contacto",
  Correo: "correo",
  "Cotizamos para": "cotizamosPara",
  Departamento: "departamento",
};

export type EstadoAuditado = "correcto" | "no_cuadra" | "sin_respaldo";

export interface ValorAuditado {
  clave: ClaveAuditada;
  /** El nombre de la fila, como la ve quien cotiza. */
  que: string;
  /** Lo que se enseña, o «» si la fila está vacía. */
  valor: string;
  /** Solo «Cotizamos para» y «Departamento»: el código interno (GENERIC, SWISS_TTOO, GROUPS…). */
  codigo?: string;
}

export interface Veredicto {
  clave: ClaveAuditada;
  estado: EstadoAuditado;
  /** El trozo del texto que lo respalda (o que dice otra cosa). Comprobado contra lo escrito. */
  cita: string;
  /** Lo que dice el texto, para «no cuadra». */
  texto: string;
  /** El valor para aplicar con un clic, ya validado. «» si no se puede aplicar solo. */
  sugerido: string;
  /** El dato está mal y lo correcto es dejarlo vacío (p. ej. una frase donde iba el régimen). */
  vaciar: boolean;
  motivo: string;
}

export interface ResultadoAuditoria {
  veredictos: Partial<Record<ClaveAuditada, Veredicto>>;
  /** Lo que el modelo dijo y no pasó la comprobación, para el registro. */
  descartado: string[];
}

/** Los datos que pueden quedarse vacíos sin que la solicitud deje de ser válida. */
const PUEDEN_QUEDAR_VACIOS = new Set<ClaveAuditada>(["regimen", "categoria", "edades", "presupuesto", "profesores", "requisitos"]);

const VACIOS = new Set(["", "—", "no lo han dicho", "ninguno", "sin elegir"]);

/** Los valores que se enseñan en la ventana, listos para auditar. */
export function valoresParaAuditar(p: PeticionParaValidar, clientes: ClienteEspecial[]): ValorAuditado[] {
  const salida: ValorAuditado[] = [];
  for (const bloque of bloquesParaValidar(p, clientes)) {
    for (const fila of bloque.filas) {
      const clave = FILA_A_CLAVE[fila.que];
      if (!clave) continue;
      const vacio = VACIOS.has(fila.valor.trim().toLowerCase());
      const v: ValorAuditado = { clave, que: fila.que, valor: vacio ? "" : fila.valor };
      if (clave === "cotizamosPara") {
        v.codigo = String(p.canal ?? "").trim() || "GENERIC";
        v.valor = nombreDelCanal(v.codigo, clientes, "Colegio, club o agencia");
      }
      if (clave === "departamento") v.codigo = String(p.departamento ?? "").trim();
      salida.push(v);
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Lo que se le pide al modelo
// ---------------------------------------------------------------------------

export const SISTEMA_AUDITORIA_IA = [
  "Eres el revisor de una agencia de viajes escolares (Grupos) y deportivos (Turismo Deportivo).",
  "Te paso los mensajes de una solicitud y el resumen que se ha entendido de ellos. Tu trabajo es COMPROBAR cada dato del resumen contra lo escrito, no volver a leer la solicitud.",
  "NUNCA inventes: cada «correcto» y cada «no_cuadra» debe llevar su «cita», el trozo del texto copiado tal cual.",
  "Responde SOLO con un objeto JSON, sin texto antes ni después.",
].join(" ");

export function instruccionesAuditoria(
  textos: TextoParaLaIa[],
  valores: ValorAuditado[],
  hoy: Date = new Date(),
  clientes: ClienteParaLaIa[] = [],
): string {
  const mensajes = textos
    .map((t, i) => `[${i + 1}] (${t.origen === "chat" ? "escrito por quien cotiza" : "del cliente"})\n${t.texto}`)
    .join("\n\n");
  const lista = clientes.length > 0 ? clientes.map((c) => `  - ${c.codigo}: ${c.nombre}${c.detalle ? ` (${c.detalle})` : ""}`).join("\n") : "  (ninguno)";
  const filas = valores
    .filter((v) => v.clave !== "correo")
    .map((v) => `  - ${v.clave} («${v.que}»): ${v.valor === "" ? "(vacío)" : v.valor}${v.codigo ? ` [código ${v.codigo || "sin elegir"}]` : ""}`)
    .join("\n");
  return [
    `Hoy es ${hoy.toISOString().slice(0, 10)}. Las fechas sin año son de la próxima vez que ocurran.`,
    "",
    "Clientes especiales (turoperadores o agencias con tarifas propias pactadas):",
    lista,
    "",
    "Resumen que se va a usar para buscar hoteles y mandar el presupuesto:",
    filas,
    "",
    "Por CADA clave del resumen devuelve:",
    '{ "campos": { "<clave>": { "estado": "correcto" | "no_cuadra" | "sin_respaldo", "cita": "trozo del texto copiado tal cual", "valorCorrecto": "solo si no_cuadra", "motivo": "solo si no_cuadra o sin_respaldo" } } }',
    "Sé BREVE: la cita, de 12 palabras como máximo (la parte justa que lo prueba); el motivo, de 15 palabras como máximo y solo cuando no es «correcto». Nada de explicaciones en los «correcto».",
    "",
    "- correcto: el texto respalda el valor. Pon la cita. Si el valor está vacío y el texto tampoco dice nada de eso, es correcto sin cita.",
    "- no_cuadra: el texto dice otra cosa, o dice algo y el valor está vacío, o hay un error (p. ej. dos requisitos que son el mismo escrito de dos formas, o una frase donde debería haber un dato). Pon la cita de lo que dice el texto y en «valorCorrecto» el valor bueno, o «» (cadena vacía) si el dato no debería estar (p. ej. una frase del chat donde iba el régimen).",
    "- sin_respaldo: el valor no aparece en lo escrito (alguien lo tecleó, o no se sabe de dónde sale). Sin cita.",
    "",
    "Formato de «valorCorrecto» según la clave:",
    "  destino: la localidad (p. ej. Cambrils). «MSH», «Mediterranean Sports Hub» y «Cambrils Park» son el mismo sitio, en Cambrils.",
    '  fechas: "AAAA-MM-DD → AAAA-MM-DD". alumnos, profesores: número entero. presupuesto: número en euros.',
    '  edades: texto, p. ej. "15-17 años". categoria: p. ej. "4*". regimen: "Pensión completa" | "Media pensión" | "Alojamiento y desayuno" | "Solo alojamiento".',
    '  requisitos: la lista buena separada por " · ", sin repetidos (los dos idiomas son el mismo), sin el destino, las fechas, las personas ni el alojamiento.',
    "  centro: nombre del colegio, club o entidad. contacto: «Nombre Apellidos» de quien escribe o firma (no el centro).",
    "  cotizamosPara: el CÓDIGO de un cliente especial si quien escribe ES ese cliente o lo nombra como el que contrata; GENERIC si es un colegio, club o agencia corriente y nada apunta a un cliente especial. Equivocarse da tarifas que no son.",
    "  departamento: GROUPS si es un colegio, instituto o grupo escolar; SPORTS si es un club, equipo o torneo deportivo.",
    "",
    "Reglas:",
    "- Un número de «pax» o «personas» es el total. Si luego dicen cuántos son alumnos y cuántos profesores, alumnos y profesores son esos.",
    "- Si dos mensajes dicen cosas distintas, vale el más reciente.",
    "- El contacto es quien escribe o firma; un saludo («Dear Pablo») no es el contacto.",
    "- Ante la duda, sin_respaldo. No marques no_cuadra por diferencias de formato (mayúsculas, «pensión completa» y «PC»).",
    "",
    "Mensajes:",
    mensajes,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Validar lo que devuelve el modelo
// ---------------------------------------------------------------------------

const EMAIL = /^[\w.+-]+@[\w-]+\.[\w.-]+$/;

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

function fechaIso(s: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? "" : s;
}

function estaEscrito(valor: string, todo: string): boolean {
  const palabras = plano(valor).split(" ").filter(Boolean);
  return palabras.length > 0 && palabras.every((p) => todo.includes(p));
}

/** El valor propuesto, comprobado y en el formato que la pantalla sabe aplicar. «» si no vale. */
function sugeridoValido(clave: ClaveAuditada, bruto: unknown, todo: string, codigosEspeciales: string[]): string {
  const s = texto(bruto);
  if (!s) return "";
  switch (clave) {
    case "alumnos":
    case "profesores": {
      const n = /^\d+$/.test(s) ? Number(s) : NaN;
      return Number.isInteger(n) && n >= (clave === "alumnos" ? 1 : 0) && n <= 5000 ? String(n) : "";
    }
    case "presupuesto": {
      const n = Number(s.replace(",", "."));
      return Number.isFinite(n) && n > 0 && n < 100000 ? String(n) : "";
    }
    case "fechas": {
      const m = s.match(/^(\d{4}-\d{2}-\d{2})\s*(?:→|->|a|-)\s*(\d{4}-\d{2}-\d{2})$/);
      return m && fechaIso(m[1]) && fechaIso(m[2]) && m[1] <= m[2] ? `${m[1]} → ${m[2]}` : "";
    }
    case "requisitos": {
      const items = s.split(/\s*[·;|]\s*|\s*,\s*/).map((r) => r.trim()).filter(Boolean);
      return items.length > 0 && items.every((r) => r.length <= 160) ? items.join(" · ") : "";
    }
    case "correo":
      return EMAIL.test(s.toLowerCase()) && todo.includes(s.toLowerCase()) ? s.toLowerCase() : "";
    case "cotizamosPara": {
      const c = s.toUpperCase() === "GENERIC" ? "GENERIC" : codigosEspeciales.find((x) => x.toUpperCase() === s.toUpperCase());
      return c ?? "";
    }
    case "departamento": {
      const d = s.toUpperCase();
      return d === "GROUPS" || d === "SPORTS" ? d : "";
    }
    case "contacto":
      return estaEscrito(s, todo) && s.length <= 80 ? s : "";
    default:
      return s.length <= 80 ? s : "";
  }
}

/**
 * Lo que devolvió el modelo, comprobado contra lo que de verdad se escribió.
 * `valores` son los que se enseñaron: solo se admiten veredictos de esas claves.
 */
export function normalizarAuditoria(
  bruto: unknown,
  textos: string[],
  valores: ValorAuditado[],
  codigosEspeciales: string[] = [],
): ResultadoAuditoria {
  const salida: ResultadoAuditoria = { veredictos: {}, descartado: [] };
  const todo = plano(textos.join("\n"));
  const campos =
    bruto && typeof bruto === "object" && (bruto as Record<string, unknown>).campos && typeof (bruto as Record<string, unknown>).campos === "object"
      ? ((bruto as Record<string, unknown>).campos as Record<string, unknown>)
      : {};

  for (const v of valores) {
    // El correo no se le fía al modelo: o está escrito tal cual, o no.
    if (v.clave === "correo") {
      if (v.valor) {
        const escrito = todo.includes(v.valor.trim().toLowerCase());
        salida.veredictos.correo = {
          clave: "correo",
          estado: escrito ? "correcto" : "sin_respaldo",
          cita: escrito ? v.valor.trim() : "",
          texto: "",
          sugerido: "",
          vaciar: false,
          motivo: escrito ? "" : "Este correo no está escrito en ningún mensaje.",
        };
      }
      continue;
    }

    const raw = campos[v.clave];
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const estado = texto(r.estado);
    if (estado !== "correcto" && estado !== "no_cuadra" && estado !== "sin_respaldo") {
      salida.descartado.push(`${v.clave}: estado no válido (${estado})`);
      continue;
    }
    const citaBruta = texto(r.cita);
    const cita = citaBruta && todo.includes(plano(citaBruta)) ? citaBruta : "";
    const motivo = texto(r.motivo).slice(0, 220);
    const base = { clave: v.clave, texto: "", sugerido: "", vaciar: false };

    if (estado === "correcto") {
      const sinNada = v.valor === "";
      const generico = v.clave === "cotizamosPara" && v.codigo === "GENERIC";
      if (sinNada || generico || cita) {
        salida.veredictos[v.clave] = { ...base, estado: "correcto", cita, motivo };
      } else {
        salida.descartado.push(`${v.clave}: «correcto» sin cita en el texto`);
        salida.veredictos[v.clave] = {
          ...base,
          estado: "sin_respaldo",
          cita: "",
          motivo: "La IA lo dio por bueno pero no pudo citar el texto que lo respalda.",
        };
      }
    } else if (estado === "no_cuadra") {
      if (!cita) {
        salida.descartado.push(`${v.clave}: «no cuadra» sin cita en el texto`);
        salida.veredictos[v.clave] = {
          ...base,
          estado: "sin_respaldo",
          cita: "",
          motivo: "La IA duda de este dato pero no pudo citar el texto: no lo doy por malo, mira si aparece en lo escrito.",
        };
        continue;
      }
      const sugerido = sugeridoValido(v.clave, r.valorCorrecto, todo, codigosEspeciales);
      // Si lo «correcto» es lo mismo que ya hay, no hay nada que avisar.
      if (sugerido && plano(sugerido) === plano(v.codigo ?? v.valor)) {
        salida.veredictos[v.clave] = { ...base, estado: "correcto", cita, motivo: "" };
        continue;
      }
      // «valorCorrecto» vacío a propósito = el dato no debería estar. Solo en los
      // campos que pueden quedarse vacíos y solo si ahora hay algo puesto.
      const debeEstarVacio =
        typeof r.valorCorrecto === "string" && r.valorCorrecto.trim() === "" && v.valor !== "" && PUEDEN_QUEDAR_VACIOS.has(v.clave);
      salida.veredictos[v.clave] = {
        ...base,
        estado: "no_cuadra",
        cita,
        texto: texto(r.valorCorrecto).slice(0, 200),
        sugerido,
        vaciar: debeEstarVacio,
        motivo,
      };
    } else {
      salida.veredictos[v.clave] = { ...base, estado: "sin_respaldo", cita: "", motivo };
    }
  }
  return salida;
}

export interface ResumenDeAuditoria {
  comprobados: number;
  porMirar: number;
  sinRespaldo: number;
}

export function resumenDeAuditoria(res: ResultadoAuditoria): ResumenDeAuditoria {
  const vs = Object.values(res.veredictos);
  return {
    comprobados: vs.filter((v) => v.estado === "correcto" && v.cita !== "").length,
    porMirar: vs.filter((v) => v.estado === "no_cuadra").length,
    sinRespaldo: vs.filter((v) => v.estado === "sin_respaldo").length,
  };
}

/** El nombre de un departamento, para decirlo en palabras. */
export function nombreDeDepartamentoAuditado(codigo: string): string {
  return DEPARTAMENTOS[codigo] ?? codigo;
}
