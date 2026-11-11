import type { OportunidadFila } from "../../domain/oportunidadUnificada";
import { diasHasta, fechaLarga } from "../../domain/oportunidadesVista";

function diasDesde(iso: string | null, hoy: Date): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.floor((hoy.getTime() - t) / 86_400_000);
}

/**
 * La frase de una oportunidad CON propuesta de la app: lo que sabe la app y
 * Zoho no («abierta 2 veces, sin respuesta», «enviada hace 3 días, sin abrir»).
 * Para las de solo Zoho manda `siguientePaso`, que habla de la fase.
 */
export function lineaDeEstado(f: OportunidadFila, hoy: Date = new Date()): string {
  const e = f.entrega;
  if (e) {
    if (e.estado === "FAILED") return `No salió: ${e.motivoDelFallo ?? "el servidor de correo la rechazó"}`;
    if (f.deposito.cobradoEl) return `Depósito cobrado, opción ${f.elegida}`;
    if (f.elegida) {
      const quedan = diasHasta(f.deposito.venceEl, hoy);
      if (quedan === null) return `Aceptada la opción ${f.elegida}`;
      if (quedan < 0) return `El depósito venció hace ${Math.abs(quedan)} días`;
      return `Quedan ${quedan} días para el depósito`;
    }
    if (e.estado === "DRAFT") return "Preparada, sin enviar";
    if (e.estado === "SIMULATED") return "Preparada, pendiente de la clave del buzón";
    const enviada = diasDesde(e.enviadaEl, hoy);
    if (e.vistas > 0) return `Abierta ${e.vistas} ${e.vistas === 1 ? "vez" : "veces"}, sin respuesta`;
    if (enviada === null) return "Enviada";
    if (enviada === 0) return "Enviada hoy";
    return `Enviada hace ${enviada} ${enviada === 1 ? "día" : "días"}, sin abrir`;
  }
  if (f.detalleRestringido) return "Propuesta de otra persona";
  return f.elegida ? `Opción ${f.elegida} aceptada` : "";
}

/** «Cierre previsto el 10 jun 2027 (en 211 días).» o, si ya pasó, la pregunta incómoda. */
export function textoDelCierre(f: Pick<OportunidadFila, "cierre">, hoy: Date = new Date()): string {
  if (!f.cierre) return "";
  const d = diasHasta(f.cierre, hoy);
  if (d === null) return "";
  if (d < 0) return `El cierre previsto era el ${fechaLarga(f.cierre)}: hace ${-d} días. ¿Sigue viva?`;
  return `Cierre previsto el ${fechaLarga(f.cierre)} (en ${d} días).`;
}
