/**
 * Las actividades que pide el mensaje del colegio, con su día si lo dice.
 *
 * Ruth, 26/10/2026, con ESCOLA ULL: «Añade actividad de multiaventura en
 * Cambrils y entradas a Port Aventura con ticket plus… el 17 de abril 2027 van
 * a port aventura». La app no leía nada de eso: había que buscar cada actividad
 * en la lista y, en PortAventura, mirar el calendario para saber qué periodo
 * tocaba («si no aparecen todas las opciones y te obliga a consultar el
 * calendario»).
 *
 * Aquí solo se LEE el texto. Qué actividad del catálogo es cada una lo decide
 * `candidatasDe`, y la pantalla solo la añade sola cuando hay una clara.
 */

export interface ActividadPedida {
  /** Clave estable de lo pedido: «portaventura», «multiaventura»… */
  clave: string;
  /** Cómo se dice al operador: «PortAventura Park», «Multiaventura». */
  etiqueta: string;
  /** Qué buscar en el catálogo si hay que elegir a mano. */
  busqueda: string;
  /** «Cambrils» si el mensaje lo dice junto a la actividad. */
  lugar: string | null;
  /** AAAA-MM-DD del día de la actividad, si el mensaje lo dice. */
  fecha: string | null;
  /** «Ticket Plus», «Express»… lo que pide de la entrada. */
  modalidad: string | null;
}

interface Patron {
  clave: string;
  etiqueta: string;
  busqueda: string;
  re: RegExp;
  /** Cómo reconocer la actividad en el catálogo por su nombre. */
  nombre: RegExp;
}

// Ordenadas de lo más concreto a lo más general.
const PATRONES: Patron[] = [
  { clave: "portaventura", etiqueta: "PortAventura Park", busqueda: "PortAventura", re: /\bport\s*aventura\b(?!\s*world)|\bportaventura\b/, nombre: /portaventura park/ },
  { clave: "ferrariland", etiqueta: "Ferrari Land", busqueda: "Ferrari", re: /\bferrari\s*land\b/, nombre: /ferrari land/ },
  { clave: "caribe", etiqueta: "Caribe Aquatic Park", busqueda: "Caribe", re: /\bcaribe(?:\s+aquatic)?\b/, nombre: /caribe/ },
  { clave: "multiaventura", etiqueta: "Multiaventura", busqueda: "multiaventura", re: /\bmulti\s*-?\s*aventura\b/, nombre: /multiaventura/ },
  { clave: "tirolina", etiqueta: "Tirolinas", busqueda: "tirolina", re: /\btirolinas?\b/, nombre: /tirolina/ },
  { clave: "paintball", etiqueta: "Paintball", busqueda: "paintball", re: /\bpaintball\b/, nombre: /paintball/ },
  { clave: "kayak", etiqueta: "Kayak", busqueda: "kayak", re: /\bkayaks?\b|\bcaiacs?\b/, nombre: /kayak/ },
  { clave: "paddle", etiqueta: "Paddle surf", busqueda: "paddle", re: /\bpaddle(?:\s*surf)?\b/, nombre: /paddle/ },
  { clave: "vela", etiqueta: "Vela", busqueda: "vela", re: /\bvela\b|\bvelero\b/, nombre: /\bvela\b/ },
  { clave: "catamaran", etiqueta: "Catamarán", busqueda: "catamarán", re: /\bcatamaran(?:es)?\b/, nombre: /catamaran/ },
  { clave: "karting", etiqueta: "Karting", busqueda: "karting", re: /\bkarts?\b|\bkarting\b/, nombre: /karting/ },
  { clave: "escape", etiqueta: "Escape room", busqueda: "escape", re: /\bescape\s*rooms?\b/, nombre: /escape room/ },
  { clave: "rafting", etiqueta: "Rafting", busqueda: "rafting", re: /\brafting\b/, nombre: /rafting/ },
  { clave: "banana", etiqueta: "Banana", busqueda: "banana", re: /\bbanana\b/, nombre: /banana/ },
  { clave: "bici", etiqueta: "Bicicleta", busqueda: "bici", re: /\bbici(?:cleta)?s?\b/, nombre: /bici/ },
  { clave: "senderismo", etiqueta: "Senderismo", busqueda: "senderismo", re: /\bsenderismo\b|\bexcursion a pie\b/, nombre: /senderismo/ },
  { clave: "minigolf", etiqueta: "Minigolf", busqueda: "minigolf", re: /\bmini\s*golf\b/, nombre: /minigolf/ },
  { clave: "arco", etiqueta: "Tiro con arco", busqueda: "arco", re: /\btiro con arco\b/, nombre: /tiro con arco/ },
  { clave: "jumping", etiqueta: "Jumping / trampolines", busqueda: "jump", re: /\bjumping\b|\btrampolin(?:es)?\b/, nombre: /jump|salta/ },
  { clave: "windsurf", etiqueta: "Windsurf", busqueda: "windsurf", re: /\bwindsurf\b/, nombre: /windsurf/ },
];

const LUGARES = [
  "Salou", "Cambrils", "La Pineda", "Vila-seca", "Tarragona", "Reus", "Altafulla",
  "Calella", "Santa Susanna", "Amposta", "Delta de l'Ebre", "Lloret de Mar", "Barcelona",
];

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  // En catalán, que también llega: «el 17 d'abril».
  gener: 1, febrer: 2, marc: 3, maig: 5, juny: 6, juliol: 7, agost: 8, setembre: 9, novembre: 11, desembre: 12,
};

