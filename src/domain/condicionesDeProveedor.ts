/**
 * Las condiciones que el proveedor pone a un alojamiento o a una actividad,
 * ordenadas en bloques con título.
 *
 * Nace de un hueco real (11/11/2026): la ficha del catálogo enseñaba las tarifas
 * pero no las condiciones, que SÍ están cargadas (34 de 36 alojamientos). Y es
 * justo lo que más malentendidos evita: «1 gratuidad por cada 25 de pago»,
 * «mínimo 25 plazas», «IVA 10 % incluido», «fianza de 100 €».
 *
 * El texto llega de dos maneras:
 *   · Alojamiento: un solo texto con entradas separadas por « | » y etiquetadas,
 *     `[GRATUITY] Gratuidades: … | [PAYMENT] Depósito: … | [CANCELLATION] …`.
 *   · Actividad: una lista de `{ policyType, policyText }`.
 * En los dos casos la etiqueta dice de qué va y se agrupa por tema.
 *
 * Es texto del proveedor (a veces en catalán): se enseña tal cual. Aquí solo se
 * reparte, no se traduce ni se reinterpreta.
 */

export interface FuenteDeCondiciones {
  conditionsText?: string | null;
  freePolicy?: string | null;
  policies?: Array<{ policyType: string; policyText: string }> | null;
}

export interface LineaDeCondicion {
  /** Lo que va delante de los dos puntos («Depósito», «Bebidas incluidas»), si aporta algo. */
  rotulo: string | null;
  texto: string;
}

export interface BloqueDeCondicion {
  clave: string;
  titulo: string;
  lineas: LineaDeCondicion[];
}

interface Entrada {
  etiqueta: string;
  rotulo: string | null;
  texto: string;
}

interface Seccion {
  clave: string;
  titulo: string;
  etiquetas: string[];
}

/** En el orden en que se enseñan: lo que cambia lo que se paga, primero. */
const SECCIONES: Seccion[] = [
  { clave: "gratuidades", titulo: "Gratuidades", etiquetas: ["GRATUITY", "FREE_PLACES"] },
  {
    clave: "minimos",
    titulo: "Mínimos y capacidad",
    etiquetas: ["GROUP_SIZE", "GROUP_MINIMUM", "MINIMUM_STAY", "CAPACITY", "OCUPACION"],
  },
  {
    clave: "precios",
    titulo: "Precios, IVA y tasas",
    etiquetas: ["TASAS", "TAXES", "IVA", "PRICING", "PRECIOS", "SPECIAL_RATE", "PROMOTION"],
  },
  { clave: "pago", titulo: "Pago y depósito", etiquetas: ["PAYMENT"] },
  {
    clave: "cancelacion",
    titulo: "Cancelación y cambios",
    etiquetas: ["CANCELLATION", "MODIFICATION", "REFUND", "RELEASE"],
  },
  { clave: "incluye", titulo: "Qué incluye", etiquetas: ["INCLUIDO", "INCLUSIONS"] },
  { clave: "notas", titulo: "Otras condiciones", etiquetas: [] },
  { clave: "contacto", titulo: "Contacto", etiquetas: ["CONTACT"] },
];

/** Rótulos que repetirían el título del bloque: no se enseñan. */
const ROTULOS_REDUNDANTES = new Set(["gratuidades", "politica de gratuidades", "cancelacion", "contacto", "condiciones"]);

