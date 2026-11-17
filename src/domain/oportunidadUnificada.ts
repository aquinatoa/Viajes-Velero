/**
 * Una oportunidad = una fila, venga de la app o de Zoho.
 *
 * Hasta el 05/11/2026 había dos pantallas sobre lo mismo: «Propuestas», que
 * leía la base de la app (las propuestas enviadas), y «Viajes», que leía Zoho
 * (los tratos). Cada una tenía su idea de qué es «enviada» o «ganada», y la
 * opción aceptada se podía apuntar por dos vías que no hacían lo mismo.
 *
 * Esta función es el único sitio donde se unen. Es PURA: no habla con la base
 * ni con Zoho, para poder probar los cruces (que son donde se esconden los
 * duplicados y las filas perdidas) sin montar nada.
 *
 * Reglas:
 *  - Las propuestas de un mismo viaje (rehacer = versión siguiente) son UNA fila.
 *    La fila enseña la aceptada si la hay —lleva el reloj del depósito— y, si no,
 *    la última.
 *  - Una fila de la app se une a su trato por `crmDealId`.
 *  - Un trato sin propuesta de la app es una fila más, con origen ZOHO. Se
 *    gestiona igual; solo le falta el desglose de las opciones.
 *  - Si la app y Zoho no dicen lo mismo de la opción aceptada, se avisa en la
 *    fila: no se elige un ganador por detrás.
 */

type Fecha = string | Date | null | undefined;

export type DepartamentoDeOportunidad = "GROUPS" | "SPORTS" | "OTRO" | null;

export type Carril = "sin_enviar" | "esperando" | "aceptada" | "cerrada";

/** Lo que hace falta saber de una propuesta enviada o preparada. */
export interface EntregaEntrada {
  id: string;
  reference: string;
  status: string;
  department: "GROUPS" | "SPORTS" | null;
  recipientName: string | null;
  recipientEmail: string;
  failureReason: string | null;
  createdAt: Fecha;
  sentAt: Fecha;
  viewCount: number;
  chosenOptionNumber: number | null;
  chosenAt: Fecha;
  depositDueAt: Fecha;
  depositPaidAt: Fecha;
  proposal: {
    id: string;
    tripRequest: {
      id: string;
      crmDealId: string | null;
      crmDealUrl?: string | null;
      opportunityName: string | null;
      destinationText: string | null;
      dateFrom: Fecha;
      dateTo: Fecha;
    } | null;
  } | null;
}

/** Lo que hace falta saber de un trato de Zoho (subconjunto de ZohoDealSummary). */
export interface TratoEntrada {
  id: string;
  dealName: string;
  stage: string;
  arrivalDate?: string;
  departureDate?: string;
  amount: number | null;
  closingDate: string;
  accountName: string;
  contactName: string;
  ownerName?: string;
  description: string;
  opcionesTexto: string;
  createdTime?: string;
  modifiedTime: string;
  dealUrl: string;
  department: DepartamentoDeOportunidad;
}

/** El registro propio de la app para una oportunidad que no nació en ella. */
export interface RegistroEntrada {
  crmDealId: string;
  origen: string;
  chosenOptionNumber: number | null;
  chosenAt: Fecha;
  depositDueAt: Fecha;
  depositPaidAt: Fecha;
}

export interface OportunidadFila {
  /** Estable: el id del trato, o `entrega:<id>` si todavía no tiene trato. */
  clave: string;
  /** APP: salió de una propuesta de la app. ZOHO: existe solo en el CRM. */
  origen: "APP" | "ZOHO";
  crmDealId: string | null;
  dealUrl: string | null;
  nombre: string;
  cuenta: string;
  contacto: string;
  /** El propietario del trato en el CRM. Null si aún no hay trato o Zoho no lo dice. */
  propietario?: string | null;
  departamento: DepartamentoDeOportunidad;
  /** La fase del CRM. Null si la propuesta aún no tiene trato (se crea al enviar). */
  fase: string | null;
  importe: number | null;
  llegada: string | null;
  salida: string | null;
  cierre: string | null;
  carril: Carril;
  /** El carril sale de la fase de Zoho y no de los hechos de la app. */
  carrilDeducido: boolean;
  /** Cuanto más bajo, antes debe verse. */
  urgencia: number;
  entrega: {
    id: string;
    proposalId: string | null;
    tripRequestId: string | null;
    reference: string;
    estado: string;
    motivoDelFallo: string | null;
    enviadaEl: string | null;
    vistas: number;
    /** Cuántas versiones de propuesta tiene este viaje. */
    versiones: number;
    /** Hay una versión nueva sin salir, distinta de la que se enseña. */
    versionNuevaSinEnviar: boolean;
  } | null;
  /** Opción aceptada según cada lado. La que manda en la fila es `elegida`. */
  elegida: number | null;
  opcionEnLaApp: number | null;
  opcionEnZoho: number | null;
  /** La app y Zoho dicen cosas distintas de la opción aceptada. */
  opcionContradictoria: boolean;
  deposito: { venceEl: string | null; cobradoEl: string | null };
  /** Hay propuesta de la app, pero esta persona no puede verla (no es suya). */
  detalleRestringido: boolean;
  /** Lo que dice el trato de Zoho, tal cual. Null si la fila no tiene trato. */
  crm: { description: string; opcionesTexto: string; createdTime: string; modifiedTime: string } | null;
}

