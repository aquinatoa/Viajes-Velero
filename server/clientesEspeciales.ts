import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import type { ClienteEspecial } from "../src/domain/documentImportTypes";
import { codigoDeClienteEspecial, mismoCliente, pareceElMismo } from "../src/domain/clientesEspeciales";
import { loQueSeLeEnsena, preguntarAlModelo, type FicheroDeCotizacion } from "./cotizacionDelProveedor";

/**
 * Los clientes especiales: los que tienen precio propio pactado.
 *
 * Hasta el 19/10/2026 eran dos fijos en el código (el turoperador suizo y Azul
 * Marino) y añadir otro era tocar código. Anthony, al revisar: «hay que poner
 * cualquier cliente, cliente especial y pedir los datos del cliente especial o
 * tomarlos del documento». Ahora viven en la base de datos y se dan de alta al
 * subir su tarifa. Los dos de antes conservan su código (SWISS_TTOO,
 * AZUL_MARINO): es lo que llevan guardado sus tarifas.
 */

const prisma = new PrismaClient();

function aDominio(fila: { codigo: string; nombre: string; detalle: string | null; porcentajeSobrePvp: unknown }): ClienteEspecial {
  const porcentaje = fila.porcentajeSobrePvp === null || fila.porcentajeSobrePvp === undefined ? null : Number(fila.porcentajeSobrePvp);
  return {
    codigo: fila.codigo,
    nombre: fila.nombre,
    detalle: fila.detalle ?? "",
    porcentajeSobrePvp: porcentaje !== null && Number.isFinite(porcentaje) ? porcentaje : null,
  };
}

export async function listarClientesEspeciales(): Promise<ClienteEspecial[]> {
  const filas = await prisma.clienteEspecial.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } });
  return filas.map(aDominio);
}

export async function codigosDeClientesEspeciales(): Promise<string[]> {
  return (await listarClientesEspeciales()).map((c) => c.codigo);
}

/** Lo que falta o no vale para dar de alta un cliente. Vacío = vale. */
export function problemasDelAlta(datos: { nombre?: unknown; porcentajeSobrePvp?: unknown }): string[] {
  const problemas: string[] = [];
  const nombre = typeof datos.nombre === "string" ? datos.nombre.trim() : "";
  if (!nombre) problemas.push("Falta el nombre del cliente.");
  if (nombre.length > 80) problemas.push("El nombre es demasiado largo (máximo 80 caracteres).");
  const p = datos.porcentajeSobrePvp;
  if (p !== null && p !== undefined && p !== "") {
    const n = Number(p);
    if (!Number.isFinite(n) || n <= -100 || n > 100) {
      problemas.push("El porcentaje tiene que estar entre −99 y 100 (−10 = un 10 % menos que el PVP general).");
    }
  }
  return problemas;
}

/**
 * Da de alta un cliente especial. Si ya hay uno con el mismo nombre (sin
 * mirar tildes ni mayúsculas), devuelve ese: subir dos tarifas del mismo
 * cliente no debe crear dos clientes.
 */
export async function crearClienteEspecial(
  datos: { nombre: string; detalle?: string | null; porcentajeSobrePvp?: number | null },
  usuario: string | null,
): Promise<{ cliente: ClienteEspecial; nuevo: boolean }> {
  const nombre = datos.nombre.trim();
  const existentes = await listarClientesEspeciales();
  const igual = existentes.find((c) => mismoCliente(c.nombre, nombre));
  if (igual) return { cliente: igual, nuevo: false };

  const usados = new Set((await prisma.clienteEspecial.findMany({ select: { codigo: true } })).map((c) => c.codigo));
  const codigo = codigoDeClienteEspecial(nombre, usados);
  const fila = await prisma.clienteEspecial.create({
    data: {
      codigo,
      nombre,
      detalle: datos.detalle?.trim() || null,
      porcentajeSobrePvp: datos.porcentajeSobrePvp ?? null,
      creadoPor: usuario,
    },
  });
  return { cliente: aDominio(fila), nuevo: true };
}

const SISTEMA = [
  "Lees tarifas de venta que una agencia de viajes escolares y deportivos (Oravia) tiene pactadas con un cliente concreto: un turoperador, una agencia, un club.",
  "Tu trabajo es decir PARA QUÉ CLIENTE es la tarifa: el que compra, no el hotel ni el proveedor que la emite.",
  "Si el documento no lo dice, no lo inventes: deja el nombre vacío.",
  "Responde SOLO con un objeto JSON, sin texto antes ni después.",
].join(" ");

const INSTRUCCIONES = [
  "Devuelve este JSON:",
  "{",
  '  "nombre": el nombre del cliente para el que es la tarifa (corto, como lo llamaría la agencia: «Turoperador suizo», «Azul Marino»), o "" si no lo dice,',
  '  "detalle": quién es, en pocas palabras (marca comercial, país, tipo de cliente), o "",',
  '  "cita": la frase del documento donde aparece, copiada tal cual, o "",',
  '  "aviso": algo que haya que comprobar, o ""',
  "}",
].join("\n");

/**
 * Lee el documento que se va a subir y dice para qué cliente es. El fichero se
 * deja en una carpeta temporal solo para leerlo y se borra al terminar: el
 * documento de verdad se guarda después, al subirlo.
 */
export async function detectarClienteEnDocumento(fichero: FicheroDeCotizacion): Promise<{
  nombre: string;
  detalle: string;
  cita: string;
  aviso: string;
  existente: ClienteEspecial | null;
}> {
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), "oravia-cliente-"));
  const ruta = path.join(carpeta, "documento" + path.extname(fichero.nombre).toLowerCase());
  try {
    await fs.writeFile(ruta, fichero.contenido);
    const visto = await loQueSeLeEnsena(fichero, ruta);
    if (visto.problema) throw new Error(visto.problema);
    const bruto = (await preguntarAlModelo(
      visto.bloques,
      [INSTRUCCIONES, visto.texto.trim() ? `\nTexto del documento:\n${visto.texto.slice(0, 60000)}` : ""].join("\n"),
      SISTEMA,
    )) as Record<string, unknown>;
    const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const nombre = texto(bruto?.nombre);
    const existentes = await listarClientesEspeciales();
    return {
      nombre,
      detalle: texto(bruto?.detalle),
      cita: texto(bruto?.cita),
      aviso: texto(bruto?.aviso),
      existente: nombre ? existentes.find((c) => pareceElMismo(c, nombre)) ?? null : null,
    };
  } finally {
    await fs.rm(carpeta, { recursive: true, force: true });
  }
}
