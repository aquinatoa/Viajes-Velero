/**
 * Clientes especiales: lo que comparten la pantalla y el servidor.
 *
 * Desde el 19/10/2026 viven en la base de datos (`server/clientesEspeciales.ts`).
 * Aquí, lo que no depende de ella: comparar nombres, fabricar el código con el
 * que se guardan sus tarifas y decir el canal en palabras.
 */
import { CLIENTES_ESPECIALES, type ClienteEspecial } from "./documentImportTypes";

export function normalizarNombre(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** El mismo cliente escrito de otra manera: «Azul Marino» y «AZUL MARINO». */
export function mismoCliente(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizarNombre(a);
  return x !== "" && x === normalizarNombre(b);
}

/**
 * Si el nombre que se ha leído de un documento es de un cliente que ya existe:
 * por su nombre o por lo que dice su detalle («Destination · Travelclub» es el
 * turoperador suizo). Pide al menos 5 letras para no casar por casualidad.
 */
export function pareceElMismo(cliente: ClienteEspecial, leido: string): boolean {
  const n = normalizarNombre(leido);
  if (n.length < 5) return mismoCliente(cliente.nombre, leido);
  const nombre = normalizarNombre(cliente.nombre);
  const detalle = normalizarNombre(cliente.detalle);
  return n === nombre || (nombre.length >= 5 && n.includes(nombre)) || (detalle.length >= 5 && (detalle.includes(n) || n.includes(detalle)));
}

/**
 * El código con el que se guardan sus tarifas: el nombre en mayúsculas, sin
 * tildes ni espacios («AZUL_MARINO»). Si ya existe, con un número detrás.
 */
export function codigoDeClienteEspecial(nombre: string, usados: Set<string>): string {
  const base =
    normalizarNombre(nombre).toUpperCase().replace(/ /g, "_").slice(0, 30).replace(/_+$/, "") || "CLIENTE";
  const reservado = (c: string) => usados.has(c) || c === "GENERIC";
  if (!reservado(base)) return base;
  for (let i = 2; ; i += 1) {
    const codigo = `${base}_${i}`;
    if (!reservado(codigo)) return codigo;
  }
}

/** El canal en palabras: «Cualquier cliente» o «Cliente especial · Azul Marino». */
export function nombreDelCanal(
  codigo: string | null | undefined,
  clientes: ClienteEspecial[] = CLIENTES_ESPECIALES,
  general = "Cualquier cliente",
): string {
  const c = (codigo ?? "").trim();
  if (!c || c === "GENERIC") return general;
  const especial = clientes.find((x) => x.codigo === c);
  return `Cliente especial · ${especial ? especial.nombre : c}`;
}
