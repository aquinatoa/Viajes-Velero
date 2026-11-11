/**
 * Cómo se ven y se ordenan las oportunidades: estados, lo siguiente que hay que
 * hacer, orden de prisa, vistas guardadas, carga por mes, cambio de fase.
 *
 * Todo puro: recibe filas (`OportunidadFila`) y un «hoy», devuelve resultados.
 * Es la lógica de la maqueta que Anthony validó el 11/11/2026, probada contra
 * las 430 oportunidades reales de 2027.
 *
 * Lo que arregla de la pantalla anterior, con sus números reales:
 *  - Dos juegos de estados (4 cuadros de Viajes y 5 botones de Propuestas) que no
 *    sumaban igual: aquí hay UNO, de seis estados, que suma el total.
 *  - «Cerradas» mezclaba 29 ganadas con 93 perdidas.
 *  - «Importe en curso» incluía lo ya ganado (307.182 € de más).
 *  - «Lo que corre prisa» empataba: 246 de 308 abiertas valían 400 y 45 valían 500.
 */
import type { OportunidadFila } from "./oportunidadUnificada";

export type EstadoDeOportunidad = "sin_enviar" | "esperando" | "aceptada" | "ganada" | "perdida";
export type FiltroDeEstado = EstadoDeOportunidad | "todas";

export const ESTADOS: { id: FiltroDeEstado; nombre: string }[] = [
  { id: "todas", nombre: "Todas" },
  { id: "sin_enviar", nombre: "Sin enviar" },
  { id: "esperando", nombre: "Esperando respuesta" },
  // Incluye «Pendiente de pago resto»: ya no es «sin depósito».
  { id: "aceptada", nombre: "Aceptadas, por cobrar" },
  { id: "ganada", nombre: "Ganadas" },
  { id: "perdida", nombre: "Perdidas" },
];

export const FASES_EN_ORDEN = [
  "Nueva",
  "Preparando Presupuesto",
  "Presupuesto Enviado",
  "Seguimiento al Presupuesto",
  "Pendiente de deposito",
  "Pendiente de pago resto",
  "Oportunidad Ganada",
] as const;
export const FASES_LATERALES = ["Lista de Espera", "Oportunidad Perdida"] as const;

type Hoy = Date;

export function estadoDe(f: Pick<OportunidadFila, "carril" | "fase">): EstadoDeOportunidad {
  if (f.carril === "cerrada") return /ganad/i.test(f.fase ?? "") ? "ganada" : "perdida";
  return f.carril;
}
export function abierta(f: Pick<OportunidadFila, "carril" | "fase">): boolean {
  const e = estadoDe(f);
  return e !== "ganada" && e !== "perdida";
}

// ── Fechas y números ─────────────────────────────────────────────────────────

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Una fecha como día de calendario local (sin hora): «2027-06-25» y «2026-11-16T01:45Z» se tratan igual. */
export function aDia(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const simple = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (simple) return new Date(Number(simple[1]), Number(simple[2]) - 1, Number(simple[3]));
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function inicioDeDia(hoy: Hoy): Date {
  return new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
}
/** Días hasta una fecha (negativo si ya pasó). Null si no hay fecha. */
export function diasHasta(iso: string | null | undefined, hoy: Hoy = new Date()): number | null {
  const d = aDia(iso);
  return d ? Math.round((d.getTime() - inicioDeDia(hoy).getTime()) / 86_400_000) : null;
}
export function fechaCorta(iso: string | null | undefined): string {
  const d = aDia(iso);
  return d ? `${d.getDate()} ${MESES[d.getMonth()]}` : "";
}
export function fechaLarga(iso: string | null | undefined): string {
  const d = aDia(iso);
  return d ? `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}` : "";
}
/** «25–29 jun 2027», «28 jun – 2 jul 2027»; lo que falte, dicho. */
export function rangoLlegada(f: Pick<OportunidadFila, "llegada" | "salida">): string {
  const a = aDia(f.llegada);
  const b = aDia(f.salida);
  if (!a && !b) return "";
  if (!a) return `hasta el ${fechaLarga(f.salida)}`;
  if (!b) return `desde el ${fechaLarga(f.llegada)}`;
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${b.getDate()} ${MESES[a.getMonth()]} ${a.getFullYear()}`;
  }
  if (a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} ${MESES[a.getMonth()]} – ${b.getDate()} ${MESES[b.getMonth()]} ${a.getFullYear()}`;
  }
  return `${fechaLarga(f.llegada)} – ${fechaLarga(f.salida)}`;
}
export function noches(f: Pick<OportunidadFila, "llegada" | "salida">): number | null {
  const a = aDia(f.llegada);
  const b = aDia(f.salida);
  return a && b ? Math.round((b.getTime() - a.getTime()) / 86_400_000) : null;
}

