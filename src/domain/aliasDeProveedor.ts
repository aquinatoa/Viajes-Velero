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
  if (variantes.some((v) => normalizados.some((c) => c.includes(v)))) return true;

  // Lo que sigue es para quien escribe el nombre «a su manera» (Sports,
  // 16/11/2026): «med 1» no encontraba «Mediterrània MED1», «med 3» no
  // encontraba «MED2/3» y «cambrils par», a medio escribir, no encontraba nada.

  // 1) Lo mismo sin espacios ni signos: «med 1» es «MED1», «med 2» es «MED2/3».
  const pegado = soloLetrasYCifras(normalizarNombre(texto));
  if (pegado.length >= 3 && normalizados.some((c) => soloLetrasYCifras(c).includes(pegado))) return true;

  // 2) Palabra a palabra, en cualquier orden, contando con los otros nombres
  //    del proveedor: «cambrils park med 1» encuentra el MED1 aunque el
  //    alojamiento no lleve «Cambrils Park» en el nombre. Cada palabra tiene
  //    que EMPEZAR alguna palabra del alojamiento («par» es «park», no
  //    «apartamentos»); una cifra suelta vale en cualquier parte («3» en
  //    «MED2/3»). Con una sola palabra no se amplía nada: ya se buscó arriba.
  const escritas = normalizarNombre(texto).split(/[^a-z0-9]+/).filter(Boolean);
  const palabras = escritas.flatMap((p) => p.match(/[a-z]+|[0-9]+/g) ?? []);
  // «med3» escrito junto también cuenta como dos («med» y «3»), pero «4r» no:
  // con una sola letra se colaría medio catálogo.
  const juntaNombreYCifra = escritas.length === 1 && /^[a-z]{3,}[0-9]+$/.test(escritas[0]);
  if (escritas.length < 2 && !juntaNombreYCifra) return false;
  const propias = normalizados.flatMap(enPalabras);
  for (const grupo of GRUPOS_DE_PROVEEDOR) {
    const nombres = terminosDelGrupo(grupo);
    const suyos = grupo.propios.map(normalizarNombre);
    const esDelGrupo = normalizados.some(
      (c) => Boolean(c) && (nombres.some((n) => c.includes(n)) || suyos.some((s) => c.includes(s))),
    );
    if (esDelGrupo) nombres.forEach((n) => propias.push(...enPalabras(n)));
  }
  const cifras = propias.join(" ").replace(/[^0-9]+/g, " ");
  return palabras.every((p) =>
    /^[0-9]+$/.test(p) ? cifras.includes(p) : propias.some((w) => w.startsWith(p)),
  );
}

/** «med2/3» → «med23»: sin espacios ni signos. */
function soloLetrasYCifras(valor: string): string {
  return valor.replace(/[^a-z0-9]+/g, "");
}

/** «Villa Bonita / Aloha» → villa, bonita, aloha. Y «med1» → med1, med, 1. */
function enPalabras(valor: string): string[] {
  const palabras = valor.split(/[^a-z0-9]+/).filter(Boolean);
  const partidas = palabras.flatMap((p) => p.match(/[a-z]+|[0-9]+/g) ?? []);
  return [...new Set([...palabras, ...partidas])];
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
