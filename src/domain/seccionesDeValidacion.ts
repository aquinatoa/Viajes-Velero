/**
 * Los pasos de «Lo que hemos entendido».
 *
 * Reunión con Oravia, 05/11/2026: faltaron alojamientos porque se eligió «grupo»
 * cuando era un operador especial, y en la prueba del mismo día el régimen era
 * una frase del chat. Validar «todo» con un solo «Está todo bien» deja pasar lo
 * que nadie miró. Por eso la ventana se parte en pasos, y NO se enseñan los
 * alojamientos ni las actividades hasta confirmar los que hacen falta para
 * buscarlos:
 *
 *   1 El viaje                  destino y fechas
 *   2 El grupo                  alumnos, profesores, edades
 *   3 Lo que piden              régimen, categoría, presupuesto, requisitos
 *   4 Qué tarifas se aplican    «Cotizamos para» y departamento (decide los precios)
 *   · Centro y contacto         NO bloquea: es lo que va al CRM y a quién se envía;
 *                               se confirma al enviar el presupuesto.
 *
 * Cada confirmación guarda la huella de los datos de SU paso: si después cambia
 * uno de ellos, solo ese paso deja de estar confirmado.
 *
 * Es lógica pura: la ventana la pinta y el estado vive en `RequestCanvas`.
 */
import { FILA_A_CLAVE, type ClaveAuditada, type ValorAuditado } from "./auditoriaIa";
import { nombreDelCanal } from "./clientesEspeciales";
import { CLIENTES_ESPECIALES, type ClienteEspecial } from "./documentImportTypes";
import { bloquesParaValidar, DEPARTAMENTOS, nochesDe, type PeticionParaValidar } from "./validacionDeLaPeticion";

export type SeccionId = "viaje" | "grupo" | "piden" | "tarifas" | "contacto";

export interface SeccionDeValidacion {
  id: SeccionId;
  /** El número que se ve en el paso. Solo los que bloquean lo llevan. */
  numero: number | null;
  titulo: string;
  /** Una línea: para qué sirve este paso. */
  para: string;
  /** Las filas de `bloquesParaValidar` que enseña, por su nombre. */
  filas: string[];
  /** Los datos que audita la IA en este paso. */
  claves: ClaveAuditada[];
  /** Sin confirmarlo no se enseñan los alojamientos ni las actividades. */
  bloquea: boolean;
}

export const SECCIONES: SeccionDeValidacion[] = [
  { id: "viaje", numero: 1, titulo: "El viaje", para: "destino y fechas", filas: ["Destino", "Fechas", "Noches"], claves: ["destino", "fechas"], bloquea: true },
  { id: "grupo", numero: 2, titulo: "El grupo", para: "cuántos son", filas: ["Alumnos", "Profesores", "Edades"], claves: ["alumnos", "profesores", "edades"], bloquea: true },
  {
    id: "piden",
    numero: 3,
    titulo: "Lo que piden",
    para: "régimen, categoría y requisitos",
    filas: ["Régimen", "Categoría", "Presupuesto por alumno", "Requisitos especiales"],
    claves: ["regimen", "categoria", "presupuesto", "requisitos"],
    bloquea: true,
  },
  {
    id: "tarifas",
    numero: 4,
    titulo: "Qué tarifas se aplican",
    para: "decide los precios",
    filas: ["Cotizamos para", "Departamento"],
    claves: ["cotizamosPara", "departamento"],
    bloquea: true,
  },
  {
    id: "contacto",
    numero: null,
    titulo: "Centro y contacto",
    para: "se confirma al enviar",
    filas: ["Centro", "Contacto", "Correo", "Nombre del viaje"],
    claves: ["centro", "contacto", "correo"],
    bloquea: false,
  },
];

export const SECCIONES_QUE_BLOQUEAN: SeccionId[] = SECCIONES.filter((s) => s.bloquea).map((s) => s.id);

