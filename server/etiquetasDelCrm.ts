/**
 * Cómo se llama cada campo del trato en la pantalla de Zoho («Importe del depósito»,
 * no `Importe_Dep_sito_New`) y de qué tipo es (moneda, fecha, sí/no…).
 *
 * Es configuración del CRM, no un dato del trato: se cachea una hora. Si Zoho no
 * contesta se devuelve lo último que se supo, y si no, nada: la ficha se abre igual
 * y enseña el nombre técnico del campo en vez de una etiqueta inventada.
 */
import type { EtiquetasDeCampos } from "../src/domain/fichaDelCrm";
import { getZohoModuleFields } from "./zoho";

const MODULO_DE_TRATOS = process.env.ZOHO_DEALS_MODULE ?? "Deals";

const CUANTO_DURA = 60 * 60 * 1000;
let cache: { cuando: number; etiquetas: EtiquetasDeCampos } | null = null;

export function etiquetasDeLosCampos(campos: Record<string, unknown>[]): EtiquetasDeCampos {
  const mapa: EtiquetasDeCampos = {};
  for (const c of campos) {
    const api = String(c.api_name ?? "");
    const etiqueta = String(c.field_label ?? c.display_label ?? "").trim();
    if (api && etiqueta) mapa[api] = { etiqueta, tipo: String(c.data_type ?? "") };
  }
  return mapa;
}

export async function etiquetasDelTrato(): Promise<EtiquetasDeCampos> {
  if (cache && Date.now() - cache.cuando < CUANTO_DURA) return cache.etiquetas;
  try {
    const etiquetas = etiquetasDeLosCampos(await getZohoModuleFields(MODULO_DE_TRATOS));
    cache = { cuando: Date.now(), etiquetas };
    return etiquetas;
  } catch {
    return cache?.etiquetas ?? {};
  }
}
