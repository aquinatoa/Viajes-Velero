/**
 * Evalúa una forma de leer documentos contra el catálogo publicado.
 *
 *   node --import tsx scripts/lectura/evaluar.ts                  # solo enseña qué haría
 *   node --import tsx scripts/lectura/evaluar.ts --gastar         # lee de verdad y compara
 *
 * Variables que la configuran (todas opcionales salvo la clave para --gastar):
 *
 *   EVAL_ANTHROPIC_API_KEY   clave de Neointec para la evaluación. NUNCA la de
 *                            Oravia: medir es trabajo nuestro y no se le carga.
 *   EVAL_MODEL               modelo a probar (por defecto el de AI_MODEL o claude-opus-5)
 *   EVAL_CITA_POR_FILA=1     prueba la variante de cita por fila en hojas de cálculo
 *   EVAL_DOCUMENTO=<id>      evalúa solo ese documento de la referencia
 *   EVAL_ADJUNTOS=<carpeta>  dónde están los PDF originales (por nombre de fichero);
 *                            sin ellos un PDF se lee solo con el texto, que es peor
 *
 * La referencia se saca antes con `scripts/lectura/exportar-referencia.mjs`.
 *
 * Cada lectura cuesta dinero de verdad. Sin `--gastar` no se llama al modelo:
 * se enseña el tamaño de cada documento y la estimación, y se para.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { analyzeDocumentText } from "../../server/aiDocumentAnalysis";
import { compararLectura, type TarifaDeReferencia } from "../../server/compararLectura";
import { costeEstimado, pensamientoEstimado } from "../../server/consumoIa";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const carpeta = path.join(raiz, "tests", "fixtures", "lectura");

interface Fixture {
  id: string;
  nombre: string;
  originalFileName: string | null;
  fileMimeType: string | null;
  context: Record<string, unknown>;
  texto: string;
  referencia: TarifaDeReferencia[];
}

const gastar = process.argv.includes("--gastar");
const soloDocumento = (process.env.EVAL_DOCUMENTO ?? "").trim();
const adjuntos = (process.env.EVAL_ADJUNTOS ?? "").trim();

if (!fs.existsSync(path.join(carpeta, "indice.json"))) {
  console.error("No hay referencia. Primero: node scripts/lectura/exportar-referencia.mjs");
  process.exit(1);
}

const fixtures: Fixture[] = fs
  .readdirSync(carpeta)
  .filter((f) => f.endsWith(".json") && f !== "indice.json")
  .map((f) => JSON.parse(fs.readFileSync(path.join(carpeta, f), "utf8")) as Fixture)
  .filter((f) => !soloDocumento || f.id === soloDocumento);

if (fixtures.length === 0) {
  console.error("No hay documentos que evaluar.");
  process.exit(1);
}

// La configuración de la lectura se inyecta por entorno, que es como la lee
// `aiDocumentAnalysis`. La clave de Oravia que haya en el .env se tapa SIEMPRE.
process.env.AI_PROVIDER = "anthropic";
process.env.ANTHROPIC_API_KEY = (process.env.EVAL_ANTHROPIC_API_KEY ?? "").trim();
if (process.env.EVAL_MODEL) process.env.AI_MODEL = process.env.EVAL_MODEL;
process.env.AI_CITA_POR_FILA = process.env.EVAL_CITA_POR_FILA === "1" ? "1" : "0";

const modelo = (process.env.AI_MODEL ?? "").trim() || "claude-opus-5";
const variante = process.env.AI_CITA_POR_FILA === "1" ? "cita-por-fila" : "actual";

console.log(`Modelo: ${modelo}   Variante: ${variante}   Documentos: ${fixtures.length}`);
console.log("");
for (const f of fixtures) {
  const tokensAprox = Math.round(f.texto.length / 3.5);
  console.log(
    `  ${f.nombre.padEnd(46)} ${String(f.referencia.length).padStart(4)} tarifas de referencia   ~${tokensAprox.toLocaleString("es-ES")} tokens de texto`,
  );
}

if (!gastar) {
  console.log("\nSin --gastar no se llama al modelo. Añádelo para leer de verdad (cuesta dinero).");
  process.exit(0);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("\nFalta EVAL_ANTHROPIC_API_KEY. No se usa la clave de Oravia para evaluar.");
  process.exit(1);
}

console.log("\nLeyendo…\n");
const filas: string[] = [];
let totalDolares = 0;

for (const f of fixtures) {
  const esPdf = (f.fileMimeType ?? "").includes("pdf");
  const adjunto = esPdf && adjuntos && f.originalFileName ? path.join(adjuntos, f.originalFileName) : undefined;
  if (esPdf && (!adjunto || !fs.existsSync(adjunto))) {
    console.log(`  ! ${f.nombre}: PDF sin fichero original (EVAL_ADJUNTOS). Se lee solo con el texto; esperable peor.`);
  }

  const inicio = Date.now();
  let resultado;
  try {
    resultado = await analyzeDocumentText({
      text: f.texto,
      attachmentPath: adjunto && fs.existsSync(adjunto) ? adjunto : undefined,
      context: f.context as never,
    });
  } catch (error) {
    console.log(`  x ${f.nombre}: ${(error as Error).message}`);
    continue;
  }
  const segundos = Math.round((Date.now() - inicio) / 1000);

  const comparacion = compararLectura(resultado, f.referencia);
  const uso = resultado.usage;
  const coste = uso ? costeEstimado(uso) : null;
  const pensamiento = uso ? pensamientoEstimado(uso) : null;
  if (coste) totalDolares += coste.dolares;

  console.log(`  ${f.nombre}`);
  console.log(
    `     cobertura laxa ${(comparacion.laxa.cobertura * 100).toFixed(1)}%  precisión laxa ${(comparacion.laxa.precision * 100).toFixed(1)}%   ` +
      `estricta ${(comparacion.estricta.cobertura * 100).toFixed(1)}% / ${(comparacion.estricta.precision * 100).toFixed(1)}%   ` +
      `(${comparacion.extraidas} extraídas de ${comparacion.referencia})`,
  );
  if (uso && coste && pensamiento) {
    console.log(
      `     ${uso.calls} llamadas · entrada ${uso.inputTokens.toLocaleString("es-ES")} · caché ${uso.cacheReadTokens.toLocaleString("es-ES")} · ` +
        `salida ${uso.outputTokens.toLocaleString("es-ES")} (pensamiento ~${pensamiento.tokens.toLocaleString("es-ES")}) · ` +
        `${coste.dolares.toFixed(2)} $ · ${segundos}s`,
    );
  }
  const peores = comparacion.porProducto.filter((p) => p.faltan.length || p.sobran.length).slice(0, 6);
  for (const p of peores) {
    console.log(
      `       - ${p.producto}: ${p.encontradas}/${p.referencia}` +
        (p.faltan.length ? `  faltan ${p.faltan.slice(0, 8).join(", ")}${p.faltan.length > 8 ? "…" : ""}` : "") +
        (p.sobran.length ? `  sobran ${p.sobran.slice(0, 8).join(", ")}${p.sobran.length > 8 ? "…" : ""}` : ""),
    );
  }
  for (const aviso of resultado.warnings.slice(0, 4)) console.log(`       · ${aviso}`);

  filas.push(
    [
      new Date().toISOString(),
      modelo,
      variante,
      f.nombre,
      comparacion.referencia,
      comparacion.extraidas,
      comparacion.laxa.cobertura,
      comparacion.laxa.precision,
      comparacion.estricta.cobertura,
      comparacion.estricta.precision,
      uso?.calls ?? "",
      uso?.inputTokens ?? "",
      uso?.cacheReadTokens ?? "",
      uso?.outputTokens ?? "",
      pensamiento?.tokens ?? "",
      coste?.dolares ?? "",
      segundos,
    ].join("\t"),
  );
}

// Cada corrida se apunta en un TSV que crece: es la tabla con la que se decide.
const registro = path.join(carpeta, "resultados.tsv");
if (!fs.existsSync(registro)) {
  fs.writeFileSync(
    registro,
    "fecha\tmodelo\tvariante\tdocumento\treferencia\textraidas\tcob_laxa\tprec_laxa\tcob_estricta\tprec_estricta\tllamadas\tentrada\tcache\tsalida\tpensamiento\tdolares\tsegundos\n",
    "utf8",
  );
}
fs.appendFileSync(registro, filas.join("\n") + "\n", "utf8");
console.log(`\nTotal estimado de esta corrida: ${totalDolares.toFixed(2)} $. Resultados apuntados en ${path.relative(raiz, registro)}`);
