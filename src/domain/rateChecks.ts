/**
 * Comprobaciones automáticas de las tarifas extraídas.
 *
 * El porqué: revisar consistía en comparar 54 números contra un PDF abierto en
 * otra ventana, que es justo lo que peor hace una persona — a la quinta fila
 * deja de mirar y empieza a aprobar. Y de estas tarifas salen todas las
 * propuestas: un precio mal aprobado son presupuestos mal hechos toda la
 * temporada.
 *
 * Aquí la máquina comprueba lo que sabe comprobar y deja a la persona solo las
 * excepciones. Ninguna de estas comprobaciones aprueba ni rechaza nada: solo
 * señala qué merece una mirada.
 */

export type RateFlagCode =
  /** El precio no aparece en el texto del que se supone que salió. */
  | "PRICE_NOT_IN_SOURCE"
  /** Individual cuesta menos que doble. */
  | "OCCUPANCY_ORDER"
  /** Un régimen más completo cuesta menos que uno más corto. */
  | "BOARD_ORDER"
  /** Sin el servicio incluido cuesta más que con él. */
  | "SERVICE_ORDER"
  /** No se sabe si el precio es por equipo, por persona o por hora. */
  | "UNIT_UNKNOWN";

export interface RateFlag {
  rateId: string;
  code: RateFlagCode;
  /** Qué pasa, en claro, para enseñarlo tal cual. */
  message: string;
}

/** Lo mínimo que necesita una tarifa para poder comprobarse. */
export interface CheckableRate {
  id: string;
  boardType?: string | null;
  occupancyLabel?: string | null;
  includedService?: string | null;
  rawText?: string | null;
  pvpAmount?: number | string | null;
  netAmount?: number | string | null;
  costAmount?: number | string | null;
}

/** De más completo a menos: pensión completa cuesta más que solo alojamiento. */
const BOARD_RANK: Record<string, number> = { PC: 4, MP: 3, AD: 2, SA: 1 };

const BOARD_NAMES: Record<string, string> = {
  PC: "pensión completa",
  MP: "media pensión",
  AD: "alojamiento y desayuno",
  SA: "solo alojamiento",
};

function normalizar(valor: unknown): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function precioDe(rate: CheckableRate): number | null {
  for (const bruto of [rate.pvpAmount, rate.netAmount, rate.costAmount]) {
    const numero = Number(bruto);
    if (Number.isFinite(numero) && numero > 0) return numero;
  }
  return null;
}

/**
 * Todos los números que aparecen en un texto. "PC 88 € - Campo (1.30h)" da
 * 88 y 1.30; nos vale con que el precio esté entre ellos.
 */
function numerosEn(texto: string): number[] {
  const encontrados = texto.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return encontrados
    .map((bruto) => Number(bruto.replace(",", ".")))
    .filter((numero) => Number.isFinite(numero));
}

