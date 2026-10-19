/**
 * La cotización que manda el proveedor cuando no hay tarifa cargada.
 *
 * Javier, 29/09/2026: «no tenemos tarifas del hotel, pero a veces el proveedor
 * nos cotiza en el momento un correo. ¿Lo podremos también copiar y pegar aquí
 * y el cotizador nos cotizará?». Y: «los hoteles no tienen tarifas de grupos,
 * solo te cotizan cuando le pides» (a Sports le pasa siempre).
 *
 * Es el analizador de tarifas en pequeño: aquí ya se sabe de qué hotel o
 * actividad se trata, para qué fechas, régimen y grupo. Lo que se busca en el
 * documento es UN precio: lo que nos cobra el proveedor (el coste). El de venta
 * sale de ese coste con el margen del departamento (13/10/2026: «Cost» es lo
 * que pagan; 8 % Grupos, 12 % Turismo Deportivo), y quien cotiza lo revisa
 * antes de añadirlo.
 *
 * Este fichero es lo que comparten la pantalla y el servidor: la forma de la
 * lectura y las cuentas. La llamada al modelo está en
 * `server/cotizacionDelProveedor.ts`.
 */

export type TipoDeCotizacion = "hotel" | "actividad";

/** Lo que se sabe ya de la petición. Se le da al modelo para que no adivine. */
export interface ContextoDeCotizacion {
  tipo: TipoDeCotizacion;
  /** El nombre que ha escrito quien cotiza, si lo ha escrito. */
  nombre: string;
  destino: string;
  /** PC, MP, AD o SA. */
  regimen: string;
  fechaEntrada: string;
  fechaSalida: string;
  alumnos: number | null;
  profesores: number | null;
}

/** Lo que el modelo ha encontrado en el documento. Todo revisable. */
export interface LecturaDeCotizacion {
  nombre: string;
  /** Hotel: la localidad. Actividad: el proveedor. */
  dondeOProveedor: string;
  /** Solo hotel: PC, MP, AD o SA; vacío si no lo dice. */
  regimen: string;
  /** Hotel: por alumno y noche. Actividad: por alumno. Lo que nos cobra. */
  coste: number | null;
  /** Solo hotel: por profesor y noche. Null si no lo distingue. */
  costeProfesor: number | null;
  /** Si el precio lleva el IVA dentro, según el documento. */
  iva: "incluido" | "no incluido" | "no lo dice";
  /** Hotel: gratuidades, depósito, cancelación. Actividad: qué incluye. */
  condiciones: string;
  /** El trozo del documento de donde sale el coste, copiado tal cual. */
  cita: string;
  /** Lo que quien cotiza tiene que comprobar a mano (conversiones, dudas). */
  avisos: string[];
}

const REGIMENES = new Set(["PC", "MP", "AD", "SA"]);

/** El margen de cada departamento, el mismo que al subir tarifas de compra. */
export const MARGEN_GRUPOS = 8;
export const MARGEN_DEPORTIVO = 12;

export function margenDelDepartamento(departamento: string | null | undefined): number {
  return departamento === "SPORTS" ? MARGEN_DEPORTIVO : MARGEN_GRUPOS;
}

/** El precio de venta: el coste con el margen, en céntimos exactos. */
export function precioConMargen(coste: number, margen: number): number {
  return Math.round(coste * (1 + margen / 100) * 100) / 100;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

/** Un importe del modelo: número, o texto con coma o «€». Nunca cero ni negativo. */
export function importe(valor: unknown): number | null {
  let n: number | null = null;
  if (typeof valor === "number") n = valor;
  else if (typeof valor === "string") {
    const limpio = valor.replace(/\s|€|eur/gi, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    n = limpio ? Number(limpio) : null;
  }
  if (n === null || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/**
 * La respuesta del modelo, ya con la forma de la pantalla. Lo que no encaje se
 * deja vacío y se avisa: mejor un campo en blanco que un precio inventado.
 */
export function normalizarLectura(bruto: unknown, tipo: TipoDeCotizacion): LecturaDeCotizacion {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const avisos = Array.isArray(o.avisos) ? o.avisos.map(texto).filter(Boolean) : [];

  const regimenLeido = texto(o.regimen).toUpperCase();
  const regimen = tipo === "hotel" && REGIMENES.has(regimenLeido) ? regimenLeido : "";

  const coste = importe(o.coste);
  const costeProfesor = tipo === "hotel" ? importe(o.costeProfesor) : null;
  if (coste === null) {
    avisos.unshift(
      tipo === "hotel"
        ? "No he encontrado un precio por alumno y noche: ponlo a mano."
        : "No he encontrado un precio por alumno: ponlo a mano.",
    );
  }

  const ivaLeido = texto(o.iva).toLowerCase();
  const iva: LecturaDeCotizacion["iva"] =
    ivaLeido === "incluido" ? "incluido" : ivaLeido === "no incluido" ? "no incluido" : "no lo dice";

  return {
    nombre: texto(o.nombre),
    dondeOProveedor: texto(o.dondeOProveedor),
    regimen,
    coste,
    costeProfesor,
    iva,
    condiciones: texto(o.condiciones),
    cita: texto(o.cita),
    avisos,
  };
}
