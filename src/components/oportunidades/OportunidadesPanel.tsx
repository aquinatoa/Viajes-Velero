import { useCallback, useEffect, useMemo, useState } from "react";
import {
  correosSueltosApi,
  fetchZohoDealStagesApi,
  listarOportunidadesApi,
  listProposalDeliveriesApi,
  type AuthUser,
  type BackendDepartment,
  type ProposalDelivery,
  type ZohoDealSummary,
} from "../../services/apiClient";
import { DEPARTAMENTOS } from "../../domain/validacionDeLaPeticion";
import {
  etiquetaDeRango,
  mesInicialDelCalendario,
  rangoPorDefecto,
  rangoValido,
  type RangoDeViajes,
} from "../../domain/rangoDeViajes";
import { contarCarriles, nombreDelViaje, type Carril, type OportunidadFila } from "../../domain/oportunidadUnificada";
import { ActionRail, ConfirmCalendar, DealDetail, Kpi, euro, norm, stageTone } from "../confirm/ConfirmRequestsPanel";
import { FichaPropuesta } from "../home/FichaPropuesta";
import { CorreosSueltosPanel } from "../home/CorreosSueltosPanel";

/**
 * Oportunidades: una sola pantalla para gestionar cada viaje presentado, desde
 * que se pide hasta que se cobra.
 *
 * Sustituye a «Propuestas» y a «Viajes», que eran dos pantallas sobre lo mismo
 * con datos distintos (la base de la app y Zoho). Aquí hay una lista, que une las
 * dos fuentes en el servidor, y un detalle:
 *  - si la oportunidad salió de una propuesta de la app, el detalle es la ficha
 *    completa (embudo, opciones con desglose, siguiente paso, correo…);
 *  - si solo existe en Zoho, el detalle es el del trato, con su panel de acción.
 *
 * Quién ve qué lo decide el servidor, como siempre. Aquí solo se elige el
 * departamento si se tiene acceso a los dos.
 */

type Vista = "list" | "calendar";
type FiltroDepartamento = BackendDepartment | "TODOS";
/** «zoho» = oportunidades que no salieron de una propuesta de la app. */
type FiltroCarril = Carril | "zoho" | "";

const CLAVE_RANGO = "oravia.viajes.rango";

function rangoInicial(): RangoDeViajes {
  try {
    const guardado = JSON.parse(window.localStorage.getItem(CLAVE_RANGO) ?? "null");
    if (rangoValido(guardado)) return guardado;
  } catch {
    // sin almacenamiento, o guardado roto: el de por defecto
  }
  return rangoPorDefecto();
}

const ETIQUETA_CARRIL: Record<Carril, string> = {
  sin_enviar: "Sin enviar",
  esperando: "Esperando respuesta",
  aceptada: "Aceptadas, sin depósito",
  cerrada: "Cerradas",
};

function diasHasta(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.ceil((t - Date.now()) / 86_400_000);
}

function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86_400_000);
}

/** Frase que explica por qué esta oportunidad está donde está. */
function lineaDeEstado(f: OportunidadFila): string {
  const e = f.entrega;
  if (e) {
    if (e.estado === "FAILED") return `No salió: ${e.motivoDelFallo ?? "el servidor de correo la rechazó"}`;
    if (f.deposito.cobradoEl) return `Depósito cobrado, opción ${f.elegida}`;
    if (f.elegida) {
      const quedan = diasHasta(f.deposito.venceEl);
      if (quedan === null) return `Aceptada la opción ${f.elegida}`;
      if (quedan < 0) return `El depósito venció hace ${Math.abs(quedan)} días`;
      return `Quedan ${quedan} días para el depósito`;
    }
    if (e.estado === "DRAFT") return "Preparada, sin enviar";
    if (e.estado === "SIMULATED") return "Preparada, pendiente de la clave del buzón";
    const enviada = diasDesde(e.enviadaEl);
    if (e.vistas > 0) return `Abierta ${e.vistas} ${e.vistas === 1 ? "vez" : "veces"}, sin respuesta`;
    if (enviada === null) return "Enviada";
    if (enviada === 0) return "Enviada hoy";
    return `Enviada hace ${enviada} ${enviada === 1 ? "día" : "días"}, sin abrir`;
  }
  if (f.detalleRestringido) return "Propuesta de otra persona";
  return f.elegida ? `Opción ${f.elegida} aceptada · solo en Zoho` : "Solo en Zoho";
}

