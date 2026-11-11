/**
 * El color de cada fase, el mismo que Oravia ve en su CRM.
 *
 * Lo señaló Anthony (11/11/2026) al ver la pantalla de Oportunidades: «los estados
 * no tienen alineado los colores que se tienen dentro de CRM». Cada fase del
 * embudo tiene su color en Zoho y se mira todos los días: pintarla de otro color
 * aquí obliga a traducir entre dos pantallas que dicen lo mismo.
 *
 * Todo puro: recibe las fases con su color y devuelve las ternas «r, g, b» que
 * usa el CSS (`--c` para el fondo y el borde, `--ci` para el texto, más oscuro).
 * Si Zoho no contestó o una fase no tiene color, NO se inventa uno parecido: se
 * devuelve null y quien pinta usa el color propio.
 */
import type { EstadoDeOportunidad } from "./oportunidadesVista";

export type ColoresDeFase = Record<string, string>;

/** La clave con la que se buscan las fases: sin tildes, sin mayúsculas, sin espacios de más. */
export function claveDeFase(fase: string | null | undefined): string {
  return String(fase ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Las fases con su color (como las manda el servidor), listas para buscar por nombre. */
export function indexarColores(fases: { nombre: string; color: string | null }[] | null | undefined): ColoresDeFase {
  const mapa: ColoresDeFase = {};
  for (const f of fases ?? []) if (f.color) mapa[claveDeFase(f.nombre)] = f.color;
  return mapa;
}

/** «#d89412» o «d89412» → [216, 148, 18]. Null si no es un color de seis cifras. */
export function rgbDeHex(hex: string | null | undefined): [number, number, number] | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec((hex ?? "").trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null;
}

/** Luminancia relativa (0 negro, 1 blanco). */
function luminancia([r, g, b]: [number, number, number]): number {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Mezcla un color con negro: `parte` = cuánto negro (0 nada, 1 todo). */
function oscurecer([r, g, b]: [number, number, number], parte: number): [number, number, number] {
  const k = 1 - parte;
  return [Math.round(r * k), Math.round(g * k), Math.round(b * k)];
}

export interface TonosDeFase {
  /** Fondo, borde y barra: «216, 148, 18», para rgba(). */
  c: string;
  /** Texto sobre un fondo suave de ese color: el mismo tono, más oscuro hasta que se lea. */
  ci: string;
}

/**
 * Los tonos de una fase. El texto se oscurece lo justo para que se lea sobre su
 * propio fondo suave: un amarillo del CRM tal cual no se lee sobre blanco.
 */
export function tonosDeFase(fase: string | null | undefined, colores: ColoresDeFase): TonosDeFase | null {
  const rgb = rgbDeHex(colores[claveDeFase(fase)]);
  if (!rgb) return null;
  // Cuanto más claro es el color, más hay que oscurecerlo para el texto.
  const parte = Math.min(0.72, Math.max(0.35, 0.35 + luminancia(rgb) * 0.5));
  return { c: rgb.join(", "), ci: oscurecer(rgb, parte).join(", ") };
}

/** Las variables CSS de una fase, o undefined si el CRM no le da color (entonces manda el de la app). */
export function estiloDeFase(
  fase: string | null | undefined,
  colores: ColoresDeFase,
): Record<"--c" | "--ci", string> | undefined {
  const t = tonosDeFase(fase, colores);
  return t ? { "--c": t.c, "--ci": t.ci } : undefined;
}

/**
 * Qué fases del CRM hay dentro de cada estado de la pantalla. Los seis estados
 * son una agrupación nuestra; las fases y sus colores son del CRM. Cada pestaña
 * toma el color de su fase principal (la primera) y enseña los de las demás.
 */
export const FASES_DEL_ESTADO: Record<EstadoDeOportunidad, string[]> = {
  sin_enviar: ["Preparando Presupuesto", "Nueva"],
  esperando: ["Presupuesto Enviado", "Seguimiento al Presupuesto", "Lista de Espera"],
  aceptada: ["Pendiente de deposito", "Pendiente de pago resto"],
  ganada: ["Oportunidad Ganada"],
  perdida: ["Oportunidad Perdida"],
};

/** La fase que da su color a la pestaña de un estado. */
export function faseDelColorDelEstado(estado: EstadoDeOportunidad): string {
  return FASES_DEL_ESTADO[estado][0];
}