// ─── utilidades ──────────────────────────────────────────────────────────────

function iso(valor: Fecha): string | null {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function dia(valor: Fecha): string | null {
  const t = iso(valor);
  return t ? t.slice(0, 10) : null;
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function diasDesde(valor: Fecha, ahora: Date): number | null {
  const t = iso(valor);
  if (!t) return null;
  return Math.floor((ahora.getTime() - new Date(t).getTime()) / 86_400_000);
}

function diasHasta(valor: Fecha, ahora: Date): number | null {
  const t = iso(valor);
  if (!t) return null;
  return Math.ceil((new Date(t).getTime() - ahora.getTime()) / 86_400_000);
}

function textoDelTrato(t: TratoEntrada) {
  return {
    description: t.description,
    opcionesTexto: t.opcionesTexto,
    createdTime: t.createdTime ?? "",
    modifiedTime: t.modifiedTime,
  };
}

/** La opción aceptada que consta en el texto del trato, si consta. */
export function opcionAceptadaEnZoho(trato: Pick<TratoEntrada, "description" | "opcionesTexto">): number | null {
  const texto = `${trato.opcionesTexto ?? ""}\n${trato.description ?? ""}`;
  const m = texto.match(/Opci[oó]n elegida por el cliente:\s*Opci[oó]n\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** El carril según los hechos de la app. */
export function carrilDeLaEntrega(e: Pick<EntregaEntrada, "status" | "chosenOptionNumber" | "depositPaidAt">): Carril {
  if (e.depositPaidAt) return "cerrada";
  if (e.chosenOptionNumber) return "aceptada";
  if (e.status === "SENT" || e.status === "SIMULATED") return "esperando";
  return "sin_enviar";
}

/**
 * El carril según la fase del CRM, para lo que la app no ha movido.
 * Es una lectura aproximada y por eso la fila lo declara (`carrilDeducido`).
 */
export function carrilDeLaFase(fase: string, hayOpcionElegida: boolean): Carril {
  const s = norm(fase);
  if (/(ganad|finaliz|perdid|cerrad)/.test(s)) return "cerrada";
  if (hayOpcionElegida || /(deposit|pendiente)/.test(s)) return "aceptada";
  if (/(enviad|seguimiento|espera)/.test(s)) return "esperando";
  return "sin_enviar";
}

/** Nombre de la fila de una propuesta de la app: el viaje y, si hace falta, el destino. */
export function nombreDelViaje(e: {
  recipientName: string | null;
  proposal?: { tripRequest?: { opportunityName: string | null; destinationText: string | null } | null } | null;
}): string {
  const solicitud = e.proposal?.tripRequest;
  const centro = e.recipientName?.trim();
  const viaje = solicitud?.opportunityName?.trim();
  const destino = solicitud?.destinationText?.trim();
  if (viaje && destino && !viaje.toLowerCase().includes(destino.toLowerCase())) return `${viaje} · ${destino}`;
  if (viaje) return viaje;
  if (centro && destino) return `${centro} · ${destino}`;
  return destino || centro || "Viaje sin nombre";
}

function urgenciaDeLaEntrega(e: EntregaEntrada, ahora: Date): number {
  if (e.depositPaidAt) return 1000;
  if (e.status === "FAILED") return -100;
  if (e.chosenOptionNumber) return diasHasta(e.depositDueAt, ahora) ?? 500;
  if (e.status === "DRAFT" || e.status === "SIMULATED") return -50;
  return 60 - (diasDesde(e.sentAt, ahora) ?? 0);
}

function urgenciaDelCarril(carril: Carril, registro: RegistroEntrada | undefined, ahora: Date): number {
  if (carril === "cerrada") return 1000;
  if (carril === "aceptada") return diasHasta(registro?.depositDueAt, ahora) ?? 500;
  // Sin hechos de la app no se sabe cuánto lleva esperando: detrás de lo que sí corre prisa.
  return 400;
}

// ─── la unión ────────────────────────────────────────────────────────────────

export interface UnionEntrada {
  /** Propuestas visibles para quien mira. */
  entregas: EntregaEntrada[];
  /** Tratos de Zoho visibles para quien mira (ya filtrados por departamento). */
  tratos: TratoEntrada[];
  /** Registros propios de la app para oportunidades que no nacieron en ella. */
  registros: RegistroEntrada[];
  /**
   * Los `crmDealId` de TODAS las propuestas, también las que esta persona no ve.
   * Sirve para no pasar por «solo Zoho» un trato que sí tiene propuesta.
   */
  dealIdsConPropuesta?: Iterable<string>;
  /** Periodo de llegada que se mira. Sin él, todo. */
  rango?: { desde: string; hasta: string } | null;
  ahora?: Date;
}

function enRango(rango: UnionEntrada["rango"], llegada: string | null, cierre: string | null): boolean {
  if (!rango || (!rango.desde && !rango.hasta)) return true;
  // Sin ninguna fecha no se esconde: es lo que más cuesta encontrar luego.
  const fecha = llegada ?? cierre;
  if (!fecha) return true;
  if (rango.desde && fecha < rango.desde) return false;
  if (rango.hasta && fecha > rango.hasta) return false;
  return true;
}

/** Agrupa las propuestas por viaje y elige la que representa al viaje. */
function entregaPrincipal(delViaje: EntregaEntrada[]): {
  principal: EntregaEntrada;
  versiones: number;
  versionNuevaSinEnviar: boolean;
} {
  const porFecha = [...delViaje].sort((a, b) => (iso(b.createdAt) ?? "").localeCompare(iso(a.createdAt) ?? ""));
  const ultima = porFecha[0];
  // La aceptada manda sobre un borrador posterior: esconderla escondería el depósito que corre.
  const aceptada = porFecha.find((e) => e.chosenOptionNumber != null);
  // Pero una versión ENVIADA después de la aceptada la sustituye: la oferta ha cambiado y el cliente tiene
  // que volver a aceptarla (Anthony, 17/11/2026). El depósito de la anterior deja de contar.
  const sustituta = aceptada
    ? porFecha.find((e) => e.status === "SENT" && (iso(e.createdAt) ?? "") > (iso(aceptada.createdAt) ?? ""))
    : undefined;
  const principal = sustituta ?? aceptada ?? ultima;
  const nueva =
    principal.id !== ultima.id && (ultima.status === "DRAFT" || ultima.status === "SIMULATED");
  return { principal, versiones: delViaje.length, versionNuevaSinEnviar: nueva };
}

export function unirOportunidades(entrada: UnionEntrada): OportunidadFila[] {
  const ahora = entrada.ahora ?? new Date();
  const registros = new Map(entrada.registros.map((r) => [r.crmDealId, r]));
  const tratosPorId = new Map(entrada.tratos.map((t) => [t.id, t]));
  const conPropuesta = new Set(entrada.dealIdsConPropuesta ?? []);

  // 1) Las propuestas, agrupadas por viaje (la solicitud). Sin solicitud, cada una es la suya.
  const porViaje = new Map<string, EntregaEntrada[]>();
  for (const e of entrada.entregas) {
    const clave = e.proposal?.tripRequest?.id ?? `suelta:${e.id}`;
    porViaje.set(clave, [...(porViaje.get(clave) ?? []), e]);
  }

  const filas: OportunidadFila[] = [];
  const tratosUsados = new Set<string>();

  for (const delViaje of porViaje.values()) {
    const { principal, versiones, versionNuevaSinEnviar } = entregaPrincipal(delViaje);
    const solicitud = principal.proposal?.tripRequest ?? null;
    const dealId = solicitud?.crmDealId ?? null;
    const trato = dealId ? tratosPorId.get(dealId) : undefined;
    if (trato) tratosUsados.add(trato.id);

    const llegada = trato?.arrivalDate || dia(solicitud?.dateFrom);
    const salida = trato?.departureDate || dia(solicitud?.dateTo);
    const cierre = trato?.closingDate || null;
    // Un trato que Zoho ya devolvió está en el rango por definición; si no, se mira la solicitud.
    if (!trato && !enRango(entrada.rango, llegada, cierre)) continue;

    const opcionApp = principal.chosenOptionNumber ?? null;
    const opcionZoho = trato ? opcionAceptadaEnZoho(trato) : null;

    filas.push({
      clave: dealId ?? `entrega:${principal.id}`,
      origen: "APP",
      crmDealId: dealId,
      dealUrl: trato?.dealUrl || solicitud?.crmDealUrl || null,
      nombre: nombreDelViaje(principal),
      cuenta: trato?.accountName || principal.recipientName || "",
      contacto: trato?.contactName || principal.recipientEmail,
      propietario: trato?.ownerName || null,
      departamento: principal.department ?? trato?.department ?? null,
      fase: trato?.stage || null,
      importe: trato?.amount ?? null,
      llegada,
      salida,
      cierre,
      carril: carrilDeLaEntrega(principal),
      carrilDeducido: false,
      urgencia: urgenciaDeLaEntrega(principal, ahora),
      entrega: {
        id: principal.id,
        proposalId: principal.proposal?.id ?? null,
        tripRequestId: solicitud?.id ?? null,
        reference: principal.reference,
        estado: principal.status,
        motivoDelFallo: principal.failureReason,
        enviadaEl: iso(principal.sentAt),
        vistas: principal.viewCount,
        versiones,
        versionNuevaSinEnviar,
      },
      elegida: opcionApp ?? opcionZoho,
      opcionEnLaApp: opcionApp,
      opcionEnZoho: opcionZoho,
      // Solo hay contradicción si los dos lados dicen algo y no coincide, o si Zoho
      // afirma una opción que la app no conoce (no arrancó el depósito).
      opcionContradictoria: opcionZoho != null && opcionZoho !== opcionApp,
      deposito: { venceEl: iso(principal.depositDueAt), cobradoEl: iso(principal.depositPaidAt) },
      detalleRestringido: false,
      crm: trato ? textoDelTrato(trato) : null,
    });
  }

  // 2) Los tratos que ninguna propuesta visible reclama.
  for (const trato of entrada.tratos) {
    if (tratosUsados.has(trato.id)) continue;
    const registro = registros.get(trato.id);
    const opcionZoho = opcionAceptadaEnZoho(trato);
    const opcionApp = registro?.chosenOptionNumber ?? null;
    const elegida = opcionApp ?? opcionZoho;
    const carril = carrilDeLaFase(trato.stage, elegida != null);
    const tienePropuestaAjena = conPropuesta.has(trato.id);

    filas.push({
      clave: trato.id,
      origen: tienePropuestaAjena ? "APP" : "ZOHO",
      crmDealId: trato.id,
      dealUrl: trato.dealUrl || null,
      nombre: trato.dealName || "(sin nombre)",
      cuenta: trato.accountName,
      contacto: trato.contactName,
      propietario: trato.ownerName || null,
      departamento: trato.department,
      fase: trato.stage || null,
      importe: trato.amount,
      llegada: trato.arrivalDate || null,
      salida: trato.departureDate || null,
      cierre: trato.closingDate || null,
      carril,
      carrilDeducido: true,
      urgencia: urgenciaDelCarril(carril, registro, ahora),
      entrega: null,
      elegida,
      opcionEnLaApp: opcionApp,
      opcionEnZoho: opcionZoho,
      opcionContradictoria: opcionApp != null && opcionZoho != null && opcionApp !== opcionZoho,
      deposito: { venceEl: iso(registro?.depositDueAt), cobradoEl: iso(registro?.depositPaidAt) },
      detalleRestringido: tienePropuestaAjena,
      crm: textoDelTrato(trato),
    });
  }

  return filas.sort((a, b) => a.urgencia - b.urgencia);
}

/** Cuántas filas hay en cada carril. */
export function contarCarriles(filas: Pick<OportunidadFila, "carril">[]): Record<Carril, number> {
  const cuenta: Record<Carril, number> = { sin_enviar: 0, esperando: 0, aceptada: 0, cerrada: 0 };
  for (const f of filas) cuenta[f.carril] += 1;
  return cuenta;
}
