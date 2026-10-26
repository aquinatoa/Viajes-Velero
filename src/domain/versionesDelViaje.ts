/**
 * Una fila por viaje en la mesa de propuestas.
 *
 * Ruth, 26/10/2026: al rehacer la propuesta de ESCOLA ULL salían dos filas
 * «ESCOLA ULL 2027 · Cambrils», la enviada y la nueva, como si fueran dos
 * viajes. Rehacer es la versión siguiente del mismo viaje: se ve la última.
 *
 * Excepción: si el colegio ya aceptó una versión anterior y la nueva todavía no
 * ha salido, se ven las dos. Esconder la aceptada escondería el plazo del
 * depósito que corre.
 */
export interface EntregaDeUnViaje {
  createdAt: string;
  status: string;
  chosenOptionNumber?: number | null;
  proposal?: { tripRequest?: { id: string } | null } | null;
}

export function ultimaDeCadaViaje<T extends EntregaDeUnViaje>(entregas: T[]): T[] {
  const porViaje = new Map<string, T[]>();
  const sueltas: T[] = [];
  for (const e of entregas) {
    const viaje = e.proposal?.tripRequest?.id;
    if (!viaje) {
      sueltas.push(e);
      continue;
    }
    porViaje.set(viaje, [...(porViaje.get(viaje) ?? []), e]);
  }
  const resultado = [...sueltas];
  for (const delViaje of porViaje.values()) {
    const ordenadas = [...delViaje].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const ultima = ordenadas[0];
    resultado.push(ultima);
    if (ultima.status === "DRAFT") {
      const aceptada = ordenadas.slice(1).find((e) => e.chosenOptionNumber != null);
      if (aceptada) resultado.push(aceptada);
    }
  }
  return resultado;
}
