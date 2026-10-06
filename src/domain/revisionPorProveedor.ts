import type { StagingActivity, StagingActivityPolicy, StagingActivityRate } from "./documentImportTypes";

/**
 * La revisión de actividades, agrupada por proveedor.
 *
 * Anthony, 07/10/2026, con las 130 actividades de la plantilla en pantalla:
 * «puede dar sensación de no saber qué se está aprobando». Tenía 130 tarjetas
 * iguales, cada una con las mismas tres condiciones de su proveedor, y un
 * «Aprobar todas» que no decía todas de qué.
 *
 * Lo que de verdad se revisa es por proveedor: Club Nàutic Salou son 34
 * actividades con 3 condiciones comunes. Esto agrupa, cuenta y junta las
 * condiciones repetidas, para que el botón pueda decir «Aprobar las 34
 * actividades de Club Nàutic Salou y sus 3 condiciones». Es cálculo puro: la
 * pantalla solo lo pinta.
 */

export type EstadoAgregado = "PENDING" | "APPROVED" | "REJECTED" | "MIXTO";

export interface CondicionAgrupada {
  clave: string;
  policyType: string;
  policyText: string;
  /** Una por actividad del proveedor que la tiene. */
  ids: string[];
  estado: EstadoAgregado;
}

export interface GrupoProveedor {
  proveedor: string;
  actividades: StagingActivity[];
  tarifas: number;
  /** Tarifas con algo que no cuadra (ver `avisosDeTarifa`). */
  avisos: number;
  condiciones: CondicionAgrupada[];
  /** Actividades por estado. */
  aprobadas: number;
  rechazadas: number;
  pendientes: number;
  idsActividades: string[];
  idsTarifas: string[];
  idsCondiciones: string[];
}

export const SIN_PROVEEDOR = "Sin proveedor";

function normalizar(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** El estado que resume varios: todos iguales, o mezcla. */
export function estadoAgregado(estados: string[]): EstadoAgregado {
  const distintos = new Set(estados.map((e) => (e === "NEEDS_CHANGES" ? "PENDING" : e)));
  if (distintos.size === 0) return "PENDING";
  if (distintos.size > 1) return "MIXTO";
  const unico = [...distintos][0];
  return unico === "APPROVED" || unico === "REJECTED" ? unico : "PENDING";
}

/**
 * Lo que no cuadra en una tarifa, dicho en una frase. Es la comprobación que
 * nadie hace a mano con 130 filas: una venta por debajo del coste pasa
 * desapercibida en una tarjeta y aquí sale marcada antes de aprobar.
 */
export function avisosDeTarifa(tarifa: StagingActivityRate): string[] {
  const avisos: string[] = [];
  const venta = tarifa.salePvpAmount ?? null;
  const coste = tarifa.costNetAmount ?? null;
  if (venta === null) avisos.push("sin precio de venta");
  else if (venta <= 0) avisos.push("precio de venta a cero");
  if (venta !== null && coste !== null && venta < coste) avisos.push("venta por debajo del coste");
  if (!tarifa.rateUnit || tarifa.rateUnit === "UNKNOWN") avisos.push("sin unidad (¿por persona, por grupo?)");
  if (tarifa.minPax != null && tarifa.maxPax != null && tarifa.minPax > tarifa.maxPax) {
    avisos.push("mínimo de grupo mayor que el máximo");
  }
  return avisos;
}

/** La fila del Excel, si la cita la trae («… · fila 117»). */
export function filaDeOrigen(rawText: string | null | undefined): number | null {
  const m = /fila (\d+)\s*$/i.exec(rawText ?? "");
  return m ? Number(m[1]) : null;
}

function agruparCondiciones(actividades: StagingActivity[]): CondicionAgrupada[] {
  const porClave = new Map<string, { policyType: string; policyText: string; ids: string[]; estados: string[] }>();
  for (const actividad of actividades) {
    for (const p of actividad.policies as StagingActivityPolicy[]) {
      const clave = `${normalizar(String(p.policyType))}||${normalizar(p.policyText)}`;
      const entrada = porClave.get(clave) ?? {
        policyType: String(p.policyType),
        policyText: p.policyText,
        ids: [],
        estados: [],
      };
      entrada.ids.push(p.id);
      entrada.estados.push(String(p.reviewStatus));
      porClave.set(clave, entrada);
    }
  }
  return [...porClave.entries()].map(([clave, c]) => ({
    clave,
    policyType: c.policyType,
    policyText: c.policyText,
    ids: c.ids,
    estado: estadoAgregado(c.estados),
  }));
}

/** Agrupa por proveedor, en el orden en que aparecen; dentro, el orden original. */
export function agruparPorProveedor(actividades: StagingActivity[]): GrupoProveedor[] {
  const grupos = new Map<string, StagingActivity[]>();
  for (const a of actividades) {
    const nombre = (a.supplierName ?? "").trim() || SIN_PROVEEDOR;
    grupos.set(nombre, [...(grupos.get(nombre) ?? []), a]);
  }
  return [...grupos.entries()].map(([proveedor, lista]) => {
    const estados = lista.map((a) => String(a.reviewStatus));
    return {
      proveedor,
      actividades: lista,
      tarifas: lista.reduce((n, a) => n + a.rates.length, 0),
      avisos: lista.reduce((n, a) => n + a.rates.filter((r) => avisosDeTarifa(r).length > 0).length, 0),
      condiciones: agruparCondiciones(lista),
      aprobadas: estados.filter((e) => e === "APPROVED").length,
      rechazadas: estados.filter((e) => e === "REJECTED").length,
      pendientes: estados.filter((e) => e !== "APPROVED" && e !== "REJECTED").length,
      idsActividades: lista.map((a) => a.id),
      idsTarifas: lista.flatMap((a) => a.rates.map((r) => r.id)),
      idsCondiciones: lista.flatMap((a) => a.policies.map((p) => p.id)),
    };
  });
}

/** ¿Esta actividad encaja con lo que se ha escrito en el buscador? */
export function coincideConBusqueda(actividad: StagingActivity, texto: string): boolean {
  const q = normalizar(texto);
  if (!q) return true;
  const campos = [actividad.activityName, actividad.supplierName, actividad.activityType, actividad.locationMain];
  return campos.some((c) => normalizar(c).includes(q));
}

export interface ProgresoDeRevision {
  total: number;
  /** Aprobadas o rechazadas: ya decididas. */
  revisadas: number;
  proveedores: number;
  /** Proveedores sin ninguna actividad pendiente. */
  proveedoresCompletos: number;
}

export function progresoDeRevision(actividades: StagingActivity[]): ProgresoDeRevision {
  const grupos = agruparPorProveedor(actividades);
  const revisadas = actividades.filter((a) => {
    const e = String(a.reviewStatus);
    return e === "APPROVED" || e === "REJECTED";
  }).length;
  return {
    total: actividades.length,
    revisadas,
    proveedores: grupos.length,
    proveedoresCompletos: grupos.filter((g) => g.pendientes === 0).length,
  };
}

/** Lo que dice el botón del proveedor, con los números delante. */
export function textoDeAprobarProveedor(grupo: GrupoProveedor): string {
  const actividades = grupo.pendientes === 1 ? "1 actividad" : `${grupo.pendientes} actividades`;
  const condiciones =
    grupo.condiciones.length === 0
      ? ""
      : grupo.condiciones.length === 1
        ? " y su condición"
        : ` y sus ${grupo.condiciones.length} condiciones`;
  return `Aprobar ${actividades} de ${grupo.proveedor}${condiciones}`;
}
