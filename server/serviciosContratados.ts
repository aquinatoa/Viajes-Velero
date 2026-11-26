import { PrismaClient } from "@prisma/client";
import { desgloseDeLaOpcion } from "../src/domain/desgloseDeOpcion";
import { filasDeLasActividades, lineasDeLaActividad, type FilaDeActividad } from "../src/domain/actividadesContratadas";
import { MARCA_GRATUIDAD } from "../src/domain/lineasDeActividad";
import {
  buscarIdPorNombre,
  buscarPorNombreParecido,
  crearRegistro,
  escribirServiciosContratados,
  leerServiciosContratados,
  updateZohoDeal,
  type FilaExistente,
} from "./zoho";

export { desgloseDeLaOpcion, importeDesdeTexto } from "../src/domain/desgloseDeOpcion";

const prisma = new PrismaClient();

/**
 * Lo contratado, en la tabla del trato.
 *
 * Anthony, 07/10/2026: «esa es la tabla que se tiene que actualizar: Servicios
 * Contratados». Cuando el colegio elige una opción (o se marca desde la ficha)
 * la app escribía en el trato la fase y una nota, y lo contratado de verdad
 * —qué hotel, cuántos alumnos, a qué precio, cuántas noches— lo tenía que
 * teclear alguien a mano en el subformulario, como hacen con LA SALLE
 * DONOSTIA 2027: una fila «ALUMNOS EN MÚLTIPLE - PC» y otra «PROFESORES EN
 * DOBLE - PC», cada una con pasajeros, precio por persona y noche, coste y
 * noches. El Importe del trato es la suma.
 *
 * Esto rellena esas filas desde la opción elegida. El desglose de la opción
 * está guardado como texto («43,13 € x 48 alumnos + 60,11 € x 8 profesores
 * (uso individual), por noche x 4 noches») porque la propuesta es una foto;
 * se lee de ahí, y el formato es nuestro, así que se lee sin adivinar.
 *
 * «Servicio» y «Proveedor» son enlaces a Productos y Proveedores del CRM: se
 * buscan por nombre y, si no existen, se crean. El producto sigue su patrón
 * («Habitación Múltiple - Hotel - PC»); lo que ellos tengan ya con ese nombre
 * se reutiliza.
 *
 * Lo que hacen SUS funciones con estas filas (código que nos pasó Anthony el
 * 13/10/2026, porque la API no deja leerlo):
 *
 * - «NEO_Actualizar_Totales_Por_Presupuesto», en cada edición del trato: el
 *   Importe es la suma de las filas con `Validado`, con `Coste` Y `Precio`, y
 *   del presupuesto `N_Presupuesto_Subformulario`. Una fila sin coste o sin
 *   validar no cuenta: por eso el Importe se quedaba a 0. Si el producto es
 *   «P.Pax», cuenta Viajeros × Cantidad × Precio.
 * - «JZ_NEO_Subform_Servicios_Contratados»: rehace las filas; si una no trae
 *   Coste copia el «Precio de coste» del producto, y en P.Pax pone en
 *   Cantidad las noches entre entrada y salida. Las filas salen con id nuevo,
 *   así que las nuestras se reconocen por la referencia en Comentarios.
 *
 * Así que cada fila lleva su coste, y se marca validada solo si el coste se
 * sabe: el precio sale de una tarifa ya aprobada en la revisión por
 * proveedor. Si el coste no se sabe, la fila va sin validar y lo dice.
 */

/** El régimen de la app (SA/AD/MP/PC o texto) → la lista del CRM. */
export function regimenEnCrm(boardType: string | null | undefined): string | null {
  const b = (boardType ?? "").trim().toLowerCase();
  if (!b) return null;
  if (b === "pc" || b.includes("completa")) return "Pensión Completa";
  if (b === "mp" || b.includes("media") || b.startsWith("mp+")) return "Media Pensión";
  if (b === "ad" || b.includes("desayuno")) return "Alojamiento y Desayuno";
  if (b === "sa" || b.includes("solo")) return "Solo Alojamiento";
  return null;
}

/** La abreviatura que usan ellos en el nombre del producto. */
function regimenCorto(boardType: string | null | undefined): string {
  const r = regimenEnCrm(boardType);
  return r === "Pensión Completa" ? "PC" : r === "Media Pensión" ? "MP" : r === "Alojamiento y Desayuno" ? "AD" : r === "Solo Alojamiento" ? "SA" : "";
}

/**
 * El hotel como lo nombran ellos: «Hotel Planas 3* (Salou)» → «Hotel Planas».
 * Fuera las estrellas, lo que va entre paréntesis y lo que sigue a un guion
 * largo («4R Hotels 3* – Salou & Calafell (…)» → «4R Hotels»).
 */
