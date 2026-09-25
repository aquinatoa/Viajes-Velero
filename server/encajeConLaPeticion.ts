/**
 * Qué cumple y qué no cumple un alojamiento respecto a lo que pidió el centro.
 *
 * Nace de una queja concreta: al pulsar «Detalle» la pantalla enseñaba la ficha
 * del hotel —precio, régimen, condiciones— pero «no me da la seguridad de que
 * estoy seleccionando un alojamiento con las características y necesidades de
 * la petición». Y era literal: los requisitos del mensaje ni se miraban.
 *
 * La idea está tomada de cómo Booking presenta la disponibilidad: una lista de
 * líneas con ✓ que contestan a lo que te importa, no un párrafo descriptivo.
 * La diferencia es que aquí las líneas no son fijas —«incluye wifi»— sino que
 * salen de LO QUE PIDIÓ ESTE CENTRO.
 *
 * Los tres estados tienen que existir, y el tercero es el importante:
 *
 *   CUMPLE     lo pedido y lo que ofrece el hotel coinciden.
 *   NO CUMPLE  el documento dice algo que contradice lo pedido.
 *   NO CONSTA  el documento no dice nada. NO es lo mismo que «no lo tiene», y
 *              mezclarlos sería mentir: un hotel puede tener habitación
 *              adaptada y no haberlo puesto en su tarifa.
 *
 * Todo sale de textos que escribieron los hoteles, así que un «no consta» es
 * frecuente y honesto. Lo que no se puede es callarlo.
 */

export type Estado = "cumple" | "no_cumple" | "no_consta";

export interface Comprobacion {
  /** Qué se comprueba, en una línea: «Pensión completa», «Dietas especiales». */
  que: string;
  estado: Estado;
  /** El porqué, cuando aporta algo: «pedían 3★», «230 € sobre un tope de 300 €». */
  detalle?: string;
}

export interface PeticionDelCentro {
  categoryRequested?: string | null;
  boardType?: string | null;
  destinationText?: string | null;
  /** Lo que el mensaje pedía y no cabe en un campo: dietas, accesibilidad… */
  requisitos?: string[] | null;
  /** Tope por alumno, si el colegio lo dijo. */
  topePorAlumno?: number | null;
}

export interface AlojamientoParaComprobar {
  locality?: string | null;
  categoryType?: string | null;
  /** Todo lo que sabemos escrito de este alojamiento, junto. */
  textos: (string | null | undefined)[];
}

export interface TarifaParaComprobar {
  boardType?: string | null;
  minNights?: number | null;
}