// «always»: con 4 cifras («8500») es-ES no pone el punto de miles por defecto, y 8500 al lado de 10.000 desconcierta.
const formato = new Intl.NumberFormat("es-ES", { useGrouping: "always", maximumFractionDigits: 0 } as unknown as Intl.NumberFormatOptions);
export function euros(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : `${formato.format(Math.round(n))} €`;
}
/** «4,45 M€», «307 k€», «8.500 €»: para los contadores, donde caben pocas cifras. */
export function eurosCorto(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(".", ",")} M€`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)} k€`;
  return euros(n);
}

// ── Cierre vencido ───────────────────────────────────────────────────────────

/** Días que lleva vencida la fecha de cierre de una oportunidad ABIERTA. Null si no lo está. */
export function cierreVencidoHace(f: Pick<OportunidadFila, "carril" | "fase" | "cierre">, hoy: Hoy = new Date()): number | null {
  if (!abierta(f)) return null;
  const d = diasHasta(f.cierre, hoy);
  return d !== null && d < 0 ? -d : null;
}

// ── Lo siguiente que hay que hacer ───────────────────────────────────────────

export type TonoDelPaso = "aviso" | "info" | "ok" | "mute";
/** Qué hace el botón de «lo siguiente». Quien pinta decide cómo hacerlo. */
export type AccionDelPaso = "ver-documento" | "abrir-zoho" | "revisar-envio" | "mover-fase" | "";
export interface PasoSiguiente {
  texto: string;
  tono: TonoDelPaso;
  accion: AccionDelPaso;
}

export function siguientePaso(f: OportunidadFila, hoy: Hoy = new Date()): PasoSiguiente {
  const e = f.entrega;
  const est = estadoDe(f);
  const fase = f.fase ?? "";
  if (e && e.estado === "FAILED") return { texto: "El envío falló", tono: "aviso", accion: "revisar-envio" };
  if (e && (e.estado === "DRAFT" || e.estado === "SIMULATED")) return { texto: "Falta enviarla", tono: "aviso", accion: "ver-documento" };
  if (est === "ganada") return { texto: "Ganada", tono: "ok", accion: "" };
  if (est === "perdida") return { texto: "Perdida", tono: "mute", accion: "" };
  if (est === "aceptada") {
    if (/resto/i.test(fase)) return { texto: "Cobrar el resto", tono: "info", accion: "abrir-zoho" };
    const q = diasHasta(f.deposito.venceEl, hoy);
    if (q !== null) {
      return {
        texto: q < 0 ? `Depósito vencido hace ${-q} días` : `Quedan ${q} días para el depósito`,
        tono: q <= 7 ? "aviso" : "info",
        accion: "abrir-zoho",
      };
    }
    return { texto: "Cobrar el depósito", tono: "info", accion: "abrir-zoho" };
  }
  if (/lista de espera/i.test(fase)) return { texto: "En lista de espera", tono: "mute", accion: "mover-fase" };
  if (/preparando|nueva/i.test(fase)) return { texto: "Preparar y enviar la propuesta", tono: "aviso", accion: "abrir-zoho" };
  if (/seguimiento/i.test(fase)) return { texto: "Hacer seguimiento", tono: "info", accion: "abrir-zoho" };
  if (/enviad/i.test(fase) || (e && e.estado === "SENT")) return { texto: "Esperando su respuesta", tono: "info", accion: "abrir-zoho" };
  return { texto: "", tono: "mute", accion: "" };
}

