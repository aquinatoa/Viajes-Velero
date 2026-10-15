/**
 * Tarifas «ad hoc»: un hotel o una actividad que NO está en el catálogo, con el
 * precio que ha dado el proveedor, metido a mano en una cotización.
 *
 * Ruth, 29/09/2026: «pegar el correo o el documento con la cotización del
 * proveedor cuando no hay tarifa cargada, y que mande sobre el catálogo. A
 * Sports le pasa siempre». Javier lo repitió en la reunión del 08/10: «tarifa
 * ad hoc del producto».
 *
 * No toca el catálogo: vive en la cotización. Se convierte en un resultado de
 * búsqueda más, con un id que empieza por `adhoc:`, y a partir de ahí la
 * propuesta, el PDF y el CRM lo tratan como a cualquier otro. Al guardar, el
 * enlace al catálogo queda vacío (no hay fila a la que apuntar) y la propuesta
 * conserva su foto: nombre, precio y condiciones.
 *
 * «Que mande sobre el catálogo»: si el hotel SÍ está en el catálogo pero el
 * proveedor ha dado otro precio para este grupo, se añade como ad hoc con ese
 * precio y sustituye al del catálogo (mismo nombre): el del catálogo deja de
 * salir en la lista y, si estaba elegido, se elige el ad hoc en su lugar.
 *
 * 15/10/2026: el precio ya no se teclea. Se adjunta la cotización del proveedor
 * (o se pega su correo), la aplicación lee el COSTE y el de venta sale con el
 * margen del departamento. Ver `cotizacionDelProveedor.ts`.
 */
import type { AccommodationSearchMatch, ActivitySearchMatch } from "./types";

export const PREFIJO_AD_HOC = "adhoc:";

export function esAdHoc(id: string | null | undefined): boolean {
  return Boolean(id && id.startsWith(PREFIJO_AD_HOC));
}

export function nuevoIdAdHoc(): string {
  const azar = Math.random().toString(36).slice(2, 10);
  return `${PREFIJO_AD_HOC}${Date.now().toString(36)}${azar}`;
}

export interface HotelAdHoc {
  id: string;
  nombre: string;
  localidad: string;
  /** PC, MP, AD o SA. */
  regimen: string;
  /** Por alumno y noche, de venta. */
  precioAlumno: number;
  /** Por profesor y noche (habitación individual). Vacío: el de los alumnos. */
  precioProfesor: number | null;
  /** Lo que dice el proveedor: gratuidades, depósito, cancelación… */
  condiciones: string;
  /**
   * De dónde sale el precio: el correo o el documento pegado, tal cual. Solo
   * para Oravia: NUNCA llega al PDF ni al correo del colegio.
   */
  origen: string;
  /** Lo que nos cobra el proveedor por alumno y noche. Null en borradores viejos. */
  costeAlumno?: number | null;
  costeProfesor?: number | null;
  /** El margen con el que se ha calculado la venta, en %. */
  margen?: number | null;
  /** El justificante guardado (CotizacionProveedor) y el nombre del fichero. */
  cotizacionId?: string | null;
  documento?: string | null;
}

export interface ActividadAdHoc {
  id: string;
  nombre: string;
  proveedor: string;
  /** Por alumno, de venta. */
  precioPorAlumno: number;
  descripcion: string;
  origen: string;
  /** Lo que nos cobra el proveedor por alumno. */
  coste?: number | null;
  margen?: number | null;
  cotizacionId?: string | null;
  documento?: string | null;
}

const REGIMENES = new Set(["PC", "MP", "AD", "SA"]);

/**
 * El régimen de la petición («pensión completa», «MP»…) como código del
 * desplegable. Venía tal cual y el desplegable no lo reconocía: se veía PC
 * elegido, pero al añadir decía «Elige el régimen».
 */
export function codigoDeRegimen(texto: string | null | undefined): string {
  const t = (texto ?? "").trim().toLowerCase();
  if (REGIMENES.has(t.toUpperCase())) return t.toUpperCase();
  if (t.includes("completa")) return "PC";
  if (t.includes("media")) return "MP";
  if (t.includes("desayuno")) return "AD";
  if (t.includes("solo")) return "SA";
  return "";
}

/** Lo que falta para que el hotel se pueda usar. Vacío = vale. */
export function problemasDelHotel(h: Partial<HotelAdHoc>): string[] {
  const problemas: string[] = [];
  if (!(h.nombre ?? "").trim()) problemas.push("Falta el nombre del alojamiento.");
  if (!REGIMENES.has((h.regimen ?? "").trim())) problemas.push("Elige el régimen.");
  if (!(typeof h.precioAlumno === "number" && h.precioAlumno > 0)) {
    problemas.push("Falta el precio por alumno y noche.");
  }
  if (h.precioProfesor !== null && h.precioProfesor !== undefined && !(h.precioProfesor > 0)) {
    problemas.push("El precio de los profesores tiene que ser mayor que cero, o dejarlo vacío.");
  }
  return problemas;
}

