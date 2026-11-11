import { PrismaClient } from "@prisma/client";

/**
 * La constancia de cada cambio de fase de una oportunidad.
 *
 * Una oportunidad es una gestión viva: la mueve el cliente a su ritmo (abre el
 * enlace, elige una opción) y la movemos nosotros. Para saber luego quién hizo
 * qué y por qué, cada cambio deja aquí una línea. Lo automático también: el
 * historial tiene que distinguir lo que hicimos de lo que hizo el cliente.
 *
 * Registrar NUNCA lanza: quien lo llama está enviando una propuesta o atendiendo
 * al colegio, y eso no se cae porque la base tosa.
 */
const prisma = new PrismaClient();

export type OrigenDelCambio = "MANUAL" | "AUTOMATICO";

export interface NuevoCambioDeFase {
  crmDealId: string;
  desde: string | null;
  hasta: string;
  motivo?: string | null;
  origen: OrigenDelCambio;
  hito?: string | null;
  porUserId?: string | null;
  porNombre?: string | null;
}

export async function registrarCambioDeFase(cambio: NuevoCambioDeFase): Promise<void> {
  try {
    await prisma.cambioDeFase.create({
      data: {
        crmDealId: cambio.crmDealId,
        desde: cambio.desde?.trim() || null,
        hasta: cambio.hasta.trim(),
        motivo: cambio.motivo?.trim() || null,
        origen: cambio.origen,
        hito: cambio.hito ?? null,
        porUserId: cambio.porUserId ?? null,
        porNombre: cambio.porNombre ?? null,
      },
    });
  } catch (error) {
    console.error("[crm] no se pudo anotar el cambio de fase", error);
  }
}

export interface CambioDeFaseLeido {
  id: string;
  desde: string | null;
  hasta: string;
  motivo: string | null;
  origen: OrigenDelCambio;
  hito: string | null;
  porNombre: string | null;
  cuando: string;
}

/** El historial de una oportunidad, del más reciente al más antiguo. */
export async function historialDeFase(crmDealId: string, limite = 100): Promise<CambioDeFaseLeido[]> {
  const filas = await prisma.cambioDeFase.findMany({
    where: { crmDealId },
    orderBy: { createdAt: "desc" },
    take: limite,
  });
  return filas.map((f) => ({
    id: f.id,
    desde: f.desde,
    hasta: f.hasta,
    motivo: f.motivo,
    origen: f.origen as OrigenDelCambio,
    hito: f.hito,
    porNombre: f.porNombre,
    cuando: f.createdAt.toISOString(),
  }));
}