/** El plazo del depósito, visto. Un anillo que se vacía se entiende de un vistazo. */
const PLAZO_DEPOSITO = 40;
function AnilloDeposito({ dias }: { dias: number }) {
  const radio = 18;
  const vuelta = 2 * Math.PI * radio;
  const parte = Math.max(0, Math.min(dias / PLAZO_DEPOSITO, 1));
  const tono = dias <= 7 ? "now" : dias <= 21 ? "soon" : "calm";
  return (
    <span
      className={`ring ring--${tono}`}
      role="img"
      aria-label={dias < 0 ? `Vencido hace ${Math.abs(dias)} días` : `Quedan ${dias} días para el depósito`}
    >
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle className="ring__track" cx="22" cy="22" r={radio} />
        <circle className="ring__bar" cx="22" cy="22" r={radio} strokeDasharray={vuelta} strokeDashoffset={vuelta * (1 - parte)} />
      </svg>
      <span className="ring__txt" aria-hidden="true">
        <b>{Math.abs(dias)}</b>
        <small>{dias < 0 ? "pasados" : "días"}</small>
      </span>
    </span>
  );
}

/** Lo que el detalle de Zoho necesita, a partir de una fila. */
function comoTratoDeZoho(f: OportunidadFila): ZohoDealSummary {
  return {
    id: f.crmDealId ?? f.clave,
    dealName: f.nombre,
    stage: f.fase ?? "",
    arrivalDate: f.llegada ?? "",
    departureDate: f.salida ?? "",
    amount: f.importe,
    closingDate: f.cierre ?? "",
    accountName: f.cuenta,
    contactName: f.contacto,
    description: f.crm?.description ?? "",
    opcionesTexto: f.crm?.opcionesTexto ?? "",
    nextStep: "",
    createdTime: f.crm?.createdTime ?? "",
    modifiedTime: f.crm?.modifiedTime ?? "",
    dealUrl: f.dealUrl ?? "",
    department: f.departamento,
  };
}

