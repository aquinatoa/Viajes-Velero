/**
 * A qué viaje pertenece un correo que entra.
 *
 * Es la pieza sobre la que se apoya toda la bandeja: si esto falla, la
 * respuesta de un colegio aparece en el expediente de otro, que es exactamente
 * lo que hace Zoho y por lo que hay que sustituirlo. Ruth lo describió así el
 * 17/06: «se vinculan a la última oportunidad que se creó. Primera. Depende del
 * día es una cosa u otra».
 *
 * El plan original era usar subdirecciones —`groups+ORV-2026-0184@…`—, que son
 * infalsificables. **No sirve aquí.** Probado contra su servidor el 25/09/2026:
 * un correo a `groups+ORV-2026-0004@oraviatravel.com` se acepta sin error y no
 * llega a ninguna parte. Ni al buzón, ni de vuelta como rebote.
 *
 * Así que se emparejará por tres vías, de más fiable a menos, y **queda escrito
 * por cuál** para poder revisar después los emparejamientos dudosos:
 *
 *   MESSAGE_ID  la respuesta cita el Message-ID de lo que mandamos, en
 *               `In-Reply-To` o en `References`. Lo pone el cliente de correo
 *               del colegio, no una persona, así que no se equivoca.
 *   ASUNTO      la referencia ORV-AAAA-NNNN aparece en el asunto. Sobrevive a
 *               los «RE:» y a que reenvíen el hilo, pero no a que alguien
 *               escriba un correo nuevo.
 *   REMITENTE   quien escribe tiene UN solo expediente vivo. Es un último
 *               recurso y por eso exige que no haya ninguna duda.
 *
 * Lo que no se empareja NO se inventa: se queda sin expediente y sale en la
 * bandeja general para que alguien lo mire. Es preferible que sobre trabajo a
 * que una conversación acabe en el viaje equivocado.
 */

/** Lo que hace falta saber de un correo recién llegado. */
export interface CorreoEntrante {
  messageId?: string | null;
  inReplyTo?: string | null;
  /** La cadena `References` entera, con sus Message-ID separados por espacios. */
  referencias?: string | null;
  de: string;
  asunto: string;
  cuerpo?: string | null;
}

/** Un envío nuestro, con lo que permite reconocer su respuesta. */
export interface EnvioConocido {
  id: string;
  reference: string;
  /** El Message-ID del correo que salió. Puede faltar en los envíos antiguos. */
  messageId?: string | null;
  recipientEmail: string;
  /** Si ya está cerrado, deja de ser candidato por remitente. */
  cerrado?: boolean;
}

export type ComoSeEmparejo = "MESSAGE_ID" | "ASUNTO" | "REMITENTE";

export interface Emparejamiento {
  deliveryId: string;
  reference: string;
  emparejadoPor: ComoSeEmparejo;
}

/**
 * Los Message-ID que cita un correo, en orden de fiabilidad.
 *
 * `In-Reply-To` apunta al mensaje al que se responde directamente; `References`
 * trae el hilo entero. Se miran los dos porque hay clientes de correo que solo
 * rellenan uno, y alguno rellena `References` y no `In-Reply-To`.
 */
export function messageIdsCitados(correo: CorreoEntrante): string[] {
  const crudo = `${correo.inReplyTo ?? ""} ${correo.referencias ?? ""}`;

  // Lo normal es que vengan entre ángulos, que es lo que manda el estándar.
  let encontrados: string[] = crudo.match(/<[^<>\s]+>/g) ?? [];

  // Pero no siempre. Hay clientes que escriben el `In-Reply-To` a pelo, sin
  // ángulos, y entonces la expresión de arriba no encuentra nada y la
  // respuesta se queda sin emparejar. Se recogen las piezas que tengan pinta
  // de identificador: algo@algo, sin espacios.
  if (encontrados.length === 0) {
    encontrados = crudo.split(/\s+/).filter((t) => /^[^<>@\s]+@[^<>@\s]+$/.test(t));
  }

  // Sin duplicados y conservando el orden: el primero es el más directo.
  const vistos = new Set<string>();
  const limpios: string[] = [];
  for (const id of encontrados) {
    const normal = normalizarMessageId(id);
    if (normal && !vistos.has(normal)) {
      vistos.add(normal);
      limpios.push(normal);
    }
  }
  return limpios;
}

