import fs from "node:fs/promises";
import path from "node:path";
import { extractPdfText } from "./pdfTextExtraction";
import { extractSpreadsheetText } from "./spreadsheetTextExtraction";

/**
 * Qué se puede hacer con un archivo subido.
 *
 * - `text`: se le saca texto y eso es lo que lee el modelo.
 * - `native`: el modelo lo mira tal cual (PDF e imágenes). Un PDF además da
 *   texto, que se envía como apoyo.
 * - `unsupported`: no se sabe leer. Se dice claramente, en vez de dejar el
 *   documento a medias sin explicar por qué.
 */
export type DocumentKind = "pdf" | "spreadsheet" | "plaintext" | "image" | "unsupported";

export interface DocumentTextExtractionResult {
  kind: DocumentKind;
  /** Texto extraído. Vacío en imágenes: ahí lee el modelo, no nosotros. */
  text: string;
  hasText: boolean;
  /** Qué se hizo, para dejarlo como incidencia del documento. */
  detail: string;
  /** Mensaje para el usuario cuando no se puede leer. */
  unsupportedReason?: string;
}

const EXTENSIONES: Record<string, DocumentKind> = {
  ".pdf": "pdf",
  ".xlsx": "spreadsheet",
  ".xlsm": "spreadsheet",
  ".xls": "spreadsheet",
  ".csv": "spreadsheet",
  ".txt": "plaintext",
  ".md": "plaintext",
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
  ".webp": "image",
  ".gif": "image",
};

/** Qué tipo de documento es, por extensión y, si no, por tipo MIME. */
export function classifyDocument(fileName: string | null, mimeType: string | null): DocumentKind {
  const extension = path.extname(fileName ?? "").toLowerCase();
  if (EXTENSIONES[extension]) return EXTENSIONES[extension];

  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("csv")) {
    return "spreadsheet";
  }
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "plaintext";

  return "unsupported";
}

/** Los formatos que el modelo puede mirar tal cual, sin extraerles texto antes. */
export function isNativelyReadable(kind: DocumentKind): boolean {
  return kind === "pdf" || kind === "image";
}

/**
 * Saca el texto de un documento, sea del formato que sea.
 *
 * Antes esto solo sabía leer PDF, aunque el selector de archivos ofreciera
 * Excel, Word, CSV e imágenes: se subía un .xlsx, la extracción lo dejaba
 * pendiente «por tipo» y el documento se quedaba muerto sin que la pantalla lo
 * explicara. Pasó el 26/08/2026 con la hoja de tarifas de MSH. Un proveedor
 * manda lo que quiere, y el trabajo de entenderlo es de la aplicación.
 */
export async function extractDocumentText(
  filePath: string,
  fileName: string | null,
  mimeType: string | null,
): Promise<DocumentTextExtractionResult> {
  const kind = classifyDocument(fileName, mimeType);

  if (kind === "pdf") {
    const resultado = await extractPdfText(filePath);
    return {
      kind,
      text: resultado.text,
      hasText: resultado.hasText,
      detail: resultado.hasText
        ? `PDF de ${resultado.pageCount} página(s); se extrajo la capa de texto.`
        : `PDF de ${resultado.pageCount} página(s) sin capa de texto. El modelo lo leerá como imagen.`,
    };
  }

  if (kind === "spreadsheet") {
    const resultado = extractSpreadsheetText(filePath);
    return {
      kind,
      text: resultado.text,
      hasText: resultado.hasText,
      detail: `Hoja de cálculo: ${resultado.sheetCount} hoja(s) y ${resultado.rowCount} fila(s) con contenido, volcadas a texto tabulado.`,
      unsupportedReason: resultado.hasText
        ? undefined
        : "La hoja de cálculo no tiene ninguna fila con contenido.",
    };
  }

  if (kind === "plaintext") {
    const contenido = await fs.readFile(filePath, "utf8");
    return {
      kind,
      text: contenido,
      hasText: contenido.trim().length > 0,
      detail: `Archivo de texto de ${contenido.length} caracteres.`,
    };
  }

  if (kind === "image") {
    // No hay texto que extraer, y no pasa nada: el modelo lee la imagen. Es lo
    // que salva una tarifa que llega como foto o como captura de pantalla.
    return {
      kind,
      text: "",
      hasText: false,
      detail: "Imagen: no se extrae texto, la lee el modelo directamente.",
    };
  }

  return {
    kind: "unsupported",
    text: "",
    hasText: false,
    detail: "Formato no soportado.",
    unsupportedReason:
      `No se sabe leer un archivo de tipo "${mimeType ?? (path.extname(fileName ?? "") || "desconocido")}". ` +
      "Se leen PDF, Excel (.xlsx/.xls/.xlsm), CSV, texto e imágenes. " +
      "Si es un Word, guárdalo como PDF y vuelve a subirlo.",
  };
}