export function nombreCortoDelHotel(snapshot: string | null | undefined): string {
  return (snapshot ?? "")
    .split(/\s[–—-]\s/)[0]
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d\s*\*+/g, " ")
    .replace(/\*+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PALABRAS_VACIAS = new Set(["hotel", "hotels", "hostal", "camping", "aparthotel", "apartamentos", "resort", "de", "del", "la", "el", "los", "las", "y", "&", "en"]);

/** Las palabras que de verdad identifican al hotel, sin tildes ni mayúsculas. */
export function palabrasClave(nombreCorto: string): string[] {
  return nombreCorto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 1 && !PALABRAS_VACIAS.has(p));
}

function normalizado(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Entre los proveedores que contienen la palabra más larga del hotel, el que
 * contiene TODAS sus palabras clave. Si hay exactamente uno, es él; si hay
 * varios o ninguno, null: no se adivina.
 */
export function elegirProveedor(
  nombreCorto: string,
  candidatos: Array<{ id: string; nombre: string }>,
): { id: string; nombre: string } | null {
  const claves = palabrasClave(nombreCorto);
  if (claves.length === 0) return null;
  const conTodas = candidatos.filter((c) => claves.every((k) => normalizado(c.nombre).includes(k)));
  if (conTodas.length === 1) return conTodas[0];
  // «CAMPING LA SIESTA» y «LA SIESTA BEACH CLUB» contienen «siesta»; el que
  // no tiene ninguna palabra de más es el nuestro.
  const mismasPalabras = conTodas.filter((c) => palabrasClave(c.nombre).join(" ") === claves.join(" "));
  return mismasPalabras.length === 1 ? mismasPalabras[0] : null;
}

/**
 * Proveedores de actividades que en su CRM se escriben de otra forma y que
 * ninguna regla de palabras reconoce. Nuestro nombre (el del catálogo, sin
 * tildes ni mayúsculas) → el suyo, exacto. Leído en su CRM el 20/11/2026.
 */
export const PROVEEDORES_CON_OTRO_NOMBRE: Record<string, string> = {
  "portaventura world": "PORT AVENTURA ENTERTAINMENT S.A.U.",
  "escola de vela club nautic comarruga": "CLUB NAUTIC COMA-RUGA",
  // Los extras de fútbol son de MARSOPA, «mismo proveedor que los campos»
  // (Javier, 24/11/2026). En su CRM no hay ningún «MARSOPA»: los campos están
  // en «Futbol Salou» (leído el 25/11/2026).
  marsopa: "Futbol Salou",
};

/** El nombre del proveedor en su CRM si es uno de los que se escriben distinto. */
export function nombreDelProveedorEnElCrm(nombre: string): string | null {
  return PROVEEDORES_CON_OTRO_NOMBRE[normalizado(nombre).replace(/\s+/g, " ").trim()] ?? null;
}

/** Forma jurídica y palabras que no distinguen a un proveedor de actividades. */
const SIN_PESO_EN_PROVEEDOR = new Set(["sl", "slu", "sa", "sau", "grup", "grupo"]);

function clavesDeProveedor(nombre: string): string[] {
  return [...new Set(palabrasClave(nombre).filter((p) => !SIN_PESO_EN_PROVEEDOR.has(p)))];
}

/**
 * El proveedor de una ACTIVIDAD entre los candidatos de su CRM.
 *
 * Primero, la regla de los hoteles (el suyo contiene todas nuestras palabras).
 * Si no, la contraria: nuestro nombre del catálogo suele llevar algo de más
 * («Bosc Aventura Salou», «Grup Balfegó», «La Suite Games (Escapépolis)»,
 * «UTE Playa (UTE Lot)») y el suyo es el corto («BOSC AVENTURA», «BALFEGO»,
 * «LA SUITE GAMES», «UTE PLAYA»). Vale el candidato cuyas palabras están
 * TODAS en el nuestro y cubren al menos la mitad de las nuestras; si hay más
 * de uno, null: no se adivina.
 */
export function elegirProveedorDeActividad(
  nombre: string,
  candidatos: Array<{ id: string; nombre: string }>,
): { id: string; nombre: string } | null {
  // Se buscan por varias palabras: el mismo puede llegar dos veces y no es un empate.
  const unicos = [...new Map(candidatos.map((c) => [c.id, c])).values()];
  const directo = elegirProveedor(nombre, unicos);
  if (directo) return directo;
  const nuestras = clavesDeProveedor(nombre);
  if (nuestras.length === 0) return null;
  const dentro = unicos.filter((c) => {
    const suyas = clavesDeProveedor(c.nombre);
    return suyas.length > 0 && suyas.every((k) => nuestras.includes(k)) && suyas.length * 2 >= nuestras.length;
  });
  return dentro.length === 1 ? dentro[0] : null;
}

const centimos = (n: number) => Math.round(n * 100);

/**
 * El coste de un precio de venta, buscado en las tarifas del hotel y régimen:
 * las que se venden a ese precio y, de ellas, su neto. Si todas dicen el mismo
 * neto, ese es el coste; si no hay ninguna, o dicen netos distintos, o la
 * tarifa vino de un papel de venta (sin neto), null: no se adivina.
 *
 * La propuesta guarda el precio pero no el coste, y su enlace al hotel se
 * pierde cuando se vuelve a publicar el documento (ORV-2026-0006 lo había
 * perdido el 13/10), así que se busca por nombre en el catálogo de hoy.
 */
export function costeDelPrecio(
  precio: number,
  tarifas: Array<{ pvp: number | null; neto: number | null }>,
): number | null {
  const netos = new Set(
    tarifas
      .filter((t) => t.pvp !== null && centimos(t.pvp) === centimos(precio))
      .map((t) => (t.neto !== null && t.neto > 0 ? centimos(t.neto) : -1)),
  );
  if (netos.size !== 1) return null;
  const [unico] = [...netos];
  return unico > 0 ? unico / 100 : null;
}

/**
 * Qué filas del trato se quedan y con qué número de presupuesto van las
 * nuestras.
 *
 * La API v8 CONSERVA las filas que no se mandan; para quitar una hay que
 * nombrarla con `_delete` (13/10/2026: las dos filas viejas del trato de
 * prueba se quedaron al lado de las nuevas). Se borran solo las que escribió
 * la app para ESTA propuesta (llevan su referencia en Comentarios); las demás
 * no se tocan. Y si ya había filas ajenas, las nuestras van en otro
 * presupuesto (el siguiente libre) para no sumarse a las suyas; si la app ya
 * había escrito antes, repite su número.
 */
export function planDelSubformulario(
  existentes: FilaExistente[],
  referencia: string,
): { conservar: string[]; borrar: string[]; numero: number } {
  const nuestras = existentes.filter((f) => (f.comentarios ?? "").includes(referencia));
  const ajenas = existentes.filter((f) => !(f.comentarios ?? "").includes(referencia));
  const numeroPrevio = nuestras.find((f) => f.numero !== null)?.numero ?? null;
  const usados = ajenas.map((f) => f.numero ?? 1);
  const numero = numeroPrevio ?? (usados.length ? Math.max(...usados) + 1 : 1);
  return { conservar: ajenas.map((f) => f.id), borrar: nuestras.map((f) => f.id), numero };
}

/** Una fila del subformulario, todavía con nombres en vez de ids. */
export interface FilaContratada {
  quien: "alumnos" | "profesores" | "chofer";
  /** El tramo de la estancia (0 si es uno solo) y si hay más de uno. */
  tramo?: number;
  /**
   * El grupo, si van en varias habitaciones (0 = el primero): de profesores, de
   * chóferes o, desde el 05/11/2026, los BLOQUES de alumnos con otra habitación
   * y otra pensión (el 0 es el grupo principal).
   */
  grupo?: number;
  variosTramos?: boolean;
  comentario: string;
  pax: number;
  precio: number;
  noches: number;
  producto: string;
  proveedor: string;
  regimen: string | null;
  fechaEntrada: string | null;
  fechaSalida: string | null;
}

export interface OpcionParaContratar {
  accommodationNameSnapshot: string | null;
  boardType: string | null;
  dateFrom: Date | string | null;
  dateTo: Date | string | null;
  priceBreakdownText: string | null;
  totalPvpText: string | null;
  /** El coste guardado al cotizar (desde el 15/10/2026). Decimal de Prisma o número. */
  studentCostAmount?: unknown;
  teacherCostAmount?: unknown;
  /** El coste de cada tramo (desde el 20/10/2026). */
  costsJson?: string | null;
}

interface CosteDeTramo {
  alumno: number | null;
  profesor: number | null;
  chofer: number | null;
  /** Con grupos en varias habitaciones: el coste de cada uno, en el orden del desglose. */
  profesores?: Array<number | null>;
  choferes?: Array<number | null>;
  /** Con bloques de alumnos: el coste de cada uno, el principal primero. */
  alumnos?: Array<number | null>;
}

function costesDeTramos(json: string | null | undefined): CosteDeTramo[] | null {
  if (!json) return null;
  try {
    const lista = JSON.parse(json) as CosteDeTramo[];
    return Array.isArray(lista) ? lista : null;
  } catch {
    return null;
  }
}

function numeroONulo(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * El coste de una fila: el que se guardó al cotizar, si lo hay; si no (las
 * propuestas de antes del 15/10/2026), el que se deduce del catálogo por el
 * precio. Un alojamiento ad hoc solo tiene el guardado.
 */
export function costeDeLaFila(
  fila: Pick<FilaContratada, "quien" | "precio" | "tramo" | "variosTramos" | "grupo">,
  opcion: Pick<OpcionParaContratar, "studentCostAmount" | "teacherCostAmount" | "costsJson">,
  tarifas: Array<{ pvp: number | null; neto: number | null }>,
): number | null {
  // El de su tramo, si la propuesta lo guardó (desde el 20/10/2026).
  const tramos = costesDeTramos(opcion.costsJson);
  if (tramos) {
    const t = tramos[fila.tramo ?? 0];
    const g = fila.grupo ?? 0;
    const delTramo = numeroONulo(
      fila.quien === "profesores"
        ? (t?.profesores?.[g] ?? (g === 0 ? t?.profesor : null))
        : fila.quien === "chofer"
          ? (t?.choferes?.[g] ?? (g === 0 ? t?.chofer : null))
          : (t?.alumnos?.[g] ?? (g === 0 ? t?.alumno : null)),
    );
    return delTramo ?? costeDelPrecio(fila.precio, tarifas);
  }
  // Propuestas de antes: el coste guardado era el de UNA tarifa. Solo vale si
  // la estancia es de un solo tramo; si no, se deduce del catálogo por el
  // precio (y si no sale, la fila queda sin validar).
  const unSoloTramo = !fila.variosTramos;
  const guardado = unSoloTramo
    ? numeroONulo(fila.quien === "profesores" ? opcion.teacherCostAmount : fila.quien === "alumnos" && !fila.grupo ? opcion.studentCostAmount : null)
    : null;
  return guardado ?? costeDelPrecio(fila.precio, tarifas);
}

function fecha(valor: Date | string | null): string | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Las filas de la opción: alumnos (en múltiple) y, si los hay, profesores
 * (en individual si tenían tarifa propia; si no, en múltiple al mismo precio).
 */
export function filasDeLaOpcion(opcion: OpcionParaContratar): { filas: FilaContratada[]; total: number | null } | null {
  const d = desgloseDeLaOpcion(opcion.priceBreakdownText, opcion.totalPvpText);
  const hotel = (opcion.accommodationNameSnapshot ?? "").trim();
  if (!d || !hotel) return null;

  const hotelCorto = nombreCortoDelHotel(hotel) || hotel;
  // En el nombre del producto, como ellos: «Canada Palace», sin «Hotel».
  const hotelEnProducto = hotelCorto.replace(/^hotel\s+/i, "");
  const NOMBRE: Record<"INDIVIDUAL" | "DOBLE" | "MULTIPLE", string> = {
    INDIVIDUAL: "Individual",
    DOBLE: "Doble",
    MULTIPLE: "Múltiple",
  };

  // Un tramo por régimen y noches seguidas (Ruth, 19/10/2026: «MP y PC
  // mezcladas»). Con un solo tramo, las filas de siempre.
  const filas: FilaContratada[] = [];
  let desplazamiento = 0;
  for (const [numeroDeTramo, tramo] of d.tramos.entries()) {
    const regimenGrupo = tramo.regimen ?? opcion.boardType;
    const entrada = sumarDias(opcion.dateFrom, desplazamiento);
    const salida = d.tramos.length > 1 ? sumarDias(opcion.dateFrom, desplazamiento + tramo.noches) : fecha(opcion.dateTo);
    desplazamiento += tramo.noches;
    const fila = (
      quien: FilaContratada["quien"],
      etiqueta: string,
      habitacion: "INDIVIDUAL" | "DOBLE" | "MULTIPLE",
      pax: number,
      precio: number,
      regimenPropio: string | null | undefined,
      grupo = 0,
    ): FilaContratada => {
      const regimen = regimenPropio || regimenGrupo;
      const corto = regimenCorto(regimen);
      const sufijo = corto ? ` - ${corto}` : "";
      const tipo = NOMBRE[habitacion];
      return {
        quien,
        tramo: numeroDeTramo,
        ...(grupo > 0 ? { grupo } : {}),
        variosTramos: d.tramos.length > 1,
        comentario: `${etiqueta} EN ${tipo.toUpperCase()}${sufijo}`,
        pax,
        precio,
        noches: tramo.noches,
        producto: `Habitación ${tipo} - ${hotelEnProducto}${sufijo}`,
        proveedor: hotelCorto,
        regimen: regimenEnCrm(regimen),
        fechaEntrada: entrada,
        fechaSalida: salida,
      };
    };
    filas.push(fila("alumnos", "ALUMNOS", "MULTIPLE", tramo.alumnos.pax, tramo.alumnos.precio, null));
    // Los bloques de alumnos con otra habitación y otra pensión: una fila cada uno
    // (Oravia, 05/11/2026: «asignación por colectivo, tipo de habitación y régimen»).
    (tramo.alumnosGrupos ?? []).forEach((a, i) => {
      if (a.pax > 0) filas.push(fila("alumnos", "ALUMNOS", a.habitacion, a.pax, a.precio, a.regimen, i + 1));
    });
    // Profesores y chóferes: una fila por habitación (Ruth, 21/10/2026).
    const profesores = tramo.profesoresGrupos ?? (tramo.profesores ? [tramo.profesores] : []);
    // Las plazas de gratuidad del hotel (06/11/2026) no se cobran ni cuestan: no son una fila.
    // El índice `g` se conserva, que es el del coste de cada grupo en `costsJson`.
    profesores.forEach((p, g) => {
      if (p.pax > 0 && !p.gratuidad) filas.push(fila("profesores", "PROFESORES", p.habitacion, p.pax, p.precio, p.regimen, g));
    });
    const choferes = tramo.choferGrupos ?? (tramo.chofer ? [tramo.chofer] : []);
    choferes.forEach((c, g) => {
      if (c.pax > 0 && !c.gratuidad) filas.push(fila("chofer", "CHÓFER", c.habitacion, c.pax, c.precio, c.regimen, g));
    });
  }
  return { filas, total: d.total };
}

/** La fecha de entrada más N días, como «AAAA-MM-DD». */
function sumarDias(desde: Date | string | null, dias: number): string | null {
  const base = fecha(desde);
  if (!base) return null;
  const d = new Date(`${base}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export interface ResultadoDeContratar {
  dealId: string;
  filas: number;
  total: number | null;
  /** Filas que van sin validar porque no se sabe su coste. */
  sinCoste: number;
  presupuesto: number;
  conservadas: number;
  creados: string[];
}

/** Las tarifas del hotel y régimen de la opción, en el catálogo de hoy. */
async function tarifasDelHotel(
  opcion: { accommodationId: string | null; accommodationNameSnapshot: string | null; boardType: string | null },
): Promise<Array<{ pvp: number | null; neto: number | null }>> {
  const nombre = (opcion.accommodationNameSnapshot ?? "").trim();
  const donde = [
    ...(opcion.accommodationId ? [{ id: opcion.accommodationId }] : []),
    ...(nombre ? [{ accommodationName: nombre }] : []),
  ];
  if (donde.length === 0) return [];
  // «MP + PC» son dos pensiones; y «PC (PRECIO FINAL…)» empieza por PC.
  const pensiones = (opcion.boardType ?? "").split("+").map((p) => p.trim()).filter(Boolean);
  const rates = await prisma.accommodationRate.findMany({
    where: {
      accommodation: { OR: donde },
      ...(pensiones.length ? { OR: pensiones.map((p) => ({ boardType: { startsWith: p } })) } : {}),
    },
    select: { pvpAmount: true, netSaleAmount: true },
  });
  return rates.map((r) => ({
    pvp: r.pvpAmount === null ? null : Number(r.pvpAmount),
    neto: r.netSaleAmount === null ? null : Number(r.netSaleAmount),
  }));
}

/**
 * Escribe en el trato lo contratado de UNA entrega. No lanza: lo que falle se
 * apunta en el registro, porque la elección del colegio ya está guardada y no
 * puede depender de Zoho.
 */
export async function contratarEnElCrm(deliveryId: string, optionNumber: number): Promise<ResultadoDeContratar | null> {
  try {
    const delivery = await prisma.proposalDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        proposal: {
          include: {
            accommodationOptions: true,
            activityOptions: true,
            tripRequest: { select: { crmDealId: true, dateFrom: true, participants: true, teachers: true } },
          },
        },
      },
    });
    const dealId = delivery?.proposal?.tripRequest?.crmDealId ?? null;
    if (!delivery || !dealId) {
      console.info(`[crm] ${deliveryId}: sin trato en el CRM, no hay dónde escribir lo contratado.`);
      return null;
    }
    // Con o sin hotel, las actividades de la opción también se contratan
    // (Oravia, 16/11/2026: «las actividades no suben»). Solo actividades
    // (Ruth, 02/11/2026): no hay alojamiento, pero sí sus filas.
    const soloActividades = delivery.proposal.accommodationOptions.length === 0;
    const opcion = delivery.proposal.accommodationOptions.find((o) => o.optionNumber === optionNumber) ?? null;
    if (!soloActividades && !opcion) {
      console.error(`[crm] ${delivery.reference}: la opción ${optionNumber} no existe en la propuesta.`);
      return null;
    }
    const plan = opcion ? filasDeLaOpcion(opcion) : { filas: [], total: 0 };
    if (!plan) {
      console.error(`[crm] ${delivery.reference}: no se pudo leer el desglose de la opción ${optionNumber}: «${opcion?.priceBreakdownText}».`);
      return null;
    }

    const delPrograma = await actividadesParaContratar(delivery.proposal, opcion, optionNumber, soloActividades);
    if (delPrograma.sinPrecio.length) {
      console.info(`[crm] ${delivery.reference}: actividades sin precio, fuera de Servicios Contratados: ${delPrograma.sinPrecio.join(", ")}.`);
    }
    if (plan.filas.length === 0 && delPrograma.filas.length === 0) {
      console.info(`[crm] ${delivery.reference}: nada con precio que poner en Servicios Contratados.`);
      await updateZohoDeal({ dealId, chosenOption: optionNumber });
      return null;
    }

    const tarifas = opcion ? await tarifasDelHotel(opcion) : [];
    const existentes = await leerServiciosContratados(dealId);
    const { conservar, borrar, numero } = planDelSubformulario(existentes, delivery.reference);

    const creados: string[] = [];
    const proveedor = plan.filas.length ? await idDeProveedor(plan.filas[0].proveedor, creados) : { id: "", nuevo: false };
    const categoria = delivery.department === "SPORTS" ? "Turismo Deportivo" : "Grupos";

    const filas = [];
    let sinCoste = 0;

    // Las actividades: cada una con SU proveedor (el del alojamiento no vale).
    const proveedoresDeActividad = new Map<string, { id: string; nuevo: boolean }>();
    for (const f of delPrograma.filas) {
      let suProveedor: { id: string; nuevo: boolean } | null = null;
      if (f.proveedor) {
        suProveedor = proveedoresDeActividad.get(f.proveedor) ?? null;
        if (!suProveedor) {
          suProveedor = await idDeProveedorDeActividad(f.proveedor, creados);
          proveedoresDeActividad.set(f.proveedor, suProveedor);
        }
      }
      if (f.coste === null) sinCoste += 1;
      const productoId = await idDeProductoDeActividad(f, suProveedor?.id ?? null, categoria, delivery.reference, creados);
      const avisos = [
        ...(!suProveedor ? ["sin proveedor en la propuesta: ponerlo"] : suProveedor.nuevo ? ["proveedor nuevo en el CRM: revisar"] : []),
        ...(f.coste === null ? ["falta el coste: poner Coste y marcar Validado"] : []),
      ];
      filas.push({
        N_Presupuesto: numero,
        Servicio: { id: productoId },
        ...(suProveedor ? { Proveedor: { id: suProveedor.id } } : {}),
        Viajeros: f.pax,
        Precio: f.precio,
        Coste: f.coste,
        Cantidad: f.cantidad,
        // La misma fecha en entrada y salida, como las rellenan ellos: su
        // función pone en Cantidad las noches entre las dos cuando es P.Pax.
        Fecha_Entrada: f.fecha,
        Fecha_Salida: f.fecha,
        Unidad_de_uso: f.unidad,
        Tipo_de_Servicio: "Actividad",
        Comentarios: [f.comentario, delivery.reference, ...avisos].join(" · "),
        Validado: f.coste !== null,
      });
    }

    for (const f of plan.filas) {
      if (!opcion) break;
      const coste = costeDeLaFila(f, opcion, tarifas);
      if (coste === null) sinCoste += 1;
      const productoId = await idDeProducto(f, coste, proveedor.id, categoria, delivery.reference, creados);
      const avisos = [
        ...(proveedor.nuevo ? ["proveedor nuevo en el CRM: revisar"] : []),
        ...(coste === null ? ["falta el coste: poner Coste y marcar Validado"] : []),
      ];
      filas.push({
        N_Presupuesto: numero,
        Servicio: { id: productoId },
        Proveedor: { id: proveedor.id },
        Viajeros: f.pax,
        Precio: f.precio,
        Coste: coste,
        Cantidad: f.noches,
        Fecha_Entrada: f.fechaEntrada,
        Fecha_Salida: f.fechaSalida,
        Regimen: f.regimen,
        Unidad_de_uso: "P.Pax",
        Tipo_de_Servicio: "Alojamiento",
        Comentarios: [f.comentario, delivery.reference, ...avisos].join(" · "),
        // Sin coste, su función no la sumaría aunque fuera validada; y validar
        // una fila sin coste diría que está revisada cuando no lo está.
        Validado: coste !== null,
      });
    }

    // El importe del trato: el alojamiento MÁS las actividades de la opción.
    const total =
      plan.total == null && delPrograma.total === 0 ? plan.total : Math.round(((plan.total ?? 0) + delPrograma.total) * 100) / 100;
    await escribirServiciosContratados(dealId, [...borrar.map((id) => ({ id, _delete: null })), ...filas], numero, total);
    // Y la línea de opción elegida, la misma que escribe el botón de Viajes.
    await updateZohoDeal({ dealId, chosenOption: optionNumber });

    console.info(
      `[crm] ${delivery.reference}: ${filas.length} fila(s) en Servicios Contratados (presupuesto ${numero}` +
        (conservar.length ? `, ${conservar.length} fila(s) ajenas conservadas` : "") +
        `), importe ${total ?? "?"} (${delPrograma.filas.length} de actividades, ${delPrograma.total})` +
        (sinCoste ? `, ${sinCoste} sin coste: sin validar` : "") +
        (creados.length ? `, creados: ${creados.join(", ")}` : "") +
        ".",
    );
    return { dealId, filas: filas.length, total, sinCoste, presupuesto: numero, conservadas: conservar.length, creados };
  } catch (error) {
    console.error("[crm] no se pudo escribir lo contratado", error);
    return null;
  }
}

/**
 * El proveedor del CRM para este hotel. Ellos los llaman «HOTEL PLANAS»,
 * «CAMPING LA SIESTA»: se busca por parecido y solo se acepta si hay uno
 * claro. Si no, se crea con el nombre corto en mayúsculas, como los suyos, y
 * la fila lo dice para que alguien lo revise o lo fusione.
 */
async function idDeProveedor(nombreCorto: string, creados: string[]): Promise<{ id: string; nuevo: boolean }> {
  const exacto = await buscarIdPorNombre("Vendors", "Vendor_Name", nombreCorto);
  if (exacto) return { id: exacto, nuevo: false };

  const claves = palabrasClave(nombreCorto);
  const masLarga = [...claves].sort((a, b) => b.length - a.length)[0];
  if (masLarga) {
    const candidatos = await buscarPorNombreParecido("Vendors", "Vendor_Name", masLarga);
    const elegido = elegirProveedor(nombreCorto, candidatos);
    if (elegido) return { id: elegido.id, nuevo: false };
  }

  const nombre = nombreCorto.toUpperCase();
  const id = await crearRegistro("Vendors", { Vendor_Name: nombre });
  creados.push(`proveedor «${nombre}»`);
  return { id, nuevo: true };
}

/**
 * El proveedor del CRM para una actividad (20/11/2026). Antes se buscaba como
 * un hotel y 6 de los 15 proveedores del catálogo no se reconocían: se habrían
 * creado duplicados («PORTAVENTURA WORLD» junto a su «PORT AVENTURA
 * ENTERTAINMENT S.A.U.»). Ahora: equivalencia fija, nombre exacto, y si no,
 * los candidatos de sus tres palabras más largas con `elegirProveedorDeActividad`.
 * Solo si nada encaja se crea, y la fila lo dice para que lo revisen.
 */
async function idDeProveedorDeActividad(nombre: string, creados: string[]): Promise<{ id: string; nuevo: boolean }> {
  const suNombre = nombreDelProveedorEnElCrm(nombre);
  if (suNombre) {
    const id = await buscarIdPorNombre("Vendors", "Vendor_Name", suNombre);
    if (id) return { id, nuevo: false };
  }
  const exacto = await buscarIdPorNombre("Vendors", "Vendor_Name", nombre);
  if (exacto) return { id: exacto, nuevo: false };

  const claves = [...new Set(palabrasClave(nombre))].sort((a, b) => b.length - a.length).slice(0, 3);
  const candidatos: Array<{ id: string; nombre: string }> = [];
  for (const clave of claves) candidatos.push(...(await buscarPorNombreParecido("Vendors", "Vendor_Name", clave)));
  const elegido = elegirProveedorDeActividad(nombre, candidatos);
  if (elegido) return { id: elegido.id, nuevo: false };

  const nuevo = nombre.toUpperCase();
  const id = await crearRegistro("Vendors", { Vendor_Name: nuevo });
  creados.push(`proveedor «${nuevo}»`);
  return { id, nuevo: true };
}

/**
 * Las filas de las actividades de la opción elegida, con la unidad y el coste
 * de cada tarifa del catálogo y el día de la visita que se guardó al cotizar.
 */
async function actividadesParaContratar(
  proposal: {
    stayJson?: unknown;
    activityOptions: Array<{
      optionNumber: number;
      activityId: string | null;
      activityNameSnapshot: string;
      providerSnapshot: string | null;
      pvpSnapshot: string | null;
      linesJson: string | null;
      amountTotal: unknown;
      unitCostAmount: unknown;
    }>;
    tripRequest: { dateFrom?: Date | string | null; participants?: number | null; teachers?: number | null } | null;
  },
  opcion: { dateFrom?: Date | string | null; participants?: number | null; teachers?: number | null } | null,
  optionNumber: number,
  soloActividades: boolean,
): Promise<{ filas: FilaDeActividad[]; total: number; sinPrecio: string[] }> {
  // Solo con actividades no hay opciones de hotel: van todas.
  const actividades = proposal.activityOptions.filter((a) => soloActividades || a.optionNumber === optionNumber);
  if (actividades.length === 0) return { filas: [], total: 0, sinPrecio: [] };

  const ids = [
    ...new Set(
      actividades
        .flatMap((a) => lineasDeLaActividad(a).map((l) => l.rateId.replace(MARCA_GRATUIDAD, "")))
        .filter((id) => id && !id.startsWith("#")),
    ),
  ];
  const tarifas = ids.length
    ? await prisma.activityRate.findMany({ where: { id: { in: ids } }, select: { id: true, rateUnit: true, costNetAmount: true } })
    : [];

  let fechasDeVisita: Record<string, string> = {};
  try {
    const guardado = typeof proposal.stayJson === "string" ? JSON.parse(proposal.stayJson) : proposal.stayJson;
    fechasDeVisita = ((guardado as { fechasDeVisita?: Record<string, string> } | null)?.fechasDeVisita) ?? {};
  } catch {
    fechasDeVisita = {};
  }
  const dia = (valor: Date | string | null | undefined): string | null => {
    if (!valor) return null;
    const texto = valor instanceof Date ? valor.toISOString() : String(valor);
    return /^\d{4}-\d{2}-\d{2}/.test(texto) ? texto.slice(0, 10) : null;
  };

  return filasDeLasActividades(actividades, {
    alumnos: opcion?.participants ?? proposal.tripRequest?.participants ?? 0,
    profesores: opcion?.teachers ?? proposal.tripRequest?.teachers ?? 0,
    tarifas: Object.fromEntries(tarifas.map((t) => [t.id, t])),
    fechasDeVisita,
    fechaPorDefecto: dia(opcion?.dateFrom) ?? dia(proposal.tripRequest?.dateFrom),
  });
}

/**
 * El producto del CRM para una actividad. Por nombre exacto (los suyos ya
 * existen: «1 DIA AQUOPOLIS 2026 SOLO ENTRADA»); si no, se crea de tipo
 * «Actividad», con su unidad, su precio y su proveedor, y la fila lo dice.
 */
async function idDeProductoDeActividad(
  f: FilaDeActividad,
  proveedorId: string | null,
  categoria: string,
  referencia: string,
  creados: string[],
): Promise<string> {
  const existente = await buscarIdPorNombre("Products", "Product_Name", f.producto);
  if (existente) return existente;
  const id = await crearRegistro("Products", {
    Product_Name: f.producto,
    ...(proveedorId ? { Vendor_Name: { id: proveedorId } } : {}),
    Product_Active: true,
    Tipo_de_Servicio: "Actividad",
    Product_Category: categoria,
    Usage_Unit: f.unidad,
    Unit_Price: Math.max(0, f.precio),
    ...(f.coste !== null ? { Precio_de_coste: f.coste } : {}),
    Description: `Creado por la consola al contratar la propuesta ${referencia}.`,
  });
  creados.push(`producto «${f.producto}»`);
  return id;
}

/**
 * El producto del CRM para esta fila. Por nombre exacto; si no existe, se
 * crea como los suyos: tipo Alojamiento (sin eso el lookup del subformulario
 * lo rechaza: «FILTER_CRITERIA_NOT_SATISFIED»), categoría del departamento,
 * unidad P.Pax (su función multiplica por viajeros solo si lo es), precio de
 * venta, precio de coste y proveedor.
 */
async function idDeProducto(
  f: FilaContratada,
  coste: number | null,
  proveedorId: string,
  categoria: string,
  referencia: string,
  creados: string[],
): Promise<string> {
  const existente = await buscarIdPorNombre("Products", "Product_Name", f.producto);
  if (existente) return existente;
  const id = await crearRegistro("Products", {
    Product_Name: f.producto,
    Vendor_Name: { id: proveedorId },
    Product_Active: true,
    Tipo_de_Servicio: "Alojamiento",
    Product_Category: categoria,
    Usage_Unit: "P.Pax",
    Unit_Price: f.precio,
    ...(coste !== null ? { Precio_de_coste: coste } : {}),
    Description: `Creado por la consola al contratar la propuesta ${referencia}.`,
  });
  creados.push(`producto «${f.producto}»`);
  return id;
}