function sinTildes(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** «Gratuidades: 1 por cada 25» → rótulo «Gratuidades», texto «1 por cada 25». */
function partirRotulo(bruto: string): { rotulo: string | null; texto: string } {
  const limpio = bruto.trim();
  // Los dos puntos de una hora («10:00») no llevan espacio detrás: no son rótulo.
  const m = /^([^:]{1,60}):\s+([\s\S]+)$/.exec(limpio);
  if (!m) return { rotulo: null, texto: limpio };
  return { rotulo: m[1].trim(), texto: m[2].trim() };
}

function entradasDeTexto(texto: string): Entrada[] {
  const trozos = texto.split(/\s*\|\s*(?=\[[A-Z_]+\])/);
  const entradas: Entrada[] = [];
  for (const trozo of trozos) {
    const m = /^\[([A-Z_]+)\]\s*([\s\S]*)$/.exec(trozo.trim());
    if (!m) continue;
    const { rotulo, texto: cuerpo } = partirRotulo(m[2]);
    if (!cuerpo) continue;
    entradas.push({ etiqueta: m[1], rotulo, texto: cuerpo });
  }
  return entradas;
}

/**
 * Cuando la etiqueta es genérica (`SPECIAL_NOTES`), el rótulo dice de qué va:
 * «Gratuidades: 1 profesor gratis por cada 15 pax» es una gratuidad aunque
 * llegue como nota. Se mira en el orden en que importan para lo que se paga.
 */
const SECCION_POR_ROTULO: Array<[RegExp, string]> = [
  [/gratuidad|plazas gratis/i, "gratuidades"],
  [/cancelaci|modificaci|devoluci|release/i, "cancelacion"],
  [/^(pago|dep[oó]sito|forma de pago|nuevas reservas)/i, "pago"],
  [/m[ií]nim|^plazas|ocupaci[oó]n m[aá]xima|capacidad/i, "minimos"],
  [/contacto/i, "contacto"],
  [/incluid|incluye/i, "incluye"],
  [/^(iva|tasa|impuesto|precio)/i, "precios"],
];

function seccionDe(entrada: Entrada): string {
  const propia = SECCIONES.find((s) => s.etiquetas.includes(entrada.etiqueta));
  if (propia) return propia.clave;
  if (entrada.rotulo) {
    const porRotulo = SECCION_POR_ROTULO.find(([patron]) => patron.test(entrada.rotulo!));
    if (porRotulo) return porRotulo[1];
  }
  return "notas";
}

/**
 * Las condiciones de uno o varios registros (los de un mismo canal), en bloques
 * con título. Lo repetido entre ellos —o entre el texto y la política de
 * gratuidades— sale una sola vez.
 */
export function condicionesDe(fuentes: FuenteDeCondiciones[]): BloqueDeCondicion[] {
  const entradas: Entrada[] = [];
  for (const f of fuentes) {
    if (f.conditionsText?.trim()) entradas.push(...entradasDeTexto(f.conditionsText));
    if (f.freePolicy?.trim()) {
      const { rotulo, texto } = partirRotulo(f.freePolicy);
      if (texto) entradas.push({ etiqueta: "GRATUITY", rotulo, texto });
    }
    for (const p of f.policies ?? []) {
      if (!p.policyText?.trim()) continue;
      const { rotulo, texto } = partirRotulo(p.policyText);
      entradas.push({ etiqueta: p.policyType, rotulo, texto });
    }
  }

  const bloques = new Map<string, BloqueDeCondicion>();
  const vistas = new Set<string>();
  for (const e of entradas) {
    const clave = sinTildes(e.texto);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const seccion = SECCIONES.find((s) => s.clave === seccionDe(e))!;
    const bloque = bloques.get(seccion.clave) ?? { clave: seccion.clave, titulo: seccion.titulo, lineas: [] };
    const rotulo = e.rotulo && !ROTULOS_REDUNDANTES.has(sinTildes(e.rotulo)) ? e.rotulo : null;
    bloque.lineas.push({ rotulo, texto: e.texto });
    bloques.set(seccion.clave, bloque);
  }
  return SECCIONES.map((s) => bloques.get(s.clave)).filter((b): b is BloqueDeCondicion => Boolean(b));
}

// ── Suplementos: los extras opcionales, aparte de las tasas y los depósitos ───

export interface SuplementoPublicado {
  concepto: string;
  importe: string | null;
  condicion: string | null;
}

/**
 * El mismo suplemento al mismo precio en dos periodos («Sábanas +6 €» en
 * abril-mayo-octubre y otra vez «+6 €» en junio-septiembre) es UNA línea con los
 * dos periodos, no dos casi iguales. Si alguna de las repeticiones no trae
 * condición (vale siempre), la condición se descarta: «siempre» ya las incluye.
 */
export function juntarIguales(lista: SuplementoPublicado[]): SuplementoPublicado[] {
  const grupos = new Map<string, { base: SuplementoPublicado; condiciones: string[]; siempre: boolean }>();
  for (const s of lista) {
    const clave = `${sinTildes(s.concepto)}|${s.importe ?? ""}`;
    const g = grupos.get(clave) ?? { base: s, condiciones: [], siempre: false };
    if (s.condicion?.trim()) {
      if (!g.condiciones.includes(s.condicion.trim())) g.condiciones.push(s.condicion.trim());
    } else {
      g.siempre = true;
    }
    grupos.set(clave, g);
  }
  return [...grupos.values()].map((g) => ({
    ...g.base,
    condicion: g.siempre || g.condiciones.length === 0 ? null : g.condiciones.join(" · "),
  }));
}

/** Tasas y depósitos no son un extra que se elige: se pagan (o se devuelven) aparte. */
const TASA_O_DEPOSITO = /^(tasa|tasas|impuesto|impuestos|fianza|fian[cç]a|dep[oó]sito|garant[ií]a)\b/i;

/**
 * Separa lo que el cliente puede elegir (sábanas, comida extra, individual) de
 * lo que se paga o se deposita aparte (tasa turística, fianza). La fianza salía
 * como «+100,00 €», como si se sumara al precio: aquí pierde el «+».
 */
export function separarSuplementos(lista: SuplementoPublicado[]): {
  extras: SuplementoPublicado[];
  tasasYDepositos: SuplementoPublicado[];
} {
  const extras: SuplementoPublicado[] = [];
  const tasasYDepositos: SuplementoPublicado[] = [];
  for (const s of lista) {
    if (TASA_O_DEPOSITO.test(s.concepto.trim())) {
      tasasYDepositos.push({ ...s, importe: s.importe ? s.importe.replace(/^\s*\+\s*/, "") : s.importe });
    } else {
      extras.push(s);
    }
  }
  return { extras, tasasYDepositos };
}
