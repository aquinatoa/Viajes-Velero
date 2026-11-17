/**
 * Las actividades de una opción: lo que suman, y cómo quedan en la tabla
 * «Servicios Contratados» del trato en Zoho.
 *
 * Hasta el 16/11/2026 el total de una opción era solo su alojamiento y al
 * aceptarla solo el alojamiento pasaba al CRM: las actividades se quedaban en
 * la propuesta («las actividades no suben», Javier). Decisiones de Oravia de
 * ese día:
 *   · el total de la opción SUMA sus actividades;
 *   · cada actividad se cobra como diga su tarifa: las entradas, por persona;
 *     un entrenador, un campo o una hora de luz, por grupo.
 *
 * Las filas siguen la forma en que Oravia las rellena a mano en su CRM (trato
 * «Tot Turisme», jun. 2027): una fila por tarifa, tipo «Actividad», la misma
 * fecha de entrada y de salida, los pasajeros en «Pasajeros», cantidad 1 y la
 * unidad «P.Pax»; y la gratuidad de los profesores en su propia fila a 0 €.
 * Lo que se cobra por grupo va con la unidad «P.Neto» (la otra que tiene su
 * lista): el precio es el del servicio y no se multiplica por los pasajeros.
 *
 * Es lógica pura, sin pantalla, sin base de datos y sin Zoho.
 */
import { importeDe } from "./importe";
import { esLineaDeGratuidad, esPorUnidad, type LineaDeActividad } from "./lineasDeActividad";

/** Lo que se guarda de una actividad en la propuesta (ProposalActivityOption). */
export interface ActividadDeLaPropuesta {
  activityId?: string | null;
  activityNameSnapshot: string;
  providerSnapshot?: string | null;
  /** Lo que se suma por alumno, como texto: «41,28 €» o «A consultar». */
  pvpSnapshot?: string | null;
  /** Las líneas (tarifa × cantidad), como JSON o ya leídas. */
  linesJson?: string | LineaDeActividad[] | null;
  /** El total del grupo, cuando hay líneas. Decimal de Prisma, número o texto. */
  amountTotal?: unknown;
  /** Lo que cobra el proveedor por persona, cuando NO hay líneas. */
  unitCostAmount?: unknown;
}

/** Lo que hace falta saber de cada tarifa del catálogo. */
export interface TarifaDeActividad {
  rateUnit?: string | null;
  costNetAmount?: unknown;
}

