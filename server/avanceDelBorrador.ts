/**
 * Hasta dónde llegó una solicitud a medias.
 *
 * La lista de «Solicitudes a medias» enseñaba el título y cuánto hace que se
 * tocó, y nada más. Con dos intentos del mismo colegio —uno enviado y otro
 * abandonado— las dos líneas son idénticas:
 *
 *     IES Jaume Balmes · Salou · 2027-05-12      hace 34 minutos
 *
 * Y entonces la pregunta razonable es la que hizo Anthony: «ya la envié, ¿por
 * qué me sigue apareciendo una pendiente?». La respuesta era que sí, que es
 * correcto —aquel intento no llegó a elegir alojamientos y nunca se envió—,
 * pero para saberlo había que mirar la base de datos.
 *
 * Con una línea más, eso se ve: «la petición, sin alojamientos elegidos» no se
 * parece en nada a «3 alojamientos · 3 actividades».
 *
 * Y hay un aviso que pesa más que el resto: si el borrador ya tiene solicitud
 * creada, puede haber un trato en el CRM detrás. Eso hay que decirlo antes de
 * que alguien lo descarte pensando que no deja rastro.
 */

export interface CargaDelBorrador {
  solicitudId?: string | null;
  mensajes?: unknown[] | null;
  elegidos?: unknown[] | null;
  programaBase?: unknown[] | null;
  conversacion?: unknown[] | null;
  entendido?: { destinationText?: string | null; dateFrom?: string | null } | null;
}

function cuantos(lista: unknown[] | null | undefined): number {
  return Array.isArray(lista) ? lista.length : 0;
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/**
 * Una línea que dice por dónde se quedó, en el lenguaje de la pantalla.
 *
 * El orden va de más avanzado a menos: lo primero que se mira es si llegó a
 * elegir alojamientos, que es lo que separa un intento serio de uno que se
 * quedó en leer el correo.
 */
export function avanceDelBorrador(carga: CargaDelBorrador | null | undefined): string {
  if (!carga) return "sin nada guardado";

  const hoteles = cuantos(carga.elegidos);
  const actividades = cuantos(carga.programaBase);
  const mensajes = cuantos(carga.mensajes);
  const hayPeticion = Boolean(carga.entendido?.destinationText || carga.entendido?.dateFrom);

  // Lo que puede haber dejado rastro fuera de aquí va primero: con solicitud
  // creada puede existir ya un trato en el CRM.
  const conSolicitud = Boolean(carga.solicitudId);

  let avance: string;
  if (hoteles > 0) {
    avance = plural(hoteles, "alojamiento", "alojamientos");
    if (actividades > 0) avance += ` · ${plural(actividades, "actividad", "actividades")}`;
  } else if (hayPeticion) {
    avance = "la petición, sin alojamientos elegidos";
  } else if (mensajes > 0) {
    avance = "solo el mensaje pegado";
  } else {
    avance = "sin nada guardado";
  }

  return conSolicitud ? `${avance} · ya tiene solicitud creada` : avance;
}
