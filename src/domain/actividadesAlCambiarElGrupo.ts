/**
 * Las actividades de una propuesta cuando el cliente cambia el grupo.
 *
 * «Ahora, en vez de 48, seremos 46» (Javier, 17/06/2026). El cambio rehacía el
 * alojamiento con el grupo nuevo, pero las actividades viajaban a la versión
 * nueva tal cual: 48 entradas para 46 alumnos, y desde el 16/11/2026 esas
 * entradas suman al total de la opción y pasan a «Servicios Contratados».
 *
 * Qué se recalcula, siguiendo cómo las reparte el esbozo (`lineasPorDefecto`):
 *   · las entradas de los alumnos, con los alumnos de ahora;
 *   · las de los profesores de pago, y la gratuidad del proveedor con su regla
 *     («1 gratis por cada 10 alumnos») si la propuesta la estaba siguiendo;
 *   · el descuento en euros, que va «por alumno»;
 *   · lo que se cobra por grupo de N personas, con los grupos que hagan falta.
 * Una hora de campo, un entrenador o un servicio no dependen del grupo: se
 * quedan como están.
 *
 * Qué NO se toca: una actividad cuyas entradas no cuadran con el grupo de
 * antes. Eso es que quien cotizó las repartió a mano (van la mitad, hay dos
 * tramos de edad…) y no se puede adivinar cómo quedan: se dejan igual y se
 * avisa, que es mejor que inventar una cuenta.
 *
 * Es lógica pura, sin pantalla y sin base de datos.
 */
import { lineasDeLaActividad, totalDeLaActividad, type ActividadDeLaPropuesta } from "./actividadesContratadas";
import { esLineaDeDescuento } from "./descuentoDeActividad";
import { profesoresGratis, type GratuidadDeProfesores } from "./gratuidadDeActividad";
import {
  MARCA_GRATUIDAD,
  esLineaDeGratuidad,
  esPorUnidad,
  idDeGratuidad,
  porAlumno,
  totalDeLineas,
  unidadDeTarifa,
  type LineaDeActividad,
} from "./lineasDeActividad";

export interface Grupo {
  alumnos: number;
  profesores: number;
}

/** Lo que hace falta saber de la tarifa de cada línea (del catálogo). */
export interface TarifaDeLaLinea {
  rateUnit?: string | null;
  maxPax?: number | null;
  ageLabel?: string | null;
  salePvpAmount?: unknown;
}

export interface LineasRecalculadas {
  lineas: LineaDeActividad[];
  /** Por qué no se han podido recalcular, o qué conviene mirar. */
  aviso: string | null;
}

export const AVISO_REPARTO_A_MANO = "sus entradas no coinciden con el grupo de antes (se repartieron a mano): no se han tocado, revísalas.";

const tarifaBase = (rateId: string) => (rateId.endsWith(MARCA_GRATUIDAD) ? rateId.slice(0, -MARCA_GRATUIDAD.length) : rateId);

/** Qué línea lleva a los alumnos y cuál a los profesores de pago. `null` si las cantidades no cuadran con el grupo. */
function encajar(
  dePersona: LineaDeActividad[],
  gratis: LineaDeActividad[],
  alumnos: number,
  profesoresDePago: number,
): { deAlumnos: LineaDeActividad | null; deProfesores: LineaDeActividad | null } | null {
  if (gratis.length > 1 || profesoresDePago < 0) return null;
  if (dePersona.length === 0) return alumnos === 0 && profesoresDePago === 0 ? { deAlumnos: null, deProfesores: null } : null;
  if (dePersona.length === 1) {
    // Una sola tarifa: los profesores de pago van con los alumnos, al mismo precio.
    return dePersona[0].cantidad === alumnos + profesoresDePago ? { deAlumnos: dePersona[0], deProfesores: null } : null;
  }
  if (dePersona.length === 2) {
    const [a, b] = dePersona;
    const derecho = a.cantidad === alumnos && b.cantidad === profesoresDePago;
    const reves = b.cantidad === alumnos && a.cantidad === profesoresDePago;
    if (derecho && reves) {
      // Mismo número de alumnos que de profesores de pago: manda la tarifa de la gratuidad, que es la del profesor.
      const delProfesor = gratis[0] ? tarifaBase(gratis[0].rateId) : null;
      return delProfesor === a.rateId ? { deAlumnos: b, deProfesores: a } : { deAlumnos: a, deProfesores: b };
    }
    if (derecho) return { deAlumnos: a, deProfesores: b };
    if (reves) return { deAlumnos: b, deProfesores: a };
  }
  return null;
}