const DESCUENTO = "#descuento";
const redondear = (n: number) => Math.round(n * 100) / 100;

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Las líneas de la actividad con cantidad; vacío si no tiene o no se pueden leer. */
export function lineasDeLaActividad(actividad: Pick<ActividadDeLaPropuesta, "linesJson">): LineaDeActividad[] {
  let lineas: unknown = actividad.linesJson;
  if (typeof lineas === "string") {
    try {
      lineas = JSON.parse(lineas);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(lineas)) return [];
  return (lineas as LineaDeActividad[]).filter(
    (l) => l && typeof l.rateId === "string" && Number.isFinite(Number(l.precio)) && Number(l.cantidad) > 0,
  );
}

/**
 * Lo que cuesta una actividad a todo el grupo.
 *
 * Con líneas, su suma (o el total guardado). Sin líneas se cobra por persona:
 * el precio por alumno × todo el grupo, alumnos y profesores, que es la misma
 * cuenta que hace el documento del cliente. `null` si no tiene precio («A
 * consultar»): no se sabe, que no es lo mismo que cero.
 */
export function totalDeLaActividad(actividad: ActividadDeLaPropuesta, alumnos: number, profesores: number): number | null {
  const lineas = lineasDeLaActividad(actividad);
  if (lineas.length > 0) {
    const guardado = numero(actividad.amountTotal);
    return redondear(guardado ?? lineas.reduce((s, l) => s + Number(l.precio) * Number(l.cantidad), 0));
  }
  const guardado = numero(actividad.amountTotal);
  if (guardado !== null && guardado > 0) return redondear(guardado);
  const porPersona = importeDe(actividad.pvpSnapshot);
  if (porPersona === null) return null;
  return redondear(porPersona * (Math.max(0, alumnos) + Math.max(0, profesores)));
}

export interface TotalDeLaOpcion {
  /** El alojamiento; null si la opción no lo trae en número. */
  alojamiento: number | null;
  /** Lo que suman las actividades con precio. */
  actividades: number;
  /** Alojamiento más actividades; null si no hay ni lo uno ni lo otro. */
  total: number | null;
  /** Actividades sin precio («A consultar»): el total no las lleva. */
  sinPrecio: string[];
}

/** El total de una opción: su alojamiento más SUS actividades. */
export function totalDeLaOpcion(
  totalDelAlojamiento: string | number | null | undefined,
  actividades: ActividadDeLaPropuesta[],
  alumnos: number,
  profesores: number,
): TotalDeLaOpcion {
  const alojamiento = typeof totalDelAlojamiento === "number" ? totalDelAlojamiento : importeDe(totalDelAlojamiento);
  let suma = 0;
  const sinPrecio: string[] = [];
  for (const actividad of actividades) {
    const total = totalDeLaActividad(actividad, alumnos, profesores);
    if (total === null) sinPrecio.push(actividad.activityNameSnapshot);
    else suma += total;
  }
  suma = redondear(suma);
  const total = alojamiento === null && actividades.length === 0 ? null : redondear((alojamiento ?? 0) + suma);
  return { alojamiento, actividades: suma, total, sinPrecio };
}

/** Una fila de actividad para «Servicios Contratados». */
export interface FilaDeActividad {
  /** El nombre del servicio (el producto del CRM). */
  producto: string;
  /** El proveedor; null si la propuesta no lo trae. */
  proveedor: string | null;
  /** «P.Pax»: precio × pasajeros. «P.Neto»: precio × cantidad, sin multiplicar por pasajeros. */
  unidad: "P.Pax" | "P.Neto";
  pax: number;
  cantidad: number;
  precio: number;
  /** Coste con la misma unidad que el precio; null si no se sabe. */
  coste: number | null;
  /** La fecha de la visita (AAAA-MM-DD): va en entrada y en salida. */
  fecha: string | null;
  comentario: string;
  /** Lo que suma esta fila. */
  total: number;
}

export interface ContextoDeLasFilas {
  alumnos: number;
  profesores: number;
  /** Las tarifas del catálogo por su id, para la unidad y el coste. */
  tarifas?: Record<string, TarifaDeActividad | undefined>;
  /** El día de cada actividad por su id (AAAA-MM-DD); si falta, `fechaPorDefecto`. */
  fechasDeVisita?: Record<string, string | undefined>;
  /** La fecha de entrada del viaje. */
  fechaPorDefecto?: string | null;
}

/**
 * Las filas de «Servicios Contratados» de las actividades de una opción.
 *
 * Una fila por línea de tarifa. La suma de las filas es, al céntimo, el total
 * de las actividades de la opción. Las actividades sin precio no generan fila
 * y se devuelven aparte, para avisarlo.
 */
export function filasDeLasActividades(
  actividades: ActividadDeLaPropuesta[],
  contexto: ContextoDeLasFilas,
): { filas: FilaDeActividad[]; total: number; sinPrecio: string[] } {
  const filas: FilaDeActividad[] = [];
  const sinPrecio: string[] = [];
  const grupo = Math.max(0, contexto.alumnos) + Math.max(0, contexto.profesores);

  for (const actividad of actividades) {
    const nombre = actividad.activityNameSnapshot.trim();
    const proveedor = actividad.providerSnapshot?.trim() || null;
    const fecha = (actividad.activityId && contexto.fechasDeVisita?.[actividad.activityId]) || contexto.fechaPorDefecto || null;
    const lineas = lineasDeLaActividad(actividad);

    if (lineas.length === 0) {
      // Sin líneas: un precio por persona para todo el grupo.
      const precio = importeDe(actividad.pvpSnapshot);
      if (precio === null || grupo === 0) {
        sinPrecio.push(nombre);
        continue;
      }
      filas.push({
        producto: nombre,
        proveedor,
        unidad: "P.Pax",
        pax: grupo,
        cantidad: 1,
        precio,
        coste: numero(actividad.unitCostAmount),
        fecha,
        comentario: "Actividad",
        total: redondear(precio * grupo),
      });
      continue;
    }

    for (const linea of lineas) {
      const precio = Number(linea.precio);
      const cantidad = Number(linea.cantidad);
      const etiqueta = (linea.etiqueta ?? "").trim();
      if (linea.rateId === DESCUENTO) {
        // El descuento en euros: una fila en negativo, por alumno.
        filas.push({ producto: nombre, proveedor, unidad: "P.Pax", pax: cantidad, cantidad: 1, precio, coste: 0, fecha, comentario: etiqueta || "Descuento", total: redondear(precio * cantidad) });
        continue;
      }
      if (esLineaDeGratuidad(linea)) {
        filas.push({ producto: nombre, proveedor, unidad: "P.Pax", pax: cantidad, cantidad: 1, precio: 0, coste: 0, fecha, comentario: etiqueta || "Gratuidad", total: 0 });
        continue;
      }
      const tarifa = contexto.tarifas?.[linea.rateId];
      const coste = (() => {
        const c = numero(tarifa?.costNetAmount);
        return c !== null && c > 0 ? c : null;
      })();
      if (esPorUnidad(tarifa?.rateUnit)) {
        // Por grupo, por hora, por servicio: el precio es el del servicio.
        filas.push({ producto: nombre, proveedor, unidad: "P.Neto", pax: grupo, cantidad, precio, coste, fecha, comentario: etiqueta || "Actividad", total: redondear(precio * cantidad) });
      } else {
        filas.push({ producto: nombre, proveedor, unidad: "P.Pax", pax: cantidad, cantidad: 1, precio, coste, fecha, comentario: etiqueta || "Actividad", total: redondear(precio * cantidad) });
      }
    }
  }

  return { filas, total: redondear(filas.reduce((s, f) => s + f.total, 0)), sinPrecio };
}
