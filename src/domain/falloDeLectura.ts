/**
 * Si la última lectura de un documento falló, y por qué.
 *
 * Javier, el 29/09: «queda pendiente de revisión, pero no sabemos cómo
 * revisarlo. Al final no te da indicaciones». El documento tenía SEIS
 * incidencias guardadas —tres fallos del proveedor, con el motivo— y ninguna
 * salía en la tarjeta de «Siguiente paso», que seguía diciendo «Lee el
 * documento, tarda un par de minutos» como si no hubiera pasado nada. Las
 * incidencias estaban en una pestaña que nadie abre cuando cree que algo está
 * en marcha.
 *
 * Esto mira las incidencias y contesta a una sola pregunta: ¿lo último que
 * pasó fue un fallo? Si sí, la tarjeta lo dice con el motivo del proveedor y
 * qué hacer. Si después del fallo hubo una lectura que creó candidatos, el
 * fallo es historia y no se enseña.
 *
 * Las incidencias llegan de la API de la más nueva a la más antigua, y traen
 * `createdAt` aunque el tipo del front no lo declarara. Se usa cuando está; si
 * no, manda el orden del array.
 */

export interface IncidenciaParaLeer {
  severity: string;
  issueType: string;
  message: string;
  resolved: boolean;
  createdAt?: string | null;
}

export interface FalloDeLectura {
  /** Etiqueta corta del motivo: SIN_SALDO, CLAVE, MODELO, LIMITE, PETICION, RESPUESTA, PROVEEDOR, RED, EXTRACCION, DESCONOCIDO. */
  motivo: string;
  /** Lo que se pone en grande. */
  titulo: string;
  /** El mensaje de la incidencia, que ya trae el texto del proveedor y la acción. */
  mensaje: string;
}

/** Los tipos de incidencia que significan «la lectura no terminó». */
const TIPOS_DE_FALLO = /^(AI_ANALYSIS_FAILED|PDF_EXTRACTION_FAILED|NO_TEXT_LAYER)/;

/** Los tipos que significan «hubo una lectura que llegó al final». */
const TIPOS_DE_EXITO = new Set([
  "STAGING_CANDIDATES_CREATED",
  "STAGING_REGENERATED",
  "AI_ANALYSIS_EXECUTED",
  "PUBLISH_COMPLETED",
]);

const TITULOS: Record<string, string> = {
  SIN_SALDO: "La cuenta de IA no tiene saldo",
  CLAVE: "La clave de la IA no vale",
  MODELO: "El modelo configurado no existe",
  LIMITE: "El proveedor de IA ha limitado el uso",
  PETICION: "El proveedor de IA ha rechazado la lectura",
  RESPUESTA: "La IA contestó en un formato que no se pudo leer",
  PROVEEDOR: "El proveedor de IA ha fallado",
  RED: "No se pudo conectar con el proveedor de IA",
  EXTRACCION: "No se pudo sacar el texto del fichero",
  DESCONOCIDO: "La última lectura falló",
};

function motivoDe(issueType: string): string {
  if (issueType.startsWith("PDF_EXTRACTION_FAILED") || issueType === "NO_TEXT_LAYER") return "EXTRACCION";
  const sufijo = issueType.replace(/^AI_ANALYSIS_FAILED_?/, "");
  return sufijo && TITULOS[sufijo] ? sufijo : "DESCONOCIDO";
}

/** Etiqueta legible de un tipo de incidencia de fallo, para la pestaña de incidencias. */
export function etiquetaDeFallo(issueType: string): string | null {
  if (!TIPOS_DE_FALLO.test(issueType)) return null;
  const motivo = motivoDe(issueType);
  return motivo === "DESCONOCIDO" ? "Fallo de lectura con IA" : TITULOS[motivo];
}

function instante(i: IncidenciaParaLeer, posicion: number, total: number): number {
  if (i.createdAt) {
    const t = Date.parse(i.createdAt);
    if (!Number.isNaN(t)) return t;
  }
  // Sin fecha, el orden del array manda: la primera es la más nueva.
  return total - posicion;
}

export function ultimoFalloDeLectura(incidencias: IncidenciaParaLeer[]): FalloDeLectura | null {
  let fallo: { i: IncidenciaParaLeer; t: number } | null = null;
  let exito: number | null = null;

  incidencias.forEach((i, posicion) => {
    const t = instante(i, posicion, incidencias.length);
    if (!i.resolved && (i.severity === "ERROR" || i.severity === "CRITICAL") && TIPOS_DE_FALLO.test(i.issueType)) {
      if (!fallo || t > fallo.t) fallo = { i, t };
    }
    if (TIPOS_DE_EXITO.has(i.issueType)) {
      if (exito === null || t > exito) exito = t;
    }
  });

  if (!fallo) return null;
  const f: { i: IncidenciaParaLeer; t: number } = fallo;
  if (exito !== null && exito > f.t) return null;

  const motivo = motivoDe(f.i.issueType);
  return { motivo, titulo: TITULOS[motivo], mensaje: f.i.message };
}