/** Las líneas de una actividad con el grupo nuevo. Si el grupo no cambia, las mismas. */
export function lineasConElGrupoNuevo(
  lineas: LineaDeActividad[],
  antes: Grupo,
  ahora: Grupo,
  tarifas: Record<string, TarifaDeLaLinea | undefined> = {},
  gratuidad: GratuidadDeProfesores | null = null,
): LineasRecalculadas {
  if (antes.alumnos === ahora.alumnos && antes.profesores === ahora.profesores) return { lineas, aviso: null };

  const personasAntes = antes.alumnos + antes.profesores;
  const personasAhora = ahora.alumnos + ahora.profesores;
  const deUnidad = (l: LineaDeActividad) => !esLineaDeDescuento(l) && !esLineaDeGratuidad(l) && esPorUnidad(tarifas[l.rateId]?.rateUnit);
  const dePersona = lineas.filter((l) => !esLineaDeDescuento(l) && !esLineaDeGratuidad(l) && !deUnidad(l));
  const gratis = lineas.filter(esLineaDeGratuidad);

  const cantidad = new Map<LineaDeActividad, number>();
  const nuevas: LineaDeActividad[] = [];
  let aviso: string | null = null;

  for (const l of lineas) {
    // El descuento en euros es «por alumno»: tantos como alumnos.
    if (esLineaDeDescuento(l)) {
      if (l.cantidad === antes.alumnos) cantidad.set(l, ahora.alumnos);
      continue;
    }
    // Por grupo de N personas: los grupos que hagan falta. Lo demás por unidad no depende del grupo.
    if (deUnidad(l)) {
      const t = tarifas[l.rateId];
      if (unidadDeTarifa(t?.rateUnit) === "PER_GROUP" && t?.maxPax && personasAntes > 0 && l.cantidad === Math.ceil(personasAntes / t.maxPax)) {
        cantidad.set(l, Math.max(1, Math.ceil(personasAhora / t.maxPax)));
      }
    }
  }

  if (dePersona.length > 0 || gratis.length > 0) {
    const gratisAntes = gratis.reduce((s, l) => s + l.cantidad, 0);
    const pagoAntes = antes.profesores - gratisAntes;
    const encaje = encajar(dePersona, gratis, antes.alumnos, pagoAntes);
    if (!encaje) return { lineas, aviso: AVISO_REPARTO_A_MANO };

    // La gratuidad se vuelve a calcular con su regla solo si la propuesta la seguía; si quien
    // cotizó puso otra cosa, se respeta lo que puso (sin pasarse de los profesores que van).
    const regla = gratuidad && gratuidad.tipo !== "consultar" ? gratuidad : null;
    const seguiaLaRegla = regla !== null && profesoresGratis(regla, antes.alumnos, antes.profesores) === gratisAntes;
    const gratisAhora = seguiaLaRegla ? profesoresGratis(regla, ahora.alumnos, ahora.profesores) : Math.min(gratisAntes, ahora.profesores);
    const pagoAhora = ahora.profesores - gratisAhora;
    const { deAlumnos, deProfesores } = encaje;
    const lineaGratis = gratis[0] ?? null;

    if (deAlumnos && deProfesores) {
      cantidad.set(deAlumnos, ahora.alumnos);
      cantidad.set(deProfesores, pagoAhora);
    } else if (deAlumnos) {
      // Antes no pagaba ningún profesor y ahora sí: a su tarifa de adulto si se conoce (la de la gratuidad).
      const idDeAdulto = lineaGratis && tarifaBase(lineaGratis.rateId) !== deAlumnos.rateId ? tarifaBase(lineaGratis.rateId) : null;
      const adulto = idDeAdulto ? tarifas[idDeAdulto] : undefined;
      const precioDeAdulto = Number(adulto?.salePvpAmount);
      if (pagoAntes === 0 && pagoAhora > 0 && idDeAdulto && Number.isFinite(precioDeAdulto) && precioDeAdulto > 0) {
        cantidad.set(deAlumnos, ahora.alumnos);
        nuevas.push({ rateId: idDeAdulto, etiqueta: adulto?.ageLabel || "Tarifa única", precio: precioDeAdulto, cantidad: pagoAhora });
      } else {
        cantidad.set(deAlumnos, ahora.alumnos + pagoAhora);
        if (pagoAntes === 0 && pagoAhora > 0) {
          aviso = `${pagoAhora} ${pagoAhora === 1 ? "profesor pasa" : "profesores pasan"} a pagar y se ${pagoAhora === 1 ? "ha" : "han"} sumado a la tarifa de los alumnos: comprueba si les corresponde otra.`;
        }
      }
    } else if (ahora.alumnos > 0 || pagoAhora > 0) {
      // Solo había gratuidad: no hay tarifa con la que cobrar a quien ahora paga.
      return { lineas, aviso: AVISO_REPARTO_A_MANO };
    }

    if (lineaGratis) cantidad.set(lineaGratis, gratisAhora);
    else if (gratisAhora > 0) {
      const referencia = deProfesores ?? deAlumnos;
      if (referencia) nuevas.push({ rateId: idDeGratuidad(referencia.rateId), etiqueta: `${referencia.etiqueta} · gratuidad`, precio: 0, cantidad: gratisAhora });
    }
  }

  const resultado = [...lineas.map((l) => (cantidad.has(l) ? { ...l, cantidad: cantidad.get(l) as number } : l)), ...nuevas].filter((l) => l.cantidad > 0);
  return { lineas: resultado, aviso };
}

