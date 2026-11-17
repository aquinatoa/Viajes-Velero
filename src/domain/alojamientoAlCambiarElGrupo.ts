/**
 * El alojamiento de una opción cuando cambia el grupo y NO se puede volver a
 * consultar su tarifa.
 *
 * Pasa con los hoteles de fuera del catálogo (los que se cotizan a mano) y con
 * las propuestas cuyo hotel perdió el enlace al republicarse su documento de
 * tarifas. Hasta el 17/11/2026 el cambio decía «ya no hay tarifa: hay que
 * elegir otro hotel» aunque solo cambiara el número de alumnos, y obligaba a
 * rehacer la propuesta entera en el cotizador.
 *
 * Si lo único que cambia es el grupo, no hace falta la tarifa: el desglose de
 * la propuesta ya dice cuánto paga cada alumno y cada profesor por noche
 * («43,13 € x 48 alumnos + 43,13 € x 4 profesores (…), por noche x 4 noches»).
 * Se rehace la cuenta con esos mismos precios y el grupo nuevo.
 *
 * Solo se hace cuando el desglose es de los sencillos y da exactamente el total
 * que tenía la propuesta. Con bloques de alumnos, varios grupos de profesores o
 * cualquier cosa que no cuadre, devuelve `null`: mejor mandar al cotizador que
 * inventar un precio.
 *
 * Es lógica pura, sin pantalla y sin base de datos.
 */
import type { Grupo } from "./actividadesAlCambiarElGrupo";
import { importeDesdeTexto } from "./desgloseDeOpcion";

export interface AlojamientoRecalculado {
  total: number;
  /** El desglose con el grupo nuevo, en el mismo formato en que se guarda. */
  desglose: string;
  /** El total repartido entre los alumnos, para compararlo con el de antes. */
  porAlumno: number | null;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

interface TramoLeido {
  total: (grupo: Grupo) => number;
  texto: (grupo: Grupo) => string;
}

function leerTramo(segmento: string, antes: Grupo): TramoLeido | null {
  const alumnos = [...segmento.matchAll(/([\d.]+,\d{2}) € x (\d+) alumnos/g)];
  const profesores = [...segmento.matchAll(/([\d.]+,\d{2}) € x (\d+) profesores/g)];
  const chofer = [...segmento.matchAll(/([\d.]+,\d{2}) € x (\d+) chófer/g)];
  const noches = /por noche x (\d+) noche/.exec(segmento);
  if (alumnos.length !== 1 || profesores.length > 1 || !noches) return null;
  if (Number(alumnos[0][2]) !== antes.alumnos) return null;
  if (profesores.length === 1 && Number(profesores[0][2]) !== antes.profesores) return null;

  const porAlumno = importeDesdeTexto(alumnos[0][1]);
  const porProfesor = profesores.length === 1 ? importeDesdeTexto(profesores[0][1]) : null;
  if (porAlumno === null || (profesores.length === 1 && porProfesor === null)) return null;
  // El chófer no depende del grupo: se queda como está.
  const delChofer = chofer.reduce((s, m) => s + (importeDesdeTexto(m[1]) ?? 0) * Number(m[2]), 0);
  const k = Number(noches[1]);

  return {
    total: (grupo) => (porAlumno * grupo.alumnos + (porProfesor ?? 0) * (profesores.length === 1 ? grupo.profesores : 0) + delChofer) * k,
    texto: (grupo) =>
      segmento
        .replace(/ € x \d+ alumnos/, ` € x ${grupo.alumnos} alumnos`)
        .replace(/ € x \d+ profesores/, ` € x ${grupo.profesores} profesores`),
  };
}

/**
 * La opción con el grupo nuevo, a los mismos precios por persona y noche.
 * `null` si el desglose no se puede leer con seguridad o no da el total de antes.
 */
export function alojamientoConElGrupoNuevo(
  priceBreakdownText: string | null | undefined,
  totalDeAntes: number | null,
  antes: Grupo,
  ahora: Grupo,
): AlojamientoRecalculado | null {
  const texto = (priceBreakdownText ?? "").replace(/\s+/g, " ").trim();
  if (!texto || totalDeAntes === null) return null;
  const segmentos = texto.split(" · ");
  const tramos = segmentos.map((s) => leerTramo(s, antes));
  if (tramos.some((t) => t === null)) return null;
  const leidos = tramos as TramoLeido[];

  // Si el desglose no lleva a los profesores (van gratis o no van), cambiar su número no se puede cobrar desde aquí.
  const llevaProfesores = / € x \d+ profesores/.test(texto);
  if (!llevaProfesores && ahora.profesores !== antes.profesores) return null;

  // La cuenta leída tiene que dar el total que tenía la propuesta: si no, hay algo más que no está en el texto.
  const comprobacion = redondear(leidos.reduce((s, t) => s + t.total(antes), 0));
  if (Math.abs(comprobacion - totalDeAntes) > 0.05) return null;

  const total = redondear(leidos.reduce((s, t) => s + t.total(ahora), 0));
  return {
    total,
    desglose: leidos.map((t) => t.texto(ahora)).join(" · "),
    porAlumno: ahora.alumnos > 0 ? redondear(total / ahora.alumnos) : null,
  };
}
