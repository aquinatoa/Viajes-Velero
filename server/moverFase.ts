import { exigeMotivo } from "../src/domain/oportunidadesVista";
import type { NuevoCambioDeFase } from "./cambiosDeFase";

/**
 * Mover una oportunidad de fase, con constancia.
 *
 * La fase se mueve libremente, adelante y atrás (decisión de Anthony, 05/11/2026),
 * pero con una regla: retroceder, perder o pasar a lista de espera exige un
 * motivo. Cada cambio deja una línea (quién, cuándo, de → a, motivo) y una nota
 * fechada en el propio trato de Zoho, para que quien mire el CRM sepa por qué.
 *
 * Aquí está SOLO la decisión: qué se valida, qué se escribe y en qué orden. Zoho,
 * la base y la auditoría llegan por fuera (`DependenciasDeMoverFase`): así se
 * prueba entera sin escribir en el CRM de un cliente.
 */

export interface TratoParaMover {
  fase: string;
  departamento: "GROUPS" | "SPORTS" | "OTRO" | null;
}

export interface DependenciasDeMoverFase {
  /** El trato tal cual está ahora en Zoho; null si no existe. */
  leerTrato(dealId: string): Promise<TratoParaMover | null>;
  /** Las fases que existen en el CRM. */
  fasesValidas(): Promise<string[]>;
  /** ¿Esta persona puede ver (y por tanto mover) un trato de ese departamento? */
  puedeVer(departamento: TratoParaMover["departamento"]): boolean;
  /** Escribe en Zoho: fase, opción elegida y/o nota fechada. */
  actualizar(cambio: { dealId: string; fase?: string; opcion?: number | null; nota?: string }): Promise<void>;
  /** Deja constancia en la base. Nunca lanza. */
  registrar(cambio: NuevoCambioDeFase): Promise<void>;
  /** Deja constancia en la auditoría. Nunca lanza. */
  auditar(detalle: string): Promise<void>;
}

export interface PeticionDeMoverFase {
  dealId: string;
  /** La fase a la que pasa. Sin ella (o igual a la actual), solo se anota o se apunta la opción. */
  fase?: string;
  motivo?: string;
  /** Opción elegida por el cliente; `undefined` = no se toca. */
  opcion?: number | null;
}

export type ResultadoDeMoverFase =
  | { ok: true; desde: string; hasta: string; cambioDeFase: boolean }
  | { ok: false; status: 400 | 404; error: string };

export const MOTIVO_MINIMO = 3;

export async function moverDeFase(
  peticion: PeticionDeMoverFase,
  deps: DependenciasDeMoverFase,
  quien: { id: string | null; nombre: string | null },
): Promise<ResultadoDeMoverFase> {
  const dealId = (peticion.dealId ?? "").trim();
  const motivo = (peticion.motivo ?? "").trim();
  const fase = (peticion.fase ?? "").trim();
  if (!dealId) return { ok: false, status: 400, error: "Falta la oportunidad." };

  const trato = await deps.leerTrato(dealId);
  if (!trato || !deps.puedeVer(trato.departamento)) {
    // Misma respuesta si no existe o no es suyo: no se revela cuál de las dos.
    return { ok: false, status: 404, error: "Esa oportunidad no existe o no es de tu departamento." };
  }

  const cambiaLaFase = fase !== "" && fase !== trato.fase;
  const tocaLaOpcion = peticion.opcion !== undefined;
  if (!cambiaLaFase && !motivo && !tocaLaOpcion) {
    return { ok: false, status: 400, error: "No hay nada que guardar: cambia la fase, la opción o añade una nota." };
  }

  if (cambiaLaFase) {
    const validas = await deps.fasesValidas();
    if (validas.length > 0 && !validas.includes(fase)) {
      return { ok: false, status: 400, error: "Esa fase no existe en el CRM." };
    }
    if (exigeMotivo(trato.fase, fase) && motivo.length < MOTIVO_MINIMO) {
      return { ok: false, status: 400, error: "Hace falta un motivo para retroceder, perder o pasar a lista de espera." };
    }
  }

  // La nota que queda en el trato de Zoho. Si no cambia la fase, es la nota tal cual.
  const por = quien.nombre ? ` por ${quien.nombre}` : "";
  const nota = cambiaLaFase
    ? `Cambio de fase${por}: ${trato.fase || "sin fase"} → ${fase}.${motivo ? ` Motivo: ${motivo}` : ""}`
    : motivo || undefined;

  await deps.actualizar({
    dealId,
    ...(cambiaLaFase ? { fase } : {}),
    ...(tocaLaOpcion ? { opcion: peticion.opcion } : {}),
    ...(nota ? { nota } : {}),
  });

  // Solo si Zoho aceptó el cambio: una línea de historial de algo que no pasó sería mentira.
  if (cambiaLaFase) {
    await deps.registrar({
      crmDealId: dealId,
      desde: trato.fase || null,
      hasta: fase,
      motivo: motivo || null,
      origen: "MANUAL",
      porUserId: quien.id,
      porNombre: quien.nombre,
    });
    await deps.auditar(`${dealId}: ${trato.fase || "sin fase"} → ${fase}`);
  } else {
    await deps.auditar(`${dealId}: ${tocaLaOpcion ? "opción" : "nota"}`);
  }

  return { ok: true, desde: trato.fase, hasta: cambiaLaFase ? fase : trato.fase, cambioDeFase: cambiaLaFase };
}
