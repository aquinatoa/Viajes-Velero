import { useEffect, useState } from "react";
import { CLIENTES_ESPECIALES, type ClienteEspecial } from "../domain/documentImportTypes";
import { listarClientesEspecialesApi } from "../services/apiClient";

/**
 * La lista de clientes especiales, compartida por todas las pantallas que la
 * usan (la subida de tarifas, la edición del documento y «Cotizamos para»).
 * Se pide al servidor una vez; dar de alta uno nuevo la vuelve a pedir y todas
 * se enteran. Mientras llega, los dos de partida: nunca sale vacía.
 */

let lista: ClienteEspecial[] = CLIENTES_ESPECIALES;
let pedida: Promise<void> | null = null;
const avisar = new Set<(clientes: ClienteEspecial[]) => void>();

function pedir(): Promise<void> {
  pedida = listarClientesEspecialesApi()
    .then((r) => {
      lista = r.clientes;
      avisar.forEach((f) => f(lista));
    })
    .catch(() => {
      // Sin la lista del servidor se queda la de partida, y se reintenta la
      // próxima vez que alguien la pida.
      pedida = null;
    });
  return pedida;
}

/** Vuelve a pedir la lista: después de dar de alta un cliente. */
export function recargarClientesEspeciales(): Promise<void> {
  return pedir();
}

export function useClientesEspeciales(): ClienteEspecial[] {
  const [clientes, setClientes] = useState<ClienteEspecial[]>(lista);
  useEffect(() => {
    avisar.add(setClientes);
    if (!pedida) void pedir();
    else setClientes(lista);
    return () => {
      avisar.delete(setClientes);
    };
  }, []);
  return clientes;
}
