/**
 * Leer fechas escritas como las escribe un colegio.
 *
 * Estaba repartido dentro del lector de peticiones y solo entendía el orden
 * «día primero»: «del 12 al 16 de mayo de 2027». Con el chat quedó a la vista
 * que falla en cuanto el mes va delante, que es como escribe media España:
 *
 *   «Estamos organizando el viaje para mayo de 2027, del 12 al 16.»
 *
 * Eso devolvía dos fechas vacías. Antes del chat te dejaba delante de una
 * pantalla sin hoteles y sin explicación; ahora el chat lo pregunta, pero
 * preguntar algo que está escrito en el correo es hacer trabajar a quien
 * cotiza para nada.
 *
 * Aquí vive ahora todo: lo usa el lector del mensaje y lo usa el chat cuando
 * alguien contesta una fecha escribiéndola.
 *
 * Nada mira el reloj: `hoy` se recibe. Una prueba que dependa de la fecha del
 * día caduca sola y un día falla sin que nadie haya tocado nada.
 */

export const MESES_ES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/** Los meses como alternativa de expresión regular, sin acentos. */
const MES = Object.keys(MESES_ES).join("|");

export function sinTildes(valor: string): string {
  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function mesNumero(token: string | undefined | null): number | null {
  if (!token) return null;
  return MESES_ES[sinTildes(token).toLowerCase()] ?? null;
}

export function aIso(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * El primer año en el que ese día y ese mes aún no han pasado.
 *
 * Nadie pide presupuesto para un viaje que ya ocurrió, así que ante una fecha
 * sin año la lectura correcta es la próxima vez que llegue.
 */
export function proximoAnioCon(mes: number, dia: number, referencia: Date): number {
  const anio = referencia.getUTCFullYear();
  const esteAnio = Date.UTC(anio, mes - 1, dia);
  const hoySinHora = Date.UTC(
    referencia.getUTCFullYear(),
    referencia.getUTCMonth(),
    referencia.getUTCDate(),
  );
  return esteAnio >= hoySinHora ? anio : anio + 1;
}

/** Un día del mes creíble. Sin esto, «del 4º de ESO» se leería como día 4. */
function diaValido(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 31;
}

export interface RangoLeido {
  desde: string;
  hasta: string;
}

const VACIO: RangoLeido = { desde: "", hasta: "" };

/**
 * El rango de fechas de un texto libre. Reconoce, por orden:
 *
 *   1. ISO: «2027-05-12 … 2027-05-16»
 *   2. Día primero con año: «del 12 al 16 de mayo de 2027»,
 *      «del 2 de mayo al 6 de junio de 2027», «entre el 12 y el 16 de mayo de 2027»
 *   3. Numérico: «12/05/2027 … 16/05/2027» (también con - o .)
 *   4. MES PRIMERO: «mayo de 2027, del 12 al 16» — el que faltaba
 *   5. Día primero sin año: «del 10 al 14 de mayo» → el próximo mayo
 *   6. Mes primero sin año: «en mayo, del 12 al 16»
 *
 * El orden importa: lo explícito antes que lo deducido, y con año antes que
 * sin año. Un texto que trae las dos formas se lee por la más segura.
 */
export function leerRango(texto: string, hoy: Date): RangoLeido {
  if (!texto || !texto.trim()) return VACIO;

  // 1) ISO
  const iso = [...texto.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map((m) => m[1]);
  if (iso.length >= 2) return { desde: iso[0], hasta: iso[1] };

  const bajo = sinTildes(texto.toLowerCase());

  // 2) Día primero, con año
  const diaPrimero = bajo.match(
    new RegExp(
      `(\\d{1,2})\\s*(?:de\\s+(${MES})\\s+)?(?:al|a|y|hasta|–|-)\\s*(?:el\\s+)?(\\d{1,2})\\s+de\\s+(${MES})\\s+(?:de\\s+)?(20\\d{2})`,
    ),
  );
  if (diaPrimero) {
    const d1 = Number(diaPrimero[1]);
    const d2 = Number(diaPrimero[3]);
    const m2 = mesNumero(diaPrimero[4]);
    const m1 = mesNumero(diaPrimero[2]) ?? m2;
    const anio = Number(diaPrimero[5]);
    if (m1 && m2 && diaValido(d1) && diaValido(d2)) {
      return { desde: aIso(anio, m1, d1), hasta: aIso(m2 < m1 ? anio + 1 : anio, m2, d2) };
    }
  }

  // 3) Numérico DD/MM/AAAA
  const numerico = [...texto.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/g)].map((m) =>
    aIso(Number(m[3]), Number(m[2]), Number(m[1])),
  );
  if (numerico.length >= 2) return { desde: numerico[0], hasta: numerico[1] };

  // 3b) Numérico con el año solo al final: «31.01. – 06.02.2027»,
  // «31/01 - 06/02/2027». Así lo escribe el turoperador suizo, y es lo que
  // trajo el error 400 de Ricard el 29/09/2026: la primera fecha no tenía año,
  // la solicitud se quedó sin fechas y el trato salió sin fecha de cierre.
  const anioAlFinal = texto.match(
    /\b(\d{1,2})[./-](\d{1,2})\.?\s*(?:–|—|-|a|al|hasta)\s*(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/,
  );
  if (anioAlFinal) {
    const d1 = Number(anioAlFinal[1]);
    const m1 = Number(anioAlFinal[2]);
    const d2 = Number(anioAlFinal[3]);
    const m2 = Number(anioAlFinal[4]);
    const anio = Number(anioAlFinal[5]);
    if (m1 >= 1 && m1 <= 12 && m2 >= 1 && m2 <= 12 && diaValido(d1) && diaValido(d2)) {
      // «30.12. – 03.01.2027» empieza el año anterior.
      return { desde: aIso(m1 > m2 ? anio - 1 : anio, m1, d1), hasta: aIso(anio, m2, d2) };
    }
  }

  // 4) Mes primero: «mayo de 2027, del 12 al 16».
  //
  // El hueco entre el mes y los días se limita a una frase -sin punto y sin
  // salto- para no unir dos ideas distintas: en «… de mayo. Seríamos unos 48
  // alumnos de 4º de ESO», el «4» no es un día de viaje.
  const mesPrimero = bajo.match(
    new RegExp(
      `\\b(${MES})\\b\\s*(?:de\\s+)?(20\\d{2})[^.\\n]{0,40}?\\b(?:del?|entre\\s+el|desde\\s+el)\\s*(\\d{1,2})\\s*(?:al|a|y|hasta|–|-)\\s*(?:el\\s+)?(\\d{1,2})\\b`,
    ),
  );
  if (mesPrimero) {
    const mes = mesNumero(mesPrimero[1]);
    const anio = Number(mesPrimero[2]);
    const d1 = Number(mesPrimero[3]);
    const d2 = Number(mesPrimero[4]);
    if (mes && diaValido(d1) && diaValido(d2)) {
      // Si el segundo día es menor, el viaje cruza al mes siguiente:
      // «mayo de 2027, del 30 al 2».
      const mesFin = d2 < d1 ? (mes % 12) + 1 : mes;
      const anioFin = d2 < d1 && mes === 12 ? anio + 1 : anio;
      return { desde: aIso(anio, mes, d1), hasta: aIso(anioFin, mesFin, d2) };
    }
  }

  // 5) Día primero, sin año
  const sinAnio = bajo.match(
    new RegExp(
      `(\\d{1,2})\\s*(?:de\\s+(${MES})\\s+)?(?:al|a|y|hasta|–|-)\\s*(?:el\\s+)?(\\d{1,2})\\s+de\\s+(${MES})\\b`,
    ),
  );
  if (sinAnio) {
    const d1 = Number(sinAnio[1]);
    const d2 = Number(sinAnio[3]);
    const m2 = mesNumero(sinAnio[4]);
    const m1 = mesNumero(sinAnio[2]) ?? m2;
    if (m1 && m2 && diaValido(d1) && diaValido(d2)) {
      const anio = proximoAnioCon(m1, d1, hoy);
      return { desde: aIso(anio, m1, d1), hasta: aIso(m2 < m1 ? anio + 1 : anio, m2, d2) };
    }
  }

  // 6) Mes primero, sin año
  const mesPrimeroSinAnio = bajo.match(
    new RegExp(
      `\\b(?:en|para|durante)\\s+(${MES})\\b[^.\\n]{0,40}?\\b(?:del?|entre\\s+el|desde\\s+el)\\s*(\\d{1,2})\\s*(?:al|a|y|hasta|–|-)\\s*(?:el\\s+)?(\\d{1,2})\\b`,
    ),
  );
  if (mesPrimeroSinAnio) {
    const mes = mesNumero(mesPrimeroSinAnio[1]);
    const d1 = Number(mesPrimeroSinAnio[2]);
    const d2 = Number(mesPrimeroSinAnio[3]);
    if (mes && diaValido(d1) && diaValido(d2)) {
      const anio = proximoAnioCon(mes, d1, hoy);
      const mesFin = d2 < d1 ? (mes % 12) + 1 : mes;
      return { desde: aIso(anio, mes, d1), hasta: aIso(d2 < d1 && mes === 12 ? anio + 1 : anio, mesFin, d2) };
    }
  }

  // 7) Otros idiomas: los clubes y turoperadores de Deportivo escriben en
  // inglés o alemán. «17.-21. February» (FC Sins, 27/10/2026) devolvía dos
  // fechas vacías y Ricard tuvo que escribirlas a mano.
  const internacional = leerRangoInternacional(bajo, hoy);
  if (internacional) return internacional;

  return VACIO;
}

/**
 * Meses en inglés, alemán, francés y catalán, con sus abreviaturas. Van aparte
 * de los castellanos para no tocar las lecturas de arriba, que son las de los
 * colegios y están probadas.
 */
const MESES_OTROS: Record<string, number> = {
  january: 1, jan: 1, januar: 1, janvier: 1, gener: 1,
  february: 2, feb: 2, februar: 2, fevrier: 2, febrer: 2,
  march: 3, mar: 3, marz: 3, maerz: 3, mars: 3, marc: 3,
  april: 4, apr: 4, avril: 4, abril: 4,
  may: 5, mai: 5, maig: 5,
  june: 6, jun: 6, juni: 6, juin: 6, juny: 6,
  july: 7, jul: 7, juli: 7, juillet: 7, juliol: 7,
  august: 8, aug: 8, aout: 8, agost: 8,
  september: 9, sep: 9, sept: 9, septembre: 9, setembre: 9,
  october: 10, oct: 10, oktober: 10, octobre: 10, octubre: 10,
  november: 11, nov: 11, novembre: 11,
  december: 12, dec: 12, dezember: 12, decembre: 12, desembre: 12,
};
// Los largos primero: si no, «mar» se come el principio de «march».
const MES_OTRO = Object.keys(MESES_OTROS).sort((a, b) => b.length - a.length).join("|");
const ORDINAL = "(?:st|nd|rd|th|er|e)?\\.?";
const HASTA = "(?:-|–|—|to|till|until|bis|au|a|al|-\\s*the)";

function leerRangoInternacional(bajo: string, hoy: Date): RangoLeido | null {
  const mesDe = (t: string) => MESES_OTROS[t.replace(/\.$/, "")] ?? null;
  const conAnio = (m1: number, d1: number, m2: number, d2: number, anio: string | undefined) => {
    if (!diaValido(d1) || !diaValido(d2)) return null;
    const a1 = anio ? Number(anio) - (m2 < m1 ? 1 : 0) : proximoAnioCon(m1, d1, hoy);
    const a2 = m2 < m1 ? a1 + 1 : a1;
    return { desde: aIso(a1, m1, d1), hasta: aIso(a2, m2, d2) };
  };

  // «17.-21. February 2027», «17-21 February», «from 17th to 21st of February, 2027»
  const diasYMes = bajo.match(
    new RegExp(
      `(?<!\\d)(\\d{1,2})${ORDINAL}\\s*${HASTA}\\s*(\\d{1,2})${ORDINAL}\\s+(?:of\\s+)?(${MES_OTRO})\\b\\.?(?:,?\\s*(20\\d{2}))?`,
    ),
  );
  if (diasYMes) {
    const mes = mesDe(diasYMes[3]);
    if (mes) {
      const d1 = Number(diasYMes[1]);
      const d2 = Number(diasYMes[2]);
      // «30-2 March»: el primero es del mes anterior.
      const m1 = d2 < d1 ? ((mes + 10) % 12) + 1 : mes;
      const r = conAnio(m1, d1, mes, d2, diasYMes[4]);
      if (r) return r;
    }
  }

  // «28 February - 3 March 2027», «28. Februar bis 3. März»
  const dosMeses = bajo.match(
    new RegExp(
      `(?<!\\d)(\\d{1,2})${ORDINAL}\\s+(?:of\\s+)?(${MES_OTRO})\\b\\.?\\s*${HASTA}\\s*(\\d{1,2})${ORDINAL}\\s+(?:of\\s+)?(${MES_OTRO})\\b\\.?(?:,?\\s*(20\\d{2}))?`,
    ),
  );
  if (dosMeses) {
    const m1 = mesDe(dosMeses[2]);
    const m2 = mesDe(dosMeses[4]);
    if (m1 && m2) {
      const r = conAnio(m1, Number(dosMeses[1]), m2, Number(dosMeses[3]), dosMeses[5]);
      if (r) return r;
    }
  }

  // Mes delante, a la inglesa: «February 17-21, 2027», «Feb 17th to 21st»
  const mesDelante = bajo.match(
    new RegExp(
      `\\b(${MES_OTRO})\\b\\.?\\s+(\\d{1,2})${ORDINAL}\\s*${HASTA}\\s*(\\d{1,2})${ORDINAL}(?!\\d)(?:,?\\s*(20\\d{2}))?`,
    ),
  );
  // «may» delante es también el verbo («you may 3 to 5…»): solo con año.
  if (mesDelante && !(mesDelante[1] === "may" && !mesDelante[4])) {
    const mes = mesDe(mesDelante[1]);
    if (mes) {
      const d1 = Number(mesDelante[2]);
      const d2 = Number(mesDelante[3]);
      const mesFin = d2 < d1 ? (mes % 12) + 1 : mes;
      const r = conAnio(mes, d1, mesFin, d2, mesDelante[4]);
      if (r) return r;
    }
  }

  return null;
}

/**
 * Una sola fecha, para cuando alguien contesta escribiéndola en el chat.
 *
 * Acepta lo que la gente escribe de verdad: «12/05/2027», «12-5-2027»,
 * «2027-05-12», «12 de mayo de 2027» y «12 de mayo» a secas. Lo que no
 * entienda devuelve null, y el chat lo dice en vez de guardar una fecha
 * inventada.
 */
export function leerUnaFecha(texto: string, hoy: Date): string | null {
  const limpio = (texto ?? "").trim();
  if (!limpio) return null;

  const iso = limpio.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const mes = Number(iso[2]);
    const dia = Number(iso[3]);
    if (mes >= 1 && mes <= 12 && diaValido(dia)) return aIso(Number(iso[1]), mes, dia);
  }

  const numerico = limpio.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/);
  if (numerico) {
    const dia = Number(numerico[1]);
    const mes = Number(numerico[2]);
    if (mes >= 1 && mes <= 12 && diaValido(dia)) return aIso(Number(numerico[3]), mes, dia);
  }

  const bajo = sinTildes(limpio.toLowerCase());

  const conAnio = bajo.match(new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MES})\\s+(?:de\\s+)?(20\\d{2})\\b`));
  if (conAnio) {
    const dia = Number(conAnio[1]);
    const mes = mesNumero(conAnio[2]);
    if (mes && diaValido(dia)) return aIso(Number(conAnio[3]), mes, dia);
  }

  // «12 mayo 2027», sin el «de».
  const suelta = bajo.match(new RegExp(`\\b(\\d{1,2})\\s+(${MES})\\s+(20\\d{2})\\b`));
  if (suelta) {
    const dia = Number(suelta[1]);
    const mes = mesNumero(suelta[2]);
    if (mes && diaValido(dia)) return aIso(Number(suelta[3]), mes, dia);
  }

  // Sin año: el próximo que llegue.
  const sinAnio = bajo.match(new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${MES})\\b`));
  if (sinAnio) {
    const dia = Number(sinAnio[1]);
    const mes = mesNumero(sinAnio[2]);
    if (mes && diaValido(dia)) return aIso(proximoAnioCon(mes, dia, hoy), mes, dia);
  }

  return null;
}
