/**
 * El podio: los tres alojamientos que mejor encajan con lo que pidió el centro.
 *
 * Es una funcionalidad que ya se había trabajado y se perdió por el camino.
 * Anthony la reclamó mirando la pantalla de opciones: «veo que no tenemos una
 * funcionalidad que estuvimos trabajando… una especie de podio de los tres
 * mejores alojamientos».
 *
 * La lista larga ordena por `score`, que es la puntuación interna de la
 * búsqueda —cuánto se parece el hotel a los filtros—. El podio ordena por otra
 * cosa: por CUÁNTAS DE LAS COSAS QUE PIDIÓ EL COLEGIO cumple. No es lo mismo.
 * Un hotel puede puntuar muy alto por destino y fechas y a la vez no llegar a
 * la categoría pedida o pasarse del tope por alumno.
 *
 * Dos reglas que no se negocian:
 *
 *   1. Al podio NO sube nada que incumpla algo. Recomendar un 2★ cuando el
 *      colegio pidió 3★, o un hotel que se pasa 55 € del tope, es hacerle
 *      perder el tiempo a quien cotiza. Si solo hay dos limpios, el podio tiene
 *      dos; si no hay ninguno, no hay podio y se ve la lista.
 *
 *   2. «No consta» no descalifica, pero sí desempata hacia abajo. Un hotel que
 *      dice tener habitación adaptada va antes que uno que no dice nada, sin
 *      que el segundo quede fuera: puede tenerla y no haberlo escrito.
 */
import type { AccommodationSearchMatch, ComprobacionDeEncaje } from "./types";

export interface CuentaDelEncaje {
  cumple: number;
  noCumple: number;
  noConsta: number;
  /** Cuántas comprobaciones hay en total. */
  total: number;
}

/** Cuántas cosas cumple, cuántas no y cuántas no se saben. */
export function cuentaDelEncaje(lista: ComprobacionDeEncaje[] | undefined): CuentaDelEncaje {
  const items = lista ?? [];
  return {
    cumple: items.filter((c) => c.estado === "cumple").length,
    noCumple: items.filter((c) => c.estado === "no_cumple").length,
    noConsta: items.filter((c) => c.estado === "no_consta").length,
    total: items.length,
  };
}

/** El precio por persona y noche de una opción, para desempatar. */
function porNoche(item: AccommodationSearchMatch): number {
  return item.rate.pvpAmount || item.rate.netSaleAmount || 0;
}

/**
 * Los mejores primero: más cosas cumplidas, menos cosas sin confirmar y, a
 * igualdad, más barato. El `score` de la búsqueda solo desempata al final.
 */
export function ordenarPorEncaje(matches: AccommodationSearchMatch[]): AccommodationSearchMatch[] {
  return [...matches].sort((a, b) => {
    const ca = cuentaDelEncaje(a.encaje);
    const cb = cuentaDelEncaje(b.encaje);
    if (ca.noCumple !== cb.noCumple) return ca.noCumple - cb.noCumple;
    if (ca.cumple !== cb.cumple) return cb.cumple - ca.cumple;
    if (ca.noConsta !== cb.noConsta) return ca.noConsta - cb.noConsta;
    if (b.score !== a.score) return b.score - a.score;
    return porNoche(a) - porNoche(b);
  });
}

/**
 * Los hasta tres recomendados.
 *
 * Solo entran los que no incumplen nada, y solo si hay algo que comprobar: sin
 * requisitos ni tope, todas las comprobaciones están vacías y un «podio» sería
 * un adorno que no dice nada.
 */
export function podio(matches: AccommodationSearchMatch[], cuantos = 3): AccommodationSearchMatch[] {
  const conComprobaciones = matches.filter((item) => (item.encaje?.length ?? 0) > 0);
  if (conComprobaciones.length === 0) return [];

  const limpios = conComprobaciones.filter((item) => cuentaDelEncaje(item.encaje).noCumple === 0);
  return ordenarPorEncaje(limpios).slice(0, cuantos);
}

/**
 * Por qué está en el podio, en una línea.
 *
 * Un puesto sin motivo es una opinión; con el motivo, quien cotiza puede
 * discutirlo. Y si hay cosas sin confirmar, se dicen aquí: es lo que tendrá
 * que preguntarle al hotel.
 */
export function razonDelPodio(item: AccommodationSearchMatch): string {
  const n = cuentaDelEncaje(item.encaje);
  if (n.total === 0) return "Sin nada que comprobar";

  const cumplidas =
    n.cumple === 0
      ? "No confirma nada de lo que pidieron"
      : n.cumple === n.total
        ? `Cumple las ${n.total} cosas que pidieron`
        : `Cumple ${n.cumple} de ${n.total}`;

  if (n.noConsta === 0) return cumplidas;
  return `${cumplidas} · ${n.noConsta} ${n.noConsta === 1 ? "por confirmar" : "por confirmar"}`;
}
