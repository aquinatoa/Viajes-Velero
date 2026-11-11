/**
 * La ficha de un alojamiento o una actividad del catálogo: qué es, para quién
 * es, qué incluye, cuándo vale y cuánto cuesta en cada canal.
 *
 * Nace de un malentendido real (Anthony, 10/11/2026): el mismo hotel,
 * «Mediterrània MED1», salía en el catálogo como DOS alojamientos —uno
 * `CAMBRILS` con las 12 tarifas del turoperador suizo y otro `Cambrils` con las
 * 18 del general, cada uno de su documento—, sin decir quién es el uso general
 * y quién el del turoperador. Aquí se hace lo contrario: se reúnen los registros
 * que son lo mismo, se separa por canal y se dice en palabras.
 *
 * Todo puro: recibe registros del catálogo, devuelve estructuras para pintar.
 * No toca la base de datos: agrupar es una forma de MIRAR, no de guardar.
 */
import { normalizarNombre } from "./clientesEspeciales";
import type { ClienteEspecial } from "./documentImportTypes";
import { cubreTodoElAnio, etiquetaDePeriodo, etiquetaDeRegimen, fechaCorta, type TarifaDeCatalogo } from "./rejillaDeTarifas";

export const CANAL_GENERAL = "GENERIC";

/** Una tarifa sin canal vale para cualquier cliente: es lo mismo que «GENERIC». */
export function codigoDeCanal(segmento: string | null | undefined): string {
  const c = (segmento ?? "").trim();
  return c || CANAL_GENERAL;
}

export interface CanalEnPalabras {
  codigo: string;
  /** «General» o «Turoperador suizo». */
  nombre: string;
  /** Lo que aclara quién es: «Destination · Travelclub». */
  detalle: string | null;
  esGeneral: boolean;
}

export function canalEnPalabras(segmento: string | null | undefined, clientes: ClienteEspecial[]): CanalEnPalabras {
  const codigo = codigoDeCanal(segmento);
  if (codigo === CANAL_GENERAL) {
    return { codigo, nombre: "General", detalle: "vale para cualquier colegio, club o agencia", esGeneral: true };
  }
  const especial = clientes.find((c) => c.codigo === codigo);
  return { codigo, nombre: especial?.nombre ?? codigo, detalle: especial?.detalle?.trim() || null, esGeneral: false };
}

/** «Turoperador suizo (Destination · Travelclub)», para un título o una línea. */
export function canalCompleto(canal: CanalEnPalabras): string {
  return canal.detalle && !canal.esGeneral ? `${canal.nombre} (${canal.detalle})` : canal.nombre;
}

// ---------------------------------------------------------------------------
// Reunir lo que es el mismo
// ---------------------------------------------------------------------------

export interface RegistroDeCatalogo {
  id: string;
  rates: TarifaDeCatalogo[];
}

export interface GrupoDeCatalogo<T extends RegistroDeCatalogo> {
  clave: string;
  nombre: string;
  lugar: string;
  miembros: T[];
}

/**
 * Reúne los registros con el mismo nombre y el mismo lugar, sin fijarse en
 * mayúsculas, tildes ni signos: «Mediterrània MED1 · CAMBRILS» y
 * «Mediterrània MED1 · Cambrils» son el mismo alojamiento cargado dos veces.
 * Conserva el orden de aparición.
 *
 * Solo junta lo que se llama IGUAL. Que «Bungalow» sea «Villa Bonita / Aloha»
 * no se puede saber desde aquí: eso lo tiene que decir una persona.
 */
export function agruparPorIdentidad<T extends RegistroDeCatalogo>(
  items: T[],
  nombreDe: (t: T) => string,
  lugarDe: (t: T) => string | null | undefined,
): Array<GrupoDeCatalogo<T>> {
  const grupos = new Map<string, GrupoDeCatalogo<T>>();
  for (const item of items) {
    const nombre = nombreDe(item).trim();
    const lugar = (lugarDe(item) ?? "").trim();
    const clave = `${normalizarNombre(nombre)}|${normalizarNombre(lugar)}`;
    const existente = grupos.get(clave);
    if (existente) {
      existente.miembros.push(item);
      // Entre «CAMBRILS» y «Cambrils» se queda con el que no está en mayúsculas.
      if (existente.lugar === existente.lugar.toUpperCase() && lugar !== lugar.toUpperCase()) existente.lugar = lugar;
    } else {
      grupos.set(clave, { clave, nombre, lugar, miembros: [item] });
    }
  }
  return [...grupos.values()];
}

// ---------------------------------------------------------------------------
// Separar por canal
// ---------------------------------------------------------------------------

