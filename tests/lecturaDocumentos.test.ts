/**
 * Las piezas nuevas de la lectura de documentos, sin tocar al proveedor:
 *
 *   - la cita por número de fila (`citaDeFila`): el literal se reconstruye
 *     desde la extracción guardada, y nunca pisa lo que el modelo citó;
 *   - el mensaje de error (`erroresIa`): el motivo del proveedor se conserva,
 *     y «sin saldo» se lee como «sin saldo»;
 *   - el consumo (`consumoIa`): coste estimado con las cuatro cifras, el
 *     pensamiento estimado y el resumen por mes y por documento;
 *   - la comparación con el catálogo (`compararLectura`): cobertura y precisión
 *     laxas y estrictas, y el desglose por producto que caza los precios
 *     colgados del producto de al lado.
 *
 * Cómo correrla:  npm run test:lectura
 * No necesita base de datos ni red: todo es función pura.
 */
import assert from "node:assert/strict";

import { completarCitasDesdeFilas, indiceDeFilas, literalDeFila, tieneFilas } from "../server/citaDeFila";
import { mensajeDeErrorDelProveedor } from "../server/erroresIa";
import { costeEstimado, pensamientoEstimado, resumirConsumo } from "../server/consumoIa";
import { compararLectura, huella } from "../server/compararLectura";
import type { AiDocumentAnalysisResult } from "../src/domain/documentImportTypes";

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

function analisisVacio(): AiDocumentAnalysisResult {
  return {
    mode: "ai",
    detectedAccommodations: [],
    detectedActivities: [],
    candidateRates: [],
    candidateActivityRates: [],
    candidateSupplements: [],
    candidatePolicies: [],
    candidateBlackoutDates: [],
    warnings: [],
    confidence: 0,
    usage: null,
    rawModelOutput: null,
  } as unknown as AiDocumentAnalysisResult;
}

const HOJA = [
  "### Hoja «Tarifas» · 3 fila(s) con contenido",
  "",
  "1 | Proveedor / Centro | Zona | Actividad | Grupo (pax) | Precio",
  "2 | Club Nàutic Salou | Salou · Puerto deportivo | Banana | Hasta 10 pax | 12",
  "3 | Club Nàutic Salou | Salou · Puerto deportivo | Kayak |  | 15",
].join("\n");

console.log("\nLa cita por número de fila");

prueba("reconoce una hoja con filas numeradas, y un PDF no", () => {
  assert.equal(tieneFilas(HOJA), true);
  assert.equal(tieneFilas("Adulto 25 € 36 € 38 € 15 16 17 18"), false);
});

prueba("el literal de una fila va sin el número, sin celdas vacías y separado por puntos", () => {
  const filas = indiceDeFilas(HOJA);
  assert.equal(literalDeFila(filas, 3), "Club Nàutic Salou · Salou · Puerto deportivo · Kayak · 15");
  assert.equal(literalDeFila(filas, 99), null);
});

prueba("rellena rawText desde sourceRow solo donde falta", () => {
  const a = analisisVacio();
  a.candidateActivityRates.push(
    { activityName: "Banana", sourceRow: 2, rawText: null } as never,
    { activityName: "Kayak", sourceRow: 3, rawText: "lo que citó el modelo" } as never,
    { activityName: "Sin fila", sourceRow: null, rawText: null } as never,
  );
  const rellenadas = completarCitasDesdeFilas(a, HOJA);
  assert.equal(rellenadas, 1);
  assert.equal(a.candidateActivityRates[0].rawText, "Club Nàutic Salou · Salou · Puerto deportivo · Banana · Hasta 10 pax · 12");
  assert.equal(a.candidateActivityRates[1].rawText, "lo que citó el modelo");
  assert.equal(a.candidateActivityRates[2].rawText, null);
});

prueba("con un texto sin filas no hace nada", () => {
  const a = analisisVacio();
  a.candidateRates.push({ accommodationName: "X", sourceRow: 2, rawText: null } as never);
  assert.equal(completarCitasDesdeFilas(a, "texto plano de un pdf"), 0);
  assert.equal(a.candidateRates[0].rawText, null);
});

console.log("\nEl mensaje de error conserva el motivo del proveedor");

prueba("«sin saldo» se lee como sin saldo, con la acción, y no como «revisa el modelo»", () => {
  const m = mensajeDeErrorDelProveedor({
    estado: 400,
    tipo: "BadRequestError",
    mensaje:
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
  });
  assert.equal(m.motivo, "SIN_SALDO");
  assert.match(m.texto, /no tiene saldo/);
  assert.match(m.texto, /credit balance is too low/);
  assert.match(m.accion ?? "", /Plans & Billing/);
  assert.doesNotMatch(m.texto, /revisa el modelo/);
});

prueba("un 400 que no es de saldo pega el texto del proveedor", () => {
  const m = mensajeDeErrorDelProveedor({ estado: 400, mensaje: '400 {"error":{"message":"max_tokens: 128000 > 64000"}}' });
  assert.equal(m.motivo, "PETICION");
  assert.match(m.texto, /max_tokens: 128000 > 64000/);
});

prueba("clave, modelo, límite y red tienen cada uno su motivo", () => {
  assert.equal(mensajeDeErrorDelProveedor({ estado: 401 }).motivo, "CLAVE");
  assert.equal(mensajeDeErrorDelProveedor({ estado: 404 }).motivo, "MODELO");
  assert.equal(mensajeDeErrorDelProveedor({ estado: 429 }).motivo, "LIMITE");
  assert.equal(mensajeDeErrorDelProveedor({ estado: 503 }).motivo, "PROVEEDOR");
  assert.equal(mensajeDeErrorDelProveedor({ mensaje: "ECONNRESET" }).motivo, "RED");
});

