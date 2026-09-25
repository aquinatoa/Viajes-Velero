/**
 * Lo que se enseña para validar una petición antes de trabajarla.
 *
 * Nace de cómo estaba repartida la pantalla: a la izquierda el chat y, debajo,
 * un bloque «Lo que hemos entendido» con catorce campos sueltos que aparecía
 * desde el primer momento, medio vacío, mientras el chat todavía preguntaba lo
 * básico. Anthony lo dijo claro: eso no debe verse hasta que haya lo mínimo
 * para interpretar la petición, y no debe ser una sección de la columna, sino
 * un detalle completo que alguien LEE y VALIDA.
 *
 * De ahí las dos funciones de aquí:
 *
 *   `bloquesParaValidar`  agrupa los datos como se leen —el viaje, el grupo,
 *                         lo que piden, el centro— en vez de como se teclean.
 *                         Catorce campos en fila no se revisan; cuatro bloques
 *                         de tres o cuatro, sí.
 *
 *   `firmaDeLaPeticion`   resume la petición en una cadena. Es lo que permite
 *                         que el visto bueno CADUQUE: se guarda la firma de lo
 *                         validado y, si algo cambia después —un correo nuevo,
 *                         una respuesta en el chat—, deja de coincidir y se
 *                         vuelve a pedir. Un visto bueno sobre datos que ya han
 *                         cambiado no vale nada.
 */

export interface PeticionParaValidar {
  destinationText?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  participants?: number | null;
  teachers?: number | null;
  ageRangeText?: string | null;
  regimeRequested?: string | null;
  categoryRequested?: string | null;
  topePorAlumno?: number | null;
  requisitos?: string[] | null;
  centreName?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  opportunityName?: string | null;
  canal?: string | null;
}

export interface FilaParaValidar {
  que: string;
  valor: string;
  /**
   * El dato no está. `true` cuando además hace falta para algo: se pinta en
   * ámbar. Lo que simplemente no dijeron va en gris, sin alarma.
   */
  falta?: boolean;
  /** Para qué se usa, cuando no es evidente. */
  nota?: string;
}

export interface BloqueParaValidar {
  titulo: string;
  /** Qué pasa con este bloque, en una línea. */
  para: string;
  filas: FilaParaValidar[];
}

function texto(valor: unknown): string {
  const s = String(valor ?? "").trim();
  return s;
}

/** Las noches del viaje, que es lo que multiplica el precio. */
export function nochesDe(desde?: string | null, hasta?: string | null): number | null {
  if (!desde || !hasta) return null;
  const a = new Date(desde).getTime();
  const b = new Date(hasta).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const n = Math.round((b - a) / 86_400_000);
  return n > 0 ? n : null;
}

const CANALES: Record<string, string> = {
  GENERIC: "Colegio, club o agencia",
  SWISS_TTOO: "Turoperador suizo",
};

/**
 * Los datos agrupados como se leen.
 *
 * El orden es el de quien revisa: primero el viaje, que es lo que se busca;
 * después el grupo, que es lo que se cotiza; luego lo que pidieron, que es lo
 * que se comprueba; y al final el centro, que es lo que va al CRM y a quién se
 * le manda.
 */