/** Lo que falta por rellenar y se nota al leer la ficha (solo en lo abierto). */
export function faltanDatos(f: OportunidadFila): string[] {
  if (!abierta(f)) return [];
  const falta: string[] = [];
  if (f.importe === null || f.importe === undefined) falta.push("importe");
  if (!f.llegada) falta.push("fecha de llegada");
  if (!f.cierre) falta.push("fecha de cierre");
  if (!f.departamento) falta.push("departamento");
  return falta;
}

// ── Cambio de fase con constancia ────────────────────────────────────────────

export type TipoDeMovimiento = "igual" | "adelante" | "atras" | "lateral" | "reabrir";

function indiceDeFase(fase: string | null | undefined): number {
  return (FASES_EN_ORDEN as readonly string[]).indexOf(fase ?? "");
}
function esLateral(fase: string | null | undefined): boolean {
  return (FASES_LATERALES as readonly string[]).includes(fase ?? "");
}
/** «adelante», «atras», «lateral» (perdida / lista de espera), «reabrir» (sale de ahí) o «igual». */
export function tipoDeMovimiento(actual: string | null | undefined, nueva: string | null | undefined): TipoDeMovimiento {
  if (!nueva || nueva === actual) return "igual";
  if (esLateral(nueva)) return "lateral";
  if (esLateral(actual)) return "reabrir";
  return indiceDeFase(nueva) < indiceDeFase(actual) ? "atras" : "adelante";
}
/** El motivo es obligatorio al retroceder, perder o pasar a lista de espera. */
export function exigeMotivo(actual: string | null | undefined, nueva: string | null | undefined): boolean {
  const t = tipoDeMovimiento(actual, nueva);
  return t === "atras" || t === "lateral";
}
export interface AtajoDeFase {
  texto: string;
  fase: string;
}
/** Los saltos de cada día, a un clic: lo normal desde la fase en la que está. */
export function atajos(f: Pick<OportunidadFila, "fase" | "carril">): AtajoDeFase[] {
  const fase = f.fase ?? "";
  if (!fase) return [];
  const a: AtajoDeFase[] = [];
  if (/nueva|preparando/i.test(fase)) a.push({ texto: "Propuesta enviada", fase: "Presupuesto Enviado" });
  if (/enviad|seguimiento/i.test(fase)) a.push({ texto: "Han aceptado", fase: "Pendiente de deposito" });
  if (/deposito/i.test(fase)) a.push({ texto: "Depósito cobrado", fase: "Pendiente de pago resto" });
  if (/resto/i.test(fase)) a.push({ texto: "Resto cobrado: ganada", fase: "Oportunidad Ganada" });
  if (abierta(f) && !/lista de espera/i.test(fase)) a.push({ texto: "A lista de espera", fase: "Lista de Espera" });
  if (abierta(f)) a.push({ texto: "Perdida", fase: "Oportunidad Perdida" });
  if (/lista de espera/i.test(fase)) a.push({ texto: "Reabrir: preparando", fase: "Preparando Presupuesto" });
  return a;
}
/** El texto que explica el cambio elegido (o null si no hay cambio). */
export function avisoDelMovimiento(actual: string | null | undefined, nueva: string | null | undefined): string | null {
  switch (tipoDeMovimiento(actual, nueva)) {
    case "atras": return "Retrocedes de fase: hace falta un motivo.";
    case "lateral": return "Salida del camino normal (lista de espera o perdida): hace falta un motivo.";
    case "reabrir": return "La reabres: el motivo es opcional.";
    case "adelante": return "Avanzas de fase: el motivo es opcional.";
    default: return null;
  }
}

// ── Resumen, filtros y orden ────────────────────────────────────────────────

export interface Contador {
  n: number;
  importe: number;
}
export type ResumenDeOportunidades = Record<FiltroDeEstado, Contador> & {
  abierto: Contador;
  aviso: { vencidas: number; importeVencidas: number; sinImporte: number };
};

