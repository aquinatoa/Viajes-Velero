/**
 * ¿Este alojamiento está en el destino que pidió el cliente, o solo cerca?
 *
 * La búsqueda trae a propósito toda la comarca: pidiendo Cambrils también salen
 * los de Salou. Al probarlo, Sports lo vivió como un fallo («aunque filtres por
 * Salou o Cambrils salen los mismos alojamientos», Javier, 16/11/2026): la
 * lista era casi la misma y solo cambiaba el orden.
 *
 * Decisión: la lista enseña primero SOLO los del destino pedido, y los de
 * cerca quedan a un clic («Ver también los de cerca»). Esto es la regla que
 * separa unos de otros. Es lógica pura, sin pantalla ni base de datos.
 */

function normalizar(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Un alojamiento puede estar en varias localidades: «Salou / Calafell»,
 * «Salou/Cambrils», «Vila-seca/Salou». Se parte igual que en la búsqueda del
 * servidor (`localidadesDe`, en `server/searchDb.ts`), para que las dos digan
 * lo mismo.
 */
export function localidadesDe(localidad: string | null | undefined): string[] {
  return String(localidad ?? "")
    .split(/[/,&·+]|\s+y\s+|\s+-\s+|\s+–\s+/)
    .map(normalizar)
    .filter(Boolean);
}

/**
 * Si el alojamiento está en el destino pedido.
 *
 * Sin destino no hay nada que separar: todos cuentan como «del destino». Y si
 * el alojamiento no trae localidad, se mira si el nombre la lleva («Camping
 * Platja Cambrils»), que es como vienen algunos del maestro de Oravia.
 */
export function estaEnElDestino(
  alojamiento: { locality?: string | null; accommodationName?: string | null },
  destino: string | null | undefined,
): boolean {
  const buscado = normalizar(destino);
  if (!buscado) return true;
  const localidades = localidadesDe(alojamiento.locality);
  if (localidades.length > 0) return localidades.includes(buscado);
  const nombre = normalizar(alojamiento.accommodationName).split(/[^a-z0-9']+/);
  const palabras = buscado.split(/[^a-z0-9']+/).filter(Boolean);
  return palabras.length > 0 && palabras.every((p) => nombre.includes(p));
}

/**
 * Parte una lista en «los del destino» y «los de cerca», sin cambiar el orden.
 * Si en el destino no hay ninguno, no se esconde nada: mejor enseñar los de
 * cerca que una lista vacía.
 */
export function separarPorDestino<T>(
  lista: T[],
  destino: string | null | undefined,
  alojamientoDe: (item: T) => { locality?: string | null; accommodationName?: string | null },
): { delDestino: T[]; deCerca: T[] } {
  const delDestino: T[] = [];
  const deCerca: T[] = [];
  for (const item of lista) {
    (estaEnElDestino(alojamientoDe(item), destino) ? delDestino : deCerca).push(item);
  }
  if (delDestino.length === 0) return { delDestino: lista, deCerca: [] };
  return { delDestino, deCerca };
}
