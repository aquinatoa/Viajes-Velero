import { PrismaClient } from "@prisma/client";
import { type AuthedUser, deliveryVisibilityWhere } from "./auth";
import { listDeliveries } from "./proposalDelivery";
import { departamentoDesdeCrm, tratosVisiblesPara } from "./tratosPorDepartamento";
import { getZohoDealDetalle, listZohoDeals, listZohoDealsEntre, type ZohoDealSummary } from "./zoho";
import {
  contarCarriles,
  unirOportunidades,
  type Carril,
  type EntregaEntrada,
  type OportunidadFila,
} from "../src/domain/oportunidadUnificada";
import { rangoValido } from "../src/domain/rangoDeViajes";

/**
 * Las oportunidades: propuestas de la app y tratos de Zoho en una sola lista.
 *
 * Esta capa solo reúne los datos (con la visibilidad de siempre) y se los pasa a
 * `unirOportunidades`, que es donde está la regla y donde están las pruebas.
 *
 * Si Zoho no contesta, la lista sale igual con lo que sabe la app y lo dice
 * (`zohoDisponible: false`): mejor una lista incompleta y avisada que una
 * pantalla en blanco.
 */
const prisma = new PrismaClient();

export interface RespuestaDeOportunidades {
  oportunidades: OportunidadFila[];
  carriles: Record<Carril, number>;
  zohoDisponible: boolean;
}

export async function listarOportunidades(
  user: AuthedUser | undefined,
  rango: { desde: string; hasta: string } | null,
): Promise<RespuestaDeOportunidades> {
  const entregas = await listDeliveries(user ? deliveryVisibilityWhere(user) : {});

  // Los tratos que tienen propuesta, también las que esta persona no ve.
  const conPropuesta = await prisma.proposalDelivery.findMany({
    select: { proposal: { select: { tripRequest: { select: { crmDealId: true } } } } },
  });
  const dealIdsConPropuesta = conPropuesta
    .map((e) => e.proposal?.tripRequest?.crmDealId)
    .filter((id): id is string => Boolean(id));

  let tratos: ZohoDealSummary[] = [];
  let zohoDisponible = true;
  try {
    const todos = rango && rangoValido(rango) ? await listZohoDealsEntre(rango.desde, rango.hasta) : await listZohoDeals();
    tratos = user ? tratosVisiblesPara(user, todos) : todos;
  } catch (error) {
    zohoDisponible = false;
    console.error("[oportunidades] Zoho no contestó; se enseña solo lo que sabe la app.", error);
  }

  const registros = tratos.length
    ? await prisma.oportunidad.findMany({ where: { crmDealId: { in: tratos.map((t) => t.id) } } })
    : [];

  const oportunidades = unirOportunidades({
    entregas: entregas as unknown as EntregaEntrada[],
    tratos,
    registros,
    dealIdsConPropuesta,
    rango,
  });

  return { oportunidades, carriles: contarCarriles(oportunidades), zohoDisponible };
}

export interface ResultadoDeAdopcion {
  crmDealId: string;
  origen: "APP" | "ZOHO";
  yaEstaba: boolean;
}

/**
 * La app adopta una oportunidad: crea su registro propio para poder gestionarla.
 *
 * Es idempotente y se hace de una en una, al abrirla. Nunca en bloque: adoptar no
 * escribe en Zoho, pero tampoco hay razón para crear registros de las que nadie ha
 * mirado. Devuelve `null` si el trato no existe o esta persona no puede verlo.
 */
export async function adoptarOportunidad(
  crmDealId: string,
  user: AuthedUser | undefined,
): Promise<ResultadoDeAdopcion | null> {
  const existente = await prisma.oportunidad.findUnique({ where: { crmDealId } });
  if (existente) {
    return { crmDealId, origen: existente.origen === "APP" ? "APP" : "ZOHO", yaEstaba: true };
  }

  const detalle = await getZohoDealDetalle(crmDealId);
  if (!detalle) return null;
  const departamento = departamentoDesdeCrm(detalle.Departamento);
  if (user && tratosVisiblesPara(user, [{ department: departamento }]).length === 0) return null;

  const solicitud = await prisma.tripRequest.findFirst({ where: { crmDealId }, select: { id: true } });
  const origen = solicitud ? "APP" : "ZOHO";
  await prisma.oportunidad.create({
    data: { crmDealId, origen, adoptadaPor: user?.name ?? user?.email ?? null },
  });
  return { crmDealId, origen, yaEstaba: false };
}