export interface CanalDelGrupo {
  canal: CanalEnPalabras;
  /** Con el canal normalizado: una tarifa sin canal sale como «GENERIC». */
  tarifas: TarifaDeCatalogo[];
  /** Los registros (documentos) de los que vienen estas tarifas. */
  miembroIds: string[];
}

/** Los canales de un grupo: primero el general, luego los especiales por nombre. */
export function canalesDelGrupo<T extends RegistroDeCatalogo>(
  grupo: GrupoDeCatalogo<T>,
  clientes: ClienteEspecial[],
): CanalDelGrupo[] {
  const porCodigo = new Map<string, CanalDelGrupo>();
  for (const miembro of grupo.miembros) {
    for (const tarifa of miembro.rates) {
      const codigo = codigoDeCanal(tarifa.clientSegment);
      let canal = porCodigo.get(codigo);
      if (!canal) {
        canal = { canal: canalEnPalabras(codigo, clientes), tarifas: [], miembroIds: [] };
        porCodigo.set(codigo, canal);
      }
      canal.tarifas.push({ ...tarifa, clientSegment: codigo });
      if (!canal.miembroIds.includes(miembro.id)) canal.miembroIds.push(miembro.id);
    }
  }
  return [...porCodigo.values()].sort((a, b) => {
    if (a.canal.esGeneral !== b.canal.esGeneral) return a.canal.esGeneral ? -1 : 1;
    return a.canal.nombre.localeCompare(b.canal.nombre, "es");
  });
}

// ---------------------------------------------------------------------------
// Qué incluye y cuándo vale
// ---------------------------------------------------------------------------

