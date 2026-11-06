/**
 * Subrayar en el mensaje original lo que se ha usado.
 *
 * La IA da, por cada dato, la frase del texto de donde lo sacó, y el servidor ya
 * comprobó que esa frase está escrita (sin distinguir mayúsculas, acentos ni
 * saltos de línea). Aquí se localiza esa frase DENTRO del texto original para
 * subrayarla, y se reparte el subrayado cuando dos datos comparten trozo (el
 * centro y el departamento salen de la misma frase).
 *
 * Es lógica pura. Una frase que no se encuentra en este texto se ignora: no se
 * subraya nada antes que subrayar mal.
 */

export interface MarcaPedida {
  /** El dato al que pertenece (la clave de la auditoría). */
  clave: string;
  /** La frase copiada del texto. */
  cita: string;
  /** El dato no cuadra: se pinta en ámbar, no en verde. */
  aviso: boolean;
}

export interface TrozoDeTexto {
  texto: string;
  /** Los datos que usan este trozo. Vacío = trozo sin subrayar. */
  claves: string[];
  aviso: boolean;
}

/** El texto sin mayúsculas, acentos ni espacios repetidos, y dónde estaba cada letra en el original. */
function normalizar(texto: string): { plano: string; origen: number[] } {
  let plano = "";
  const origen: number[] = [];
  let espacioPrevio = true; // así se quitan los espacios del principio
  for (let i = 0; i < texto.length; i += 1) {
    const base = texto[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    for (const c of base) {
      if (/\s/.test(c)) {
        if (espacioPrevio) continue;
        plano += " ";
        origen.push(i);
        espacioPrevio = true;
      } else {
        plano += c;
        origen.push(i);
        espacioPrevio = false;
      }
    }
  }
  const recortado = plano.replace(/ $/, "");
  return { plano: recortado, origen: origen.slice(0, recortado.length) };
}

function normalizarCita(cita: string): string {
  return normalizar(cita).plano;
}

/** Dónde está una frase en un texto: [desde, hasta) del ORIGINAL, o null si no está. */
export function localizarCita(texto: string, cita: string): [number, number] | null {
  const buscada = normalizarCita(cita);
  if (buscada.length < 2) return null;
  const { plano, origen } = normalizar(texto);
  const i = plano.indexOf(buscada);
  if (i < 0) return null;
  const desde = origen[i];
  const hasta = origen[i + buscada.length - 1] + 1;
  return [desde, hasta];
}

/**
 * El texto partido en trozos, con a cada uno los datos que lo usan.
 * Dos datos sobre el mismo trozo lo comparten; es de aviso solo si TODOS lo dan por malo.
 */
export function trocearConMarcas(texto: string, marcas: MarcaPedida[]): TrozoDeTexto[] {
  const rangos: Array<{ desde: number; hasta: number; clave: string; aviso: boolean }> = [];
  for (const m of marcas) {
    const r = localizarCita(texto, m.cita);
    if (r) rangos.push({ desde: r[0], hasta: r[1], clave: m.clave, aviso: m.aviso });
  }
  if (rangos.length === 0) return [{ texto, claves: [], aviso: false }];

  const cortes = [...new Set([0, texto.length, ...rangos.flatMap((r) => [r.desde, r.hasta])])].sort((a, b) => a - b);
  const trozos: TrozoDeTexto[] = [];
  for (let k = 0; k < cortes.length - 1; k += 1) {
    const [a, b] = [cortes[k], cortes[k + 1]];
    if (a === b) continue;
    const dentro = rangos.filter((r) => r.desde <= a && r.hasta >= b);
    trozos.push({
      texto: texto.slice(a, b),
      claves: [...new Set(dentro.map((r) => r.clave))],
      // Ámbar solo si TODOS los datos que usan este trozo lo dan por malo: «20 alumnos»
      // está bien usado para los alumnos aunque un régimen mal leído lo cite también.
      aviso: dentro.length > 0 && dentro.every((r) => r.aviso),
    });
  }
  return trozos;
}

/**
 * Cómo enseñar los saltos de línea de un mensaje sin gastar pantalla.
 *
 * Muchos correos vienen «a renglón por frase», con una línea en blanco entre
 * cada una («Dear Pablo,⏎⏎got a new request…⏎⏎12.03.-16.03.2027»), y en la
 * ventana eso eran diez líneas vacías. Si las líneas son cortas, se enseña una
 * sola línea entre frases; si son párrafos, se deja como mucho una línea en blanco.
 * Solo es para pintar: el texto y las posiciones de los subrayados no cambian.
 */
export function compactadorDeSaltos(textoCompleto: string): (trozo: string) => string {
  const lineas = textoCompleto.split("\n").filter((l) => l.trim() !== "");
  const media = lineas.length > 0 ? lineas.reduce((n, l) => n + l.length, 0) / lineas.length : 0;
  const cortas = media < 60;
  return (trozo) => trozo.replace(/[ \t]+\n/g, "\n").replace(cortas ? /\n{2,}/g : /\n{3,}/g, cortas ? "\n" : "\n\n");
}