export function resumen(filas: OportunidadFila[], hoy: Hoy = new Date()): ResumenDeOportunidades {
  const r = {} as ResumenDeOportunidades;
  for (const e of ESTADOS) r[e.id] = { n: 0, importe: 0 };
  const aviso = { vencidas: 0, importeVencidas: 0, sinImporte: 0 };
  for (const f of filas) {
    const e = estadoDe(f);
    r[e].n += 1;
    r[e].importe += f.importe ?? 0;
    r.todas.n += 1;
    r.todas.importe += f.importe ?? 0;
    if (abierta(f)) {
      if (cierreVencidoHace(f, hoy) !== null) {
        aviso.vencidas += 1;
        aviso.importeVencidas += f.importe ?? 0;
      }
      if (f.importe === null || f.importe === undefined) aviso.sinImporte += 1;
    }
  }
  // Lo abierto NO incluye lo ganado (el «importe en curso» antiguo sí lo incluía).
  r.abierto = {
    n: r.sin_enviar.n + r.esperando.n + r.aceptada.n,
    importe: r.sin_enviar.importe + r.esperando.importe + r.aceptada.importe,
  };
  r.aviso = aviso;
  return r;
}

/** Vistas guardadas: preguntas que se repiten, a un clic. */
export const VISTAS_GUARDADAS: { id: string; nombre: string; coincide: (f: OportunidadFila, hoy: Hoy) => boolean }[] = [
  { id: "vencidas", nombre: "Cierre vencido", coincide: (f, hoy) => cierreVencidoHace(f, hoy) !== null },
  { id: "sin_importe", nombre: "Sin importe", coincide: (f) => abierta(f) && (f.importe === null || f.importe === undefined) },
  {
    id: "llegan_pronto",
    nombre: "Llegan en 3 meses",
    coincide: (f, hoy) => {
      const d = diasHasta(f.llegada, hoy);
      return abierta(f) && d !== null && d >= 0 && d <= 92;
    },
  },
  { id: "por_cobrar", nombre: "Por cobrar", coincide: (f) => estadoDe(f) === "aceptada" },
  { id: "grandes", nombre: "Más de 50.000 €", coincide: (f) => abierta(f) && (f.importe ?? 0) > 50_000 },
];

export function mesDeLlegada(f: Pick<OportunidadFila, "llegada">): string {
  return f.llegada ? f.llegada.slice(0, 7) : "";
}

function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export interface OpcionesDeFiltro {
  estado?: FiltroDeEstado | "";
  origen?: "todas" | "app" | "zoho";
  departamento?: string;
  fase?: string;
  q?: string;
  vista?: string;
  mes?: string;
}

export function filtrar(filas: OportunidadFila[], o: OpcionesDeFiltro, hoy: Hoy = new Date()): OportunidadFila[] {
  const q = sinTildes((o.q ?? "").trim());
  const vista = VISTAS_GUARDADAS.find((v) => v.id === o.vista) ?? null;
  return filas.filter((f) => {
    if (o.estado && o.estado !== "todas" && estadoDe(f) !== o.estado) return false;
    if (o.origen === "app" && f.origen !== "APP") return false;
    if (o.origen === "zoho" && f.origen !== "ZOHO") return false;
    if (o.departamento && o.departamento !== "TODOS" && f.departamento !== o.departamento && f.departamento !== null) return false;
    if (o.fase && (f.fase ?? "") !== o.fase) return false;
    if (o.mes && mesDeLlegada(f) !== o.mes) return false;
    if (vista && !vista.coincide(f, hoy)) return false;
    if (q) {
      const texto = sinTildes([f.nombre, f.cuenta, f.contacto, f.entrega?.reference ?? ""].join(" "));
      if (!texto.includes(q)) return false;
    }
    return true;
  });
}

/**
 * «Lo que corre prisa» de verdad. El orden que traía la API empataba: 246 de las
 * 308 abiertas valían 400 y 45 valían 500. Aquí manda lo que se puede defender:
 * lo de la app que hay que enviar, luego el cierre vencido (cuanto más antiguo,
 * antes), luego lo que hay que cobrar y luego la llegada más próxima.
 */
export function puntosDePrisa(f: OportunidadFila, hoy: Hoy = new Date()): number {
  let p = 0;
  const e = f.entrega;
  if (e && (e.estado === "DRAFT" || e.estado === "FAILED" || e.estado === "SIMULATED")) p += 1000;
  const v = cierreVencidoHace(f, hoy);
  if (v !== null) p += 400 + Math.min(v, 300);
  if (estadoDe(f) === "aceptada") p += 200;
  const l = diasHasta(f.llegada, hoy);
  if (abierta(f) && l !== null && l >= 0) p += Math.max(0, 120 - l) / 2;
  if (!abierta(f)) p -= 5000;
  return p;
}

