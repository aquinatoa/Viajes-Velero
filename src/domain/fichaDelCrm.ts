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
  /**
   * ¿El CRM tiene el presupuesto línea a línea («Servicios Contratados»)? Sin él, el
   * número, el total, el coste y el margen no significan nada: `N_Presupuesto_Subformulario`
   * vale 1 por defecto y los totales valen 0 (visto el 11/11 en «TORREMOLINOS BLOCK 2027»).
   */
  hayDetalle: boolean;
  /** El número del presupuesto aceptado, si el CRM lo dice y hay detalle que lo respalde. */
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
    const directo = String(o.name ?? o.display_value ?? o.full_name ?? "").trim();
    if (directo) return directo;
    // Los multi-lookup («Proveedores») llegan como { id, Proveedores: { name, id } }.
    for (const [clave, hijo] of Object.entries(o)) {
      if (clave === "id" || !hijo || typeof hijo !== "object") continue;
      const t = texto(hijo);
      if (t) return t;
    }
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
  const hayDetalle = Array.isArray(trato.Servicios_Contratados) && trato.Servicios_Contratados.length > 0;
  return {
    hayDetalle,
    numero: hayDetalle ? entero(trato.N_Presupuesto_Subformulario) : null,
    total: hayDetalle ? numero(trato.Total_Servicios_Contratados_Presupuesto) : null,
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
    coste: opciones.verEconomia && hayDetalle ? numero(trato.Costes_Totales_Presupuesto_Aceptado) : null,
    margen: opciones.verEconomia && hayDetalle ? numero(trato.Margen_Beneficio_Presupuesto_Aceptado) : null,
    costePorViajero: opciones.verEconomia && hayDetalle ? numero(trato.Coste_por_viajero) : null,
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

// ── Qué tiene y qué no tiene el trato en el CRM ──────────────────────────────

export type EstadoDeInventario = "si" | "no" | "aviso" | "na";

export interface ItemDeInventario {
  /** Lo que se mira: «Presupuesto línea a línea», «Enlace al documento»… */
  texto: string;
  /** si = está · no = falta y debería estar · aviso = no se puede saber · na = vacío pero aún no toca */
  estado: EstadoDeInventario;
  detalle: string;
  /** Enlace para abrirlo, si lo hay. */
  enlace?: string;
}

const EUROS = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
} as unknown as Intl.NumberFormatOptions);
const eurosDe = (n: number | null): string => (n === null ? "" : `${EUROS.format(n)} €`);

/**
 * Una lista de comprobación de lo que el CRM tiene de verdad en este trato.
 *
 * Nace de una observación de Anthony (11/11/2026, «TORREMOLINOS BLOCK 2027»): la ficha
 * le enseñaba datos pero «no termino de ver realmente qué tiene esa oportunidad»: el
 * subformulario de servicios estaba vacío, no había enlace a ningún documento y la
 * pantalla lo disimulaba con «Presupuesto aceptado nº 1 · 0,00 €». Aquí lo que falta se
 * dice con todas las letras, y lo que no se puede saber también.
 */