export function problemasDeLaActividad(a: Partial<ActividadAdHoc>): string[] {
  const problemas: string[] = [];
  if (!(a.nombre ?? "").trim()) problemas.push("Falta el nombre de la actividad.");
  if (!(typeof a.precioPorAlumno === "number" && a.precioPorAlumno > 0)) {
    problemas.push("Falta el precio por alumno.");
  }
  return problemas;
}

const AVISO = "Tarifa ad hoc: la ha puesto quien cotiza con el precio del proveedor; no está en el catálogo.";

/** El hotel, con la forma de un resultado de búsqueda. */
export function hotelComoResultado(h: HotelAdHoc, anio: number): AccommodationSearchMatch {
  const tarifa = (precio: number, coste: number | null | undefined, ocupacion: string) => ({
    id: `${h.id}:${ocupacion}`,
    accommodationId: h.id,
    rateSource: "ad hoc",
    year: anio,
    seasonName: "Ad hoc",
    dateFrom: "",
    dateTo: "",
    minNights: 0,
    boardType: h.regimen,
    tariffUnit: "PER_PAX_NIGHT",
    pvpAmount: precio,
    // El coste del proveedor: la propuesta lo guarda y el CRM lo usa.
    netSaleAmount: coste ?? 0,
    netAzulmarinoAmount: 0,
    clientSegment: "",
    includedService: "",
    occupancyLabel: ocupacion,
    sourceFile: "",
    sourceSheet: "",
  });
  return {
    accommodation: {
      id: h.id,
      accommodationName: h.nombre.trim(),
      locality: h.localidad.trim(),
      categoryType: "",
      accommodationType: "",
      // El texto pegado del proveedor NO va aquí: las observaciones salen en
      // el PDF que recibe el colegio, y ese correo lleva el coste. Se queda en
      // la cotización (el borrador), que solo ve Oravia.
      observations: "",
      conditionsText: h.condiciones.trim(),
      freePolicy: "",
      sourceFile: "",
      sourceDocumentName: "Ad hoc",
    },
    rate: tarifa(h.precioAlumno, h.costeAlumno, "Múltiple"),
    singleRate: h.precioProfesor ? tarifa(h.precioProfesor, h.costeProfesor ?? h.costeAlumno, "Individual") : null,
    score: 1000,
    matchReasons: [AVISO],
    adHoc: true,
    cotizacionId: h.cotizacionId ?? null,
  };
}

/** La actividad, con la forma de un resultado de búsqueda. */
export function actividadComoResultado(a: ActividadAdHoc, anio: number): ActivitySearchMatch {
  return {
    activity: {
      id: a.id,
      activityName: a.nombre.trim(),
      supplierName: a.proveedor.trim(),
      locationMain: "",
      durationText: "",
      // Solo lo que incluye: la descripción sale en el PDF del colegio, y el
      // texto del proveedor (con su coste) se queda en la cotización.
      descriptionText: a.descripcion.trim(),
      policies: [],
      sourceFile: "",
      sourceDocumentName: "Ad hoc",
    },
    rate: {
      id: `${a.id}:tarifa`,
      activityId: a.id,
      year: anio,
      ageLabel: "Tarifa ad hoc",
      ageMin: 0,
      ageMax: 0,
      salePvpAmount: a.precioPorAlumno,
      costNetAmount: a.coste ?? 0,
      commissionPercent: 0,
      durationText: "",
      sourceFile: "",
      sourceSheet: "",
    },
    score: 1000,
    matchReasons: [AVISO],
    adHoc: true,
    cotizacionId: a.cotizacionId ?? null,
  };
}

/** Un nombre para comparar: sin tildes, mayúsculas, «Hotel» delante ni signos. */
export function nombreParaComparar(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^\s*(hotel|hostal|albergue|alberg|aparthotel)\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Mezcla lo ad hoc con lo que ha devuelto la búsqueda: lo ad hoc primero, que
 * es lo que quien cotiza acaba de poner a propósito.
 */
export function conLoAdHoc<T extends { matches: M[] }, M extends { score: number }>(
  resultado: T,
  propios: M[],
  idDe: (m: M) => string,
  nombreDe?: (m: M) => string,
): T {
  const ids = new Set(propios.map(idDe));
  // «Que mande sobre el catálogo»: el mismo hotel del catálogo deja de salir.
  const nombres = new Set(nombreDe ? propios.map((m) => nombreParaComparar(nombreDe(m))) : []);
  const delCatalogo = resultado.matches.filter(
    (m) => !ids.has(idDe(m)) && !(nombreDe && nombres.has(nombreParaComparar(nombreDe(m)))),
  );
  return { ...resultado, matches: [...propios, ...delCatalogo] };
}

/**
 * Los ids del catálogo a los que sustituye un ad hoc con el mismo nombre: si
 * estaban elegidos, se cambian por el ad hoc.
 */
export function sustituidosPor<M>(
  matches: M[],
  propio: { id: string; nombre: string },
  idDe: (m: M) => string,
  nombreDe: (m: M) => string,
): string[] {
  const nombre = nombreParaComparar(propio.nombre);
  return matches
    .filter((m) => idDe(m) !== propio.id && nombreParaComparar(nombreDe(m)) === nombre)
    .map(idDe);
}
