import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  fetchZohoDealStagesApi,
  listarOportunidadesApi,
  listProposalDeliveriesApi,
  type AuthUser,
  type BackendDepartment,
  type ProposalDelivery,
} from "../../services/apiClient";
import { DEPARTAMENTOS } from "../../domain/validacionDeLaPeticion";
import {
  etiquetaDeRango,
  mesInicialDelCalendario,
  rangoPorDefecto,
  rangoValido,
  type RangoDeViajes,
} from "../../domain/rangoDeViajes";
import type { OportunidadFila } from "../../domain/oportunidadUnificada";
import {
  ESTADOS,
  filtrar,
  eurosCorto,
  fasesPresentes,
  ordenar,
  porMes,
  resumen,
  VISTAS_GUARDADAS,
  type FiltroDeEstado,
  type OrdenDeOportunidades,
} from "../../domain/oportunidadesVista";
import { FASES_DEL_ESTADO, enElOrdenDelCrm, estiloDeFase, indexarColores, type ColoresDeFase } from "../../domain/colorDeFase";
import { ConfirmCalendar } from "../confirm/ConfirmRequestsPanel";
import { FichaPropuesta } from "../home/FichaPropuesta";
import { FichaDeTrato } from "./FichaDeTrato";
import { MoverDeFase } from "./MoverDeFase";
import { SelectorDeFase } from "./SelectorDeFase";
import { TablaDeOportunidades, TableroDeOportunidades } from "./TablaYTablero";
import { comoTratoDeZoho } from "./tratoDeZoho";

/**
 * Oportunidades: una sola pantalla para gestionar cada viaje presentado, desde
 * que se pide hasta que se cobra.
 *
 * Sustituye a «Propuestas» y a «Viajes», que eran dos pantallas sobre lo mismo
 * con datos distintos (la base de la app y Zoho). El servidor une las dos
 * fuentes y aquí se enseñan como en el CRM (Anthony, 16/11/2026):
 *
 *  - dos VISTAS y solo dos: **Lista** (una fila por oportunidad, con las
 *    columnas del CRM) y **Kanban** (una columna por fase);
 *  - la **ficha a pantalla completa** (`/oportunidades/ficha/<clave>`), con
 *    «Volver» y anterior / siguiente. Si la oportunidad salió de una propuesta
 *    de la app es la ficha completa (avance, opciones, siguiente paso, correo…);
 *    si solo existe en Zoho, la ficha del trato;
 *  - el **Resumen** (`/oportunidades/resumen`) y el **Calendario**
 *    (`/oportunidades/calendario`) son secciones aparte, en el menú lateral.
 *    Cada cifra del resumen abre la lista ya filtrada.
 *
 * Quién ve qué lo decide el servidor, como siempre. Aquí solo se elige el
 * departamento si se tiene acceso a los dos.
 */

type Vista = "list" | "calendar" | "summary" | "detail";
type Modo = "lista" | "kanban";
type FiltroDepartamento = BackendDepartment | "TODOS";
type Origen = "todas" | "app" | "zoho";

const CLAVE_RANGO = "oravia.viajes.rango";
const CLAVE_MODO = "oravia.oportunidades.modo";

/** Dónde vive la ficha de una oportunidad. */
export function rutaDeLaFicha(clave: string): string {
  return `/oportunidades/ficha/${encodeURIComponent(clave)}`;
}

function rangoInicial(): RangoDeViajes {
  try {
    const guardado = JSON.parse(window.localStorage.getItem(CLAVE_RANGO) ?? "null");
    if (rangoValido(guardado)) return guardado;
  } catch {
    // sin almacenamiento, o guardado roto: el de por defecto
  }
  return rangoPorDefecto();
}

function modoInicial(): Modo {
  try {
    // «tablero» es como se llamaba el kanban hasta el 16/11/2026; «tabla», la lista.
    const guardado = window.localStorage.getItem(CLAVE_MODO);
    if (guardado === "kanban" || guardado === "tablero") return "kanban";
  } catch {
    // sin almacenamiento
  }
  return "lista";
}

