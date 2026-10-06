/**
 * Cuánto cuesta leer documentos, en tokens y en dinero.
 *
 * Lo que de verdad se factura lo sabe solo la consola de Anthropic. Esto es
 * una ESTIMACIÓN a partir de las cuatro cifras de consumo que devuelve cada
 * llamada y de una tabla de precios que hay que mantener a mano. Se dice así
 * en pantalla, siempre: «estimado», con la fecha de los precios.
 *
 * Lo que sí es exacto son los tokens, y el reparto entre documentos y meses.
 *
 * El saldo restante NO se puede consultar por API —solo existe en la consola—,
 * así que aquí no se promete. Lo que se puede es avisar en el momento en que el
 * proveedor conteste «sin saldo» (ver `erroresIa.ts`).
 */

/**
 * Precio por millón de tokens, en dólares, por modelo. Fuente: la tabla de
 * precios de Anthropic cacheada el 25/09/2026 en la guía de la API. La lectura
 * de caché se cobra a una fracción del precio de entrada; la escritura, un
 * poco más que la entrada. Modelos que no estén aquí se estiman con el precio
 * del modelo por defecto y se marcan como tales.
 */
export const PRECIOS_POR_MILLON: Record<
  string,
  { entrada: number; salida: number; cacheLectura: number; cacheEscritura: number }
> = {
  "claude-opus-5": { entrada: 5, salida: 25, cacheLectura: 0.5, cacheEscritura: 6.25 },
  "claude-opus-5-5": { entrada: 4, salida: 20, cacheLectura: 0.2, cacheEscritura: 5 },
  "claude-sonnet-5-5": { entrada: 2, salida: 10, cacheLectura: 0.2, cacheEscritura: 2.5 },
  "claude-sonnet-5": { entrada: 2, salida: 10, cacheLectura: 0.2, cacheEscritura: 2.5 },
  "claude-sonnet-4-5": { entrada: 3, salida: 15, cacheLectura: 0.3, cacheEscritura: 3.75 },
  "claude-haiku-4-5": { entrada: 1, salida: 5, cacheLectura: 0.1, cacheEscritura: 1.25 },
};

export const FECHA_DE_LOS_PRECIOS = "2026-09-25";
const MODELO_DE_REFERENCIA = "claude-opus-5";

export interface ConsumoDeUnaLectura {
  modelo: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  outputChars: number;
}

export interface CosteEstimado {
  /** Dólares, con dos decimales. */
  dolares: number;
  /** El modelo cuyos precios se han usado. */
  modeloDePrecio: string;
  /** true si el modelo no estaba en la tabla y se usó el de referencia. */
  aproximado: boolean;
}

/** Coste estimado de una lectura, con el desglose que explica de dónde sale. */
export function costeEstimado(c: ConsumoDeUnaLectura): CosteEstimado {
  const conocido = PRECIOS_POR_MILLON[c.modelo];
  const precio = conocido ?? PRECIOS_POR_MILLON[MODELO_DE_REFERENCIA];
  const dolares =
    (c.inputTokens / 1e6) * precio.entrada +
    (c.outputTokens / 1e6) * precio.salida +
    (c.cacheReadTokens / 1e6) * precio.cacheLectura +
    (c.cacheCreationTokens / 1e6) * precio.cacheEscritura;
  return {
    dolares: Math.round(dolares * 100) / 100,
    modeloDePrecio: conocido ? c.modelo : MODELO_DE_REFERENCIA,
    aproximado: !conocido,
  };
}

/**
 * Cuánto de la salida fue, estimativamente, pensamiento del modelo.
 *
 * El proveedor factura el razonamiento como tokens de salida pero no lo
 * devuelve. Lo que sí devuelve es el texto, y un token de JSON en español son
 * unos 3,5 caracteres. La diferencia entre lo facturado y lo que cabe en el
 * texto es razonamiento. Es una estimación gruesa; sirve para ver si el
 * esfuerzo del modelo está desproporcionado para transcribir una tabla.
 */
export function pensamientoEstimado(c: ConsumoDeUnaLectura): { tokens: number; fraccion: number } {
  const tokensDeTexto = Math.round(c.outputChars / 3.5);
  const tokens = Math.max(0, c.outputTokens - tokensDeTexto);
  const fraccion = c.outputTokens > 0 ? Math.round((tokens / c.outputTokens) * 100) / 100 : 0;
  return { tokens, fraccion };
}