/** Una actividad de la propuesta, recalculada para el grupo nuevo. */
export interface ActividadConElGrupoNuevo {
  /** Si hay algo nuevo que guardar en la actividad (sus líneas han cambiado). */
  cambia: boolean;
  /** Las líneas de ahora; null si la actividad no lleva líneas (se cobra por persona, no hay nada que guardar). */
  lineas: LineaDeActividad[] | null;
  /** El total del grupo que se guarda con las líneas. */
  amountTotal: number | null;
  /** Lo que se suma por alumno (el total repartido entre los alumnos), con líneas. */
  porAlumno: number | null;
  /** Lo que costaba y lo que cuesta a todo el grupo; null si no tiene precio. */
  totalAntes: number | null;
  totalAhora: number | null;
  aviso: string | null;
}

export function actividadConElGrupoNuevo(
  actividad: ActividadDeLaPropuesta,
  antes: Grupo,
  ahora: Grupo,
  tarifas: Record<string, TarifaDeLaLinea | undefined> = {},
  gratuidad: GratuidadDeProfesores | null = null,
): ActividadConElGrupoNuevo {
  const lineas = lineasDeLaActividad(actividad);
  const totalAntes = totalDeLaActividad(actividad, antes.alumnos, antes.profesores);
  if (lineas.length === 0) {
    // Sin líneas se cobra por persona: el total sale del grupo y no hay nada guardado que cambiar.
    return { cambia: false, lineas: null, amountTotal: null, porAlumno: null, totalAntes, totalAhora: totalDeLaActividad(actividad, ahora.alumnos, ahora.profesores), aviso: null };
  }
  const recalculadas = lineasConElGrupoNuevo(lineas, antes, ahora, tarifas, gratuidad);
  const cambia = JSON.stringify(recalculadas.lineas) !== JSON.stringify(lineas);
  if (!cambia) return { cambia: false, lineas, amountTotal: null, porAlumno: null, totalAntes, totalAhora: totalAntes, aviso: recalculadas.aviso };
  const total = totalDeLineas(recalculadas.lineas);
  return { cambia: true, lineas: recalculadas.lineas, amountTotal: total, porAlumno: porAlumno(recalculadas.lineas, ahora.alumnos), totalAntes, totalAhora: total, aviso: recalculadas.aviso };
}
