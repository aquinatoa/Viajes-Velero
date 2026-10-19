/**
 * El nombre del viaje: «AMA GUADALUPEKOA 2027».
 *
 * Ruth, 19/10/2026: la propuesta salió como «2027» en el asunto, en el correo
 * y en la página del colegio. Escribió el grupo en «Centro», pero el «Nombre
 * del viaje» se había rellenado solo («centro + año») cuando aún no había
 * centro, se quedó en «2027» y no siguió al centro.
 */

/** «CENTRO AÑO», como lo nombra Oravia en su CRM. */
export function nombreAutomatico(centro: string | null | undefined, anio: number | string | null | undefined): string {
  const c = (centro ?? "").trim().toUpperCase();
  const a = anio ? String(anio) : "";
  if (!c) return a;
  return a && !c.includes(a) ? `${c} ${a}` : c;
}

/** Un nombre que no dice nada del grupo: vacío o solo un año. */
export function esNombreVacio(nombre: string | null | undefined): boolean {
  const n = (nombre ?? "").trim();
  return !n || /^\d{4}$/.test(n);
}

/**
 * Si al cambiar el centro hay que rehacer el nombre: cuando está vacío, es solo
 * un año o es el automático del centro anterior. Si alguien lo escribió a
 * mano, se respeta.
 */
export function siguientesNombre(
  nombreActual: string | null | undefined,
  centroAnterior: string | null | undefined,
  centroNuevo: string | null | undefined,
  anio: number | string | null | undefined,
): string {
  const actual = (nombreActual ?? "").trim();
  const eraAutomatico = esNombreVacio(actual) || actual === nombreAutomatico(centroAnterior, anio);
  return eraAutomatico ? nombreAutomatico(centroNuevo, anio) : actual;
}

/**
 * El título que va al asunto, al correo, a la página del colegio y al PDF. Si
 * el nombre no dice nada (solo un año), el centro; y si tampoco, el destino.
 */
export function tituloDelViaje(datos: {
  opportunityName?: string | null;
  centreName?: string | null;
  destinationText?: string | null;
  dateFrom?: Date | string | null;
}): string {
  const nombre = (datos.opportunityName ?? "").trim();
  if (!esNombreVacio(nombre)) return nombre;
  const fecha = datos.dateFrom ? new Date(datos.dateFrom) : null;
  const anio = fecha && !Number.isNaN(fecha.getTime()) ? fecha.getUTCFullYear() : nombre || null;
  if ((datos.centreName ?? "").trim()) return nombreAutomatico(datos.centreName, anio);
  return nombre || (datos.destinationText ?? "").trim() || "vuestro viaje";
}