const ORDENES: { id: OrdenDeOportunidades; nombre: string }[] = [
  { id: "prisa", nombre: "Lo que corre prisa" },
  { id: "llegada", nombre: "Llegada más próxima" },
  { id: "cierre", nombre: "Cierre más próximo" },
  { id: "importe", nombre: "Importe (mayor)" },
  { id: "reciente", nombre: "Recientes" },
  { id: "nombre", nombre: "Nombre" },
  { id: "cuenta", nombre: "Cuenta" },
  { id: "fase", nombre: "Fase" },
];

export function OportunidadesPanel({
  view = "list",
  fichaClave = null,
  onNavigate,
  usuario,
}: {
  view?: Vista;
  /** La oportunidad que se está viendo a pantalla completa (solo con `view="detail"`). */
  fichaClave?: string | null;
  onNavigate?: (path: string) => void;
  usuario?: Pick<AuthUser, "role" | "department"> | null;
}) {
  const [todas, setTodas] = useState<OportunidadFila[]>([]);
  const [entregas, setEntregas] = useState<ProposalDelivery[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  /** Las fases con el color que tienen en el CRM: se pinta cada una con el suyo. */
  const [fasesDelCrm, setFasesDelCrm] = useState<{ nombre: string; color: string | null }[]>([]);
  const [zohoDisponible, setZohoDisponible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const eligeDepartamento = !usuario || !usuario.department;
  const [departamento, setDepartamento] = useState<FiltroDepartamento>("TODOS");

  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("buscar") ?? "";
  });
  const [estado, setEstado] = useState<FiltroDeEstado>("todas");
  const [origen, setOrigen] = useState<Origen>("todas");
  const [fase, setFase] = useState("");
  const [orden, setOrden] = useState<OrdenDeOportunidades>("prisa");
  const [vistaGuardada, setVistaGuardada] = useState("");
  const [mes, setMes] = useState("");
  const [modo, setModoEstado] = useState<Modo>(() => modoInicial());
  /** La última oportunidad abierta: al volver de la ficha queda marcada y a la vista. */
  const [seleccion, setSeleccion] = useState<string | null>(null);

  const cambiarModo = (m: Modo) => {
    setModoEstado(m);
    try {
      window.localStorage.setItem(CLAVE_MODO, m);
    } catch {
      // sin almacenamiento: vale para esta visita
    }
    if (view !== "list") onNavigate?.("/oportunidades");
  };

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
   * que algo cambió, para que no se vacíe mientras se trabaja en el detalle.
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
        setFasesDelCrm(lista.fases ?? []);
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

  const colores = useMemo(() => indexarColores(fasesDelCrm), [fasesDelCrm]);
  const entregaPorId = useMemo(() => new Map(entregas.map((e) => [e.id, e])), [entregas]);
  const hoy = useMemo(() => new Date(), [todas]);

  // Lo que se está mirando, sin el estado.
  const baseSinEstado = useMemo(
    () => filtrar(todas, { origen, departamento, fase, q: query, vista: vistaGuardada, mes }, hoy),
    [todas, origen, departamento, fase, query, vistaGuardada, mes, hoy],
  );
  const res = useMemo(() => resumen(baseSinEstado, hoy), [baseSinEstado, hoy]);
  const filas = useMemo(() => ordenar(filtrar(baseSinEstado, { estado }, hoy), orden, hoy), [baseSinEstado, estado, orden, hoy]);

  // Los números que no dependen de nada de lo anterior: son los del resumen.
  const delDepartamento = useMemo(() => filtrar(todas, { departamento }, hoy), [todas, departamento, hoy]);
  const resTotal = useMemo(() => resumen(delDepartamento, hoy), [delDepartamento, hoy]);
  const nApp = useMemo(() => filtrar(todas, { departamento, fase, q: query, vista: vistaGuardada, mes }, hoy).filter((f) => f.origen === "APP").length, [todas, departamento, fase, query, vistaGuardada, mes, hoy]);
  const nTodasOrigen = useMemo(() => filtrar(todas, { departamento, fase, q: query, vista: vistaGuardada, mes }, hoy).length, [todas, departamento, fase, query, vistaGuardada, mes, hoy]);
  // Las fases del filtro, en el orden del CRM (el mismo del kanban), y cuántas hay en cada una.
  const fases = useMemo(() => enElOrdenDelCrm(fasesPresentes(delDepartamento), fasesDelCrm.map((f) => f.nombre)), [delDepartamento, fasesDelCrm]);
  const cuantasPorFase = useMemo(() => {
    const n: Record<string, number> = {};
    for (const f of delDepartamento) if (f.fase) n[f.fase] = (n[f.fase] ?? 0) + 1;
    return n;
  }, [delDepartamento]);
  // La carga por mes es del resumen: del periodo y el departamento, sin los filtros de la lista.
  const carga = useMemo(() => porMes(delDepartamento), [delDepartamento]);
  const cargaMaxima = Math.max(1, ...carga.map((m) => m.importe));
  const nombreDelMes = carga.find((m) => m.mes === mes)?.nombre ?? mes;
  const nombreDelEstado = ESTADOS.find((e) => e.id === estado)?.nombre ?? "";
  const hayFiltros = estado !== "todas" || origen !== "todas" || fase !== "" || query.trim() !== "" || vistaGuardada !== "" || mes !== "";

  // La ficha a pantalla completa: la oportunidad de la ruta, y su sitio en la lista.
  const claveAbierta = view === "detail" ? fichaClave : null;
  const abierta = claveAbierta ? (todas.find((f) => f.clave === claveAbierta) ?? null) : null;
  const posicion = claveAbierta ? filas.findIndex((f) => f.clave === claveAbierta) : -1;
  const anterior = posicion > 0 ? filas[posicion - 1] : null;
  const siguiente = posicion >= 0 && posicion < filas.length - 1 ? filas[posicion + 1] : null;

  // La que se abre queda como «la última vista», para marcarla al volver.
  useEffect(() => {
    if (claveAbierta) setSeleccion(claveAbierta);
  }, [claveAbierta]);

  // Al volver a la lista o al kanban, la última oportunidad abierta queda a la vista.
  useEffect(() => {
    if (view !== "list" || loading || !seleccion) return;
    const id = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".opx-tabla tbody tr.is, .opx-tarjeta.is")?.scrollIntoView({ block: "center", inline: "nearest" });
    });
    return () => window.cancelAnimationFrame(id);
    // Solo al entrar en la vista: moverse por la lista no debe recolocarla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, modo, loading]);

  // El calendario lee los mismos datos: cada fila, como un trato con sus fechas.
  const paraElCalendario = useMemo(() => delDepartamento.map(comoTratoDeZoho), [delDepartamento]);

  const ponerVista = (id: string) => {
    setVistaGuardada(id);
    setEstado("todas");
  };
  const limpiarFiltros = () => {
    setEstado("todas");
    setOrigen("todas");
    setFase("");
    setQuery("");
    setVistaGuardada("");
    setMes("");
  };
  /**
   * Del resumen a la lista. Las cifras del resumen son del periodo y el
   * departamento, así que se llega con ESE filtro y ningún otro: si quedara una
   * búsqueda vieja, la tarjeta diría 28 y la lista enseñaría 3.
   */
  const irAlListado = (f: { estado?: FiltroDeEstado; vista?: string; mes?: string }) => {
    setOrigen("todas");
    setFase("");
    setQuery("");
    setEstado(f.estado ?? "todas");
    setVistaGuardada(f.vista ?? "");
    setMes(f.mes ?? "");
    onNavigate?.("/oportunidades");
  };
  /** Abre la ficha a pantalla completa. */
  const abrir = (clave: string) => {
    setSeleccion(clave);
    onNavigate?.(rutaDeLaFicha(clave));
  };
  const volver = () => onNavigate?.("/oportunidades");

  const detalle = abierta ? (
    <DetalleDeLaOportunidad
      fila={abierta}
      entrega={abierta.entrega ? entregaPorId.get(abierta.entrega.id) : undefined}
      stages={stages}
      colores={colores}
      onCambio={() => void cargar(true)}
      onBorrada={(resumenDeBorrado) => {
        setSeleccion(null);
        setInfo(resumenDeBorrado);
        void cargar(true);
        volver();
      }}
      onSaved={(msg) => {
        setInfo(msg);
        void cargar(true);
      }}
      onError={(msg) => setError(msg)}
    />
  ) : null;

  return (
    <div className="opx">
      {view === "detail" ? null : (
        <header className="opx-cab">
          <div>
            <h2>{view === "summary" ? "Resumen de oportunidades" : view === "calendar" ? "Calendario de oportunidades" : "Oportunidades"}</h2>
            <p className="opx-sub">
              {loading
                ? "Cargando oportunidades…"
                : `${resTotal.todas.n} oportunidades con llegada ${etiquetaDeRango(rango)}${
                    departamento === "TODOS" ? "" : ` · ${DEPARTAMENTOS[departamento]}`
                  } · los importes son de este periodo`}
            </p>
          </div>
          <div className="opx-controles">
            <div className="opx-campo" role="group" aria-label="Periodo de llegada">
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
                <button type="button" className="opx-btn" onClick={() => aplicarRango(rangoPorDefecto())}>
                  {rangoPorDefecto().desde.slice(0, 4)}
                </button>
              ) : null}
            </div>
            {eligeDepartamento ? (
              <label className="opx-campo">
                <span>Departamento</span>
                <select value={departamento} onChange={(e) => setDepartamento(e.target.value as FiltroDepartamento)}>
                  <option value="TODOS">Todos</option>
                  <option value="GROUPS">{DEPARTAMENTOS.GROUPS}</option>
                  <option value="SPORTS">{DEPARTAMENTOS.SPORTS}</option>
                </select>
              </label>
            ) : null}
            {/* Dos vistas, como en el CRM. El resumen y el calendario están en el menú lateral. */}
            <div className="opx-seg" role="tablist" aria-label="Vista">
              {(["lista", "kanban"] as const).map((m) => (
                <button key={m} type="button" role="tab" aria-selected={view === "list" && modo === m} className={view === "list" && modo === m ? "is" : ""} onClick={() => cambiarModo(m)}>
                  {m === "lista" ? "Lista" : "Kanban"}
                </button>
              ))}
            </div>
            <button type="button" className="opx-btn" onClick={() => void cargar()} disabled={loading}>
              Actualizar
            </button>
          </div>
        </header>
      )}

      {error ? <div className="cf__alert cf__alert--error">{error}</div> : null}
      {info && !error ? <div className="cf__alert cf__alert--ok">{info}</div> : null}
      {!zohoDisponible && !error ? (
        <div className="cf__alert cf__alert--error">Zoho no ha contestado: se enseña solo lo que sabe la app. Prueba a actualizar en un momento.</div>
      ) : null}

      {view === "detail" ? (
        <section className="opx-pagina" aria-label="Ficha de la oportunidad">
          <div className="opx-pagina__barra">
            <button type="button" className="opx-btn" onClick={volver}>
              ← Volver a {modo === "kanban" ? "el kanban" : "la lista"}
            </button>
            <span className="opx-pagina__pos">{posicion >= 0 ? `${posicion + 1} de ${filas.length}` : ""}</span>
            <button type="button" className="opx-btn" disabled={!anterior} onClick={() => anterior && abrir(anterior.clave)} title={anterior?.nombre}>
              ‹ Anterior
            </button>
            <button type="button" className="opx-btn" disabled={!siguiente} onClick={() => siguiente && abrir(siguiente.clave)} title={siguiente?.nombre}>
              Siguiente ›
            </button>
          </div>
          {detalle ??
            (loading ? (
              <p className="opx-vacia">Cargando la oportunidad…</p>
            ) : (
              <p className="opx-vacia">
                Esta oportunidad no está entre las del periodo elegido ({etiquetaDeRango(rango)}). Vuelve a la lista y cambia las fechas de llegada.
              </p>
            ))}
        </section>
      ) : view === "calendar" ? (
        <ConfirmCalendar
          key={`${rango.desde}|${rango.hasta}`}
          deals={paraElCalendario}
          loading={loading}
          onSelect={(id) => abrir(id)}
          inicio={mesInicialDelCalendario(rango)}
        />
      ) : view === "summary" ? (
        <section className="opx-panel" aria-label="Resumen del periodo">
          <section className="opx-estados" aria-label="Oportunidades por estado">
            {ESTADOS.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`opx-estado opx-c-${e.id}`}
                style={e.id === "todas" ? undefined : (estiloDeFase(FASES_DEL_ESTADO[e.id][0], colores) as CSSProperties | undefined)}
                title="Abrir la lista con este estado"
                onClick={() => irAlListado({ estado: e.id })}
              >
                <span className="opx-estado__n">{loading ? "…" : resTotal[e.id].n}</span>
                <span className="opx-estado__nom">{e.nombre}</span>
                <span className="opx-estado__imp">{loading ? "" : eurosCorto(resTotal[e.id].importe)}</span>
                {e.id !== "todas" ? (
                  <span className="opx-puntos" aria-hidden="true" title={FASES_DEL_ESTADO[e.id].join(" · ")}>
                    {FASES_DEL_ESTADO[e.id].map((f) => {
                      const t = estiloDeFase(f, colores);
                      return <i key={f} style={t ? { background: `rgb(${t["--c"]})` } : undefined} />;
                    })}
                  </span>
                ) : null}
              </button>
            ))}
          </section>

          <div className="opx-panel__bloque">
            <h3>Importes del periodo</h3>
            <p className="opx-resumen">
              Abierto <b>{eurosCorto(resTotal.abierto.importe)}</b> en {resTotal.abierto.n} · Ganado <b>{eurosCorto(resTotal.ganada.importe)}</b> en {resTotal.ganada.n} · Perdido{" "}
              <b>{eurosCorto(resTotal.perdida.importe)}</b> en {resTotal.perdida.n}
              {resTotal.aviso.vencidas > 0 || resTotal.aviso.sinImporte > 0 ? (
                <span className="opx-resumen__avisos">
                  {resTotal.aviso.vencidas > 0 ? (
                    <button type="button" className="opx-aviso" onClick={() => irAlListado({ vista: "vencidas" })}>
                      ⚠ {resTotal.aviso.vencidas} abiertas con el cierre vencido ({eurosCorto(resTotal.aviso.importeVencidas)})
                    </button>
                  ) : null}
                  {resTotal.aviso.sinImporte > 0 ? (
                    <button type="button" className="opx-aviso opx-aviso--suave" onClick={() => irAlListado({ vista: "sin_importe" })}>
                      {resTotal.aviso.sinImporte} abiertas sin importe
                    </button>
                  ) : null}
                </span>
              ) : null}
            </p>
          </div>

          <div className="opx-panel__dos">
            <div className="opx-panel__bloque">
              <h3>Para revisar</h3>
              <div className="opx-vgs">
                {VISTAS_GUARDADAS.map((v) => (
                  <button key={v.id} type="button" className="opx-vgc" onClick={() => irAlListado({ vista: v.id })}>
                    <strong>{filtrar(todas, { departamento, vista: v.id }, hoy).length}</strong>
                    <span>{v.nombre}</span>
                  </button>
                ))}
              </div>
              <p className="opx-panel__nota">Cada cifra abre la lista ya filtrada.</p>
            </div>

            <div className="opx-panel__bloque">
              <h3>Carga por mes de llegada (importe abierto)</h3>
              {carga.length > 0 ? (
                <div className="opx-barras opx-barras--panel">
                  {carga.map((m) => (
                    <button key={m.mes} type="button" className="opx-barra" title={`${m.nombre}: ${m.n} abiertas. Abre la lista de ese mes.`} onClick={() => irAlListado({ mes: m.mes })}>
                      <span className="opx-barra__imp">{eurosCorto(m.importe)}</span>
                      <span className="opx-barra__b" style={{ height: `${Math.max(6, Math.round((m.importe / cargaMaxima) * 96))}px` }} />
                      <span className="opx-barra__m">{m.nombre.slice(0, 3)}</span>
                      <span className="opx-barra__n">{m.n}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="opx-panel__nota">{loading ? "Cargando…" : "No hay oportunidades abiertas en este periodo."}</p>
              )}
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* Una sola fila de filtros: todo lo demás es de las oportunidades. */}
          <section className="opx-filtros opx-filtros--compacto">
            <input type="search" placeholder="Buscar por nombre, cuenta, contacto o referencia…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="opx-seg" role="group" aria-label="Origen">
              <span className="opx-seg__t">Origen</span>
              {(
                [
                  ["todas", "Todas", nTodasOrigen],
                  ["app", "De la app", nApp],
                  ["zoho", "Solo Zoho", nTodasOrigen - nApp],
                ] as const
              ).map(([id, nombre, n]) => (
                <button key={id} type="button" className={origen === id ? "is" : ""} aria-pressed={origen === id} onClick={() => setOrigen(id)}>
                  {nombre} <b>{n}</b>
                </button>
              ))}
            </div>
            <SelectorDeFase fases={fases} valor={fase} onCambio={setFase} colores={colores} cuantas={cuantasPorFase} total={delDepartamento.length} />
            <select value={vistaGuardada} onChange={(e) => ponerVista(e.target.value)} aria-label="Vista rápida">
              <option value="">Vistas rápidas</option>
              {VISTAS_GUARDADAS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre} ({filtrar(todas, { departamento, vista: v.id }, hoy).length})
                </option>
              ))}
            </select>
            <select value={orden} onChange={(e) => setOrden(e.target.value as OrdenDeOportunidades)} aria-label="Orden">
              {ORDENES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
            {estado !== "todas" ? (
              <span className="opx-chip">
                Estado: {nombreDelEstado}
                <button type="button" onClick={() => setEstado("todas")} aria-label="Quitar el filtro de estado">
                  ✕
                </button>
              </span>
            ) : null}
            {mes ? (
              <span className="opx-chip">
                Llegada: {nombreDelMes}
                <button type="button" onClick={() => setMes("")} aria-label="Quitar el filtro de mes">
                  ✕
                </button>
              </span>
            ) : null}
            <span className="opx-tira__fin">
              {loading ? "Cargando…" : `${filas.length} de ${res.todas.n}`}
              {hayFiltros ? (
                <button type="button" className="opx-enlace" onClick={limpiarFiltros}>
                  Quitar filtros
                </button>
              ) : null}
            </span>
          </section>

          {loading && todas.length === 0 ? (
            <p className="opx-vacia">Cargando…</p>
          ) : modo === "lista" ? (
            <TablaDeOportunidades
              filas={filas}
              seleccion={seleccion}
              onSeleccionar={abrir}
              orden={orden}
              onOrdenar={setOrden}
              hoy={hoy}
              colores={colores}
              vacio={todas.length === 0 ? "No hay oportunidades en este periodo." : "Ninguna oportunidad coincide con los filtros."}
            />
          ) : (
            <TableroDeOportunidades filas={filas} seleccion={seleccion} onSeleccionar={abrir} hoy={hoy} colores={colores} ordenDelCrm={fasesDelCrm.map((f) => f.nombre)} />
          )}
        </>
      )}
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
  colores,
  onCambio,
  onBorrada,
  onSaved,
  onError,
}: {
  fila: OportunidadFila;
  entrega: ProposalDelivery | undefined;
  stages: string[];
  colores: ColoresDeFase;
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

  // Con propuesta de la app: la ficha completa y, si ya hay oportunidad en el CRM, el panel de fase.
  if (entrega && !fila.detalleRestringido) {
    return (
      <div className="op__ficha">
        {aviso}
        <FichaPropuesta
          key={entrega.id}
          delivery={entrega}
          incrustada
          onCambio={onCambio}
          onBorrada={onBorrada}
          aside={
            fila.crmDealId ? (
              <MoverDeFase fila={fila} fasesDelCrm={stages} onHecho={(m) => onSaved(m)} onError={onError} />
            ) : null
          }
        />
      </div>
    );
  }

  // Sin ella: la ficha del trato.
  return (
    <div className="op__crm">
      {aviso}
      <FichaDeTrato fila={fila} stages={stages} colores={colores} onCambio={onSaved} onError={onError} />
    </div>
  );
}
