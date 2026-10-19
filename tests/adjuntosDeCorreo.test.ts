/**
 * Los adjuntos de la conversación con el colegio (Javier, 08/10/2026): qué se
 * guarda de lo que trae un correo que entra.
 *
 * Cómo correrla:  npm run test:adjuntos
 * No toca la base ni el disco: solo el filtro.
 */
import assert from "node:assert/strict";

import { adjuntosQueSeGuardan, TAMANO_MAXIMO_ADJUNTO } from "../server/adjuntosDeCorreo";

let pasadas = 0;
let fallidas = 0;

function prueba(nombre: string, cuerpo: () => void) {
  try {
    cuerpo();
    pasadas += 1;
    console.log(`  ok  ${nombre}`);
  } catch (error) {
    fallidas += 1;
    console.log(`  FALLA  ${nombre}`);
    console.log(`         ${error instanceof Error ? error.message : String(error)}`);
  }
}

const fichero = (filename: string, extra: Record<string, unknown> = {}) => ({
  filename,
  contentType: "application/pdf",
  contentDisposition: "attachment",
  related: false,
  size: 1000,
  content: Buffer.from("x"),
  ...extra,
});

prueba("la lista de alumnos y el justificante se guardan, con su nombre y tipo", () => {
  const r = adjuntosQueSeGuardan([fichero("Llista alumnes 3r ESO.xlsx", { contentType: "application/vnd.ms-excel" }), fichero("Justificant.pdf")]);
  assert.deepEqual(r.map((a) => [a.nombre, a.tipo]), [
    ["Llista alumnes 3r ESO.xlsx", "application/vnd.ms-excel"],
    ["Justificant.pdf", "application/pdf"],
  ]);
});

prueba("las imágenes de la firma (incrustadas en el cuerpo) no son adjuntos", () => {
  // El pie de Oravia lleva diez PNG incrustados: no son documentos del colegio.
  const r = adjuntosQueSeGuardan([
    fichero("1.png", { contentType: "image/png", contentDisposition: "inline", related: true }),
    fichero("logo.png", { contentType: "image/png", contentDisposition: "inline" }),
    fichero("Pressupost revisat.pdf"),
  ]);
  assert.deepEqual(r.map((a) => a.nombre), ["Pressupost revisat.pdf"]);
});

prueba("lo que pasa de 25 MB no se guarda", () => {
  assert.equal(adjuntosQueSeGuardan([fichero("video.mp4", { size: TAMANO_MAXIMO_ADJUNTO + 1 })]).length, 0);
});

prueba("un adjunto sin nombre se llama «adjunto»", () => {
  assert.equal(adjuntosQueSeGuardan([fichero("", { filename: null })])[0].nombre, "adjunto");
});

console.log(`\n${pasadas} pasada(s), ${fallidas} fallida(s)`);
if (fallidas > 0) process.exit(1);
