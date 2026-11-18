/**
 * Un complejo con varios tipos de alojamiento sale en la lista como UNO.
 *
 * Javier, 16–17/11/2026: «Cuando buscamos alojamiento, tiene que salir CAMBRILS
 * PARK y después tiene que haber la opción de MED 1 / MED 2 / MED 3 / VILLA
 * BONITA-ALOHA». Cada tipo sigue siendo su propio alojamiento en el catálogo
 * («Cambrils Park · MED 1»…): así se puede ofrecer cada uno como opción de una
 * propuesta, y la estancia no mezcla el precio de un tipo con el de otro. Lo que
 * cambia es cómo se enseñan: juntos, bajo el nombre del complejo.
 *
 * La regla: el nombre es «<complejo> · <tipo>» y hay al menos DOS del mismo
 * complejo en la misma localidad. Uno solo con ese nombre sale tal cual.
 */

export const SEPARADOR_DE_TIPO = " · ";

const normal = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** «Cambrils Park · MED 1» → { complejo: «Cambrils Park», tipo: «MED 1» }. Sin separador, null. */
export function partesDelNombre(nombre: string): { complejo: string; tipo: string } | null {
  const i = nombre.indexOf(SEPARADOR_DE_TIPO);
  if (i <= 0) return null;
  const complejo = nombre.slice(0, i).trim();
  const tipo = nombre.slice(i + SEPARADOR_DE_TIPO.length).trim();
  return complejo && tipo ? { complejo, tipo } : null;
}

export type EntradaDeLaLista<T> =
  | { clase: "suelto"; item: T }
  | { clase: "complejo"; clave: string; nombre: string; items: Array<{ item: T; tipo: string }> };

/**
 * Agrupa la lista sin cambiar su orden: el complejo ocupa el sitio del primero
 * de los suyos (el mejor colocado) y, dentro, sus tipos van en orden natural
 * (MED 1, MED 2, MED 3, Villa Bonita), que es como se leen.
 */
export function agruparPorComplejo<T>(
  lista: T[],
  nombreDe: (t: T) => string,
  localidadDe: (t: T) => string | null | undefined,
): Array<EntradaDeLaLista<T>> {
  const claveDe = (t: T) => {
    const partes = partesDelNombre(nombreDe(t));
    return partes ? `${normal(partes.complejo)}|${normal(localidadDe(t))}` : null;
  };
  const cuantos = new Map<string, number>();
  for (const t of lista) {
    const k = claveDe(t);
    if (k) cuantos.set(k, (cuantos.get(k) ?? 0) + 1);
  }

  const salida: Array<EntradaDeLaLista<T>> = [];
  const yaPuestos = new Map<string, Extract<EntradaDeLaLista<T>, { clase: "complejo" }>>();
  for (const t of lista) {
    const k = claveDe(t);
    if (!k || (cuantos.get(k) ?? 0) < 2) {
      salida.push({ clase: "suelto", item: t });
      continue;
    }
    const partes = partesDelNombre(nombreDe(t))!;
    let grupo = yaPuestos.get(k);
    if (!grupo) {
      grupo = { clase: "complejo", clave: k, nombre: partes.complejo, items: [] };
      yaPuestos.set(k, grupo);
      salida.push(grupo);
    }
    grupo.items.push({ item: t, tipo: partes.tipo });
  }
  for (const g of yaPuestos.values()) {
    g.items.sort((a, b) => a.tipo.localeCompare(b.tipo, "es", { numeric: true, sensitivity: "base" }));
  }
  return salida;
}
