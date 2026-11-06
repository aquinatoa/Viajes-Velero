/**
 * Proveedores que el equipo de Oravia nombra de varias maneras.
 *
 * Reunión del 05/11/2026: «MSH» no enlazaba con Cambrils Park / Mediterranean
 * Sports Hub. En los correos de los clubes es «MSH»; en los documentos de
 * tarifas es «Cambrils Park»; en el catálogo los alojamientos se llaman
 * «Mediterrània MED1» o «Villa Bonita / Aloha». Quien escribía «MSH» en el
 * buscador de hoteles no encontraba nada, y en la revisión de tarifas el mismo
 * proveedor salía partido en dos.
 *
 * Esto es la tabla que lo une. Es deliberadamente una lista a mano: cada alias
 * lo ha dicho una persona de Oravia. La capa de IA que se habló en la reunión
 * (reconocer abreviaturas que nadie ha escrito aquí) cuelga de esta misma
 * tabla: lo que la IA proponga y alguien confirme se añade como un grupo más.
 *
 * Es lógica pura, sin pantalla ni base de datos: la usan el buscador de hoteles,
 * el de actividades y la revisión de tarifas, y se prueba sin levantar nada.
 */

export interface GrupoDeProveedor {
  /** Cómo se llama de verdad, tal como se muestra. */
  proveedor: string;
  /** Otras formas de nombrarlo: siglas, nombre comercial, traducciones. */
  alias: string[];
  /**
   * Alojamientos o actividades del catálogo que son suyos pero no llevan su
   * nombre. Sin esto, buscar «MSH» no puede encontrar «Villa Bonita».
   */
  propios: string[];
}

export const GRUPOS_DE_PROVEEDOR: GrupoDeProveedor[] = [
  {
    // MSH = Mediterranean Sports Hub, el complejo deportivo de Cambrils Park.
    // Los alojamientos salen de la separación de sus tarifas
    // (migración 20261015130000_separar_cambrils_suizo).
    proveedor: "Cambrils Park",
    alias: ["msh", "mediterranean sports hub", "cambrils park resort"],
    propios: ["Mediterrània", "Villa Bonita", "Aloha"],
  },
];

/** Sin tildes, sin mayúsculas, sin espacios de más: la forma de comparar. */
export function normalizarNombre(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function terminosDelGrupo(grupo: GrupoDeProveedor): string[] {
  return [grupo.proveedor, ...grupo.alias].map(normalizarNombre);
}

/**
 * Lo que hay que buscar cuando alguien escribe `texto` en un buscador.
 *
 * Es siempre lo escrito; y si lo escrito es el nombre de un proveedor conocido
 * o cualquiera de sus alias, también el resto de sus nombres y sus alojamientos.
 * La coincidencia es del texto ENTERO: «msh» activa el grupo, «mshx» o «campo
 * msh» no, para que una búsqueda a medio escribir no se amplíe por casualidad.
 */
export function variantesDeBusqueda(texto: string | null | undefined): string[] {
  const q = normalizarNombre(texto);
  if (!q) return [];

  const variantes = new Set<string>([q]);
  for (const grupo of GRUPOS_DE_PROVEEDOR) {
    const nombres = terminosDelGrupo(grupo);
    if (!nombres.includes(q)) continue;
    nombres.forEach((n) => variantes.add(n));
    grupo.propios.map(normalizarNombre).forEach((n) => variantes.add(n));
  }
  return [...variantes];
}

/** ¿Algún campo contiene lo buscado, o un alias de lo buscado? Un buscador vacío deja pasar todo. */
export function algunCampoCoincide(
  campos: Array<string | null | undefined>,
  texto: string | null | undefined,
): boolean {
  const variantes = variantesDeBusqueda(texto);
  if (variantes.length === 0) return true;
  const normalizados = campos.map(normalizarNombre);
  return variantes.some((v) => normalizados.some((c) => c.includes(v)));
}

/**
 * El nombre bueno de un proveedor: «MSH» y «Cambrils Park Resort» son
 * «Cambrils Park». Lo que no está en la tabla se devuelve tal cual, sin tocar.
 */
export function proveedorCanonico(nombre: string | null | undefined): string {
  const limpio = (nombre ?? "").trim();
  const q = normalizarNombre(limpio);
  if (!q) return limpio;
  const grupo = GRUPOS_DE_PROVEEDOR.find((g) => terminosDelGrupo(g).includes(q));
  return grupo ? grupo.proveedor : limpio;
}
