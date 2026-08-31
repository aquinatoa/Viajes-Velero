import XLSXModule from "xlsx";

const XLSX = XLSXModule as typeof import("xlsx");

export interface SpreadsheetTextExtractionResult {
  /** Las hojas convertidas a texto tabulado, listas para el modelo. */
  text: string;
  /** Cuántas hojas tenía el libro. */
  sheetCount: number;
  /** Cuántas filas con contenido se volcaron en total. */
  rowCount: number;
  hasText: boolean;
}

/** Celdas vacías al final de una fila: no aportan nada y ensucian la tabla. */
function recortarFinal(celdas: string[]): string[] {
  const copia = [...celdas];
  while (copia.length > 0 && copia[copia.length - 1] === "") {
    copia.pop();
  }
  return copia;
}

function normalizar(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).replace(/\s+/g, " ").trim();
}

/**
 * Convierte un Excel o un CSV en texto tabulado que el modelo pueda leer.
 *
 * Una hoja de cálculo YA es una tabla: no hay maquetación que interpretar ni
 * orden de lectura que reconstruir, que es lo que hace difícil un PDF. Basta
 * con volcarla en filas y columnas conservando la cabecera, y el modelo la lee
 * mejor que cualquier PDF, sin necesidad de mirarla como imagen.
 *
 * Se conserva el número de fila del Excel a propósito: cuando al revisar una
 * tarifa haya que ir al origen, «fila 214» es una instrucción; «por ahí en
 * medio», no.
 */
export function extractSpreadsheetText(filePath: string): SpreadsheetTextExtractionResult {
  const libro = XLSX.readFile(filePath, { cellDates: true });
  const trozos: string[] = [];
  let rowCount = 0;

  for (const nombreHoja of libro.SheetNames) {
    const hoja = libro.Sheets[nombreHoja];
    if (!hoja) continue;

    const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
      header: 1,
      blankrows: false,
      defval: "",
      raw: false,
    });

    const lineas: string[] = [];
    for (const [indice, fila] of filas.entries()) {
      const celdas = recortarFinal((fila ?? []).map(normalizar));
      if (celdas.length === 0) continue;
      // El número es el de la hoja de cálculo (1-based), para poder decir
      // "mira la fila 214" y que cuadre con lo que se ve en Excel.
      lineas.push(`${indice + 1} | ${celdas.join(" | ")}`);
      rowCount += 1;
    }

    if (lineas.length === 0) continue;

    trozos.push(
      [
        `### Hoja «${nombreHoja}» · ${lineas.length} fila(s) con contenido`,
        "",
        "Formato: número de fila del Excel, y después las celdas separadas por «|».",
        "La primera fila suele ser la cabecera de columnas.",
        "",
        ...lineas,
      ].join("\n"),
    );
  }

  const text = trozos.join("\n\n").trim();

  return {
    text,
    sheetCount: libro.SheetNames.length,
    rowCount,
    hasText: text.length > 0,
  };
}
