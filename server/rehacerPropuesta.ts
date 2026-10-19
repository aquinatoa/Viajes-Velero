import { PrismaClient } from "@prisma/client";
import { guardarBorradorDb } from "./draftsDb";
import { nuevoIdAdHoc, type ActividadAdHoc, type HotelAdHoc } from "../src/domain/adHoc";
import { desgloseDeLaOpcion, importeDesdeTexto } from "../src/domain/desgloseDeOpcion";
import { COMPOSICION_POR_DEFECTO, type ComposicionDeLaEstancia } from "../src/domain/estancia";
import { tituloDelViaje } from "../src/domain/tituloDelViaje";

/**
 * Rehacer una propuesta ya enviada: cambiar un hotel, quitar una actividad…
 *
 * Ruth, 19/10/2026: «si una vez que se manda se quiere modificar la oferta y
 * por ejemplo sustituir un hotel por otro, ¿cómo se hace?». «Ha cambiado algo»
 * solo recalcula cuando cambian los datos (alumnos, fechas); no deja cambiar
 * de hotel.
 *
 * Aquí se arma un BORRADOR del lienzo con todo lo de esa entrega —la petición,
 * el contacto, los hoteles y actividades elegidos (también los de fuera del
 * catálogo) y la composición de la estancia— y se abre en Nueva solicitud.
 * Al enviarlo se guarda como la versión siguiente del mismo viaje: lo que ya
 * salió no se toca.
 */

const prisma = new PrismaClient();