export function inventarioDelTrato(trato: TratoCrudo): ItemDeInventario[] {
  const aceptado = estaAceptadoEnElCrm(texto(trato.Stage));
  const lineas = Array.isArray(trato.Servicios_Contratados) ? trato.Servicios_Contratados.filter((f) => f && typeof f === "object") : [];
  const numeros = new Set((lineas as Record<string, unknown>[]).map((f) => entero(f.N_Presupuesto) ?? 1));
  const items: ItemDeInventario[] = [];

  const importe = numero(trato.Amount);
  items.push(
    importe !== null && importe > 0
      ? { texto: "Importe del trato", estado: "si", detalle: eurosDe(importe) }
      : { texto: "Importe del trato", estado: "no", detalle: "sin importe en el CRM" },
  );

  // Un error de año en el CRM («llegada 19/03/2027, salida 31/03/2026») da noches negativas y descuadra el calendario.
  const llegada = texto(trato.Fecha_llegada_actividad).slice(0, 10);
  const salida = texto(trato.Fecha_salida_actividad).slice(0, 10);
  if (llegada && salida) {
    items.push(
      salida < llegada
        ? {
            texto: "Fechas del viaje",
            estado: "no",
            detalle: `la salida (${fechaLegible(salida)}) es anterior a la llegada (${fechaLegible(llegada)}): parece un error de año en el CRM`,
          }
        : { texto: "Fechas del viaje", estado: "si", detalle: `${fechaLegible(llegada)} → ${fechaLegible(salida)}` },
    );
  } else {
    items.push({ texto: "Fechas del viaje", estado: "no", detalle: llegada ? "falta la fecha de salida" : salida ? "falta la fecha de llegada" : "sin fechas de llegada ni de salida" });
  }

  const cobro = [
    texto(trato.Forma_de_Cobro),
    numero(trato.Importe_Dep_sito_New) !== null ? `depósito ${eurosDe(numero(trato.Importe_Dep_sito_New))}` : "",
    numero(trato.Imp_Pendiente) !== null ? `pendiente ${eurosDe(numero(trato.Imp_Pendiente))}` : "",
  ].filter(Boolean);
  items.push(
    cobro.length > 0
      ? { texto: "Condiciones de cobro", estado: "si", detalle: cobro.join(" · ") }
      : { texto: "Condiciones de cobro", estado: aceptado ? "no" : "na", detalle: aceptado ? "aceptada y sin forma de cobro ni depósito" : "todavía sin rellenar" },
  );

  items.push(
    lineas.length > 0
      ? {
          texto: "Presupuesto línea a línea («Servicios Contratados»)",
          estado: "si",
          detalle: `${lineas.length} ${lineas.length === 1 ? "línea" : "líneas"} en ${numeros.size} ${numeros.size === 1 ? "presupuesto" : "presupuestos"}`,
        }
      : {
          texto: "Presupuesto línea a línea («Servicios Contratados»)",
          estado: aceptado ? "no" : "na",
          detalle: aceptado
            ? "VACÍO: el trato está aceptado pero el CRM no tiene los servicios del presupuesto"
            : "vacío: todavía no se ha cargado ningún presupuesto en el CRM",
        },
  );

  if (aceptado) {
    const n = entero(trato.N_Presupuesto_Subformulario);
    items.push(
      lineas.length > 0 && n !== null
        ? { texto: "Cuál de los presupuestos aceptó el cliente", estado: "si", detalle: `el nº ${n}` }
        : { texto: "Cuál de los presupuestos aceptó el cliente", estado: "no", detalle: "no se sabe: sin servicios cargados no hay presupuesto que señalar" },
    );
  }

  // El enlace a Zoho Books («Presupuesto (Enlace Books)») NO se comprueba: Anthony (11/11/2026) dijo
  // que el documento de Books no hace falta. Si el trato lo trae, la tarjeta de cobro lo enseña.

  const proveedores = texto(trato.Proveedores);
  items.push(
    proveedores
      ? { texto: "Proveedores", estado: "si", detalle: proveedores }
      : { texto: "Proveedores", estado: "na", detalle: "ninguno enlazado" },
  );

  const libre = texto(trato.Opciones_de_Presupuesto) || texto(trato.Description);
  items.push(
    libre
      ? { texto: "Texto de opciones o descripción", estado: "si", detalle: `${libre.length} caracteres` }
      : { texto: "Texto de opciones o descripción", estado: "na", detalle: "vacío" },
  );

  items.push({
    texto: "Archivos adjuntos, notas, correos e historial de fases",
    estado: "aviso",
    detalle: "la app no puede leerlos con el permiso que tiene hoy en Zoho: están en la ficha del trato en Zoho",
  });
  return items;
}

// ── Todos los campos con valor ───────────────────────────────────────────────

