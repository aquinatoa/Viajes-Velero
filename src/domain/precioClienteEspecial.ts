/**
 * El precio para un cliente especial.
 *
 * Javier, 28/09/2026: «son 2-3 clientes. Normalmente es un porcentaje como el
 * que comentas para PortAventura, pero también puede ser un neto». La regla,
 * en este orden:
 *
 *   1. Si el cliente tiene tarifa PROPIA cargada para ese hotel o actividad
 *      (el turoperador suizo en Fútbol Salou), manda esa.
 *   2. Si no, la general con SU porcentaje sobre el PVP.
 *   3. Si no tiene porcentaje, la general tal cual.
 *
 * El porcentaje de cada cliente está en `CLIENTES_ESPECIALES`. A 15/10/2026
 * no tenemos ninguno: falta que Javier diga el de cada cliente.
 */
import { CLIENTES_ESPECIALES, type ClienteEspecial } from "./documentImportTypes";

export function porcentajeDelCliente(segmento: string | null | undefined): number | null {
  const cliente = CLIENTES_ESPECIALES.find((c) => c.codigo === segmento);
  return cliente?.porcentajeSobrePvp ?? null;
}

/**
 * El precio que toca a este cliente con esta tarifa, y por qué. `motivo` va a
 * las razones del resultado para que quien cotiza vea que no es el precio
 * general.
 */
export function precioParaElCliente(
  pvp: number,
  segmentoPedido: string | null | undefined,
  tarifa: { clientSegment?: string | null },
  tieneTarifaPropia: boolean,
  clientes: ClienteEspecial[] = CLIENTES_ESPECIALES,
): { precio: number; motivo: string | null } {
  const pedido = (segmentoPedido ?? "").trim();
  const cliente = clientes.find((c) => c.codigo === pedido);
  if (!cliente) return { precio: pvp, motivo: null };
  if ((tarifa.clientSegment ?? "") === pedido) return { precio: pvp, motivo: null };
  if (tieneTarifaPropia) return { precio: pvp, motivo: null };
  const porcentaje = cliente.porcentajeSobrePvp ?? null;
  if (porcentaje === null || !(pvp > 0)) return { precio: pvp, motivo: null };
  const precio = Math.round(pvp * (1 + porcentaje / 100) * 100) / 100;
  const signo = porcentaje < 0 ? "−" : "+";
  return {
    precio,
    motivo: `Cliente especial ${cliente.nombre}: ${signo}${Math.abs(porcentaje)} % sobre el PVP general (${pvp} €).`,
  };
}