export type OrdenDeOportunidades = "prisa" | "llegada" | "cierre" | "importe" | "nombre" | "cuenta" | "fase" | "reciente";

export function ordenar(filas: OportunidadFila[], modo: OrdenDeOportunidades, hoy: Hoy = new Date()): OportunidadFila[] {
  const copia = [...filas];
  const porTexto = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").localeCompare(b ?? "", "es");
  const comparadores: Record<OrdenDeOportunidades, (a: OportunidadFila, b: OportunidadFila) => number> = {
    prisa: (a, b) => puntosDePrisa(b, hoy) - puntosDePrisa(a, hoy),
    llegada: (a, b) => (a.llegada || "9999").localeCompare(b.llegada || "9999"),
    cierre: (a, b) => (a.cierre || "9999").localeCompare(b.cierre || "9999"),
    importe: (a, b) => (b.importe ?? 0) - (a.importe ?? 0),
    nombre: (a, b) => porTexto(a.nombre, b.nombre),
    cuenta: (a, b) => porTexto(a.cuenta, b.cuenta),
    fase: (a, b) => porTexto(a.fase, b.fase),
    reciente: (a, b) => (b.crm?.modifiedTime ?? "").localeCompare(a.crm?.modifiedTime ?? ""),
  };
  return copia.sort(comparadores[modo]);
}

export interface MesDeCarga {
  mes: string;
  nombre: string;
  n: number;
  importe: number;
}
/** Importe abierto por mes de llegada (para ver dónde se concentra el trabajo). */
export function porMes(filas: OportunidadFila[]): MesDeCarga[] {
  const meses = new Map<string, { n: number; importe: number }>();
  for (const f of filas) {
    if (!abierta(f) || !f.llegada) continue;
    const m = mesDeLlegada(f);
    const actual = meses.get(m) ?? { n: 0, importe: 0 };
    actual.n += 1;
    actual.importe += f.importe ?? 0;
    meses.set(m, actual);
  }
  return [...meses.keys()]
    .sort()
    .map((m) => ({ mes: m, nombre: MESES_LARGOS[Number(m.slice(5, 7)) - 1] ?? m, ...(meses.get(m) as { n: number; importe: number }) }));
}

export interface GrupoDeCuenta {
  cuenta: string;
  filas: OportunidadFila[];
  importe: number;
}
/** Agrupa por cuenta, de más a menos oportunidades. */
export function porCuenta(filas: OportunidadFila[]): GrupoDeCuenta[] {
  const grupos = new Map<string, GrupoDeCuenta>();
  for (const f of filas) {
    const k = f.cuenta || "(sin cuenta)";
    const g = grupos.get(k) ?? { cuenta: k, filas: [], importe: 0 };
    g.filas.push(f);
    g.importe += f.importe ?? 0;
    grupos.set(k, g);
  }
  return [...grupos.values()].sort((a, b) => b.filas.length - a.filas.length || b.importe - a.importe);
}

/** Los nombres que salen más de una vez (posibles duplicados), sin mayúsculas ni tildes. */
export function nombresRepetidos(filas: Pick<OportunidadFila, "nombre">[]): Set<string> {
  const cuenta = new Map<string, number>();
  for (const f of filas) {
    const k = sinTildes((f.nombre ?? "").trim());
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }
  return new Set([...cuenta.entries()].filter(([, n]) => n > 1).map(([k]) => k));
}
export function claveDeNombre(nombre: string): string {
  return sinTildes((nombre ?? "").trim());
}

export function fasesPresentes(filas: Pick<OportunidadFila, "fase">[]): string[] {
  const vistas = new Set(filas.map((f) => f.fase).filter((x): x is string => Boolean(x)));
  const conocidas: string[] = [...FASES_EN_ORDEN, ...FASES_LATERALES];
  return [...conocidas.filter((x) => vistas.has(x)), ...[...vistas].filter((x) => !conocidas.includes(x))];
}
