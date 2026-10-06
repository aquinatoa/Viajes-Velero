/**
 * Qué toca hacer ahora con un presupuesto.
 *
 * La ficha enseñaba dónde está el expediente y qué se ofreció, y ahí se
 * acababa: «estoy aquí y no sé cuál es el próximo paso que debo hacer». Saber
 * en qué fase está no es saber qué hacer; el embudo dice dónde estás, no hacia
 * dónde moverte.
 *
 * Dos reglas:
 *
 *   1. **Una sola cosa cada vez.** Una lista de cinco posibles acciones no es
 *      una respuesta: es el mismo problema con más texto.
 *
 *   2. **Con su porqué y su plazo.** «Haz seguimiento» no mueve a nadie;
 *      «la abrió hace 6 días y no ha contestado» sí.
 *
 * Lo que devuelve NO manda sobre el CRM. Si alguien movió la fase a mano en
 * Zoho, esa persona sabe más que nosotros: aquí solo se propone.
 */

export interface EstadoDelExpediente {
  /** DRAFT, SENT, SIMULATED, FAILED… */
  estado: string;
  sentAt?: string | null;
  firstViewedAt?: string | null;
  viewCount?: number | null;
  /** Número de la opción que eligió el colegio, si eligió. */
  elegida?: number | null;
  chosenAt?: string | null;
  depositDueAt?: string | null;
  depositPaidAt?: string | null;
  /** Cuántos mensajes ha mandado el colegio. */
  correosEntrantes?: number | null;
  /** La fase que tiene el trato en Zoho ahora mismo. */
  faseEnElCrm?: string | null;
}

export type Urgencia = "normal" | "atencion" | "urgente" | "hecho";

export interface SiguientePaso {
  /** Qué hay que hacer, en una frase corta. */
  titulo: string;
  /** Por qué, con la cifra que lo justifica. */
  porque: string;
  urgencia: Urgencia;
  /**
   * A qué botón de la ficha lleva, cuando hay uno. La ficha decide cómo se
   * pinta; aquí solo se dice cuál.
   */
  accion?: "correo" | "documento" | "crm" | "enviar";
}

/** Días enteros entre una fecha y hoy. Negativo si la fecha ya pasó. */
export function diasHasta(fecha: string | null | undefined, hoy: Date): number | null {
  if (!fecha) return null;
  const t = new Date(fecha).getTime();
  if (Number.isNaN(t)) return null;
  const dia = 86_400_000;
  return Math.ceil((t - hoy.getTime()) / dia);
}

/** Días enteros desde una fecha hasta hoy. */
export function diasDesde(fecha: string | null | undefined, hoy: Date): number | null {
  const d = diasHasta(fecha, hoy);
  return d === null ? null : -d;
}

function hace(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}

/**
 * Lo siguiente, en orden de lo que más bloquea.
 *
 * El orden importa más que las frases: lo primero que se mira es si la
 * propuesta llegó a salir, porque todo lo demás da igual si no salió.
 */
export function siguientePasoDelExpediente(e: EstadoDelExpediente, hoy: Date): SiguientePaso {
  // — Todavía no ha salido
  if (e.estado === "SIMULATED") {
    // Hasta el 06/10/2026 este caso no traía acción: el cartel rojo salía sin
    // botón, y en la mesa caía en «Hacer seguimiento» de una propuesta que el
    // colegio nunca recibió. `sendDelivery` admite reenviar una simulada: en
    // cuanto el buzón tenga clave, se envía desde aquí.
    return {
      titulo: "La propuesta no ha salido",
      porque:
        "Está generada y guardada, pero falta la clave del buzón del departamento. El colegio no ha recibido nada. En cuanto el buzón tenga clave, envíala desde aquí: no hace falta regenerarla.",
      urgencia: "urgente",
      accion: "enviar",
    };
  }

  if (e.estado === "FAILED") {
    return {
      titulo: "El envío falló: hay que reintentarlo",
      porque: "El documento y el trato del CRM están creados. Reintentar no duplica nada.",
      urgencia: "urgente",
      accion: "enviar",
    };
  }

  if (e.estado !== "SENT" || !e.sentAt) {
    return {
      titulo: "Falta enviarla",
      porque: "El documento está preparado pero no ha salido hacia el colegio.",
      urgencia: "atencion",
      accion: "documento",
    };
  }

  // — El depósito, que es lo último y lo que cierra
  const pagado = Boolean(e.depositPaidAt);
  if (pagado) {
    return {
      titulo: "Cobrado: toca cerrar el expediente",
      porque: "El depósito está pagado. En el CRM esto es «Oportunidad Ganada».",
      urgencia: "hecho",
      accion: "crm",
    };
  }

  if (e.elegida) {
    const quedan = diasHasta(e.depositDueAt, hoy);
    if (quedan !== null && quedan < 0) {
      return {
        titulo: "El depósito está vencido: reclámalo",
        porque: `Eligieron la opción ${e.elegida} y el plazo del depósito venció ${hace(-quedan)}.`,
        urgencia: "urgente",
        accion: "correo",
      };
    }
    return {
      titulo: "Pídeles el depósito",
      porque:
        `Eligieron la opción ${e.elegida}` +
        (quedan !== null
          ? quedan === 0
            ? " y el plazo del depósito termina hoy."
            : ` y quedan ${quedan} días para el depósito.`
          : ". Falta fijar el plazo del depósito."),
      urgencia: quedan !== null && quedan <= 3 ? "urgente" : "atencion",
      accion: "correo",
    };
  }

  // — Salió pero no han elegido
  const vista = (e.viewCount ?? 0) > 0;
  const desdeEnvio = diasDesde(e.sentAt, hoy) ?? 0;

  if (!vista) {
    // Sin abrir a los tres días, algo pasa: o no llegó, o se fue a spam.
    if (desdeEnvio >= 3) {
      return {
        titulo: "No la han abierto: escríbeles",
        porque: `Salió ${hace(desdeEnvio)} y el enlace sigue sin abrirse. Puede no haber llegado.`,
        urgencia: "atencion",
        accion: "correo",
      };
    }
    return {
      titulo: "Esperando a que la abran",
      porque: `Salió ${hace(desdeEnvio)}. Todavía no han abierto el enlace.`,
      urgencia: "normal",
    };
  }

  const desdeVista = diasDesde(e.firstViewedAt, hoy) ?? 0;

  if ((e.correosEntrantes ?? 0) > 0) {
    return {
      titulo: "Te han contestado: léelo",
      porque: `La abrieron ${hace(desdeVista)} y hay ${e.correosEntrantes} mensaje(s) suyos sin cerrar.`,
      urgencia: "atencion",
      accion: "correo",
    };
  }

  if (desdeVista >= 5) {
    return {
      titulo: "Haz seguimiento",
      porque: `La abrieron ${hace(desdeVista)} y no han elegido ninguna opción ni han contestado.`,
      urgencia: "atencion",
      accion: "correo",
    };
  }

  return {
    titulo: "Esperando su respuesta",
    porque: `La abrieron ${hace(desdeVista)}. Aún no han elegido ninguna opción.`,
    urgencia: "normal",
  };
}
