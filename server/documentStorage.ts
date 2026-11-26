import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// Dónde viven los ficheros. `ORAVIA_STORAGE_DIR` lo mueve entero: lo usan las
// pruebas para no ensuciar `storage/`, y hará falta en Azure, donde el disco que
// sobrevive a un despliegue no es el de la aplicación.
const STORAGE_ROOT = path.resolve(
  process.env.ORAVIA_STORAGE_DIR ?? path.join(process.cwd(), "storage"),
  "inventory-documents",
);

export interface StoredInventoryFile {
  originalFileName: string;
  storedFilePath: string;
  fileMimeType: string;
  fileSizeBytes: number;
  fileHash: string;
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 160);
}

export async function saveInventoryDocumentFile(input: {
  documentId: string;
  originalFileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<StoredInventoryFile> {
  const documentFolder = path.join(STORAGE_ROOT, input.documentId);
  await fs.mkdir(documentFolder, { recursive: true });

  const safeName = sanitizeFileName(input.originalFileName);
  const fileHash = crypto.createHash("sha256").update(input.buffer).digest("hex");
  const storedFileName = `${Date.now()}-${fileHash.slice(0, 12)}-${safeName}`;
  const storedFilePath = path.join(documentFolder, storedFileName);

  await fs.writeFile(storedFilePath, input.buffer);

  return {
    originalFileName: input.originalFileName,
    storedFilePath,
    fileMimeType: input.mimeType,
    fileSizeBytes: input.buffer.length,
    fileHash,
  };
}
/**
 * Dónde está hoy el archivo guardado de un documento. La ruta se guardó
 * absoluta al subirlo; si el disco se movió (otro despliegue, otra carpeta de
 * `storage/`), se busca el mismo nombre en la carpeta del documento.
 */
export async function rutaDelArchivoGuardado(documentId: string, storedFilePath: string): Promise<string | null> {
  const candidatas = [storedFilePath, path.join(STORAGE_ROOT, documentId, path.basename(storedFilePath))];
  for (const ruta of candidatas) {
    try {
      const datos = await fs.stat(ruta);
      if (datos.isFile()) return ruta;
    } catch {
      // No está ahí: se prueba la siguiente.
    }
  }
  return null;
}