const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export async function borradorParaRehacer(
  deliveryId: string,
  visibilidad: Record<string, unknown>,
  usuario: { id: string; department?: string | null } | null,
): Promise<{ borradorId: string; titulo: string; avisos: string[] } | null> {
  const entrega = await prisma.proposalDelivery.findFirst({
    where: { id: deliveryId, ...visibilidad },
    include: {
      proposal: {
        include: {
          accommodationOptions: { orderBy: { optionNumber: "asc" } },
          activityOptions: { orderBy: [{ optionNumber: "asc" }, { displayOrder: "asc" }] },
          tripRequest: { include: { client: true } },
        },
      },
    },
  });
  const propuesta = entrega?.proposal;
  const solicitud = propuesta?.tripRequest;
  if (!entrega || !propuesta || !solicitud) return null;

  const avisos: string[] = [];

  // Los hoteles: los del catálogo por su id; los de fuera, como ad hoc con su precio.
  const elegidos: string[] = [];
  const hotelesAdHoc: HotelAdHoc[] = [];
  for (const o of propuesta.accommodationOptions) {
    if (o.accommodationId) {
      elegidos.push(o.accommodationId);
      continue;
    }
    const d = desgloseDeLaOpcion(o.priceBreakdownText, o.totalPvpText);
    const id = nuevoIdAdHoc();
    hotelesAdHoc.push({
      id,
      nombre: o.accommodationNameSnapshot ?? "Alojamiento",
      localidad: solicitud.destinationText ?? "",
      regimen: (o.boardType ?? "PC").slice(0, 2).toUpperCase(),
      precioAlumno: d?.alumnos.precio ?? 0,
      precioProfesor: d?.profesores && d.profesores.individual ? d.profesores.precio : null,
      condiciones: o.conditionsText ?? "",
      origen: "",
      costeAlumno: o.studentCostAmount === null ? null : Number(o.studentCostAmount),
      costeProfesor: o.teacherCostAmount === null ? null : Number(o.teacherCostAmount),
      margen: null,
      cotizacionId: o.supplierQuoteId,
      documento: null,
    });
    elegidos.push(id);
  }

  // Las actividades: las de la primera opción forman el programa; las de fuera
  // del catálogo, como ad hoc.
  const programaBase: string[] = [];
  const actividadesAdHoc: ActividadAdHoc[] = [];
  const primeraOpcion = propuesta.activityOptions.filter((a) => a.optionNumber === 1);
  for (const a of primeraOpcion) {
    if (a.activityId) {
      if (!programaBase.includes(a.activityId)) programaBase.push(a.activityId);
      continue;
    }
    const id = nuevoIdAdHoc();
    actividadesAdHoc.push({
      id,
      nombre: a.activityNameSnapshot,
      proveedor: a.providerSnapshot ?? "",
      precioPorAlumno: importeDesdeTexto(a.pvpSnapshot) ?? 0,
      descripcion: a.descriptionSnapshot ?? "",
      origen: "",
      coste: a.unitCostAmount === null ? null : Number(a.unitCostAmount),
      cotizacionId: a.supplierQuoteId,
    });
    programaBase.push(id);
  }
  const otrasOpciones = new Set(propuesta.activityOptions.filter((a) => a.optionNumber !== 1).map((a) => a.activityId ?? a.activityNameSnapshot));
  const primeras = new Set(primeraOpcion.map((a) => a.activityId ?? a.activityNameSnapshot));
  if ([...otrasOpciones].some((x) => !primeras.has(x))) {
    avisos.push("Las opciones tenían programas distintos: se ha cargado el de la opción 1. Revisa el programa de cada opción.");
  }

  let composicion: ComposicionDeLaEstancia = COMPOSICION_POR_DEFECTO;
  if (propuesta.stayJson) {
    try {
      composicion = { ...COMPOSICION_POR_DEFECTO, ...(JSON.parse(propuesta.stayJson) as ComposicionDeLaEstancia) };
    } catch {
      avisos.push("No se pudo leer la composición de la estancia: revisa la pensión por noche y las habitaciones.");
    }
  }

  const cliente = solicitud.client;
  const titulo = tituloDelViaje(solicitud);
  const payload = {
    guardadoEn: new Date().toISOString(),
    solicitudId: solicitud.id,
    canal: "GENERIC",
    mensajes: solicitud.originalMessage ? [solicitud.originalMessage] : [],
    redaccion: "",
    form: {
      clientType: "existing",
      email: cliente?.email ?? entrega.recipientEmail ?? "",
      firstName: cliente?.firstName ?? "",
      lastName: cliente?.lastName ?? "",
      centreName: solicitud.centreName ?? "",
      opportunityName: solicitud.opportunityName ?? "",
      rawTripRequestText: solicitud.originalMessage ?? "",
    },
    entendido: {
      language: solicitud.language ?? "",
      destinationText: solicitud.destinationText ?? "",
      destinationCountry: solicitud.destinationCountry ?? "",
      dateFrom: dia(solicitud.dateFrom),
      dateTo: dia(solicitud.dateTo),
      participants: solicitud.participants,
      teachers: solicitud.teachers,
      ageRangeText: solicitud.ageRangeText ?? "",
      averageAgeText: solicitud.averageAgeText ?? "",
      groupType: solicitud.groupType ?? "",
      regimeRequested: solicitud.regimeRequested ?? "",
      categoryRequested: solicitud.categoryRequested ?? "",
      requirementsText: solicitud.requirementsText ?? "",
    },
    tope: null,
    requisitos: [],
    departamento: solicitud.department ?? entrega.department ?? "",
    conversacion: [],
    preguntadas: [],
    elegidos,
    programaBase,
    excepciones: {},
    preciosFijados: {},
    descuentos: {},
    composicion,
    hotelesAdHoc,
    actividadesAdHoc,
    rehaceEntrega: entrega.reference,
  };

  const borrador = await guardarBorradorDb({
    title: `Rehacer ${entrega.reference} · ${titulo}`,
    payload,
    tripRequestId: solicitud.id,
    ownerUserId: usuario?.id ?? null,
    department: solicitud.department ?? null,
    userId: usuario?.id ?? null,
  });
  return { borradorId: borrador.id, titulo, avisos };
}
