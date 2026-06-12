import fs from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export interface PdfTextExtractionResult {
  /** Texto concatenado de todas las páginas del PDF. */
  text: string;
  /** Número de páginas detectadas en el documento. */
  pageCount: number;
  /** Indica si se obtuvo al menos algo de texto utilizable. */
  hasText: boolean;
}

/**
 * Extracción básica de texto de un PDF, sin IA y sin OCR.
 * Lee la capa de texto del documento; si el PDF es un escaneo sin texto,
 * el resultado tendrá hasText = false para que el llamador pueda marcar NEEDS_OCR.
 */
export async function extractPdfText(filePath: string): Promise<PdfTextExtractionResult> {
  const buffer = await fs.readFile(filePath);
  const data = new Uint8Array(buffer);

  const loadingTask = getDocument({
    data,
    useSystemFonts: true,
  });

  const pdf = await loadingTask.promise;

  try {
    const pageCount = pdf.numPages;
    const pageTexts: string[] = [];

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();

      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/[ \t]{2,}/g, " ")
        .trim();

      if (pageText.length > 0) {
        pageTexts.push(pageText);
      }

      page.cleanup();
    }

    const text = pageTexts.join("\n\n").trim();

    return {
      text,
      pageCount,
      hasText: text.replace(/\s/g, "").length > 0,
    };
  } finally {
    await pdf.cleanup();
    await loadingTask.destroy();
  }
}
