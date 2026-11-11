import { useCallback, useEffect, useMemo, useState } from "react";
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
  nombresRepetidos,
  ordenar,
  porCuenta,
  porMes,
  resumen,
  VISTAS_GUARDADAS,
  type FiltroDeEstado,
  type OrdenDeOportunidades,
} from "../../domain/oportunidadesVista";
import { ConfirmCalendar } from "../confirm/ConfirmRequestsPanel";
import { FichaPropuesta } from "../home/FichaPropuesta";
import { FichaDeTrato } from "./FichaDeTrato";
import { ListaDeOportunidades } from "./ListaDeOportunidades";
import { MoverDeFase } from "./MoverDeFase";
import { TablaDeOportunidades, TableroDeOportunidades } from "./TablaYTablero";
import { comoTratoDeZoho } from "./tratoDeZoho";

/**
 * Oportunidades: una sola pantalla para gestionar cada viaje presentado, desde
 * que se pide hasta que se cobra.
 *
 * Sustituye a «Propuestas» y a «Viajes», que eran dos pantallas sobre lo mismo
 * con datos distintos (la base de la app y Zoho). Aquí hay una lista, que une las
 * dos fuentes en el servidor, y un detalle:
 *  - si la oportunidad salió de una propuesta de la app, el detalle es la ficha
 *    completa (avance, opciones con desglose, siguiente paso, correo…);
 *  - si solo existe en Zoho, el detalle es la ficha del trato.
 *
 * Un solo juego de estados que suma el total (antes había cuatro cuadros de
 * Viajes y cinco botones de Propuestas que no cuadraban entre sí), una acción
 * principal por ficha y la fase movible con constancia.
 *
 * Quién ve qué lo decide el servidor, como siempre. Aquí solo se elige el
 * departamento si se tiene acceso a los dos.
 */

type Vista = "list" | "calendar";
type Modo = "lista" | "tabla" | "tablero";
type FiltroDepartamento = BackendDepartment | "TODOS";
type Origen = "todas" | "app" | "zoho";

