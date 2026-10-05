/**
 * Qué hay relleno en la oportunidad de Zoho, y qué no.
 *
 * Ruth lo reportó con todas las letras: «no rellena ningún campo de la
 * oportunidad como fecha entrada y salida, número de pasajeros, importe
 * depósito, tipo de pago y forma de cobro. Lo pone todo en la descripción».
 * Eso ya se corrigió al crear el trato, pero desde la app no había forma de
 * comprobarlo: había que abrir Zoho y mirar campo por campo.
 *
 * Este módulo traduce el trato crudo de la API a lo que se lee en pantalla, y
 * —esto es lo que importa— **enseña también lo vacío**. Una ficha que solo
 * lista lo relleno no sirve para lo que hace falta aquí, que es ver de un
 * vistazo si el trato de la app se distingue de los que ellos rellenan a mano.
 *
 * `Tipo_de_Pago` sale a propósito aunque esté siempre vacío: es una condición
 * que se pacta con cada colegio y la app no la sabe. Verlo vacío es correcto,
 * y esconderlo haría creer que no existe.
 */

export interface CampoDelTrato {
  /** Cómo se llama en la pantalla de Zoho. */
  etiqueta: string;
  /** Lo que hay, ya legible. Cadena vacía si no hay nada. */
  valor: string;
  /** Lo rellena la app al crear el trato. */
  loPoneLaApp: boolean;
  /** Por qué está vacío, cuando la app no lo rellena a propósito. */
  nota?: string;
}

/**
 * Los campos que se enseñan, en el orden en que se leen.
 *
 * No son todos los del módulo: son los del viaje y los del cobro, que es lo
 * que Ruth echó en falta. El resto de Zoho no lo tocamos y enseñarlo solo
 * llenaría la columna.
 */
const CAMPOS: { api: string; etiqueta: string; loPoneLaApp: boolean; nota?: string }[] = [
  { api: "Deal_Name", etiqueta: "Nombre", loPoneLaApp: true },
  { api: "Stage", etiqueta: "Fase", loPoneLaApp: true },
  { api: "Account_Name", etiqueta: "Cuenta", loPoneLaApp: true },
  { api: "Contact_Name", etiqueta: "Contacto", loPoneLaApp: true },
  { api: "Contacto_grupo", etiqueta: "Contacto del grupo", loPoneLaApp: true },
  { api: "Departamento", etiqueta: "Departamento", loPoneLaApp: true },
  { api: "Idioma", etiqueta: "Idioma", loPoneLaApp: true },
  { api: "Fecha_llegada_actividad", etiqueta: "Llegada", loPoneLaApp: true },
  { api: "Fecha_salida_actividad", etiqueta: "Salida", loPoneLaApp: true },
  { api: "Closing_Date", etiqueta: "Fecha de cierre", loPoneLaApp: true },
  { api: "N_mero_de_personas", etiqueta: "Nº de personas", loPoneLaApp: true },
  { api: "Profesor_entrenador", etiqueta: "Profesores", loPoneLaApp: true },
  { api: "Edad_participantes", etiqueta: "Edad de los participantes", loPoneLaApp: true },
  { api: "Amount", etiqueta: "Importe", loPoneLaApp: true },
  { api: "Forma_de_Cobro", etiqueta: "Forma de cobro", loPoneLaApp: true },
  { api: "Importe_Dep_sito_New", etiqueta: "Importe del depósito", loPoneLaApp: true },
  {
    api: "Tipo_de_Pago",
    etiqueta: "Tipo de pago",
    loPoneLaApp: false,
    // Ponerlo por defecto llenaría 900 tratos de un dato que nadie ha decidido.
    nota: "Se pacta con cada colegio: la app no lo rellena",
  },
  { api: "Owner", etiqueta: "Propietario", loPoneLaApp: false },
];

/** Un valor de Zoho, legible. Los enlaces a otro registro vienen como objeto. */
export function valorLegible(bruto: unknown): string {
  if (bruto === null || bruto === undefined) return "";
  if (typeof bruto === "number") return String(bruto);
  if (typeof bruto === "boolean") return bruto ? "Sí" : "No";
  if (typeof bruto === "string") return bruto.trim();
  if (Array.isArray(bruto)) return bruto.map(valorLegible).filter(Boolean).join(", ");
  if (typeof bruto === "object") {
    // Cuenta, contacto y propietario llegan como { id, name }. El id no se
    // enseña: no dice nada a quien mira.
    const o = bruto as Record<string, unknown>;
    return String(o.name ?? o.display_value ?? o.full_name ?? "").trim();
  }
  return "";
}

/**
 * Los campos del trato, rellenos y vacíos.
 *
 * Se devuelven TODOS los de la lista, con `valor` vacío cuando no hay nada:
 * lo que falta es justo lo que hay que ver.
 */
export function camposDelTrato(trato: Record<string, unknown> | null | undefined): CampoDelTrato[] {
  const datos = trato ?? {};
  return CAMPOS.map((c) => ({
    etiqueta: c.etiqueta,
    valor: valorLegible(datos[c.api]),
    loPoneLaApp: c.loPoneLaApp,
    ...(c.nota ? { nota: c.nota } : {}),
  }));
}

/** Los nombres de API que hay que pedirle a Zoho. */
export const CAMPOS_QUE_SE_PIDEN: string[] = CAMPOS.map((c) => c.api);

/**
 * Cuántos de los que rellena la app están de verdad rellenos.
 *
 * Es el número que contesta a la queja de Ruth de un vistazo: «15 de 16».
 */
export function cuentaDeRellenos(campos: CampoDelTrato[]): { rellenos: number; total: number } {
  const nuestros = campos.filter((c) => c.loPoneLaApp);
  return { rellenos: nuestros.filter((c) => c.valor !== "").length, total: nuestros.length };
}
