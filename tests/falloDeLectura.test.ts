/**
 * Si la última lectura de un documento falló, la tarjeta de «Siguiente paso»
 * tiene que decirlo, con el motivo y qué hacer.
 *
 * El caso que obliga a esto es el Excel de actividades de Oravia, 28/09/2026:
 * seis incidencias guardadas —tres fallos del proveedor con su motivo— y la
 * pantalla diciendo «Lee el documento, tarda un par de minutos». Javier:
 * «queda pendiente de revisión, pero no sabemos cómo revisarlo. Al final no te
 * da indicaciones».
 *
 * Cómo correrla:  npm run test:fallo-lectura
 */
import assert from "node:assert/strict";

import { etiquetaDeFallo, ultimoFalloDeLectura, type IncidenciaParaLeer } from "../src/domain/falloDeLectura";

let pasadas = 0;
let fallidas = 0;

function prueba(nombre: string, cuerpo: () => void) {
  try {
    cuerpo();
    pasadas += 1;
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallidas += 1;
    console.error(`  FALLA  ${nombre}`);
    console.error(`        ${(error as Error).message.split("\n")[0]}`);
  }
}

const i = (
  issueType: string,
  createdAt: string,
  extra: Partial<IncidenciaParaLeer> = {},
): IncidenciaParaLeer => ({
  issueType,
  createdAt,
  severity: issueType.includes("FAILED") ? "ERROR" : "INFO",
  message: `mensaje de ${issueType}`,
  resolved: false,
  ...extra,
});

// Las seis del Excel de actividades, tal como las devuelve la API: de la más
// nueva a la más antigua.
const EXCEL_DE_ACTIVIDADES: IncidenciaParaLeer[] = [
  i("AI_ANALYSIS_FAILED_SIN_SALDO", "2026-09-29T08:27:39Z", {
    message:
      "No se pudo leer el documento: La cuenta de Anthropic no tiene saldo: el documento no se ha leído. El proveedor dijo: «Your credit balance is too low…». Recargar la cuenta en la consola de Anthropic (Plans & Billing) y volver a lanzar la lectura.",
  }),
  i("TEXT_ALREADY_EXTRACTED", "2026-09-29T08:23:07Z"),
  i("AI_ANALYSIS_FAILED", "2026-09-28T10:29:31Z"),
  i("TEXT_ALREADY_EXTRACTED", "2026-09-28T10:24:48Z", { resolved: true }),
  i("AI_ANALYSIS_FAILED", "2026-09-28T09:58:20Z"),
  i("TEXT_EXTRACTED", "2026-09-28T09:53:47Z"),
];

console.log("\nEl caso de Javier");

prueba("tres fallos y ninguna lectura buena después: se enseña el último, con su motivo", () => {
  const f = ultimoFalloDeLectura(EXCEL_DE_ACTIVIDADES);
  assert.ok(f);
  assert.equal(f.motivo, "SIN_SALDO");
  assert.equal(f.titulo, "La cuenta de IA no tiene saldo");
  assert.match(f.mensaje, /Plans & Billing/);
});

prueba("un fallo sin motivo conocido sale como fallo de lectura a secas", () => {
  const f = ultimoFalloDeLectura([i("AI_ANALYSIS_FAILED", "2026-09-28T10:29:31Z")]);
  assert.equal(f?.motivo, "DESCONOCIDO");
  assert.equal(f?.titulo, "La última lectura falló");
});

console.log("\nCuándo NO se enseña");

prueba("si después del fallo hubo una lectura que creó candidatos, el fallo es historia", () => {
  const f = ultimoFalloDeLectura([
    i("STAGING_CANDIDATES_CREATED", "2026-10-07T10:00:00Z"),
    ...EXCEL_DE_ACTIVIDADES,
  ]);
  assert.equal(f, null);
});

prueba("una incidencia resuelta no cuenta", () => {
  const f = ultimoFalloDeLectura([i("AI_ANALYSIS_FAILED_SIN_SALDO", "2026-09-29T08:27:39Z", { resolved: true })]);
  assert.equal(f, null);
});

prueba("un aviso (WARNING) no es un fallo", () => {
  const f = ultimoFalloDeLectura([i("STAGING_AMBIGUOUS_DATA", "2026-09-29T08:27:39Z", { severity: "WARNING" })]);
  assert.equal(f, null);
});

prueba("sin incidencias, nada", () => {
  assert.equal(ultimoFalloDeLectura([]), null);
});

console.log("\nSin fecha, manda el orden del array");

prueba("la primera es la más nueva", () => {
  const f = ultimoFalloDeLectura([
    i("STAGING_CANDIDATES_CREATED", "", { createdAt: null }),
    i("AI_ANALYSIS_FAILED", "", { createdAt: null }),
  ]);
  assert.equal(f, null);
  const g = ultimoFalloDeLectura([
    i("AI_ANALYSIS_FAILED", "", { createdAt: null }),
    i("STAGING_CANDIDATES_CREATED", "", { createdAt: null }),
  ]);
  assert.ok(g);
});

console.log("\nLas etiquetas de la pestaña de incidencias");

prueba("los tipos de fallo tienen nombre legible, y los demás no se tocan", () => {
  assert.equal(etiquetaDeFallo("AI_ANALYSIS_FAILED_SIN_SALDO"), "La cuenta de IA no tiene saldo");
  assert.equal(etiquetaDeFallo("AI_ANALYSIS_FAILED"), "Fallo de lectura con IA");
  assert.equal(etiquetaDeFallo("PDF_EXTRACTION_FAILED"), "No se pudo sacar el texto del fichero");
  assert.equal(etiquetaDeFallo("STAGING_CANDIDATES_CREATED"), null);
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
