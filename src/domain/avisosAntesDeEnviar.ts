/**
 * Avisos antes de enviar una propuesta con selecciones incompletas.
 *
 * Reunión con Oravia, 05/11/2026: «añadir avisos y validaciones para impedir
 * envíos con selecciones incompletas». El caso que se vio: la actividad se
 * guarda con la PRIMERA tarifa del catálogo (una duración, una edad, un
 * periodo) y nadie se entera de que había más y de que ninguna se eligió. Quien
 * cotiza sigue eligiendo a mano la duración; lo que falta es que la pantalla de
 * «Antes de que salga» le diga qué dejó sin elegir.
 *
 * Dos gravedades:
 *
 *   bloquea   el documento saldría mal (sin alumnos, todo a cero): no se envía.
 *   aviso     puede ser lo que se quiere, pero hay que haberlo visto: se envía
 *             tras marcar «he revisado los avisos», una sola vez para todos.
 *
 * Es lógica pura: el lienzo le da un resumen de lo elegido y esto dice qué falta.
 */

export interface ActividadParaRevisar {
  id: string;
  nombre: string;
  /** En qué opciones (1, 2, 3) va. Vacío en una propuesta solo de actividades. */
  enOpciones: number[];
  /** Su precio sale «a consultar»: o no hay tarifa o hay que ponerlo a mano. */
  sinPrecio: boolean;
  /** Cuántas tarifas distintas tiene en el catálogo (duraciones, edades, periodos). */
  tarifas: number;
  /** Qué tarifa va a salir, dicha en palabras («Tarifa: Adulto · por persona»). */
  tarifaQueSale: string;
  /** Las entradas son las que propone el sistema: nadie las ha tocado ni elegido. */
  sinTocar: boolean;
  /** Su precio cambia según el día y el viaje cruza varios periodos. */
  necesitaDia: boolean;
  tieneDia: boolean;
  /** Ninguna de sus tarifas vale en las fechas del viaje. */
  fueraDeTemporada: boolean;
  /** No lleva ninguna entrada con cantidad: saldría sin importe. */
  sinEntradas: boolean;
}

export interface EntradaDeAvisos {
  /** Alumnos del grupo. Sin ellos, los totales salen a cero. */
  alumnos: number;
  /** Cuántas opciones de alojamiento se envían (0 si es solo de actividades). */
  opciones: number;
  soloActividades: boolean;
  actividades: ActividadParaRevisar[];
}

export type GravedadDelAviso = "bloquea" | "aviso";

export interface AvisoDeEnvio {
  /** Estable: sirve de clave y para decir «de qué actividad». */
  id: string;
  gravedad: GravedadDelAviso;
  texto: string;
}

const lista = (nombres: string[]) =>
  nombres.length <= 1 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;

export function avisosAntesDeEnviar(e: EntradaDeAvisos): AvisoDeEnvio[] {
  const avisos: AvisoDeEnvio[] = [];

  if (e.alumnos <= 0) {
    avisos.push({
      id: "sin-alumnos",
      gravedad: "bloquea",
      texto: "No hay número de alumnos: el documento saldría con los totales a cero. Vuelve y contéstalo.",
    });
  }

  if (!e.soloActividades && e.opciones > 0 && e.actividades.length === 0) {
    avisos.push({
      id: "sin-actividades",
      gravedad: "aviso",
      texto: "La propuesta no lleva ninguna actividad: saldrá solo con el alojamiento.",
    });
  }

  // Cada opción tiene que llevar algo si las demás lo llevan: el colegio compara.
  if (e.opciones > 1) {
    const conActividades = new Set(e.actividades.flatMap((a) => a.enOpciones));
    const sin = Array.from({ length: e.opciones }, (_, i) => i + 1).filter((n) => !conActividades.has(n));
    if (conActividades.size > 0 && sin.length > 0) {
      avisos.push({
        id: "opciones-sin-actividades",
        gravedad: "aviso",
        texto: `${sin.length === 1 ? "La opción" : "Las opciones"} ${lista(sin.map(String))} ${sin.length === 1 ? "no lleva" : "no llevan"} actividades y las demás sí: no se pueden comparar.`,
      });
    }
  }

  for (const a of e.actividades) {
    if (a.sinPrecio) {
      avisos.push({
        id: `sin-precio:${a.id}`,
        gravedad: "aviso",
        texto: `«${a.nombre}» no tiene precio: saldrá «a consultar» y no suma al total.`,
      });
    } else if (a.sinEntradas) {
      avisos.push({
        id: `sin-entradas:${a.id}`,
        gravedad: "aviso",
        texto: `«${a.nombre}» no lleva ninguna entrada con cantidad: saldrá sin importe.`,
      });
    }

    // El caso de la reunión: hay varias tarifas y se ha ido con la primera.
    if (a.tarifas > 1 && a.sinTocar && !a.sinPrecio && !a.sinEntradas) {
      avisos.push({
        id: `tarifa-por-defecto:${a.id}`,
        gravedad: "aviso",
        texto: `«${a.nombre}» tiene ${a.tarifas} tarifas y no has elegido ninguna: saldrá «${a.tarifaQueSale}».`,
      });
    }

    if (a.necesitaDia && !a.tieneDia) {
      avisos.push({
        id: `sin-dia:${a.id}`,
        gravedad: "aviso",
        texto: `«${a.nombre}» cobra según el día y el viaje cruza varios periodos: falta decir qué día se visita.`,
      });
    }

    if (a.fueraDeTemporada) {
      avisos.push({
        id: `fuera-de-temporada:${a.id}`,
        gravedad: "aviso",
        texto: `«${a.nombre}» no tiene tarifa para las fechas del viaje (fuera de temporada).`,
      });
    }
  }

  // Lo que bloquea, primero.
  return avisos.sort((x, y) => Number(y.gravedad === "bloquea") - Number(x.gravedad === "bloquea"));
}

/** ¿Se puede enviar? `confirmados` = quien cotiza ha marcado «he revisado los avisos». */
export function sePuedeEnviar(avisos: AvisoDeEnvio[], confirmados: boolean): { si: boolean; motivo: string | null } {
  const bloqueos = avisos.filter((a) => a.gravedad === "bloquea");
  if (bloqueos.length > 0) return { si: false, motivo: bloqueos[0].texto };
  const resto = avisos.filter((a) => a.gravedad === "aviso");
  if (resto.length > 0 && !confirmados) {
    return { si: false, motivo: `Marca que has revisado ${resto.length === 1 ? "el aviso" : `los ${resto.length} avisos`} para enviar.` };
  }
  return { si: true, motivo: null };
}