/**
 * Un Message-ID comparable.
 *
 * Unos clientes lo guardan con los ángulos y otros sin ellos, y el espacio en
 * blanco alrededor es libre. Comparando en crudo, dos formas del mismo
 * identificador no coinciden y la respuesta se queda sin emparejar.
 */
export function normalizarMessageId(valor?: string | null): string {
  return String(valor ?? "").trim().replace(/^<|>$/g, "").toLowerCase();
}

/**
 * La referencia del expediente que aparezca en un texto.
 *
 * El formato es `ORV-AAAA-NNNN` y va en el asunto de todo lo que mandamos, y
 * también en el cuerpo: «indicando la referencia ORV-2026-0004». Se acepta en
 * minúsculas porque alguien la escribirá a mano alguna vez.
 */
export function referenciaEn(texto?: string | null): string | null {
  const m = String(texto ?? "").match(/ORV-\d{4}-\d{3,}/i);
  return m ? m[0].toUpperCase() : null;
}

/** Compara direcciones de correo sin que el formato «Nombre <a@b>» estorbe. */
export function direccionDe(valor?: string | null): string {
  const bruto = String(valor ?? "").trim();
  const entreAngulos = bruto.match(/<([^<>]+)>/);
  return (entreAngulos ? entreAngulos[1] : bruto).trim().toLowerCase();
}

/**
 * Decide a qué envío pertenece un correo. `null` si no se puede saber.
 *
 * Está separada de la base de datos a propósito: es donde vive toda la lógica
 * y donde estaría el fallo si una conversación acabara en el viaje equivocado,
 * así que tiene que poder comprobarse sin IMAP y sin Postgres.
 */
export function emparejar(
  correo: CorreoEntrante,
  envios: EnvioConocido[],
): Emparejamiento | null {
  // 1. Por Message-ID citado. Lo pone la máquina, así que manda sobre todo lo
  //    demás aunque el asunto diga otra cosa.
  const citados = messageIdsCitados(correo);
  if (citados.length > 0) {
    const porId = new Map<string, EnvioConocido>();
    for (const envio of envios) {
      const id = normalizarMessageId(envio.messageId);
      if (id) porId.set(id, envio);
    }
    for (const citado of citados) {
      const envio = porId.get(citado);
      if (envio) {
        return { deliveryId: envio.id, reference: envio.reference, emparejadoPor: "MESSAGE_ID" };
      }
    }
  }

  // 2. Por la referencia, en el asunto y si no en el cuerpo.
  const referencia = referenciaEn(correo.asunto) ?? referenciaEn(correo.cuerpo);
  if (referencia) {
    const envio = envios.find((e) => e.reference.toUpperCase() === referencia);
    if (envio) {
      return { deliveryId: envio.id, reference: envio.reference, emparejadoPor: "ASUNTO" };
    }
    // La referencia está pero no es de ninguno de estos envíos. NO se sigue
    // buscando: una referencia equivocada es un dato, y adivinar por remitente
    // encima de ella daría un emparejamiento seguro y erróneo.
    return null;
  }

  // 3. Por remitente, y solo si no hay ninguna duda.
  const remitente = direccionDe(correo.de);
  if (!remitente) return null;

  const suyos = envios.filter((e) => !e.cerrado && direccionDe(e.recipientEmail) === remitente);
  if (suyos.length === 1) {
    return { deliveryId: suyos[0].id, reference: suyos[0].reference, emparejadoPor: "REMITENTE" };
  }

  // Cero, o más de uno. En ambos casos lo mira una persona: con dos viajes
  // abiertos del mismo colegio, elegir al azar acierta la mitad de las veces.
  return null;
}