console.log("\nEl consumo");

prueba("el coste suma las cuatro cifras con los precios del modelo", () => {
  const c = costeEstimado({
    modelo: "claude-opus-5",
    inputTokens: 1_000_000,
    outputTokens: 100_000,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    outputChars: 0,
  });
  assert.equal(c.dolares, 7.5); // 5 + 2.5
  assert.equal(c.aproximado, false);
});

prueba("un modelo desconocido se estima con el de referencia y se marca", () => {
  const c = costeEstimado({ modelo: "claude-futuro-9", inputTokens: 1_000_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputChars: 0 });
  assert.equal(c.aproximado, true);
  assert.equal(c.modeloDePrecio, "claude-opus-5");
});

prueba("el pensamiento es lo facturado que no cabe en el texto devuelto", () => {
  const p = pensamientoEstimado({ modelo: "claude-opus-5", inputTokens: 0, outputTokens: 10_000, cacheCreationTokens: 0, cacheReadTokens: 0, outputChars: 7_000 });
  assert.equal(p.tokens, 8_000); // 7000 chars ≈ 2000 tokens de texto
  assert.equal(p.fraccion, 0.8);
});

prueba("el resumen separa completadas de fallidas y agrupa por mes y documento", () => {
  const base = { modelo: "claude-opus-5", cacheCreationTokens: 0, cacheReadTokens: 0, outputChars: 0, variante: null, error: null, llamadas: 1 };
  const r = resumirConsumo([
    { ...base, id: "a", sourceDocumentId: "d1", documento: "Hoteles", resultado: "OK", inputTokens: 1_000_000, outputTokens: 0, iniciadaEn: new Date("2026-09-10T10:00:00"), terminadaEn: new Date("2026-09-10T10:05:00") },
    { ...base, id: "b", sourceDocumentId: "d2", documento: "Actividades", resultado: "FALLIDA", inputTokens: 200_000, outputTokens: 0, iniciadaEn: new Date("2026-10-05T10:00:00"), terminadaEn: new Date("2026-10-05T10:01:00"), error: "sin saldo" },
  ]);
  assert.equal(r.total.lecturas, 2);
  assert.equal(r.completadas.lecturas, 1);
  assert.equal(r.fallidas.lecturas, 1);
  assert.equal(r.fallidas.dolaresEstimados, 1);
  assert.deepEqual(r.porMes.map((m) => m.mes), ["2026-10", "2026-09"]);
  assert.equal(r.porDocumento[0].documento, "Hoteles");
  assert.equal(r.ultimas[0].error, "sin saldo");
});

console.log("\nLa comparación con el catálogo");

const REFERENCIA = [
  { producto: "1 día Caribe Aquatic Park", tipo: "ACTIVITY" as const, etiqueta: "Adulto · Periodo A", periodo: null, importe: 25 },
  { producto: "1 día Caribe Aquatic Park", tipo: "ACTIVITY" as const, etiqueta: "Adulto · Periodo B", periodo: null, importe: 36 },
  { producto: "1 día Ferrari Land", tipo: "ACTIVITY" as const, etiqueta: "Adulto · Periodo A", periodo: null, importe: 32 },
];

prueba("la huella iguala acentos, mayúsculas y signos", () => {
  assert.equal(huella("1 día Caribe Aquatic Park"), huella("1 DIA CARIBE AQUATIC-PARK"));
});

prueba("una lectura perfecta da cobertura y precisión 1", () => {
  const a = analisisVacio();
  a.candidateActivityRates.push(
    { activityName: "1 día Caribe Aquatic Park", salePvpAmount: 25, seasonName: "Periodo A", ageLabel: "Adulto" } as never,
    { activityName: "1 día Caribe Aquatic Park", salePvpAmount: 36, seasonName: "Periodo B", ageLabel: "Adulto" } as never,
    { activityName: "1 día Ferrari Land", salePvpAmount: 32, seasonName: "Periodo A", ageLabel: "Adulto" } as never,
  );
  const r = compararLectura(a, REFERENCIA);
  assert.equal(r.laxa.cobertura, 1);
  assert.equal(r.laxa.precision, 1);
  assert.equal(r.estricta.cobertura, 1);
});

prueba("el precio de Ferrari colgado de Caribe sale como falta en uno y sobra en otro", () => {
  const a = analisisVacio();
  a.candidateActivityRates.push(
    { activityName: "1 día Caribe Aquatic Park", salePvpAmount: 25 } as never,
    { activityName: "1 día Caribe Aquatic Park", salePvpAmount: 32 } as never, // el de Ferrari
  );
  const r = compararLectura(a, REFERENCIA);
  assert.equal(r.laxa.coincidencias, 1);
  assert.equal(r.laxa.cobertura, Math.round((1 / 3) * 1000) / 1000);
  const caribe = r.porProducto.find((p) => p.producto === "1 día Caribe Aquatic Park")!;
  assert.deepEqual(caribe.faltan, [36]);
  assert.deepEqual(caribe.sobran, [32]);
  const ferrari = r.porProducto.find((p) => p.producto === "1 día Ferrari Land")!;
  assert.deepEqual(ferrari.faltan, [32]);
});

prueba("la estricta exige que la descripción comparta algo con la etiqueta publicada", () => {
  const a = analisisVacio();
  a.candidateActivityRates.push({ activityName: "1 día Caribe Aquatic Park", salePvpAmount: 25, seasonName: "Temporada alta", ageLabel: "Senior" } as never);
  const r = compararLectura(a, REFERENCIA);
  assert.equal(r.laxa.coincidencias, 1);
  assert.equal(r.estricta.coincidencias, 0);
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas > 0 ? 1 : 0);