const limpio = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const dosDigitos = (n: number) => String(n).padStart(2, "0");

/**
 * Las fechas sueltas de una frase: «el 17 de abril 2027», «el 17/04/2027».
 * Las de un rango («del 12 al 16 de abril», «12 abril al 16 abril») NO: son las
 * fechas del viaje, no el día de una actividad.
 */
function fechasSueltas(frase: string, anioPorDefecto: number | null): string[] {
  const t = limpio(frase);
  const fechas: string[] = [];
  const conMes = /(?:^|[^\d])(\d{1,2})\s*(?:de\s+|d['’]\s*)?([a-z]+)(?:\s*(?:de|del)?\s*(\d{4}))?/g;
  for (const m of t.matchAll(conMes)) {
    const mes = MESES[m[2]];
    if (!mes) continue;
    const antes = t.slice(Math.max(0, (m.index ?? 0) - 6), (m.index ?? 0) + 1);
    const despues = t.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 6);
    // Parte de un rango: «del 12…», «… al 16», «12 abril al 16 abril».
    if (/\b(del|desde)\s*$/.test(antes) || /^\s*(al|a|hasta|-)\b/.test(despues) || /\b(al|hasta)\s*$/.test(antes)) continue;
    const anio = m[3] ? Number(m[3]) : anioPorDefecto;
    if (!anio) continue;
    fechas.push(`${anio}-${dosDigitos(mes)}-${dosDigitos(Number(m[1]))}`);
  }
  for (const m of t.matchAll(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/g)) {
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) continue;
    const anio = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : anioPorDefecto;
    if (!anio) continue;
    fechas.push(`${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`);
  }
  return fechas;
}

function modalidadDe(frase: string): string | null {
  const t = limpio(frase);
  if (/express\s*max/.test(t)) return "Express Max";
  if (/express\s*premium/.test(t)) return "Express Premium";
  if (/\bexpress\b/.test(t)) return "Express";
  if (/ticket\s*plus/.test(t)) return "Ticket Plus";
  return null;
}

function lugarDe(frase: string, desde: number): string | null {
  const resto = frase.slice(desde, desde + 60);
  for (const lugar of LUGARES) {
    const re = new RegExp(`\\b(?:en|a|de)\\s+${limpio(lugar).replace(/[-']/g, ".")}\\b`);
    if (re.test(limpio(resto))) return lugar;
  }
  return null;
}

/**
 * Lo que pide el mensaje. Una entrada por actividad, aunque se nombre varias
 * veces: «entradas a Port Aventura con ticket plus» y, más abajo, «el 17 de
 * abril van a port aventura» son la misma, con la modalidad de una frase y el
 * día de la otra.
 */
export function actividadesPedidas(texto: string, anioPorDefecto: number | null = null): ActividadPedida[] {
  // Por frases y por líneas: el día suele ir en la misma frase que la actividad.
  const frases = String(texto ?? "")
    .split(/\n+|(?<=[.!?;])\s+/)
    .map((f) => f.trim())
    .filter(Boolean);

  const porClave = new Map<string, ActividadPedida>();
  for (const frase of frases) {
    const t = limpio(frase);
    for (const p of PATRONES) {
      const m = p.re.exec(t);
      if (!m) continue;
      // «vela» dentro de «Velero Azul» (su nombre comercial) no es una actividad.
      if (p.clave === "vela" && /velero azul/.test(t)) continue;
      const previa = porClave.get(p.clave);
      const fechas = fechasSueltas(frase, anioPorDefecto);
      const entrada: ActividadPedida = previa ?? {
        clave: p.clave,
        etiqueta: p.etiqueta,
        busqueda: p.busqueda,
        lugar: null,
        fecha: null,
        modalidad: null,
      };
      entrada.lugar = entrada.lugar ?? lugarDe(frase, m.index);
      entrada.modalidad = entrada.modalidad ?? (p.clave === "portaventura" || p.clave === "ferrariland" ? modalidadDe(frase) : null);
      // Si la frase da un solo día, es el de la actividad. Con varios, no se adivina.
      if (fechas.length === 1) entrada.fecha = fechas[0];
      porClave.set(p.clave, entrada);
    }
  }
  return [...porClave.values()];
}

/** Lo mínimo de una actividad del catálogo para reconocerla. */
export interface ActividadDelCatalogo {
  id: string;
  activityName: string;
  locationMain?: string | null;
  supplierName?: string | null;
}

/**
 * Las actividades del catálogo que encajan con lo pedido, la mejor primero.
 *
 * PortAventura tiene ocho productos («1 día PortAventura Park», «2 días, 2
 * parques…»): si no se piden más parques ni más días, el de un día y un parque.
 */
export function candidatasDe<T extends ActividadDelCatalogo>(pedida: ActividadPedida, catalogo: T[]): T[] {
  const patron = PATRONES.find((p) => p.clave === pedida.clave);
  if (!patron) return [];
  const encajan = catalogo.filter((a) => {
    const texto = limpio(`${a.activityName} ${a.locationMain ?? ""}`);
    if (!patron.nombre.test(texto)) return false;
    if (pedida.lugar && !limpio(`${a.locationMain ?? ""} ${a.activityName}`).includes(limpio(pedida.lugar))) return false;
    return true;
  });
  if (pedida.clave === "portaventura") {
    const deUnDia = encajan.filter((a) => {
      const n = limpio(a.activityName);
      return !/\bparques\b|\b[23] dias\b/.test(n);
    });
    if (deUnDia.length) return deUnDia;
  }
  return encajan;
}