export function seccionDe(id: SeccionId): SeccionDeValidacion {
  return SECCIONES.find((s) => s.id === id)!;
}

/** El paso al que pertenece cada dato que audita la IA. */
export function seccionDeLaClave(clave: ClaveAuditada): SeccionId {
  return SECCIONES.find((s) => s.claves.includes(clave))!.id;
}

/** De todos los valores auditables, los de un paso. */
export function valoresDeSeccion(id: SeccionId, valores: ValorAuditado[]): ValorAuditado[] {
  const claves = seccionDe(id).claves;
  return valores.filter((v) => claves.includes(v.clave));
}

function t(v: unknown): string {
  return String(v ?? "").trim();
}

/** La huella de los datos de un paso: cambia solo si cambia alguno de ellos. */
export function firmaDeSeccion(id: SeccionId, p: PeticionParaValidar): string {
  switch (id) {
    case "viaje":
      return JSON.stringify([t(p.destinationText).toLowerCase(), t(p.dateFrom), t(p.dateTo)]);
    case "grupo":
      return JSON.stringify([p.participants ?? null, p.teachers ?? null, t(p.ageRangeText).toLowerCase()]);
    case "piden":
      return JSON.stringify([
        t(p.regimeRequested).toLowerCase(),
        t(p.categoryRequested).toLowerCase(),
        p.topePorAlumno ?? null,
        [...(p.requisitos ?? [])].sort(),
      ]);
    case "tarifas":
      return JSON.stringify([t(p.canal), t(p.departamento)]);
    case "contacto":
      return JSON.stringify([
        t(p.centreName).toLowerCase(),
        t(p.email).toLowerCase(),
        t(p.firstName).toLowerCase(),
        t(p.lastName).toLowerCase(),
        t(p.opportunityName).toLowerCase(),
      ]);
  }
}

/** Las confirmaciones: por cada paso, la huella de sus datos cuando se confirmó. */
export type Confirmaciones = Partial<Record<SeccionId, string>>;

export function estaConfirmada(c: Confirmaciones, id: SeccionId, p: PeticionParaValidar): boolean {
  return Boolean(c[id]) && c[id] === firmaDeSeccion(id, p);
}

/** Los pasos que bloquean y aún no están confirmados (o cuyos datos han cambiado después). */
export function pasosPorConfirmar(c: Confirmaciones, p: PeticionParaValidar): SeccionId[] {
  return SECCIONES_QUE_BLOQUEAN.filter((id) => !estaConfirmada(c, id, p));
}

/** ¿Se pueden enseñar ya los alojamientos y las actividades? */
export function sePuedeVerLoBuscado(c: Confirmaciones, p: PeticionParaValidar): boolean {
  return pasosPorConfirmar(c, p).length === 0;
}

/** Lo que falta y hace falta en un paso: no se puede confirmar con eso vacío. */
export function faltaEnSeccion(id: SeccionId, p: PeticionParaValidar, clientes: ClienteEspecial[] = CLIENTES_ESPECIALES): string[] {
  const filas = seccionDe(id).filas;
  return bloquesParaValidar(p, clientes)
    .flatMap((b) => b.filas)
    .filter((f) => f.falta && filas.includes(f.que))
    .map((f) => f.que);
}

const SIN_VALOR = new Set(["", "—", "no lo han dicho", "ninguno"]);

/** Los datos de un paso, en una línea: lo que queda cuando el paso se pliega al confirmarlo. */
export function resumenDeSeccion(id: SeccionId, p: PeticionParaValidar, clientes: ClienteEspecial[] = CLIENTES_ESPECIALES): string {
  const filas = seccionDe(id).filas.filter((q) => q !== "Noches" && q !== "Nombre del viaje");
  return bloquesParaValidar(p, clientes)
    .flatMap((b) => b.filas)
    .filter((f) => filas.includes(f.que) && !SIN_VALOR.has(f.valor.trim().toLowerCase()))
    .map((f) => f.valor)
    .join(" · ");
}

