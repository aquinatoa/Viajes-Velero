import type { NormalizedRequestDraft, ParseTripRequestInput } from "../../domain/types";

/**
 * Borrador del lienzo.
 *
 * Vive en el SERVIDOR, y en el navegador solo como red de seguridad.
 *
 * Antes era al revés: una sola clave en `localStorage`. Eso significaba que
 * solo había un borrador —empezar otra solicitud pisaba la anterior—, que no se
 * podía volver a uno que ya existía, y que nadie podía continuar el de un
 * compañero. Ruth lo reportó como dos puntos distintos, el 4 y el 5, y son la
 * misma causa.
 *
 * Lo que queda en el navegador es solo el último estado, para sobrevivir a una
 * recarga o a un corte de red sin perder lo escrito. Manda el servidor.
 *
 * No se guardan los resultados de búsqueda: al recuperar se vuelven a buscar,
 * porque las tarifas pueden haber cambiado y un precio viejo es peor que
 * esperar dos segundos.
 */

const CLAVE = "oravia_borrador_solicitud";
/** Un borrador de hace más de una semana ya no interesa a nadie. */
const CADUCA_EN_DIAS = 7;

export interface BorradorSolicitud {
  guardadoEn: string;
  /**
   * Solicitud ya creada en la base por un cierre que no llegó a terminar. Es el
   * único dato del borrador que no es "lo que ha escrito la persona": sin él, el
   * reintento tras recargar crearía otra solicitud y otro trato en el CRM.
   */
  solicitudId?: string | null;
  /** Para qué cliente se cotiza: cambia qué tarifas se ofrecen. */
  canal?: "GENERIC" | "SWISS_TTOO";
  mensajes: string[];
  redaccion: string;
  form: ParseTripRequestInput;
  entendido: NormalizedRequestDraft | null;
  tope: number | null;
  requisitos: string[];
  elegidos: string[];
  programaBase: string[];
  excepciones: Record<number, { fuera: string[]; dentro: string[] }>;
}

function almacen(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Navegador con almacenamiento bloqueado: la app sigue, solo sin borrador.
    return null;
  }
}

export function guardarBorrador(borrador: Omit<BorradorSolicitud, "guardadoEn">): void {
  const store = almacen();
  if (!store) return;
  // Sin nada escrito no hay borrador que guardar.
  const vacio = borrador.mensajes.length === 0 && !borrador.redaccion.trim() && !borrador.entendido;
  if (vacio) {
    store.removeItem(CLAVE);
    return;
  }
  try {
    store.setItem(CLAVE, JSON.stringify({ ...borrador, guardadoEn: new Date().toISOString() }));
  } catch {
    // Cuota llena: no vale la pena romper la pantalla por esto.
  }
}

export function leerBorrador(): BorradorSolicitud | null {
  const store = almacen();
  if (!store) return null;
  const crudo = store.getItem(CLAVE);
  if (!crudo) return null;
  try {
    const borrador = JSON.parse(crudo) as BorradorSolicitud;
    const edad = Date.now() - new Date(borrador.guardadoEn).getTime();
    if (!Number.isFinite(edad) || edad > CADUCA_EN_DIAS * 86_400_000) {
      store.removeItem(CLAVE);
      return null;
    }
    return borrador;
  } catch {
    store.removeItem(CLAVE);
    return null;
  }
}

export function borrarBorrador(): void {
  almacen()?.removeItem(CLAVE);
}

/** "hace un momento", "hace 12 minutos", "ayer": para poder decidir si recuperarlo. */
export function haceCuanto(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(minutos) || minutos < 1) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "ayer" : `hace ${dias} días`;
}

/**
 * Un nombre con el que reconocer el borrador en la lista sin abrirlo.
 *
 * Se compone de lo que ya se sabe: el centro, el destino y las fechas. Si no se
 * sabe nada todavía, las primeras palabras del mensaje pegado. Un borrador que
 * se llame «Borrador» no sirve de nada en una lista de quince.
 */
export function tituloDelBorrador(borrador: Omit<BorradorSolicitud, "guardadoEn">): string {
  const centro = borrador.form.centreName?.trim();
  const destino = borrador.entendido?.destinationText?.trim();
  const desde = borrador.entendido?.dateFrom?.trim();

  const partes = [centro, destino, desde].filter(Boolean);
  if (partes.length > 0) return partes.join(" · ");

  const primerMensaje = (borrador.mensajes[0] ?? borrador.redaccion ?? "").trim();
  if (primerMensaje) return `${primerMensaje.split(/\s+/).slice(0, 8).join(" ")}…`;

  return "Solicitud sin empezar";
}

/** Si no hay nada escrito, no hay borrador que guardar ni que listar. */
export function estaVacio(borrador: Omit<BorradorSolicitud, "guardadoEn">): boolean {
  return borrador.mensajes.length === 0 && !borrador.redaccion.trim() && !borrador.entendido;
}