const CLAVE_RANGO = "oravia.viajes.rango";
const CLAVE_MODO = "oravia.oportunidades.modo";

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
    const guardado = window.localStorage.getItem(CLAVE_MODO);
    if (guardado === "tabla" || guardado === "tablero" || guardado === "lista") return guardado;
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
];

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
  const [agrupar, setAgrupar] = useState(false);
  const [modo, setModoEstado] = useState<Modo>(() => modoInicial());
  const [seleccion, setSeleccion] = useState<string | null>(null);
  /** En Tabla y Tablero la ficha se abre a un lado, como un cajón. */
  const [cajon, setCajon] = useState(false);

  const cambiarModo = (m: Modo) => {
    setModoEstado(m);
    setCajon(false);
    try {
      window.localStorage.setItem(CLAVE_MODO, m);
    } catch {
      // sin almacenamiento: vale para esta visita
    }
    if (view === "calendar") onNavigate?.("/oportunidades");
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
   * que algo cambió, para que la lista no se vacíe mientras se trabaja en el detalle.
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

  const entregaPorId = useMemo(() => new Map(entregas.map((e) => [e.id, e])), [entregas]);
  const hoy = useMemo(() => new Date(), [todas]);

  // Lo que se está mirando, sin el estado: de aquí salen los números de las pestañas
  // (así suman el total aunque haya otros filtros puestos).
  const baseSinEstado = useMemo(
    () => filtrar(todas, { origen, departamento, fase, q: query, vista: vistaGuardada, mes }, hoy),
    [todas, origen, departamento, fase, query, vistaGuardada, mes, hoy],
  );
  const res = useMemo(() => resumen(baseSinEstado, hoy), [baseSinEstado, hoy]);
  const filas = useMemo(() => ordenar(filtrar(baseSinEstado, { estado }, hoy), orden, hoy), [baseSinEstado, estado, orden, hoy]);

  // Los números que no dependen de nada de lo anterior.
  const delDepartamento = useMemo(() => filtrar(todas, { departamento }, hoy), [todas, departamento, hoy]);
  const resTotal = useMemo(() => resumen(delDepartamento, hoy), [delDepartamento, hoy]);
  const nApp = useMemo(() => filtrar(todas, { departamento, fase, q: query, vista: vistaGuardada, mes }, hoy).filter((f) => f.origen === "APP").length, [todas, departamento, fase, query, vistaGuardada, mes, hoy]);
  const nTodasOrigen = useMemo(() => filtrar(todas, { departamento, fase, q: query, vista: vistaGuardada, mes }, hoy).length, [todas, departamento, fase, query, vistaGuardada, mes, hoy]);
  const fases = useMemo(() => fasesPresentes(delDepartamento), [delDepartamento]);
  const repetidos = useMemo(() => nombresRepetidos(todas), [todas]);
  const carga = useMemo(() => porMes(baseSinEstado), [baseSinEstado]);
  const cargaMaxima = Math.max(1, ...carga.map((m) => m.importe));

  // El orden en el que se ve la lista (agrupada por cuenta cambia el orden).
  const enOrdenVisible = useMemo(() => (agrupar ? porCuenta(filas).flatMap((g) => g.filas) : filas), [filas, agrupar]);

  // Mantener una selección válida en la lista.
  useEffect(() => {
    if (loading || modo !== "lista") return;
    if (seleccion && enOrdenVisible.some((f) => f.clave === seleccion)) return;
    setSeleccion(enOrdenVisible[0]?.clave ?? null);
  }, [loading, modo, enOrdenVisible, seleccion]);

  // Flechas ↑ ↓ para moverse por la lista.
  useEffect(() => {
    if (view !== "list" || modo !== "lista") return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const destino = e.target as HTMLElement | null;
      if (destino && /^(input|textarea|select)$/i.test(destino.tagName)) return;
      if (enOrdenVisible.length === 0) return;
      e.preventDefault();
      const i = enOrdenVisible.findIndex((f) => f.clave === seleccion);
      const siguiente = e.key === "ArrowDown" ? Math.min(enOrdenVisible.length - 1, i + 1) : Math.max(0, i - 1);
      setSeleccion(enOrdenVisible[siguiente].clave);
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".opx-fila.is")?.scrollIntoView({ block: "nearest" }));
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [view, modo, enOrdenVisible, seleccion]);

  // Esc cierra el cajón.
  useEffect(() => {
    if (!cajon) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCajon(false);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [cajon]);

  const seleccionada = todas.find((f) => f.clave === seleccion) ?? null;

  // El calendario lee los mismos datos: cada fila, como un trato con sus fechas.
  const paraElCalendario = useMemo(() => delDepartamento.map(comoTratoDeZoho), [delDepartamento]);

  const elegirEstado = (id: FiltroDeEstado) => setEstado(estado === id && id !== "todas" ? "todas" : id);
  const elegirVista = (id: string) => {
    setVistaGuardada(vistaGuardada === id ? "" : id);
    setEstado("todas");
  };
  const elegir = (clave: string) => {
    setSeleccion(clave);
    if (modo !== "lista") setCajon(true);
  };

  const detalle = seleccionada ? (
    <DetalleDeLaOportunidad
      fila={seleccionada}
      entrega={seleccionada.entrega ? entregaPorId.get(seleccionada.entrega.id) : undefined}
      stages={stages}
      onCambio={() => void cargar(true)}
      onBorrada={(resumenDeBorrado) => {
        setSeleccion(null);
        setCajon(false);
        setInfo(resumenDeBorrado);
        void cargar(true);
      }}
      onSaved={(msg) => {
        setInfo(msg);
        void cargar(true);
      }}
      onError={(msg) => setError(msg)}
    />
  ) : (
    <p className="opx-vacia">Elige una oportunidad de la lista para ver su detalle.</p>
  );

  return (
    <div className="opx">
      <header className="opx-cab">
        <div>
          <h2>Oportunidades</h2>
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
          <div className="opx-seg" role="tablist" aria-label="Vista">
            {(["lista", "tabla", "tablero"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={view === "list" && modo === m} className={view === "list" && modo === m ? "is" : ""} onClick={() => cambiarModo(m)}>
                {m === "lista" ? "Lista" : m === "tabla" ? "Tabla" : "Tablero"}
              </button>
            ))}
            <button type="button" role="tab" aria-selected={view === "calendar"} className={view === "calendar" ? "is" : ""} onClick={() => onNavigate?.("/oportunidades/calendario")}>
              Calendario
            </button>
          </div>
          <button type="button" className="opx-btn" onClick={() => void cargar()} disabled={loading}>
            Actualizar
          </button>
        </div>
      </header>

      {error ? <div className="cf__alert cf__alert--error">{error}</div> : null}
      {info && !error ? <div className="cf__alert cf__alert--ok">{info}</div> : null}
      {!zohoDisponible && !error ? (
        <div className="cf__alert cf__alert--error">Zoho no ha contestado: se enseña solo lo que sabe la app. Prueba a actualizar en un momento.</div>
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
        <>
          <section className="opx-estados" aria-label="Estado">
            {ESTADOS.map((e) => (
              <button key={e.id} type="button" className={`opx-estado opx-c-${e.id}${estado === e.id ? " is" : ""}`} aria-pressed={estado === e.id} onClick={() => elegirEstado(e.id)}>
                <span className="opx-estado__n">{res[e.id].n}</span>
                <span className="opx-estado__nom">{e.nombre}</span>
                <span className="opx-estado__imp">{eurosCorto(res[e.id].importe)}</span>
              </button>
            ))}
          </section>

          <p className="opx-resumen">
            Abierto <b>{eurosCorto(res.abierto.importe)}</b> en {res.abierto.n} · Ganado <b>{eurosCorto(res.ganada.importe)}</b> en {res.ganada.n} · Perdido{" "}
            <b>{eurosCorto(res.perdida.importe)}</b> en {res.perdida.n}
            {res.aviso.vencidas > 0 || res.aviso.sinImporte > 0 ? (
              <span className="opx-resumen__avisos">
                {res.aviso.vencidas > 0 ? (
                  <button type="button" className="opx-aviso" onClick={() => elegirVista("vencidas")}>
                    ⚠ {res.aviso.vencidas} abiertas con el cierre vencido ({eurosCorto(res.aviso.importeVencidas)})
                  </button>
                ) : null}
                {res.aviso.sinImporte > 0 ? (
                  <button type="button" className="opx-aviso opx-aviso--suave" onClick={() => elegirVista("sin_importe")}>
                    {res.aviso.sinImporte} abiertas sin importe
                  </button>
                ) : null}
              </span>
            ) : null}
          </p>

          <section className="opx-filtros">
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
            <select value={fase} onChange={(e) => setFase(e.target.value)} aria-label="Fase">
              <option value="">Todas las fases</option>
              {fases.map((f) => (
                <option key={f} value={f}>
                  {f}
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
            {modo === "lista" ? (
              <label className="opx-chk">
                <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} /> Agrupar por cuenta
              </label>
            ) : null}
          </section>

          <div className="opx-extras" aria-label="Vistas guardadas">
            <span className="opx-vg__t">Vistas rápidas</span>
            {VISTAS_GUARDADAS.map((v) => (
              <button key={v.id} type="button" className={`opx-vg${vistaGuardada === v.id ? " is" : ""}`} aria-pressed={vistaGuardada === v.id} onClick={() => elegirVista(v.id)}>
                {v.nombre} <b>{filtrar(todas, { departamento, vista: v.id }, hoy).length}</b>
              </button>
            ))}
          </div>

          {carga.length > 0 ? (
            <details className="opx-carga">
              <summary>Carga por mes de llegada (importe abierto)</summary>
              <div className="opx-barras">
                {carga.map((m) => (
                  <button
                    key={m.mes}
                    type="button"
                    className={`opx-barra${mes === m.mes ? " is" : ""}`}
                    aria-pressed={mes === m.mes}
                    title={`${m.nombre}: ${m.n} abiertas`}
                    onClick={() => setMes(mes === m.mes ? "" : m.mes)}
                  >
                    <span className="opx-barra__imp">{eurosCorto(m.importe)}</span>
                    <span className="opx-barra__b" style={{ height: `${Math.max(6, Math.round((m.importe / cargaMaxima) * 64))}px` }} />
                    <span className="opx-barra__m">{m.nombre.slice(0, 3)}</span>
                    <span className="opx-barra__n">{m.n}</span>
                  </button>
                ))}
              </div>
            </details>
          ) : null}

          {modo === "lista" ? (
            <div className="opx-cuerpo">
              <div>
                <p className="opx-contador">
                  {filas.length} de {res.todas.n} oportunidades
                </p>
                <div className="opx-lista" id="opx-lista">
                  {loading ? (
                    <p className="opx-vacia">Cargando…</p>
                  ) : (
                    <ListaDeOportunidades
                      filas={filas}
                      seleccion={seleccion}
                      onSeleccionar={elegir}
                      agrupar={agrupar}
                      hoy={hoy}
                      repetidos={repetidos}
                      vacio={todas.length === 0 ? "No hay oportunidades en este periodo." : "Ninguna oportunidad coincide con los filtros."}
                    />
                  )}
                </div>
              </div>
              <div className="opx-detalle">{detalle}</div>
            </div>
          ) : (
            <>
              <p className="opx-contador">
                {filas.length} de {res.todas.n} oportunidades
              </p>
              {modo === "tabla" ? (
                <TablaDeOportunidades filas={filas} seleccion={seleccion} onSeleccionar={elegir} orden={orden} onOrdenar={setOrden} hoy={hoy} />
              ) : (
                <TableroDeOportunidades filas={filas} seleccion={seleccion} onSeleccionar={elegir} hoy={hoy} />
              )}
              {cajon && seleccionada ? (
                <>
                  <div className="opx-cajon-fondo" onClick={() => setCajon(false)} aria-hidden="true" />
                  <aside className="opx-cajon" aria-label="Detalle de la oportunidad">
                    <p style={{ textAlign: "right", margin: "0 0 8px" }}>
                      <button type="button" className="opx-btn" onClick={() => setCajon(false)}>
                        Cerrar ✕
                      </button>
                    </p>
                    {detalle}
                  </aside>
                </>
              ) : null}
            </>
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
      <FichaDeTrato fila={fila} stages={stages} onCambio={onSaved} onError={onError} />
    </div>
  );
}
