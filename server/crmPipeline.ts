/**
 * Mueve la fase del trato en Zoho según lo que va pasando en la app.
 *
 * Hasta ahora el trato se creaba con la fase «Nueva» —un valor que ni siquiera
 * existe en el embudo de Oravia— y no volvía a moverse nunca. Enviar la
 * propuesta, que el colegio la abriera o que eligiera una opción no se notaba
 * en el CRM: quien mira Zoho veía todos los tratos amontonados al principio del
 * embudo, dijera lo que dijera la app.
 *
 * El embudo real de Oravia, leído de su picklist:
 *
 *   Preparando Presupuesto · Presupuesto Enviado · Seguimiento al Presupuesto
 *   Pendiente de deposito · Oportunidad Ganada · Pendiente de pago resto
 *   Cierre Administrativo · Expediente cerrado
 *
 * Y fuera del recorrido: Oportunidad Perdida y Lista de Espera.
 *
 * Dos reglas gobiernan todo lo de aquí:
 *
 *   1. **Solo se avanza.** Reenviar una propuesta de un viaje ya ganado no
 *      puede devolverlo a «Presupuesto Enviado». La fase la puede haber movido
 *      una persona, y esa persona sabe más que nosotros.
 *   2. **Nunca rompe lo que estaba haciendo.** Si Zoho no contesta, la
 *      propuesta se envía igual y se deja constancia en el registro. Un fallo
 *      del CRM no puede impedir que salga un presupuesto.
 */
import { getZohoDealStage, updateZohoDeal } from "./zoho";

/** Lo que ocurre en la app y que el CRM debería reflejar. */
export type Hito =
  | "presupuesto_preparado"
  | "presupuesto_enviado"
  | "presupuesto_visto"
  | "opcion_elegida"
  | "deposito_cobrado";

function fase(variable: string, pordefecto: string): string {
  const valor = (process.env[variable] ?? "").trim();
  return valor || pordefecto;
}

/**
 * El embudo, en orden. De aquí sale el «solo se avanza».
 *
 * Se puede sustituir entero con `ZOHO_FASES` separando con barras verticales,
 * por si renombran el picklist. No se usa la coma: hay nombres de fase que
 * podrían llevarla.
 */
const FASES_POR_DEFECTO = [
  "Preparando Presupuesto",
  "Presupuesto Enviado",
  "Seguimiento al Presupuesto",
  "Pendiente de deposito",
  "Oportunidad Ganada",
  "Pendiente de pago resto",
  "Cierre Administrativo",
  "Expediente cerrado",
];

export const FASES: string[] = (() => {
  const crudo = (process.env.ZOHO_FASES ?? "").trim();
  if (!crudo) return FASES_POR_DEFECTO;
  const partes = crudo.split("|").map((t) => t.trim()).filter(Boolean);
  return partes.length > 0 ? partes : FASES_POR_DEFECTO;
})();

/**
 * Fases que una persona ha decidido y que la app no toca jamás.
 *
 * Un trato aparcado en lista de espera o dado por perdido no puede volver al
 * embudo porque alguien reenvíe un PDF.
 */
export const FASES_INTOCABLES: string[] = (() => {
  const crudo = (process.env.ZOHO_FASES_INTOCABLES ?? "").trim();
  if (!crudo) return ["Oportunidad Perdida", "Lista de Espera"];
  return crudo.split("|").map((t) => t.trim()).filter(Boolean);
})();

/** A qué fase corresponde cada hito. */
export const FASE_DE_HITO: Record<Hito, string> = {
  presupuesto_preparado: fase("ZOHO_FASE_PREPARANDO", FASES_POR_DEFECTO[0]),
  presupuesto_enviado: fase("ZOHO_FASE_ENVIADO", FASES_POR_DEFECTO[1]),
  presupuesto_visto: fase("ZOHO_FASE_SEGUIMIENTO", FASES_POR_DEFECTO[2]),
  opcion_elegida: fase("ZOHO_FASE_ELEGIDA", FASES_POR_DEFECTO[3]),
  deposito_cobrado: fase("ZOHO_FASE_GANADA", FASES_POR_DEFECTO[4]),
};

function normalizar(valor: string): string {
  return valor.trim().toLowerCase();
}

function posicion(nombre: string): number {
  const buscado = normalizar(nombre);
  return FASES.findIndex((f) => normalizar(f) === buscado);
}

export type Decision =
  | { mover: true; desde: string; hasta: string; motivo: "avanza" | "fuera_del_embudo" }
  | { mover: false; desde: string; hasta: string; motivo: "intocable" | "ya_esta" | "mas_adelantada" };

/**
 * Decide, sin hablar con nadie, si un trato en `actual` debe pasar a `destino`.
 *
 * Está separada de la llamada a Zoho para poder comprobarla: es donde vive toda
 * la lógica y donde estaría el fallo si un trato se moviera hacia atrás.
 *
 * Una fase que no reconocemos —«Nueva», que es con la que se crearon los tratos
 * hasta ahora, o una de prueba— se considera a la deriva y se corrige. Ahí la
 * app sabe más que el CRM, porque el CRM tiene un valor que nadie puso a
 * propósito.
 */
export function decidirFase(actual: string, destino: string): Decision {
  const desde = (actual ?? "").trim();

  if (FASES_INTOCABLES.some((f) => normalizar(f) === normalizar(desde))) {
    return { mover: false, desde, hasta: destino, motivo: "intocable" };
  }

  const aqui = posicion(desde);
  const alli = posicion(destino);

  if (aqui < 0) {
    return { mover: true, desde, hasta: destino, motivo: "fuera_del_embudo" };
  }

  if (aqui === alli) return { mover: false, desde, hasta: destino, motivo: "ya_esta" };
  if (aqui > alli) return { mover: false, desde, hasta: destino, motivo: "mas_adelantada" };

  return { mover: true, desde, hasta: destino, motivo: "avanza" };
}

export interface ResultadoDeFase {
  movido: boolean;
  desde?: string;
  hasta?: string;
  motivo: Decision["motivo"] | "sin_trato" | "error";
  error?: string;
}

/**
 * Lleva el trato al punto del embudo que le toca por lo que ha pasado.
 *
 * No lanza nunca: quien la llama está enviando una propuesta o atendiendo al
 * colegio en la página pública, y eso no se puede caer porque el CRM tosa.
 */
export async function marcarHito(
  dealId: string | null | undefined,
  hito: Hito,
  nota?: string,
): Promise<ResultadoDeFase> {
  if (!dealId) return { movido: false, motivo: "sin_trato" };

  const destino = FASE_DE_HITO[hito];

  try {
    const actual = await getZohoDealStage(dealId);
    const decision = decidirFase(actual, destino);

    if (!decision.mover) {
      console.info(
        `[crm] ${dealId}: se queda en «${decision.desde}» (${decision.motivo}), no pasa a «${destino}».`,
      );
      return { movido: false, desde: decision.desde, hasta: destino, motivo: decision.motivo };
    }

    await updateZohoDeal({
      dealId,
      stage: destino,
      note: nota,
      noteDate: new Date().toISOString().slice(0, 10),
    });

    console.info(`[crm] ${dealId}: «${decision.desde || "sin fase"}» → «${destino}» (${hito}).`);
    return { movido: true, desde: decision.desde, hasta: destino, motivo: decision.motivo };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.error(`[crm] ${dealId}: no se pudo mover a «${destino}» por ${hito}: ${mensaje}`);
    return { movido: false, hasta: destino, motivo: "error", error: mensaje };
  }
}
