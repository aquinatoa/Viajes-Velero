/**
 * Lo que el CRM sabe de una oportunidad, ordenado para leerlo.
 *
 * Nace de una observación de Anthony (11/11/2026): en la ficha de las oportunidades
 * que solo existen en Zoho «no termino de ver la información que tienen dentro de
 * CRM» y «no he podido observar las opciones que se habían enviado y cuál de ellas
 * habían aceptado».
 *
 * Esa información SÍ está en Zoho, y estructurada:
 *  - el subformulario «Servicios Contratados» lleva, línea a línea, el número de
 *    presupuesto (`N_Presupuesto`: la opción), el servicio, el proveedor, el
 *    régimen, las fechas, los viajeros y el precio;
 *  - `N_Presupuesto_Subformulario` dice cuál fue el aceptado;
 *  - y el trato guarda el total, el depósito, la forma de cobro y las fechas.
 * Medido el 11/11 en 50 tratos: 35 con líneas, 5 con varios presupuestos.
 *
 * Lo que NO está al alcance: el historial de fases y las notas del trato. Zoho los
 * da por «related lists» y la autorización actual no tiene permiso
 * (`OAUTH_SCOPE_MISMATCH`). Para leerlos hay que volver a autorizar con más
 * permisos y cambiar el token del `.env`, que en producción lleva Mateo.
 *
 * Todo puro: recibe el trato crudo de la API de Zoho y devuelve datos de pantalla.
 * Los costes y márgenes solo salen si se pide (`verEconomia`): son datos internos.
 */

export type TratoCrudo = Record<string, unknown>;

export interface LineaDePresupuesto {
  servicio: string;
  proveedor: string;
  tipo: string;
  regimen: string;
  entrada: string;
  salida: string;
  viajeros: number | null;
  cantidad: number | null;
  unidad: string;
  precio: number | null;
  total: number | null;
  /** Coste total de la línea. Solo con `verEconomia`. */
  coste: number | null;
  comentarios: string;
  validado: boolean;
}

export interface PresupuestoDelCrm {
  /** El número de presupuesto: la «opción» que se envió. */
  numero: number;
  /** Es el que aceptó el cliente (solo si el trato ya está aceptado). */
  aceptado: boolean;
  lineas: LineaDePresupuesto[];
  /** Suma del total de sus líneas. */
  total: number;
  /** Suma de sus costes. Solo con `verEconomia`. */
  coste: number | null;
  /** (total − coste) / total, en %. Solo con `verEconomia`. */
  margen: number | null;
}

export interface ResumenDelAceptado {
  /** El número del presupuesto aceptado, si el CRM lo dice. */
  numero: number | null;
  total: number | null;
  pvpPorViajero: number | null;
  deposito: number | null;
  formaDeCobro: string;
  tipoDePago: string;
  depositoCobrado: string;
  cobradoAl100: boolean;
  pendiente: number | null;
  fechaDeReserva: string;
  /** Enlace al presupuesto en Zoho Books. */
  enlace: string;
  idPresupuesto: string;
  /** Solo con `verEconomia`. */
  coste: number | null;
  margen: number | null;
  costePorViajero: number | null;
}

export interface HitoDelCrm {
  /** Fecha o fecha y hora ISO, tal como la guarda Zoho. */
  cuando: string;
  texto: string;
}

export interface FichaDelCrm {
  presupuestos: PresupuestoDelCrm[];
  aceptado: ResumenDelAceptado | null;
  hitos: HitoDelCrm[];
  /** El texto libre de «Opciones de Presupuesto» (o la Descripción, si no hay). */
  textoLibre: string;
  motivoDePerdida: string;
  /** Si el servidor incluyó costes y márgenes (el cliente no los pide: los recibe o no). */
  economiaVisible: boolean;
}

// ── Lectura de valores crudos ────────────────────────────────────────────────

function texto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(texto).filter(Boolean).join(", ");
  if (typeof v === "object") {
    // Cuenta, usuario y propietario llegan como { id, name }; el id no dice nada.
    const o = v as Record<string, unknown>;
    return String(o.name ?? o.display_value ?? o.full_name ?? "").trim();
  }
  return "";
}
function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function entero(v: unknown): number | null {
  const n = numero(v);
  return n === null ? null : Math.trunc(n);
}

