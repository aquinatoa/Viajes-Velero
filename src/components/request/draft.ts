import type { NormalizedRequestDraft, ParseTripRequestInput } from "../../domain/types";

/**
 * Borrador del lienzo.
 *
 * El asistente antiguo perdía el trabajo al cerrarse; el lienzo lo perdía al
 * recargar. Aquí se guarda lo que la persona ha escrito o elegido, para poder
 * recuperarlo tal cual.
 *
 * Se guarda en el navegador, no en el servidor: cubre el caso real (recargar,
 * cerrar la pestaña sin querer, que se cierre el portátil) sin inventar un
 * modelo de datos nuevo. Lo que NO cubre es seguir en otro ordenador; para eso
 * haría falta guardarlo en la base de datos, y es el paso siguiente.
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
