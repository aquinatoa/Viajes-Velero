/**
 * Reconocer en una respuesta que el colegio acepta una opción.
 *
 * El correo que manda la app dice, literal: «Respondiendo a este correo nos
 * decís cuál preferís y seguimos adelante». Así que el colegio contesta por
 * correo —no pulsa el botón de la página pública, que es la ÚNICA vía que hoy
 * marca la opción elegida—. Resultado: contestan «nos quedamos con la 2» y no
 * se entera nadie, el reloj del depósito no arranca y la oportunidad de Zoho
 * se queda como estaba.
 *
 * Esto lee la respuesta y dice qué opción parece que aceptan. Y para el resto
 * de este fichero hay una sola regla, que es la que lo hace utilizable:
 *
 *   **Nunca decide. Propone.**
 *
 * Marcar una opción arranca el plazo del depósito y mueve la fase en el CRM de
 * un cliente. Equivocarse ahí no es un fallo de pantalla: es reclamarle dinero
 * a un colegio por un hotel que no pidió. Así que lo que sale de aquí se le
 * enseña a una persona con el trozo de texto en el que se ha fijado, y esa
 * persona confirma.
 */

export interface OpcionDelMensaje {
  /** El número de opción, 1 a 3. */
  numero: number;
  /** El trozo del mensaje en el que se ha fijado, para poder discutirlo. */
  porque: string;
  /**
   * Cómo de claro está. `alta` cuando dicen el número junto a un verbo de
   * aceptar; `media` cuando solo se reconoce el hotel o solo el número.
   */
  confianza: "alta" | "media";
}

function sinTildes(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** El trozo de frase donde está la pista, recortado para poder enseñarlo. */
function recorte(texto: string, indice: number): string {
  const desde = Math.max(0, indice - 45);
  const hasta = Math.min(texto.length, indice + 55);
  return (desde > 0 ? "…" : "") + texto.slice(desde, hasta).trim() + (hasta < texto.length ? "…" : "");
}

/**
 * Lo que la gente escribe cuando acepta: «nos quedamos con», «elegimos»,
 * «aceptamos», «preferimos», «nos interesa», «cogemos», «nos decantamos por».
 */
const ACEPTA =
  /(nos\s+quedamos\s+con|escogemos|elegimos|eleg[ií]|aceptamos|acepto|preferimos|prefiero|nos\s+interesa|nos\s+quedamos|cogemos|nos\s+decantamos\s+por|optamos\s+por|confirmamos|nos\s+vamos\s+a\s+quedar\s+con)/i;

/**
 * Una negación cerca cambia el sentido. «La 2 no nos vale» no es aceptar la 2,
 * y sin mirarlo se marcaría la opción que acaban de descartar.
 */
const NIEGA = /\b(no|ninguna|descartamos|descartad|nada de|en vez de|en lugar de)\b/i;

/**
 * La opción que el mensaje parece aceptar, o null.
 *
 * `nombresPorOpcion` son los alojamientos de cada opción: mucha gente no dice
 * el número, dice el hotel. Se pasan desde fuera porque cambian con cada
 * propuesta.
 */
export function opcionAceptadaEn(
  mensaje: string,
  nombresPorOpcion: Record<number, string> = {},
): OpcionDelMensaje | null {
  const texto = String(mensaje ?? "").trim();
  if (!texto) return null;

  const plano = sinTildes(texto.toLowerCase());

  // 1) El número, dicho como se dice: «la opción 2», «la opción número 2»,
  //    «opcion dos», o simplemente «nos quedamos con la 2».
  const numeros: Record<string, number> = { uno: 1, una: 1, dos: 2, tres: 3, primera: 1, segunda: 2, tercera: 3 };
  const patron = /(?:la\s+)?opci[o]n(?:\s+n[u]mero)?\s+(\d|uno|una|dos|tres|primera|segunda|tercera)\b|\b(?:con|elegimos|escogemos|aceptamos|preferimos)\s+la\s+(\d|primera|segunda|tercera)\b/gi;

  for (const m of plano.matchAll(patron)) {
    const crudo = (m[1] ?? m[2] ?? "").toLowerCase();
    const numero = /^\d$/.test(crudo) ? Number(crudo) : numeros[crudo];
    if (!numero || numero < 1 || numero > 3) continue;

    const alrededor = plano.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + m[0].length + 20);
    if (NIEGA.test(alrededor)) continue;

    return {
      numero,
      porque: recorte(texto, m.index ?? 0),
      confianza: ACEPTA.test(alrededor) ? "alta" : "media",
    };
  }

  // 2) El nombre del hotel. «Nos quedamos con el Santa Mónica» es lo que más
  //    escribe la gente, y sin esto se pierde.
  //
  //    Nadie escribe el nombre entero. En la base está «Hotel Santa Mónica
  //    Playa 3* (Salou)» y el colegio pone «el Santa Mónica», así que se
  //    prueban también los prefijos del nombre. Gana el más largo que aparezca:
  //    entre «Salou Park Resort I» y «Salou Park Resort II», el trozo largo es
  //    lo único que los distingue.
  let mejor: { numero: number; donde: number; largo: number } | null = null;

  for (const [n, nombre] of Object.entries(nombresPorOpcion)) {
    const limpio = sinTildes(String(nombre ?? "").toLowerCase()).trim();
    if (limpio.length < 4) continue;

    const nucleo = limpio
      .replace(/^(hotel|camping|apartamentos|aparthotel|hostal|albergue)\s+/, "")
      .replace(/\s*\d\s*\*.*$/, "")
      .replace(/\s*\(.*$/, "")
      .trim();
    if (nucleo.length < 4) continue;

    const palabras = nucleo.split(/\s+/).filter(Boolean);
    // De más largo a más corto, y nunca por debajo de dos palabras salvo que
    // sea una sola larga («Eurosalou»): «la» o «playa» sueltos valdrían para
    // cualquier cosa.
    for (let corte = palabras.length; corte >= 1; corte -= 1) {
      if (corte === 1 && (palabras.length > 1 || palabras[0].length < 6)) break;
      const clave = palabras.slice(0, corte).join(" ");
      if (clave.length < 5) break;

      const donde = plano.indexOf(clave);
      if (donde === -1) continue;

      const alrededor = plano.slice(Math.max(0, donde - 45), donde + clave.length + 25);
      if (NIEGA.test(alrededor)) break;

      if (!mejor || clave.length > mejor.largo) {
        mejor = { numero: Number(n), donde, largo: clave.length };
      }
      break;
    }
  }

  if (mejor) {
    const alrededor = plano.slice(Math.max(0, mejor.donde - 45), mejor.donde + mejor.largo + 25);
    return {
      numero: mejor.numero,
      porque: recorte(texto, mejor.donde),
      confianza: ACEPTA.test(alrededor) ? "alta" : "media",
    };
  }

  return null;
}
