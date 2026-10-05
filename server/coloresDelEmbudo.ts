/**
 * El color de cada fase, el mismo que Oravia ve en su CRM.
 *
 * La ficha del presupuesto pintaba «Por dónde va» con nuestro azul para todo.
 * En Zoho, cada fase del embudo tiene su color y ellos lo miran todos los días:
 * «Presupuesto Enviado» es azul petróleo, «Pendiente de deposito» naranja,
 * «Oportunidad Ganada» verde. Pintarlas aquí de otro color obliga a traducir
 * entre dos pantallas que dicen lo mismo.
 *
 * Dos decisiones:
 *
 *   1. **Se cachea.** Es la configuración del CRM, no un dato del trato: cambia
 *      cuando alguien la cambia, no en cada ficha que se abre. Pedirla a Zoho
 *      en cada visita es gastar una llamada de API por nada.
 *
 *   2. **Si Zoho no contesta, no hay color.** La ficha se abre igual, pintada
 *      con lo nuestro. Inventarse un color «parecido» sería peor que no tener
 *      ninguno: alguien lo daría por bueno.
 */
import { getZohoDealStagesConColor } from "./zoho";

/** Una hora. Son colores de configuración; nadie los cambia dos veces al día. */
const CUANTO_DURA = 60 * 60 * 1000;

let cache: { cuando: number; colores: Record<string, string> } | null = null;

/** La clave con la que se buscan las fases: sin tildes, sin mayúsculas, sin espacios de más. */
export function clave(fase: string): string {
  return String(fase ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Los colores por fase, listos para buscar por nombre.
 *
 * Se indexan por la clave normalizada porque el nombre que guarda la app y el
 * que devuelve Zoho pueden diferir en una tilde o en un espacio, y entonces la
 * fase se quedaría sin color sin que nadie sepa por qué.
 */
export function indexarColores(fases: { nombre: string; color: string | null }[]): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const f of fases) {
    if (f.color) mapa[clave(f.nombre)] = f.color;
  }
  return mapa;
}

/** Los colores del embudo. Vacío si el CRM no contesta: no se inventan. */
export async function coloresDelEmbudo(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.cuando < CUANTO_DURA) return cache.colores;

  try {
    const colores = indexarColores(await getZohoDealStagesConColor());
    cache = { cuando: Date.now(), colores };
    return colores;
  } catch {
    // Un CRM lento no puede dejar a nadie sin ver su presupuesto. Se devuelve
    // lo último que se supo, si se supo algo, y si no, nada.
    return cache?.colores ?? {};
  }
}

/** Para las pruebas y para cuando alguien cambie los colores en Zoho. */
export function olvidarLosColores(): void {
  cache = null;
}