export interface EtiquetaDeCampo {
  etiqueta: string;
  /** El `data_type` de Zoho: currency, date, datetime, boolean, lookup… */
  tipo: string;
}
export type EtiquetasDeCampos = Record<string, EtiquetaDeCampo>;

export interface CampoRelleno {
  etiqueta: string;
  valor: string;
}
export interface GrupoDeCampos {
  titulo: string;
  campos: CampoRelleno[];
}
export interface CamposDelTrato {
  grupos: GrupoDeCampos[];
  /** Los nombres de los campos que existen pero están vacíos. */
  vacios: string[];
  /** Cuántos campos tienen valor. */
  rellenos: number;
}

/** Campos de sistema o duplicados: no dicen nada a quien mira la ficha. */
const CAMPOS_DE_SISTEMA = new Set([
  "id", "Locked__s", "Record_Status__s", "Change_Log_Time__s", "Exchange_Rate", "Currency", "Tag",
  "Servicios_Contratados", "Territory", "Lead_Conversion_Time", "leadchain0__Social_Lead_ID",
]);
/** Solo para administradores. */
const CAMPOS_DE_ECONOMIA = new Set(["Costes_Totales_Presupuesto_Aceptado", "Margen_Beneficio_Presupuesto_Aceptado", "Coste_por_viajero"]);

const GRUPOS: { titulo: string; campos: string[] }[] = [
  {
    titulo: "El viaje",
    campos: [
      "Deal_Name", "Account_Name", "Contact_Name", "Contacto_grupo", "Departamento", "Idioma", "Fecha_llegada_actividad",
      "Fecha_salida_actividad", "N_mero_de_personas", "Profesor_entrenador", "Edad_participantes", "Choferes_extras",
      "Pa_s_de_Destino", "Proveedores", "Nro_de_Oportunidad", "Localizador_Dispongo",
    ],
  },
  {
    titulo: "Cobro y presupuesto",
    campos: [
      "Amount", "Forma_de_Cobro", "Tipo_de_Pago", "Importe_Dep_sito_New", "Importe_por_Viajero", "Imp_Pendiente", "Deposito_Cobrado",
      "Cobrado_al_100", "Actualizar_Importe_Deposito", "Fecha_de_Reserva", "Total_Servicios_Contratados_Presupuesto",
      "N_Presupuesto_Subformulario", "Presupuesto_Sugerido", "ID_Presupuesto_Sugerido", "Costes_Totales_Presupuesto_Aceptado",
      "Margen_Beneficio_Presupuesto_Aceptado", "Coste_por_viajero",
    ],
  },
  {
    titulo: "Fase y fechas",
    campos: [
      "Stage", "Closing_Date", "Stage_Modified_Time", "Created_Time", "Modified_Time", "Last_Activity_Time", "Fecha",
      "Fecha_Proximo_Contacto", "Overall_Sales_Duration", "Sales_Cycle_Duration", "Conversi_n_Prediction", "Fase_update", "Ultimo_Refresco",
    ],
  },
  { titulo: "Quién", campos: ["Owner", "Created_By", "Modified_By"] },
];

function fechaLegible(t: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(t);
  if (!m) return t;
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
}

function valorDeCampo(bruto: unknown, tipo: string): string {
  if (typeof bruto === "boolean") return bruto ? "Sí" : "No";
  const t = texto(bruto);
  if (t === "") return "";
  if (tipo === "currency" && numero(bruto) !== null) return eurosDe(numero(bruto));
  if (tipo === "percent" && numero(bruto) !== null) return `${numero(bruto)} %`;
  // Importes que Zoho guarda como «decimal» (PVP por viajero, pendiente…): 4667.8 → 4.667,80
  if (typeof bruto === "number" && !Number.isInteger(bruto)) return EUROS.format(bruto);
  if (tipo === "date" || tipo === "datetime" || /^\d{4}-\d{2}-\d{2}/.test(t)) return fechaLegible(t);
  return sinEntidades(t);
}