/** Las estrellas que se piden o que tiene un hotel. */
function estrellas(texto?: string | null): number | null {
  const m = String(texto ?? "").match(/(\d)\s*\*|\b(\d)\s*estrell/i);
  const n = Number(m?.[1] ?? m?.[2]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** MP, PC, AD o SA, mirando el nombre completo o el código. */
function regimen(texto?: string | null): string | null {
  const t = String(texto ?? "").trim().toLowerCase();
  if (!t) return null;
  if (/^pc\b|pensi[oó]n completa|pensi[oó] completa/.test(t)) return "PC";
  if (/^mp\b|media pensi[oó]n|mitja pensi[oó]/.test(t)) return "MP";
  if (/^ad\b|alojamiento y desayuno|b&b|bed.*breakfast/.test(t)) return "AD";
  if (/^sa\b|solo alojamiento|s[oó]lo alojamiento/.test(t)) return "SA";
  return null;
}

const NOMBRE_REGIMEN: Record<string, string> = {
  PC: "Pensión completa",
  MP: "Media pensión",
  AD: "Alojamiento y desayuno",
  SA: "Solo alojamiento",
};

/**
 * Los requisitos que sabemos buscar en el texto de un hotel.
 *
 * Es deliberadamente corto. Cada entrada es algo que un colegio pide de verdad
 * y que un hotel podría haber escrito en su tarifa; inventar veinte categorías
 * que nadie menciona solo llenaría la pantalla de «no consta».
 */
const REQUISITOS_CONOCIDOS: { clave: RegExp; que: string; enElHotel: RegExp }[] = [
  {
    clave: /al[eé]rg|dieta|cel[ií]ac|gluten|intoleran|vegetarian|vegan/i,
    que: "Dietas especiales",
    enElHotel: /al[eé]rg|dieta|cel[ií]ac|gluten|intoleran|vegetarian|vegan|men[uú]s? especial/i,
  },
  {
    clave: /movilidad|accesib|adaptad|minusv|silla de ruedas|PMR/i,
    que: "Habitación adaptada",
    enElHotel: /adaptad|accesib|movilidad reducida|PMR|minusv/i,
  },
];

/** Lo que el hotel exige y puede dejar fuera a un grupo: mínimo de plazas. */
function minimoDePlazas(textos: string): number | null {
  const m = textos.match(/m[ií]nim[oa]?\s*(?:de\s*)?(\d{1,3})\s*(?:pax|plazas|personas|alumnos)/i);
  const n = Number(m?.[1]);
  return Number.isFinite(n) ? n : null;
}

/** ¿El hotel avisa de que su disponibilidad va bajo petición? */
const BAJO_PETICION = /bajo petici[oó]n|on request|\bOR\b|sujeto a disponibilidad|consultar disponibilidad/i;

/**
 * La lista de comprobaciones de un alojamiento para esta petición.
 *
 * El orden no es casual: primero lo que el colegio dijo con todas las letras
 * —categoría, régimen, precio— y después lo que pidió en prosa. Es el orden en
 * el que alguien decide.
 */
export function comprobar(
  peticion: PeticionDelCentro,
  alojamiento: AlojamientoParaComprobar,
  tarifa: TarifaParaComprobar,
  datos: { precioPorAlumno?: number | null; noches?: number | null; participantes?: number | null },
): Comprobacion[] {
  const textos = alojamiento.textos.filter(Boolean).join(" · ");
  const lista: Comprobacion[] = [];

  // — Categoría
  const pedidas = estrellas(peticion.categoryRequested);
  const tiene = estrellas(alojamiento.categoryType);
  if (pedidas !== null) {
    if (tiene === null) {
      lista.push({
        que: `${pedidas} estrellas`,
        estado: "no_consta",
        detalle: alojamiento.categoryType ? `Es ${alojamiento.categoryType}` : "Sin categoría en el catálogo",
      });
    } else if (tiene >= pedidas) {
      lista.push({
        que: `${tiene} estrellas`,
        estado: "cumple",
        detalle: tiene > pedidas ? `Pedían ${pedidas}` : undefined,
      });
    } else {
      lista.push({ que: `${tiene} estrellas`, estado: "no_cumple", detalle: `Pedían ${pedidas}` });
    }
  }

  // — Régimen
  const regPedido = regimen(peticion.boardType);
  const regTarifa = regimen(tarifa.boardType);
  if (regPedido) {
    if (!regTarifa) {
      lista.push({ que: NOMBRE_REGIMEN[regPedido], estado: "no_consta", detalle: "La tarifa no dice el régimen" });
    } else if (regTarifa === regPedido) {
      lista.push({ que: NOMBRE_REGIMEN[regPedido], estado: "cumple" });
    } else {
      lista.push({
        que: NOMBRE_REGIMEN[regTarifa] ?? String(tarifa.boardType),
        estado: "no_cumple",
        detalle: `Pedían ${NOMBRE_REGIMEN[regPedido].toLowerCase()}`,
      });
    }
  }

  // — Precio contra el tope. Es lo primero que mira un colegio.
  const precio = datos.precioPorAlumno ?? null;
  if (peticion.topePorAlumno && precio !== null) {
    const euros = (n: number) => `${Math.round(n)} €`;
    lista.push(
      precio <= peticion.topePorAlumno
        ? {
            que: `${euros(precio)} por alumno`,
            estado: "cumple",
            detalle: `Su tope era ${euros(peticion.topePorAlumno)}`,
          }
        : {
            que: `${euros(precio)} por alumno`,
            estado: "no_cumple",
            detalle: `${euros(precio - peticion.topePorAlumno)} por encima de su tope`,
          },
    );
  }

  // — Estancia mínima
  if (tarifa.minNights && datos.noches) {
    lista.push(
      datos.noches >= tarifa.minNights
        ? { que: `Estancia mínima ${tarifa.minNights} noches`, estado: "cumple" }
        : {
            que: `Estancia mínima ${tarifa.minNights} noches`,
            estado: "no_cumple",
            detalle: `El viaje son ${datos.noches}`,
          },
    );
  }

  // — Mínimo de plazas del hotel contra el tamaño del grupo
  const minimo = minimoDePlazas(textos);
  if (minimo !== null && datos.participantes) {
    lista.push(
      datos.participantes >= minimo
        ? { que: `Mínimo ${minimo} plazas`, estado: "cumple", detalle: `El grupo son ${datos.participantes}` }
        : {
            que: `Mínimo ${minimo} plazas`,
            estado: "no_cumple",
            detalle: `El grupo son ${datos.participantes}`,
          },
    );
  }

  // — Lo que el colegio pidió en prosa. Aquí es donde más «no consta» habrá, y
  //   es la información que faltaba: hasta ahora ni se preguntaba.
  for (const req of peticion.requisitos ?? []) {
    const conocido = REQUISITOS_CONOCIDOS.find((r) => r.clave.test(req));
    if (!conocido) {
      lista.push({ que: req, estado: "no_consta", detalle: "Hay que confirmarlo con el hotel" });
      continue;
    }
    lista.push(
      conocido.enElHotel.test(textos)
        ? { que: conocido.que, estado: "cumple", detalle: "Lo menciona su tarifa" }
        : { que: conocido.que, estado: "no_consta", detalle: "Su tarifa no dice nada" },
    );
  }

  // — Y un aviso que no es un requisito pero cambia la respuesta que se da.
  if (BAJO_PETICION.test(textos)) {
    lista.push({
      que: "Disponibilidad bajo petición",
      estado: "no_consta",
      detalle: "Hay que confirmarlo antes de prometer nada",
    });
  }

  return lista;
}

/** Cuántas cosas cumple, para poder ordenar el podio sin releer la lista. */
export function resumenDelEncaje(lista: Comprobacion[]): {
  cumple: number;
  noCumple: number;
  noConsta: number;
} {
  return {
    cumple: lista.filter((c) => c.estado === "cumple").length,
    noCumple: lista.filter((c) => c.estado === "no_cumple").length,
    noConsta: lista.filter((c) => c.estado === "no_consta").length,
  };
}