/** Dos importes son el mismo si difieren en menos de un céntimo. */
function mismoImporte(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

/** Etiqueta de ocupación → true si es individual (una persona por unidad). */
function esIndividual(occupancy: unknown): boolean {
  const texto = normalizar(occupancy);
  return texto.includes("individual") || texto.includes("1 pax") || texto.includes("single");
}

function esDoble(occupancy: unknown): boolean {
  const texto = normalizar(occupancy);
  return texto.includes("doble") || texto.includes("double");
}

/** ¿Esta tarifa NO incluye ningún servicio extra? */
function sinServicio(includedService: unknown): boolean {
  const texto = normalizar(includedService);
  return texto.startsWith("sin ") || texto === "ninguno" || texto === "no";
}

function formatear(valor: number): string {
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(valor)} €`;
}

/**
 * Comprueba que el precio de cada tarifa aparezca en su propio texto de origen.
 *
 * Es mecánica y no falla: si el número no está literalmente en el fragmento del
 * que se extrajo, es que se colocó en la fila equivocada. Las tarifas sin texto
 * de origen no se señalan aquí — no hay con qué contrastarlas.
 */
function comprobarOrigen(rates: CheckableRate[]): RateFlag[] {
  const avisos: RateFlag[] = [];

  for (const rate of rates) {
    const precio = precioDe(rate);
    const origen = String(rate.rawText ?? "").trim();
    if (precio === null || !origen) continue;

    const numeros = numerosEn(origen);
    if (!numeros.some((numero) => mismoImporte(numero, precio))) {
      avisos.push({
        rateId: rate.id,
        code: "PRICE_NOT_IN_SOURCE",
        message: `${formatear(precio)} no aparece en el texto del documento del que salió esta tarifa. Puede estar colocado en la fila equivocada.`,
      });
    }
  }

  return avisos;
}

/** Agrupa por una clave y devuelve los grupos con más de un elemento. */
function agrupar<T>(items: T[], clave: (item: T) => string): T[][] {
  const mapa = new Map<string, T[]>();
  for (const item of items) {
    const k = clave(item);
    mapa.set(k, [...(mapa.get(k) ?? []), item]);
  }
  return [...mapa.values()].filter((grupo) => grupo.length > 1);
}

/**
 * Comprueba que la rejilla sea coherente consigo misma.
 *
 * En una tabla de tarifas los precios siguen reglas que no se rompen por
 * casualidad: individual cuesta más que doble, un régimen más completo cuesta
 * más que uno más corto, y llevar un servicio incluido cuesta más que no
 * llevarlo. Lo que las rompa es una excepción del proveedor o un error de
 * lectura; en los dos casos hay que mirarlo.
 */
function comprobarCoherencia(rates: CheckableRate[]): RateFlag[] {
  const avisos: RateFlag[] = [];
  const conPrecio = rates.filter((rate) => precioDe(rate) !== null);

  // Individual vs doble, con el mismo régimen y el mismo servicio.
  for (const grupo of agrupar(conPrecio, (r) =>
    `${normalizar(r.boardType)}|${normalizar(r.includedService)}`,
  )) {
    const individual = grupo.find((r) => esIndividual(r.occupancyLabel));
    const doble = grupo.find((r) => esDoble(r.occupancyLabel));
    if (!individual || !doble) continue;

    const pi = precioDe(individual)!;
    const pd = precioDe(doble)!;
    if (pi < pd) {
      avisos.push({
        rateId: individual.id,
        code: "OCCUPANCY_ORDER",
        message: `En individual sale ${formatear(pi)} y en doble ${formatear(pd)}. Lo normal es que individual cueste más.`,
      });
    }
  }

  // Régimen: el más completo no puede costar menos, a igual servicio y ocupación.
  for (const grupo of agrupar(conPrecio, (r) =>
    `${normalizar(r.includedService)}|${normalizar(r.occupancyLabel)}`,
  )) {
    const ordenados = grupo
      .map((rate) => ({ rate, rango: BOARD_RANK[String(rate.boardType ?? "").toUpperCase()] ?? 0 }))
      .filter((item) => item.rango > 0)
      .sort((a, b) => b.rango - a.rango);

    for (let i = 0; i < ordenados.length - 1; i += 1) {
      const alto = ordenados[i];
      const bajo = ordenados[i + 1];
      const pAlto = precioDe(alto.rate)!;
      const pBajo = precioDe(bajo.rate)!;
      if (pAlto < pBajo) {
        const nombreAlto = BOARD_NAMES[String(alto.rate.boardType).toUpperCase()] ?? "el régimen superior";
        const nombreBajo = BOARD_NAMES[String(bajo.rate.boardType).toUpperCase()] ?? "el inferior";
        avisos.push({
          rateId: alto.rate.id,
          code: "BOARD_ORDER",
          message: `En ${nombreAlto} sale ${formatear(pAlto)} y en ${nombreBajo} ${formatear(pBajo)}. Lo normal es lo contrario.`,
        });
      }
    }
  }

  // Servicio incluido: sin él no debería costar más que con él.
  for (const grupo of agrupar(conPrecio, (r) =>
    `${normalizar(r.boardType)}|${normalizar(r.occupancyLabel)}`,
  )) {
    const sin = grupo.find((r) => sinServicio(r.includedService));
    if (!sin) continue;
    const pSin = precioDe(sin)!;

    for (const rate of grupo) {
      if (rate === sin || sinServicio(rate.includedService)) continue;
      const pCon = precioDe(rate)!;
      if (pSin > pCon) {
        avisos.push({
          rateId: sin.id,
          code: "SERVICE_ORDER",
          message: `Sin servicio incluido sale ${formatear(pSin)}, más caro que con "${String(rate.includedService).trim()}" (${formatear(pCon)}).`,
        });
        break;
      }
    }
  }

  return avisos;
}

/**
 * Pasa todas las comprobaciones y devuelve los avisos indexados por tarifa.
 * Una tarifa puede acumular más de uno.
 */
export function checkRates(rates: CheckableRate[]): Map<string, RateFlag[]> {
  const todos = [...comprobarOrigen(rates), ...comprobarCoherencia(rates)];
  const porTarifa = new Map<string, RateFlag[]>();
  for (const aviso of todos) {
    porTarifa.set(aviso.rateId, [...(porTarifa.get(aviso.rateId) ?? []), aviso]);
  }
  return porTarifa;
}


// ---------------------------------------------------------------------------
// Actividades
// ---------------------------------------------------------------------------

/** Una tarifa de actividad tiene otra forma: se cobra por equipo, hora o pax. */
export interface CheckableActivityRate {
  id: string;
  rateUnit?: string | null;
  currency?: string | null;
  ageLabel?: string | null;
  rawText?: string | null;
  salePvpAmount?: number | string | null;
  costNetAmount?: number | string | null;
}

const UNIDADES_CONOCIDAS = ["PER_GROUP", "PER_PAX", "PER_HOUR", "PER_DAY", "PER_SERVICE"];

/**
 * Comprobaciones de las tarifas de actividad.
 *
 * No tiene sentido buscar aquí una rejilla de régimen y ocupación: una
 * actividad no la tiene. Lo verificable es que el importe esté en su texto de
 * origen y que se sepa CÓMO se cobra — porque 190 € por equipo y 190 € por
 * persona no se parecen en nada, y con 40 alumnos la diferencia son miles de
 * euros en la propuesta.
 */
export function checkActivityRates(rates: CheckableActivityRate[]): Map<string, RateFlag[]> {
  const porTarifa = new Map<string, RateFlag[]>();
  const anotar = (rateId: string, code: RateFlagCode, message: string) => {
    porTarifa.set(rateId, [...(porTarifa.get(rateId) ?? []), { rateId, code, message }]);
  };

  for (const rate of rates) {
    const precio = precioDe({
      id: rate.id,
      pvpAmount: rate.salePvpAmount,
      costAmount: rate.costNetAmount,
    });

    // El importe tiene que estar en el fragmento del que se extrajo.
    const origen = String(rate.rawText ?? "").trim();
    if (precio !== null && origen) {
      const numeros = numerosEn(origen);
      if (!numeros.some((numero) => mismoImporte(numero, precio))) {
        anotar(
          rate.id,
          "PRICE_NOT_IN_SOURCE",
          `${formatear(precio)} no aparece en el texto del documento del que salió. Puede pertenecer a otra fila.`,
        );
      }
    }

    // Sin saber cómo se cobra, el precio no se puede usar para cotizar.
    const unidad = String(rate.rateUnit ?? "").toUpperCase();
    if (precio !== null && (!unidad || unidad === "UNKNOWN" || !UNIDADES_CONOCIDAS.includes(unidad))) {
      anotar(
        rate.id,
        "UNIT_UNKNOWN",
        `No dice cómo se cobran estos ${formatear(precio)}: por equipo, por persona o por hora. Sin eso la propuesta puede salir por mucho más o por mucho menos.`,
      );
    }
  }

  return porTarifa;
}