/** La fila de la ventana a la que corresponde un dato auditado (para enseñar su valor). */
export function filaDeLaClave(clave: ClaveAuditada): string {
  return Object.entries(FILA_A_CLAVE).find(([, c]) => c === clave)![0];
}

// ---------------------------------------------------------------------------
// La frase de arriba
// ---------------------------------------------------------------------------

export interface TrozoDeFrase {
  texto: string;
  /** En negrita: los datos. Lo demás es el hilo de la frase. */
  dato?: boolean;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function partes(iso: string): { d: number; m: number; a: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Un mes 13 o un 30 de febrero no es una fecha: mejor no decir nada.
  const real = new Date(Date.UTC(a, mes - 1, d));
  return real.getUTCFullYear() === a && real.getUTCMonth() === mes - 1 && real.getUTCDate() === d ? { a, m: mes, d } : null;
}

/** «12 al 16 de marzo de 2027», «30 de marzo al 3 de abril de 2027»… */
export function fechasEnPalabras(desde: string, hasta: string): string {
  const a = partes(desde);
  const b = partes(hasta);
  if (!a || !b) return "";
  if (a.a === b.a && a.m === b.m) return `${a.d} al ${b.d} de ${MESES[b.m - 1]} de ${b.a}`;
  if (a.a === b.a) return `${a.d} de ${MESES[a.m - 1]} al ${b.d} de ${MESES[b.m - 1]} de ${b.a}`;
  return `${a.d} de ${MESES[a.m - 1]} de ${a.a} al ${b.d} de ${MESES[b.m - 1]} de ${b.a}`;
}

function cuantos(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/**
 * La petición en una frase que se lee en cinco segundos. Sale de los DATOS, no
 * de la IA: así siempre dice lo que hay en la ventana, ni más ni menos, y lo que
 * falta se dice que falta en vez de inventarse.
 */
export function fraseDeLaPeticion(p: PeticionParaValidar, clientes: ClienteEspecial[] = CLIENTES_ESPECIALES): TrozoDeFrase[] {
  const f: TrozoDeFrase[] = [];
  const centro = t(p.centreName);
  f.push(centro ? { texto: centro, dato: true } : { texto: "Esta solicitud" });

  const etiquetas: string[] = [];
  const dep = DEPARTAMENTOS[t(p.departamento)];
  if (dep) etiquetas.push(dep);
  const canal = t(p.canal);
  if (canal && canal !== "GENERIC") etiquetas.push(nombreDelCanal(canal, clientes).replace(/^Cliente especial · /, "cliente especial "));
  if (etiquetas.length) f.push({ texto: ` (${etiquetas.join(" · ")})` });

  const destino = t(p.destinationText);
  if (destino) {
    f.push({ texto: " pide " }, { texto: destino, dato: true });
  } else {
    f.push({ texto: " no dice el destino" });
  }

  const fechas = fechasEnPalabras(t(p.dateFrom), t(p.dateTo));
  if (fechas) {
    f.push({ texto: " del " }, { texto: fechas, dato: true });
    const noches = nochesDe(p.dateFrom, p.dateTo);
    if (noches) f.push({ texto: ", " }, { texto: cuantos(noches, "noche", "noches"), dato: true });
  } else {
    f.push({ texto: ", sin fechas" });
  }

  const alumnos = p.participants ?? 0;
  const profes = p.teachers ?? 0;
  if (alumnos > 0) {
    const gente = profes > 0 ? `${cuantos(alumnos, "alumno", "alumnos")} y ${cuantos(profes, "profesor", "profesores")}` : cuantos(alumnos, "alumno", "alumnos");
    f.push({ texto: ", para " }, { texto: gente, dato: true });
  } else {
    f.push({ texto: ", sin número de alumnos" });
  }
  f.push({ texto: "." });
  return f;
}