/** Lo que incluye el precio, sin repetir: «Campo natural», «Aloj sin campo»… */
export function incluyeDe(tarifas: TarifaDeCatalogo[]): string[] {
  const out: string[] = [];
  for (const t of tarifas) {
    const s = (t.includedService ?? "").trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export interface Vigencia {
  /** «Todo el año» o «28 mar → 29 abr · 27 sep → 31 dic». */
  texto: string;
  /** Los tramos sin tarifa entre dos periodos con tarifa: «30 abr → 26 sep». */
  huecos: string[];
}

const DIA = 86_400_000;

function aMs(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Number.NaN;
}

function deMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Cuándo vale un conjunto de tarifas, a partir de sus propias fechas, y qué
 * tramos del medio se quedan sin ninguna. Es lo que se ve en los datos, no una
 * regla del proveedor: un hueco puede ser un cierre, un «no válido» o un
 * olvido, y la ficha lo dice sin decidir cuál.
 */
export function vigenciaDe(tarifas: TarifaDeCatalogo[]): Vigencia {
  const conFechas = tarifas.filter((t) => t.dateFrom && t.dateTo && !Number.isNaN(aMs(t.dateFrom)) && !Number.isNaN(aMs(t.dateTo)));
  const sinFechas = tarifas.length - conFechas.length;
  if (conFechas.length === 0) return { texto: tarifas.length ? "Todo el año" : "—", huecos: [] };

  const rangos = conFechas
    .map((t) => [aMs(t.dateFrom as string), aMs(t.dateTo as string)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const unidos: Array<[number, number]> = [];
  for (const r of rangos) {
    const ultimo = unidos[unidos.length - 1];
    if (ultimo && r[0] <= ultimo[1] + DIA) ultimo[1] = Math.max(ultimo[1], r[1]);
    else unidos.push([r[0], r[1]]);
  }

  const anios = new Set(unidos.flatMap((r) => [new Date(r[0]).getUTCFullYear(), new Date(r[1]).getUTCFullYear()]));
  const dec = (ms: number) => {
    const iso = deMs(ms);
    return anios.size > 1 ? `${fechaCorta(iso)} ${iso.slice(0, 4)}` : (fechaCorta(iso) ?? iso);
  };

  const todoElAnio =
    unidos.length === 1 && cubreTodoElAnio({ dateFrom: deMs(unidos[0][0]), dateTo: deMs(unidos[0][1]) });
  let texto = todoElAnio ? "Todo el año" : unidos.map((r) => `${dec(r[0])} → ${dec(r[1])}`).join(" · ");
  if (sinFechas > 0) texto += " (y tarifas sin fechas)";

  const huecos: string[] = [];
  // Con tarifas sin fechas no se puede afirmar que algo quede sin cubrir.
  if (sinFechas === 0) {
    for (let i = 0; i + 1 < unidos.length; i += 1) {
      const desde = unidos[i][1] + DIA;
      const hasta = unidos[i + 1][0] - DIA;
      // Solo entre dos periodos del mismo año: entre diciembre y marzo del año
      // siguiente no hay «hueco» que avisar, es otra temporada.
      const mismoAnio = new Date(unidos[i][1]).getUTCFullYear() === new Date(unidos[i + 1][0]).getUTCFullYear();
      if (desde <= hasta && mismoAnio) {
        huecos.push(`${dec(desde)} → ${dec(hasta)}`);
      }
    }
  }
  return { texto, huecos };
}

// ---------------------------------------------------------------------------
// Comparar canales
// ---------------------------------------------------------------------------

/**
 * Lo que dos documentos llaman distinto y es lo mismo: «Campo natural» y «Aloj
 * + Campo Natural / Fútbol Playa (1.30h)»; «Sin campo (acompañante)» y «Aloj sin
 * campo». Sin esto, al comparar el general con el suizo ninguna fila casaría.
 */
export function servicioComparable(texto: string | null | undefined): { clave: string; etiqueta: string } {
  const original = (texto ?? "").trim();
  const n = normalizarNombre(original);
  if (!n) return { clave: "", etiqueta: "" };
  if (/acomp|sin campo/.test(n)) return { clave: "sin-campo", etiqueta: "Sin campo" };
  if (/natural|futbol playa/.test(n)) return { clave: "campo-natural", etiqueta: "Campo natural" };
  if (/artificial/.test(n)) return { clave: "campo-artificial", etiqueta: "Campo artificial" };
  return { clave: n, etiqueta: original };
}

export interface FilaComparada {
  periodo: string;
  /** «Pensión completa · Doble · Campo natural». */
  concepto: string;
  /** Los precios de la fila por código de canal (puede haber más de uno si falta un dato que los distinga). */
  precios: Record<string, number[]>;
  /** Cuánto más (+) o menos (−) cuesta el especial que el general, en %. Solo con dos canales y un precio cada uno. */
  diferencia: number | null;
  /** Los canales que no tienen precio en esta fila. */
  faltan: string[];
}

export interface Comparativa {
  canales: CanalEnPalabras[];
  filas: FilaComparada[];
  currency: string | null;
  /** Filas en las que algún canal no tiene precio. */
  filasIncompletas: number;
}

function capitalizar(s: string): string {
  const t = s.trim().toLowerCase();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

const ORDEN_REGIMEN_COMPARADA = ["SA", "AD", "MP", "PC"];

/**
 * Pone los canales de un mismo alojamiento lado a lado. Casa las filas por
 * periodo, régimen, ocupación y servicio (normalizado) —no por el texto
 * literal—, así que enseña también dónde un canal tiene algo que el otro no
 * tiene: el general trae alojamiento y desayuno y el suizo no, por ejemplo.
 */
export function comparativaDeCanales(canales: CanalDelGrupo[]): Comparativa {
  const codigos = canales.map((c) => c.canal.codigo);
  const filas = new Map<
    string,
    { periodo: string; inicio: string; regimen: string; ocupacion: string; servicio: string; concepto: string; precios: Record<string, number[]> }
  >();
  let currency: string | null = null;

  for (const canal of canales) {
    for (const t of canal.tarifas) {
      if (!currency && t.currency) currency = t.currency;
      const periodo = etiquetaDePeriodo(t);
      const servicio = servicioComparable(t.includedService);
      const regimen = (t.boardType ?? "").trim().toUpperCase();
      const ocupacion = capitalizar(t.occupancyLabel ?? "");
      const edad = (t.ageLabel ?? "").trim();
      const noches = t.minNights && t.minNights > 1 ? `desde ${t.minNights} noches` : "";
      const clave = [periodo, regimen, ocupacion.toLowerCase(), servicio.clave, edad.toLowerCase(), noches].join("|");
      let fila = filas.get(clave);
      if (!fila) {
        fila = {
          periodo,
          inicio: t.dateFrom ?? "",
          regimen,
          ocupacion,
          servicio: servicio.clave,
          concepto: [edad, regimen ? etiquetaDeRegimen(regimen) : "", ocupacion, servicio.etiqueta, noches].filter(Boolean).join(" · ") || "Precio",
          precios: {},
        };
        filas.set(clave, fila);
      }
      if (typeof t.amount === "number") (fila.precios[canal.canal.codigo] ??= []).push(t.amount);
    }
  }

  const ordenadas = [...filas.values()].sort((a, b) => {
    if (a.inicio !== b.inicio) return a.inicio < b.inicio ? -1 : 1;
    if (a.periodo !== b.periodo) return a.periodo < b.periodo ? -1 : 1;
    const ra = ORDEN_REGIMEN_COMPARADA.indexOf(a.regimen);
    const rb = ORDEN_REGIMEN_COMPARADA.indexOf(b.regimen);
    if (ra !== rb) return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
    if (a.servicio !== b.servicio) return a.servicio < b.servicio ? -1 : 1;
    return a.ocupacion < b.ocupacion ? -1 : a.ocupacion > b.ocupacion ? 1 : 0;
  });

  const resultado: FilaComparada[] = ordenadas.map((f) => {
    for (const c of Object.keys(f.precios)) f.precios[c].sort((a, b) => a - b);
    const faltan = codigos.filter((c) => !(f.precios[c]?.length));
    let diferencia: number | null = null;
    if (codigos.length === 2) {
      const base = f.precios[codigos[0]];
      const otro = f.precios[codigos[1]];
      if (base?.length === 1 && otro?.length === 1 && base[0] > 0) {
        diferencia = Math.round(((otro[0] - base[0]) / base[0]) * 1000) / 10;
      }
    }
    return { periodo: f.periodo, concepto: f.concepto, precios: f.precios, diferencia, faltan };
  });

  return {
    canales: canales.map((c) => c.canal),
    filas: resultado,
    currency,
    filasIncompletas: resultado.filter((f) => f.faltan.length > 0).length,
  };
}

// ── Filtrar por ubicación ────────────────────────────────────────────────────
// Las ubicaciones llegan escritas de mil maneras («Salou/Cambrils», «Vila-seca /
// Salou», «CAMBRILS», «Altafulla · Parque de aventura»). Para filtrar se separan
// en poblaciones sueltas, sin distinguir mayúsculas ni tildes: elegir «Salou»
// trae también «Salou / Calafell». Es una forma de mirar: los datos no se tocan.

export const SIN_UBICACION = "__sin_ubicacion__";

export interface Poblacion {
  clave: string;
  nombre: string;
}

function claveDePoblacion(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function presentable(texto: string): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  // «CAMBRILS» → «Cambrils»; lo que ya trae minúsculas se respeta.
  if (limpio === limpio.toUpperCase() && limpio !== limpio.toLowerCase()) {
    return limpio.toLowerCase().replace(/(^|[\s\-'’(])(\p{L})/gu, (_m, sep: string, letra: string) => sep + letra.toUpperCase());
  }
  return limpio;
}

/**
 * Las poblaciones que nombra una ubicación. Lo que va detrás de « · » es el
 * sitio concreto («Parque de aventura», «Puerto deportivo»), no la población, y
 * se deja fuera. Se separa por «/» y por «,».
 */
export function poblacionesDe(texto: string | null | undefined): Poblacion[] {
  const base = (texto ?? "").split("·")[0] ?? "";
  const vistas = new Set<string>();
  const resultado: Poblacion[] = [];
  for (const trozo of base.split(/[\/,]/)) {
    const nombre = presentable(trozo);
    const clave = claveDePoblacion(nombre);
    if (!clave || vistas.has(clave)) continue;
    vistas.add(clave);
    resultado.push({ clave, nombre });
  }
  return resultado;
}

/** Las poblaciones de un conjunto de textos, con cuántas veces aparecen. */
export function opcionesDeUbicacion(
  textosPorElemento: Array<Array<string | null | undefined>>,
): { poblaciones: Array<Poblacion & { cantidad: number }>; sinUbicacion: number } {
  const cuentas = new Map<string, Poblacion & { cantidad: number }>();
  let sinUbicacion = 0;
  for (const textos of textosPorElemento) {
    const propias = new Map<string, Poblacion>();
    for (const t of textos) for (const p of poblacionesDe(t)) if (!propias.has(p.clave)) propias.set(p.clave, p);
    if (propias.size === 0) {
      sinUbicacion += 1;
      continue;
    }
    for (const p of propias.values()) {
      const actual = cuentas.get(p.clave);
      if (actual) actual.cantidad += 1;
      else cuentas.set(p.clave, { ...p, cantidad: 1 });
    }
  }
  const poblaciones = [...cuentas.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  return { poblaciones, sinUbicacion };
}

/** ¿Un elemento con estos textos de ubicación pasa el filtro elegido? */
export function coincideConUbicacion(textos: Array<string | null | undefined>, elegida: string): boolean {
  if (!elegida) return true;
  const claves = textos.flatMap((t) => poblacionesDe(t).map((p) => p.clave));
  if (elegida === SIN_UBICACION) return claves.length === 0;
  return claves.includes(elegida);
}