function etiquetaDe(api: string, etiquetas: EtiquetasDeCampos): string {
  return etiquetas[api]?.etiqueta || api.replace(/_/g, " ").trim();
}

/**
 * TODO lo que el trato tiene en Zoho, con los nombres que ven allí, agrupado, más la
 * lista de lo que existe pero está vacío. Los costes y márgenes solo con `verEconomia`.
 */
export function camposDelTratoConValor(
  trato: TratoCrudo,
  etiquetas: EtiquetasDeCampos = {},
  opciones: { verEconomia: boolean } = { verEconomia: false },
): CamposDelTrato {
  const visible = (api: string) => !api.startsWith("$") && !CAMPOS_DE_SISTEMA.has(api) && (opciones.verEconomia || !CAMPOS_DE_ECONOMIA.has(api));
  const claves = Object.keys(trato).filter(visible);
  const lleno = (api: string) => valorDeCampo(trato[api], etiquetas[api]?.tipo ?? "") !== "";

  const yaUsados = new Set<string>();
  const grupos: GrupoDeCampos[] = [];
  const ordenar = (lista: string[], base: string[]) => [...lista].sort((a, b) => base.indexOf(a) - base.indexOf(b));
  for (const g of GRUPOS) {
    const presentes = ordenar(
      g.campos.filter((api) => claves.includes(api) && lleno(api)),
      g.campos,
    );
    presentes.forEach((api) => yaUsados.add(api));
    if (presentes.length) {
      grupos.push({
        titulo: g.titulo,
        campos: presentes.map((api) => ({ etiqueta: etiquetaDe(api, etiquetas), valor: valorDeCampo(trato[api], etiquetas[api]?.tipo ?? "") })),
      });
    }
  }
  const otros = claves.filter((api) => !yaUsados.has(api) && lleno(api));
  if (otros.length) {
    grupos.push({
      titulo: "Otros datos",
      campos: otros.map((api) => ({ etiqueta: etiquetaDe(api, etiquetas), valor: valorDeCampo(trato[api], etiquetas[api]?.tipo ?? "") })),
    });
  }
  // Los campos del documento de Books no se echan en falta (no hacen falta).
  const NO_SE_ECHAN_EN_FALTA = new Set(["Presupuesto_Sugerido", "ID_Presupuesto_Sugerido"]);
  const vacios = claves.filter((api) => !lleno(api) && !NO_SE_ECHAN_EN_FALTA.has(api)).map((api) => etiquetaDe(api, etiquetas));
  // «Servicios Contratados» es de sistema para el listado, pero que esté vacío es lo que más importa saber.
  if (!Array.isArray(trato.Servicios_Contratados) || trato.Servicios_Contratados.length === 0) vacios.unshift(etiquetaDe("Servicios_Contratados", etiquetas));
  return { grupos, vacios, rellenos: grupos.reduce((t, g) => t + g.campos.length, 0) };
}

// ── Todo junto ───────────────────────────────────────────────────────────────

export interface FichaDelCrmCompleta extends FichaDelCrm {
  inventario: ItemDeInventario[];
  campos: CamposDelTrato;
}

export function fichaDelCrm(
  trato: TratoCrudo,
  opciones: { verEconomia: boolean } = { verEconomia: false },
  etiquetas: EtiquetasDeCampos = {},
): FichaDelCrmCompleta {
  const libre = texto(trato.Opciones_de_Presupuesto) || texto(trato.Description);
  return {
    presupuestos: presupuestosDelTrato(trato, opciones),
    aceptado: resumenDelAceptado(trato, opciones),
    hitos: hitosDelTrato(trato),
    textoLibre: sinEntidades(libre),
    motivoDePerdida: texto(trato.Motivo_de_p_rdida),
    economiaVisible: opciones.verEconomia,
    inventario: inventarioDelTrato(trato),
    campos: camposDelTratoConValor(trato, etiquetas, opciones),
  };
}