export function OportunidadesPanel({
  view = "list",
  onNavigate,
  usuario,
}: {
  view?: Vista;
  onNavigate?: (path: string) => void;
  usuario?: Pick<AuthUser, "role" | "department"> | null;
}) {
  const [todas, setTodas] = useState<OportunidadFila[]>([]);
  const [entregas, setEntregas] = useState<ProposalDelivery[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [zohoDisponible, setZohoDisponible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [sueltos, setSueltos] = useState(0);
  const [verSueltos, setVerSueltos] = useState(false);

  const eligeDepartamento = !usuario || !usuario.department;
  const [departamento, setDepartamento] = useState<FiltroDepartamento>("TODOS");

  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("buscar") ?? "";
  });
  const [stageFilter, setStageFilter] = useState("");
  const [carril, setCarril] = useState<FiltroCarril>("");
  const [sortBy, setSortBy] = useState<"prisa" | "recent" | "closing" | "amount">("prisa");
  const [seleccion, setSeleccion] = useState<string | null>(null);

  const [rango, setRango] = useState<RangoDeViajes>(() => rangoInicial());
  const [borradorRango, setBorradorRango] = useState<RangoDeViajes>(rango);
  const aplicarRango = (siguiente: RangoDeViajes) => {
    setBorradorRango(siguiente);
    if (!rangoValido(siguiente)) return;
    setRango(siguiente);
    try {
      window.localStorage.setItem(CLAVE_RANGO, JSON.stringify(siguiente));
    } catch {
      // sin almacenamiento: vale para esta visita
    }
  };

  /**
   * Trae la lista. Con `silencioso`, sin parpadeo: lo usa la ficha al avisar de
   * que algo cambió, para que la lista de la izquierda no se vacíe mientras se
   * trabaja en el detalle.
   */
  const cargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setLoading(true);
      setError("");
      try {
        const [lista, propuestas, fases] = await Promise.all([
          listarOportunidadesApi(rango),
          // Los paneles de correo y de ficha trabajan con la propuesta tal cual.
          listProposalDeliveriesApi().catch(() => ({ deliveries: [] as ProposalDelivery[] })),
          fetchZohoDealStagesApi().catch(() => ({ stages: [] as string[] })),
        ]);
        setTodas(lista.oportunidades);
        setZohoDisponible(lista.zohoDisponible);
        setEntregas(propuestas.deliveries);
        setStages(fases.stages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron cargar las oportunidades.");
      } finally {
        if (!silencioso) setLoading(false);
      }
    },
    [rango],
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    // La cuenta de correos sin asignar es un aviso: si falla, no estorba.
    correosSueltosApi()
      .then(({ mensajes }) => setSueltos(mensajes.length))
      .catch(() => undefined);
  }, []);

  const entregaPorId = useMemo(() => new Map(entregas.map((e) => [e.id, e])), [entregas]);

  // Lo que se está mirando: un departamento o los dos. Todo lo de abajo sale de aquí.
  const delDepartamento = useMemo(
    () =>
      departamento === "TODOS"
        ? todas
        : todas.filter((f) => f.departamento === departamento || f.departamento === null),
    [todas, departamento],
  );

  const carriles = useMemo(() => contarCarriles(delDepartamento), [delDepartamento]);
  const soloZoho = useMemo(() => delDepartamento.filter((f) => f.origen === "ZOHO").length, [delDepartamento]);

  const fasesPresentes = useMemo(
    () => [...new Set(delDepartamento.map((f) => f.fase).filter((s): s is string => Boolean(s)))],
    [delDepartamento],
  );

  const filtradas = useMemo(() => {
    const q = norm(query.trim());
    const lista = delDepartamento.filter((f) => {
      if (carril === "zoho") {
        if (f.origen !== "ZOHO") return false;
      } else if (carril && f.carril !== carril) return false;
      if (stageFilter && f.fase !== stageFilter) return false;
      if (q && !norm(`${f.nombre} ${f.cuenta} ${f.contacto} ${f.entrega?.reference ?? ""}`).includes(q)) return false;
      return true;
    });
    return [...lista].sort((a, b) => {
      if (sortBy === "amount") return (b.importe ?? 0) - (a.importe ?? 0);
      if (sortBy === "closing") return (a.cierre || "9999").localeCompare(b.cierre || "9999");
      if (sortBy === "recent") return (b.crm?.modifiedTime || "").localeCompare(a.crm?.modifiedTime || "");
      return a.urgencia - b.urgencia;
    });
  }, [delDepartamento, query, stageFilter, carril, sortBy]);

  // Mantener una selección válida.
  useEffect(() => {
    if (loading) return;
    if (seleccion && delDepartamento.some((f) => f.clave === seleccion)) return;
    setSeleccion(filtradas[0]?.clave ?? delDepartamento[0]?.clave ?? null);
  }, [loading, filtradas, delDepartamento, seleccion]);

  // Los indicadores, sobre lo que se está mirando. «Importe en curso» es la suma de
  // lo que sigue abierto; «ganado», la de lo ganado. No es facturación: es importe
  // de oportunidad (Javier lo leía como «total facturado»).
  const kpis = useMemo(() => {
    let porConfirmar = 0;
    let enviado = 0;
    let ganadas = 0;
    let importeGanado = 0;
    let abiertos = 0;
    let importeEnCurso = 0;
    for (const f of delDepartamento) {
      const s = norm(f.fase ?? "");
      if (f.elegida == null && !/ganad|perdid|cerrad|finaliz/.test(s)) porConfirmar += 1;
      if (/enviad/.test(s)) enviado += 1;
      if (/ganad|finaliz/.test(s)) {
        ganadas += 1;
        importeGanado += f.importe ?? 0;
      }
      if (!/perdid|cerrad|finaliz/.test(s)) {
        abiertos += 1;
        importeEnCurso += f.importe ?? 0;
      }
    }
    return { porConfirmar, enviado, ganadas, importeGanado, abiertos, importeEnCurso };
  }, [delDepartamento]);

  const seleccionada = delDepartamento.find((f) => f.clave === seleccion) ?? null;

  // El calendario lee los mismos datos: cada fila, como un trato con sus fechas.
  const paraElCalendario = useMemo(() => delDepartamento.map(comoTratoDeZoho), [delDepartamento]);

  return (
    <div className="cw op">
      <div className="cw__head">
        <div>
          <h2>Oportunidades</h2>
          <p>
            {loading
              ? "Cargando oportunidades…"
              : `${delDepartamento.length} oportunidades con llegada ${etiquetaDeRango(rango)}${
                  departamento === "TODOS" ? "" : ` · ${DEPARTAMENTOS[departamento]}`
                }`}{" "}
            · los importes son de este periodo.
          </p>
        </div>
        <div className="cw__head-actions">
          <div className="cw__rango" role="group" aria-label="Periodo de llegada">
            <span>Llegadas</span>
            <input
              type="date"
              value={borradorRango.desde}
              max={borradorRango.hasta || undefined}
              onChange={(e) => aplicarRango({ ...borradorRango, desde: e.target.value })}
              aria-label="Desde"
            />
            <span>a</span>
            <input
              type="date"
              value={borradorRango.hasta}
              min={borradorRango.desde || undefined}
              onChange={(e) => aplicarRango({ ...borradorRango, hasta: e.target.value })}
              aria-label="Hasta"
            />
            {rango.desde !== rangoPorDefecto().desde || rango.hasta !== rangoPorDefecto().hasta ? (
              <button type="button" className="cw__rango-reset" onClick={() => aplicarRango(rangoPorDefecto())}>
                {rangoPorDefecto().desde.slice(0, 4)}
              </button>
            ) : null}
          </div>
          {eligeDepartamento ? (
            <label className="cw__dept">
              <span>Departamento</span>
              <select value={departamento} onChange={(e) => setDepartamento(e.target.value as FiltroDepartamento)}>
                <option value="TODOS">Todos</option>
                <option value="GROUPS">{DEPARTAMENTOS.GROUPS}</option>
                <option value="SPORTS">{DEPARTAMENTOS.SPORTS}</option>
              </select>
            </label>
          ) : null}
          <div className="cw__viewtabs" role="tablist" aria-label="Vista">
            <button
              className={view === "list" ? "is" : ""}
              role="tab"
              aria-selected={view === "list"}
              onClick={() => onNavigate?.("/oportunidades")}
            >
              Lista
            </button>
            <button
              className={view === "calendar" ? "is" : ""}
              role="tab"
              aria-selected={view === "calendar"}
              onClick={() => onNavigate?.("/oportunidades/calendario")}
            >
              Calendario
            </button>
          </div>
          <button type="button" className="cw__refresh" onClick={() => setVerSueltos(true)}>
            Correos sin asignar
            {sueltos > 0 ? <span className="op__badge">{sueltos}</span> : null}
          </button>
          <button className="cw__refresh" onClick={() => void cargar()} disabled={loading}>
            Actualizar
          </button>
        </div>
      </div>

      {error ? <div className="cf__alert cf__alert--error">{error}</div> : null}
      {info && !error ? <div className="cf__alert cf__alert--ok">{info}</div> : null}
      {!zohoDisponible && !error ? (
        <div className="cf__alert cf__alert--error">
          Zoho no ha contestado: se enseña solo lo que sabe la app. Prueba a actualizar en un momento.
        </div>
      ) : null}

      {view === "calendar" ? (
        <ConfirmCalendar
          key={`${rango.desde}|${rango.hasta}`}
          deals={paraElCalendario}
          loading={loading}
          onSelect={(id) => {
            setSeleccion(id);
            onNavigate?.("/oportunidades");
          }}
          inicio={mesInicialDelCalendario(rango)}
        />
      ) : (
        <div className="op__grid">
          {/* ===== Lista ===== */}
          <div className="cw__col cw__col--list">
            <div className="cw-kpis">
              <Kpi n={kpis.porConfirmar} label="Sin confirmar" dot="w" />
              <Kpi n={kpis.enviado} label="Propuesta enviada" dot="i" />
              <Kpi n={kpis.ganadas} label="Ganadas" dot="ok" sub={`${euro(kpis.importeGanado)} ganados`} />
              <Kpi
                n={euro(kpis.importeEnCurso)}
                label="Importe en curso"
                dot="m"
                sub={`${kpis.abiertos} oportunidad(es) abierta(s)`}
              />
            </div>

            <div className="cw-list">
              <div className="cw-list__head">
                <div className="op__chips" role="group" aria-label="Estado">
                  {(Object.keys(ETIQUETA_CARRIL) as Carril[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`op__chip${carril === c ? " is" : ""}`}
                      aria-pressed={carril === c}
                      onClick={() => setCarril(carril === c ? "" : c)}
                    >
                      {ETIQUETA_CARRIL[c]} <b>{carriles[c]}</b>
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`op__chip op__chip--zoho${carril === "zoho" ? " is" : ""}`}
                    aria-pressed={carril === "zoho"}
                    onClick={() => setCarril(carril === "zoho" ? "" : "zoho")}
                    title="Oportunidades que no salieron de una propuesta de la app"
                  >
                    Sin propuesta de la app <b>{soloZoho}</b>
                  </button>
                </div>
                <div className="cf__search">
                  <input
                    placeholder="Buscar por nombre, cuenta, contacto o referencia…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="cw-list__filters">
                  <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
                    <option value="">Todas las fases</option>
                    {(stages.length ? stages : fasesPresentes).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                    <option value="prisa">Lo que corre prisa</option>
                    <option value="recent">Recientes</option>
                    <option value="closing">Cierre próximo</option>
                    <option value="amount">Importe (mayor)</option>
                  </select>
                </div>
              </div>

              <div className="cw-feed">
                {loading ? (
                  <p className="cf__empty">Cargando…</p>
                ) : filtradas.length === 0 ? (
                  <p className="cf__empty">
                    {delDepartamento.length === 0
                      ? "No hay oportunidades en este periodo."
                      : "Ninguna oportunidad coincide con el filtro."}
                  </p>
                ) : (
                  filtradas.map((f) => {
                    const quedan = f.carril === "aceptada" ? diasHasta(f.deposito.venceEl) : null;
                    const urgente = f.entrega?.estado === "FAILED" || (quedan !== null && quedan <= 7);
                    return (
                      <button
                        key={f.clave}
                        className={`cw-deal op-fila${seleccion === f.clave ? " is" : ""}${urgente ? " op-fila--ya" : ""}`}
                        onClick={() => setSeleccion(f.clave)}
                      >
                        <div className="cw-deal__top">
                          <span className="cw-deal__name">{f.nombre}</span>
                          <span className="cw-deal__amt">{euro(f.importe)}</span>
                        </div>
                        <div className="cw-deal__sub">
                          {f.fase ? (
                            <span className={`cf-stage cf-stage--${stageTone(f.fase)}`}>{f.fase}</span>
                          ) : (
                            <span className="cf-stage cf-stage--muted">Sin oportunidad en el CRM aún</span>
                          )}
                          {f.departamento === "GROUPS" || f.departamento === "SPORTS" ? (
                            <span className={`desk__dept desk__dept--${f.departamento.toLowerCase()}`}>
                              {f.departamento === "SPORTS" ? "Sports" : "Groups"}
                            </span>
                          ) : null}
                          <span className="cw-deal__people">
                            {[f.cuenta, f.contacto].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </div>
                        <div className="op-fila__pie">
                          <span className="op-fila__why">{lineaDeEstado(f)}</span>
                          {quedan !== null ? <AnilloDeposito dias={quedan} /> : null}
                          {f.entrega ? <span className="op-fila__ref">{f.entrega.reference}</span> : null}
                        </div>
                        {f.opcionContradictoria ? (
                          <span className="op-fila__aviso">⚠ La opción aceptada no coincide entre la app y Zoho</span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* ===== Detalle ===== */}
          <div className="op__detalle">
            {seleccionada ? (
              <DetalleDeLaOportunidad
                fila={seleccionada}
                entrega={seleccionada.entrega ? entregaPorId.get(seleccionada.entrega.id) : undefined}
                stages={stages}
                onCambio={() => void cargar(true)}
                onBorrada={(resumen) => {
                  setSeleccion(null);
                  setInfo(resumen);
                  void cargar(true);
                }}
                onSaved={(msg) => {
                  setInfo(msg);
                  void cargar(true);
                }}
                onError={(msg) => setError(msg)}
              />
            ) : (
              <div className="cw-detail cw-detail--empty">
                <p className="cf__empty">Elige una oportunidad de la lista para ver su detalle.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {verSueltos ? (
        <CorreosSueltosPanel
          deliveries={entregas}
          tituloDe={nombreDelViaje}
          onClose={() => setVerSueltos(false)}
          onCambio={setSueltos}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detalle
// ─────────────────────────────────────────────────────────────────────────────

function DetalleDeLaOportunidad({
  fila,
  entrega,
  stages,
  onCambio,
  onBorrada,
  onSaved,
  onError,
}: {
  fila: OportunidadFila;
  entrega: ProposalDelivery | undefined;
  stages: string[];
  onCambio: () => void;
  onBorrada: (resumen: string) => void;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  // La app y Zoho no dicen lo mismo de la opción aceptada: se enseña, no se calla.
  const aviso = fila.opcionContradictoria ? (
    <div className="op__aviso" role="alert">
      <b>La opción aceptada no coincide.</b>{" "}
      {fila.opcionEnLaApp != null ? `La app dice la opción ${fila.opcionEnLaApp}` : "La app no tiene ninguna apuntada"}
      {" y Zoho dice la "}
      {fila.opcionEnZoho != null ? `opción ${fila.opcionEnZoho}` : "ninguna"}.
      {fila.opcionEnLaApp == null ? " Si es la buena, apúntala desde la ficha para que arranque el plazo del depósito." : ""}
    </div>
  ) : null;

  // Con propuesta de la app: la ficha completa.
  if (entrega && !fila.detalleRestringido) {
    return (
      <div className="op__ficha">
        {aviso}
        <FichaPropuesta key={entrega.id} delivery={entrega} incrustada onCambio={onCambio} onBorrada={onBorrada} />
      </div>
    );
  }

  // Sin ella: el detalle del trato, con su panel de acción.
  const trato = comoTratoDeZoho(fila);
  return (
    <div className="op__crm">
      {aviso}
      <p className="op__nota">
        {fila.detalleRestringido
          ? "La propuesta de esta oportunidad es de otra persona de tu departamento: aquí ves lo que dice Zoho."
          : "Esta oportunidad no salió de una propuesta de la app: se creó directamente en Zoho. Puedes moverla de fase, anotar y abrirla en el CRM."}
      </p>
      <div className="op__crm-cols">
        <DealDetail deal={trato} />
        <div className="op__crm-rail">
          <ActionRail deal={trato} stages={stages} onSaved={onSaved} onError={onError} />
        </div>
      </div>
    </div>
  );
}