export interface LecturaRegistrada extends ConsumoDeUnaLectura {
  id: string;
  sourceDocumentId: string;
  documento: string;
  resultado: string;
  variante: string | null;
  error: string | null;
  llamadas: number;
  iniciadaEn: Date;
  terminadaEn: Date;
}

export interface ResumenDeConsumo {
  precios: { fecha: string; nota: string };
  total: TotalDeConsumo;
  /** Solo lo que terminó bien: es lo que produjo catálogo. */
  completadas: TotalDeConsumo;
  /** Lo que se pagó sin obtener nada. */
  fallidas: TotalDeConsumo;
  porMes: Array<{ mes: string } & TotalDeConsumo>;
  porDocumento: Array<{ sourceDocumentId: string; documento: string; lecturas: number } & TotalDeConsumo>;
  ultimas: Array<{
    id: string;
    documento: string;
    terminadaEn: string;
    resultado: string;
    modelo: string;
    variante: string | null;
    llamadas: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    pensamientoEstimado: number;
    dolaresEstimados: number;
    error: string | null;
  }>;
}

export interface TotalDeConsumo {
  lecturas: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  dolaresEstimados: number;
}

function totalVacio(): TotalDeConsumo {
  return { lecturas: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, dolaresEstimados: 0 };
}

function sumar(t: TotalDeConsumo, l: ConsumoDeUnaLectura): void {
  t.lecturas += 1;
  t.inputTokens += l.inputTokens;
  t.outputTokens += l.outputTokens;
  t.cacheReadTokens += l.cacheReadTokens;
  t.cacheCreationTokens += l.cacheCreationTokens;
  t.dolaresEstimados = Math.round((t.dolaresEstimados + costeEstimado(l).dolares) * 100) / 100;
}

/** Mes de una fecha en formato AAAA-MM, en hora local del servidor. */
function mesDe(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** El resumen que enseña el panel. Es puro: recibe las filas, devuelve números. */
export function resumirConsumo(lecturas: LecturaRegistrada[]): ResumenDeConsumo {
  const total = totalVacio();
  const completadas = totalVacio();
  const fallidas = totalVacio();
  const meses = new Map<string, TotalDeConsumo>();
  const documentos = new Map<string, { sourceDocumentId: string; documento: string } & TotalDeConsumo>();

  for (const l of lecturas) {
    sumar(total, l);
    sumar(l.resultado === "OK" ? completadas : fallidas, l);

    const mes = mesDe(l.terminadaEn);
    if (!meses.has(mes)) meses.set(mes, totalVacio());
    sumar(meses.get(mes)!, l);

    if (!documentos.has(l.sourceDocumentId)) {
      documentos.set(l.sourceDocumentId, {
        sourceDocumentId: l.sourceDocumentId,
        documento: l.documento,
        ...totalVacio(),
      });
    }
    sumar(documentos.get(l.sourceDocumentId)!, l);
  }

  const ultimas = [...lecturas]
    .sort((a, b) => b.terminadaEn.getTime() - a.terminadaEn.getTime())
    .slice(0, 50)
    .map((l) => ({
      id: l.id,
      documento: l.documento,
      terminadaEn: l.terminadaEn.toISOString(),
      resultado: l.resultado,
      modelo: l.modelo,
      variante: l.variante,
      llamadas: l.llamadas,
      inputTokens: l.inputTokens,
      outputTokens: l.outputTokens,
      cacheReadTokens: l.cacheReadTokens,
      cacheCreationTokens: l.cacheCreationTokens,
      pensamientoEstimado: pensamientoEstimado(l).tokens,
      dolaresEstimados: costeEstimado(l).dolares,
      error: l.error,
    }));

  return {
    precios: {
      fecha: FECHA_DE_LOS_PRECIOS,
      nota: "Coste estimado con la tabla de precios de Anthropic; lo facturado de verdad está en su consola. El saldo restante no se puede consultar por API.",
    },
    total,
    completadas,
    fallidas,
    porMes: [...meses.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([mes, t]) => ({ mes, ...t })),
    porDocumento: [...documentos.values()]
      .map((d) => ({ ...d, lecturas: d.lecturas }))
      .sort((a, b) => b.dolaresEstimados - a.dolaresEstimados),
    ultimas,
  };
}
