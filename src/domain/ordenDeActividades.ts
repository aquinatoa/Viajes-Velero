/**
 * En qué orden se enseñan las actividades al cotizar.
 *
 * Sports pidió verlas por orden alfabético (Javier, 16/11/2026). El orden que
 * trae la búsqueda —primero las del destino y las destacadas, luego por lo bien
 * que encajan— sigue siendo el de entrada, y quien cotiza elige otro en
 * «Ordenar por». Lo metido a mano («fuera del catálogo») va siempre delante,
 * como ya iba.
 *
 * Es lógica pura, sin pantalla ni base de datos.
 */

export type OrdenDeActividades = "recomendado" | "nombre" | "precio" | "lugar" | "proveedor";

export const ORDENES_DE_ACTIVIDADES: Array<{ valor: OrdenDeActividades; rotulo: string }> = [
  { valor: "recomendado", rotulo: "Recomendadas primero" },
  { valor: "nombre", rotulo: "Nombre (A–Z)" },
  { valor: "precio", rotulo: "Precio, de menor a mayor" },
  { valor: "lugar", rotulo: "Lugar" },
  { valor: "proveedor", rotulo: "Proveedor" },
];

/** Lo mínimo que hace falta de una actividad para ordenarla. */
export interface ActividadOrdenable {
  activity: { activityName: string; supplierName?: string | null; locationMain?: string | null };
  rate?: { salePvpAmount?: number | null } | null;
  adHoc?: boolean;
}

const porTexto = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().localeCompare((b ?? "").trim(), "es", { sensitivity: "base", numeric: true });

/** Lo que no tiene dato (sin lugar, sin proveedor, sin precio) va al final, no al principio. */
function vaciosAlFinal(a: unknown, b: unknown): number {
  const va = a === null || a === undefined || a === "" ? 1 : 0;
  const vb = b === null || b === undefined || b === "" ? 1 : 0;
  return va - vb;
}

/**
 * Devuelve la lista en el orden pedido, sin tocar la original. «recomendado»
 * es el orden en que llegó. A igualdad, manda el nombre; y a igualdad de
 * nombre, el orden en que llegó (la ordenación es estable).
 */
export function ordenarActividades<T extends ActividadOrdenable>(lista: T[], orden: OrdenDeActividades): T[] {
  if (orden === "recomendado") return lista;
  const nombre = (a: T, b: T) => porTexto(a.activity.activityName, b.activity.activityName);
  const criterio = (a: T, b: T): number => {
    if (orden === "precio") {
      const pa = a.rate?.salePvpAmount ?? null;
      const pb = b.rate?.salePvpAmount ?? null;
      return vaciosAlFinal(pa, pb) || (pa ?? 0) - (pb ?? 0) || nombre(a, b);
    }
    if (orden === "lugar") {
      const la = a.activity.locationMain?.trim();
      const lb = b.activity.locationMain?.trim();
      return vaciosAlFinal(la, lb) || porTexto(la, lb) || nombre(a, b);
    }
    if (orden === "proveedor") {
      const sa = a.activity.supplierName?.trim();
      const sb = b.activity.supplierName?.trim();
      return vaciosAlFinal(sa, sb) || porTexto(sa, sb) || nombre(a, b);
    }
    return nombre(a, b);
  };
  return [...lista].sort((a, b) => Number(Boolean(b.adHoc)) - Number(Boolean(a.adHoc)) || criterio(a, b));
}