/** Zoho devuelve el texto con entidades HTML: «Salou &amp; Calafell» salía tal cual (Ruth, 19/10/2026). */
function sinEntidades(t: string): string {
  return t
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function sinTildes(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** ¿El trato ya está aceptado por el cliente? (depósito, resto o ganada). */
export function estaAceptadoEnElCrm(fase: string | null | undefined): boolean {
  return /deposito|resto|ganad/.test(sinTildes(fase ?? ""));
}

// ── Presupuestos ─────────────────────────────────────────────────────────────

function lineaDe(fila: Record<string, unknown>, verEconomia: boolean): LineaDePresupuesto {
  return {
    servicio: texto(fila.Servicio),
    proveedor: texto(fila.Proveedor),
    tipo: texto(fila.Tipo_de_Servicio),
    regimen: texto(fila.Regimen),
    entrada: texto(fila.Fecha_Entrada),
    salida: texto(fila.Fecha_Salida),
    viajeros: entero(fila.Viajeros),
    cantidad: numero(fila.Cantidad),
    unidad: texto(fila.Unidad_de_uso),
    precio: numero(fila.Precio),
    total: numero(fila.Total_Servicio),
    coste: verEconomia ? numero(fila.T_Coste) : null,
    comentarios: texto(fila.Comentarios),
    validado: fila.Validado === true,
  };
}

/**
 * Los presupuestos (opciones) del trato, uno por número, con sus líneas.
 * Las líneas sin número cuentan como el presupuesto 1: así lo trata Zoho.
 */
export function presupuestosDelTrato(
  trato: TratoCrudo,
  opciones: { verEconomia: boolean } = { verEconomia: false },
): PresupuestoDelCrm[] {
  const filas = Array.isArray(trato.Servicios_Contratados) ? (trato.Servicios_Contratados as Record<string, unknown>[]) : [];
  const porNumero = new Map<number, LineaDePresupuesto[]>();
  for (const fila of filas) {
    if (!fila || typeof fila !== "object") continue;
    const n = entero(fila.N_Presupuesto) ?? 1;
    const lista = porNumero.get(n) ?? [];
    lista.push(lineaDe(fila, opciones.verEconomia));
    porNumero.set(n, lista);
  }
  const aceptadoNumero = estaAceptadoEnElCrm(texto(trato.Stage)) ? entero(trato.N_Presupuesto_Subformulario) : null;
  return [...porNumero.keys()]
    .sort((a, b) => a - b)
    .map((numeroDelPresupuesto) => {
      const lineas = porNumero.get(numeroDelPresupuesto) ?? [];
      const total = lineas.reduce((t, l) => t + (l.total ?? 0), 0);
      const coste = opciones.verEconomia ? lineas.reduce((t, l) => t + (l.coste ?? 0), 0) : null;
      return {
        numero: numeroDelPresupuesto,
        aceptado: aceptadoNumero === numeroDelPresupuesto,
        lineas,
        total,
        coste,
        margen: opciones.verEconomia && coste !== null && total > 0 ? ((total - coste) / total) * 100 : null,
      };
    });
}

/** El presupuesto aceptado, con lo que el CRM dice de cobro. Null si el trato todavía no está aceptado. */
export function resumenDelAceptado(
  trato: TratoCrudo,
  opciones: { verEconomia: boolean } = { verEconomia: false },
): ResumenDelAceptado | null {
  if (!estaAceptadoEnElCrm(texto(trato.Stage))) return null;
  return {
    numero: entero(trato.N_Presupuesto_Subformulario),
    total: numero(trato.Total_Servicios_Contratados_Presupuesto),
    pvpPorViajero: numero(trato.Importe_por_Viajero),
    deposito: numero(trato.Importe_Dep_sito_New),
    formaDeCobro: texto(trato.Forma_de_Cobro),
    tipoDePago: texto(trato.Tipo_de_Pago),
    depositoCobrado: texto(trato.Deposito_Cobrado),
    cobradoAl100: trato.Cobrado_al_100 === true,
    pendiente: numero(trato.Imp_Pendiente),
    fechaDeReserva: texto(trato.Fecha_de_Reserva),
    enlace: texto(trato.Presupuesto_Sugerido),
    idPresupuesto: texto(trato.ID_Presupuesto_Sugerido),
    coste: opciones.verEconomia ? numero(trato.Costes_Totales_Presupuesto_Aceptado) : null,
    margen: opciones.verEconomia ? numero(trato.Margen_Beneficio_Presupuesto_Aceptado) : null,
    costePorViajero: opciones.verEconomia ? numero(trato.Coste_por_viajero) : null,
  };
}

// ── Hitos ────────────────────────────────────────────────────────────────────

/**
 * Las fechas que el propio trato guarda: creación, último cambio de fase, última
 * actividad, reserva y próximo contacto. No es el historial completo de Zoho (eso
 * pide permisos que la app no tiene), pero distingue «cuándo pasó qué» de «cómo es».
 * Del más reciente al más antiguo; sin fecha, no hay hito.
 */
export function hitosDelTrato(trato: TratoCrudo): HitoDelCrm[] {
  const fase = texto(trato.Stage);
  const quien = (campo: unknown) => {
    const t = texto(campo);
    return t ? ` por ${t}` : "";
  };
  const candidatos: Array<[unknown, string]> = [
    [trato.Created_Time, `Trato creado en Zoho${quien(trato.Created_By)}`],
    [trato.Stage_Modified_Time, `Última vez que cambió de fase${fase ? `: ahora «${fase}»` : ""}`],
    [trato.Last_Activity_Time, "Última actividad registrada"],
    [trato.Modified_Time, `Última modificación del trato${quien(trato.Modified_By)}`],
    [trato.Fecha_de_Reserva, "Fecha de reserva"],
    [trato.Fecha_Proximo_Contacto ?? trato.Fecha, "Próximo contacto previsto"],
  ];
  const hitos: HitoDelCrm[] = [];
  for (const [fecha, descripcion] of candidatos) {
    const cuando = texto(fecha);
    if (cuando) hitos.push({ cuando, texto: descripcion });
  }
  return hitos.sort((a, b) => (a.cuando < b.cuando ? 1 : a.cuando > b.cuando ? -1 : 0));
}

// ── Todo junto ───────────────────────────────────────────────────────────────

export function fichaDelCrm(trato: TratoCrudo, opciones: { verEconomia: boolean } = { verEconomia: false }): FichaDelCrm {
  const libre = texto(trato.Opciones_de_Presupuesto) || texto(trato.Description);
  return {
    presupuestos: presupuestosDelTrato(trato, opciones),
    aceptado: resumenDelAceptado(trato, opciones),
    hitos: hitosDelTrato(trato),
    textoLibre: sinEntidades(libre),
    motivoDePerdida: texto(trato.Motivo_de_p_rdida),
    economiaVisible: opciones.verEconomia,
  };
}

/** Los campos de Zoho que hay que pedir para montar la ficha. */
export const CAMPOS_PARA_LA_FICHA = [
  "Deal_Name", "Stage", "Account_Name", "Contact_Name", "Contacto_grupo", "Departamento", "Idioma",
  "Fecha_llegada_actividad", "Fecha_salida_actividad", "Closing_Date", "N_mero_de_personas", "Profesor_entrenador",
  "Edad_participantes", "Amount", "Forma_de_Cobro", "Importe_Dep_sito_New", "Tipo_de_Pago", "Owner",
  "Servicios_Contratados", "N_Presupuesto_Subformulario", "Costes_Totales_Presupuesto_Aceptado",
  "Margen_Beneficio_Presupuesto_Aceptado", "Total_Servicios_Contratados_Presupuesto", "Importe_por_Viajero",
  "Coste_por_viajero", "Imp_Pendiente", "Deposito_Cobrado", "Cobrado_al_100", "Fecha_de_Reserva",
  "Presupuesto_Sugerido", "ID_Presupuesto_Sugerido", "Motivo_de_p_rdida", "Opciones_de_Presupuesto", "Description",
  "Created_Time", "Modified_Time", "Created_By", "Modified_By", "Stage_Modified_Time", "Last_Activity_Time",
  "Fecha_Proximo_Contacto", "Fecha",
] as const;
