import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Los adjuntos de la conversación con el colegio.
 *
 * Javier, 08/10/2026: «subir un documento a la conversación con el cliente, en
 * plan de te vuelvo a enviar el presupuesto». Hasta ahora la conversación no
 * guardaba los adjuntos que mandaba el colegio (la lista de alumnos, el
 * justificante del depósito) ni dejaba adjuntar nada al responder.
 *
 * Los ficheros van al mismo almacén que el resto (`ORAVIA_STORAGE_DIR`), en
 * `correo/<id del mensaje>/`, y en la base solo queda dónde están.
 */

const prisma = new PrismaClient();

const RAIZ = path.resolve(process.env.ORAVIA_STORAGE_DIR ?? path.join(process.cwd(), "storage"), "correo");

/** Lo que se acepta por adjunto: lo mismo que admite la subida de documentos. */
export const TAMANO_MAXIMO_ADJUNTO = 25 * 1024 * 1024;

export interface AdjuntoNuevo {
  nombre: string;
  tipo: string;
  contenido: Buffer;
}

function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
  return limpio || "adjunto";
}

/**
 * De lo que trae un correo que entra, lo que es un adjunto de verdad.
 *
 * Fuera las imágenes incrustadas en el cuerpo (logos y firmas: el pie de
 * Oravia lleva diez) y lo que pase del tamaño máximo.
 */
export function adjuntosQueSeGuardan(
  adjuntos: Array<{ filename?: string | null; contentType?: string; contentDisposition?: string; related?: boolean; size?: number; content: Buffer }>,
): AdjuntoNuevo[] {
  return adjuntos
    .filter((a) => !a.related && a.contentDisposition !== "inline")
    .filter((a) => (a.size ?? a.content.length) <= TAMANO_MAXIMO_ADJUNTO)
    .map((a) => ({
      nombre: a.filename?.trim() || "adjunto",
      tipo: a.contentType || "application/octet-stream",
      contenido: a.content,
    }));
}

/** Guarda los adjuntos de un mensaje. No lanza: un adjunto no puede tumbar el correo. */
export async function guardarAdjuntos(mensajeId: string, adjuntos: AdjuntoNuevo[]): Promise<number> {
  let guardados = 0;
  for (const [indice, adjunto] of adjuntos.entries()) {
    try {
      const carpeta = path.join(RAIZ, mensajeId);
      await fs.mkdir(carpeta, { recursive: true });
      const ruta = path.join(carpeta, `${indice + 1}-${nombreSeguro(adjunto.nombre)}`);
      await fs.writeFile(ruta, adjunto.contenido);
      await prisma.correoAdjunto.create({
        data: {
          mensajeId,
          nombre: adjunto.nombre,
          tipo: adjunto.tipo,
          tamano: adjunto.contenido.length,
          ruta,
        },
      });
      guardados += 1;
    } catch (error) {
      console.error(`[correo] no se pudo guardar el adjunto «${adjunto.nombre}» del mensaje ${mensajeId}`, error);
    }
  }
  return guardados;
}

/** Un adjunto para descargarlo, o null si no existe o el fichero se ha perdido. */
export async function leerAdjunto(id: string): Promise<{ nombre: string; tipo: string; ruta: string } | null> {
  const fila = await prisma.correoAdjunto.findUnique({ where: { id } });
  if (!fila) return null;
  try {
    await fs.access(fila.ruta);
  } catch {
    return null;
  }
  return { nombre: fila.nombre, tipo: fila.tipo, ruta: fila.ruta };
}