export function bloquesParaValidar(p: PeticionParaValidar): BloqueParaValidar[] {
  const noches = nochesDe(p.dateFrom, p.dateTo);
  const sinDecir = "no lo han dicho";

  return [
    {
      titulo: "El viaje",
      para: "Con esto se buscan los alojamientos y se elige la tarifa de la temporada.",
      filas: [
        {
          que: "Destino",
          valor: texto(p.destinationText) || "—",
          falta: !texto(p.destinationText),
          nota: "Filtra la comarca entera: pidiendo Cambrils también salen los de Salou.",
        },
        {
          que: "Fechas",
          valor:
            texto(p.dateFrom) && texto(p.dateTo)
              ? `${texto(p.dateFrom)} → ${texto(p.dateTo)}`
              : "—",
          falta: !(texto(p.dateFrom) && texto(p.dateTo)),
        },
        {
          que: "Noches",
          valor: noches ? `${noches}` : "—",
          falta: noches === null,
          nota: "El precio por alumno es el de una noche multiplicado por estas.",
        },
      ],
    },
    {
      titulo: "El grupo",
      para: "Con esto salen los totales y se comprueba el mínimo de plazas que pide cada hotel.",
      filas: [
        {
          que: "Alumnos",
          valor: p.participants ? String(p.participants) : "—",
          falta: !p.participants,
        },
        {
          que: "Profesores",
          valor: p.teachers === null || p.teachers === undefined ? sinDecir : String(p.teachers),
          // Cero profesores es una respuesta; no saberlo no es un fallo, pero
          // el total se queda corto y hay que decirlo.
          nota: "Se alojan y se cobran, muchas veces en habitación individual.",
        },
        {
          que: "Edades",
          valor: texto(p.ageRangeText) || sinDecir,
          nota: "Sirve para descartar actividades por edad. No es obligatoria.",
        },
      ],
    },
    {
      titulo: "Lo que piden",
      para: "Esto es lo que se comprueba hotel por hotel, y lo que sale con ✓ o con — en cada opción.",
      filas: [
        { que: "Régimen", valor: texto(p.regimeRequested) || sinDecir },
        { que: "Categoría", valor: texto(p.categoryRequested) || sinDecir },
        {
          que: "Presupuesto por alumno",
          valor: p.topePorAlumno === null || p.topePorAlumno === undefined ? sinDecir : `${p.topePorAlumno} €`,
          nota: "Solo marca en la lista lo que se pasa. No descarta nada ni cambia ningún precio.",
        },
        {
          que: "Requisitos especiales",
          valor: (p.requisitos ?? []).length ? (p.requisitos ?? []).join(" · ") : "ninguno",
        },
      ],
    },
    {
      titulo: "El centro y el contacto",
      para: "Esto es lo que va al CRM y a quién se le manda el presupuesto.",
      filas: [
        {
          que: "Centro",
          valor: texto(p.centreName) || "—",
          falta: !texto(p.centreName),
          nota: "Da nombre a la CUENTA de Zoho. Sin él se crea con el nombre de la persona.",
        },
        {
          que: "Contacto",
          valor: [texto(p.firstName), texto(p.lastName)].filter(Boolean).join(" ") || "—",
          falta: !(texto(p.firstName) && texto(p.lastName)),
        },
        {
          que: "Correo",
          valor: texto(p.email) || "—",
          falta: !texto(p.email),
          nota: "Sin correo no se puede enviar el presupuesto.",
        },
        { que: "Nombre del viaje", valor: texto(p.opportunityName) || "—", falta: !texto(p.opportunityName) },
        {
          que: "Cotizamos para",
          valor: CANALES[texto(p.canal)] ?? CANALES.GENERIC,
          nota: "El mismo hotel tiene una tarifa pactada con el turoperador suizo y otra general.",
        },
      ],
    },
  ];
}

/** Lo que falta y hace falta: lo que sale en ámbar al revisar. */
export function loQueFaltaDeVerdad(p: PeticionParaValidar): string[] {
  return bloquesParaValidar(p)
    .flatMap((b) => b.filas)
    .filter((f) => f.falta)
    .map((f) => f.que);
}

/**
 * La huella de una petición.
 *
 * Se guarda al dar el visto bueno. Si después cambia cualquier dato que se usa
 * para buscar, cotizar o enviar, la huella deja de coincidir y la validación
 * vuelve a pedirse. Sin esto, alguien valida, el colegio manda un segundo
 * correo que cambia las fechas, y el presupuesto sale con un «revisado» que no
 * corresponde a lo que se envía.
 */
export function firmaDeLaPeticion(p: PeticionParaValidar): string {
  return JSON.stringify([
    texto(p.destinationText).toLowerCase(),
    texto(p.dateFrom),
    texto(p.dateTo),
    p.participants ?? null,
    p.teachers ?? null,
    texto(p.ageRangeText).toLowerCase(),
    texto(p.regimeRequested).toLowerCase(),
    texto(p.categoryRequested).toLowerCase(),
    p.topePorAlumno ?? null,
    [...(p.requisitos ?? [])].sort(),
    texto(p.centreName).toLowerCase(),
    texto(p.email).toLowerCase(),
    texto(p.firstName).toLowerCase(),
    texto(p.lastName).toLowerCase(),
    texto(p.opportunityName).toLowerCase(),
    texto(p.canal),
  ]);
}
