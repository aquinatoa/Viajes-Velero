import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { abrirAdjuntoDelCrm, cambiosDeFaseApi, fichaDelCrmApi, historialDelCrmApi, type CambioDeFaseLeido } from "../../services/apiClient";
import type { OportunidadFila } from "../../domain/oportunidadUnificada";
import { eventosDelTrato, inventarioDeListas, type FichaDelCrmCompleta, type ListaDelTratoLeida } from "../../domain/fichaDelCrm";
import {
  diasHasta,
  estadoDe,
  euros,
  faltanDatos,
  fechaLarga,
  noches,
  rangoLlegada,
  siguientePaso,
} from "../../domain/oportunidadesVista";
import { estiloDeFase, type ColoresDeFase } from "../../domain/colorDeFase";
import { parseTrip } from "../confirm/ConfirmRequestsPanel";
import { AvanceDeFase, pasosDeLaFase } from "./AvanceDeFase";
import {
  ArchivosDelTrato,
  HitosDelCrm,
  InventarioDelCrm,
  LineaDeTiempoDelTrato,
  PresupuestosDelCrm,
  TarjetaDelAceptado,
  TodosLosCampos,
} from "./InfoDelCrm";
import { MenuMas } from "./MenuMas";
import { MoverDeFase } from "./MoverDeFase";
import { comoTratoDeZoho } from "./tratoDeZoho";
import { textoDelCierre } from "./textos";

const DEPARTAMENTOS: Record<string, string> = { GROUPS: "Groups", SPORTS: "Sports", OTRO: "Otro" };

function Dato({ rotulo, valor, extra }: { rotulo: string; valor: string; extra?: ReactNode }) {
  return (
    <div className="opx-dato">
      <small>{rotulo}</small>
      <strong>{valor}</strong>
      {extra ? <span>{extra}</span> : null}
    </div>
  );
}

/**
 * La ficha de una oportunidad que solo existe en Zoho (no salió de una propuesta
 * de la app): lo siguiente que hay que hacer, por dónde va, lo que se sabe y,
 * a un lado, el panel para moverla de fase con constancia.
 *
 * Tres pestañas que ya no se repiten (Anthony, 11/11/2026: «Resumen e Historial
 * tienen la misma información»):
 *  - Resumen: cómo es la oportunidad hoy (datos, presupuesto aceptado, lo que hay
 *    en el CRM).
 *  - Presupuestos: las opciones que se enviaron, línea a línea, y cuál se aceptó.
 *  - Historial: qué ha pasado (cambios de fase hechos desde la app y las fechas del trato).
 */
export function FichaDeTrato({
  fila,
  stages,
  colores,
  onCambio,
  onError,
}: {
  fila: OportunidadFila;
  stages: string[];
  /** Los colores de las fases, tal y como están en el CRM. */
  colores: ColoresDeFase;
  onCambio: (mensaje: string) => void;
  onError: (mensaje: string) => void;
}) {
  const hoy = useMemo(() => new Date(), [fila.clave]);
  const trato = useMemo(() => comoTratoDeZoho(fila), [fila]);
  const trip = useMemo(() => parseTrip(trato.opcionesTexto || trato.description), [trato.opcionesTexto, trato.description]);
  const [pestana, setPestana] = useState<"resumen" | "presupuestos" | "historial">("resumen");
  const [cambios, setCambios] = useState<CambioDeFaseLeido[] | null>(null);
  const [errorHistorial, setErrorHistorial] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [crm, setCrm] = useState<{ ficha: FichaDelCrmCompleta } | null>(null);
  const [leyendoElCrm, setLeyendoElCrm] = useState(false);
  const [errorDelCrm, setErrorDelCrm] = useState("");
  // Historial de fases, notas, adjuntos y correos del trato en Zoho.
  const [listas, setListas] = useState<ListaDelTratoLeida[] | null>(null);
  const [errorListas, setErrorListas] = useState("");

  const estado = estadoDe(fila);
  const paso = siguientePaso(fila, hoy);
  const faltan = faltanDatos(fila);
  const dias = diasHasta(fila.cierre, hoy);
  const n = noches(fila);
  const rango = rangoLlegada(fila);
  const estilo = estiloDeFase(fila.fase, colores) as CSSProperties | undefined;

  useEffect(() => {
    setPestana("resumen");
    setCambios(null);
    setErrorHistorial("");
  }, [fila.clave]);

  // Lo que el CRM sabe del trato: al abrir la oportunidad (una lectura, sin escribir).
  useEffect(() => {
    setCrm(null);
    setErrorDelCrm("");
    if (!fila.crmDealId) return;
    let vivo = true;
    setLeyendoElCrm(true);
    fichaDelCrmApi(fila.crmDealId)
      .then((r) => vivo && setCrm(r))
      .catch((e: unknown) => vivo && setErrorDelCrm(e instanceof Error ? e.message : "No se pudo leer el CRM."))
      .finally(() => vivo && setLeyendoElCrm(false));
    return () => {
      vivo = false;
    };
  }, [fila.crmDealId, fila.fase]);

  // Historial de fases, notas, archivos y correos del trato: otra lectura, aparte, para que si falla
  // (permiso, Zoho lento) no se caiga el resto de la ficha.
  useEffect(() => {
    setListas(null);
    setErrorListas("");
    if (!fila.crmDealId) return;
    let vivo = true;
    historialDelCrmApi(fila.crmDealId)
      .then((r) => vivo && setListas(r.listas))
      .catch((e: unknown) => vivo && setErrorListas(e instanceof Error ? e.message : "No se pudo leer el historial del CRM."));
    return () => {
      vivo = false;
    };
  }, [fila.crmDealId, fila.fase]);

  // El historial de fase de la app solo se pide al abrir la pestaña.
  useEffect(() => {
    if (pestana !== "historial" || !fila.crmDealId || cambios !== null) return;
    let vivo = true;
    cambiosDeFaseApi(fila.crmDealId)
      .then((r) => vivo && setCambios(r.cambios))
      .catch((e: unknown) => vivo && setErrorHistorial(e instanceof Error ? e.message : "No se pudo leer el historial."));
    return () => {
      vivo = false;
    };
  }, [pestana, fila.crmDealId, cambios]);

  const ficha = crm?.ficha ?? null;
  const opcionesTotal = Math.max(trip.options.length, trip.chosen ?? 0);
  const eventos = useMemo(() => (listas ? eventosDelTrato(listas) : []), [listas]);
  const inventario = useMemo(() => (ficha ? [...ficha.inventario, ...(listas ? inventarioDeListas(listas) : [])] : []), [ficha, listas]);
  const sinPermiso = (listas ?? []).filter((l) => l.estado === "sin_permiso");
  const estadoDeArchivos: "cargando" | "ok" | "sin_leer" = errorListas
    ? "sin_leer"
    : listas === null
      ? "cargando"
      : listas.find((l) => l.lista === "Attachments")?.estado === "ok"
        ? "ok"
        : "sin_leer";
  const abrirArchivo = (adjuntoId: string, nombre: string) => {
    if (!fila.crmDealId) return;
    abrirAdjuntoDelCrm(fila.crmDealId, adjuntoId, nombre).catch((e: unknown) => onError(e instanceof Error ? e.message : "No se pudo abrir el archivo."));
  };

  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(trato.dealUrl);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      onError("No se pudo copiar el enlace.");
    }
  };

  return (
    <article className={`opx-ficha opx-c-${estado}`} style={estilo}>
      <header className="opx-ficha__cab">
        <div>
          <p className="opx-ficha__miga">{[fila.cuenta, fila.contacto].filter(Boolean).join(" · ") || "Sin cuenta"}</p>
          <h3>{fila.nombre || "(sin nombre)"}</h3>
          <p className="opx-ficha__meta">
            <span className={`opx-pastilla opx-c-${estado}`} style={estilo}>
              {fila.fase ?? "—"}
            </span>
            {fila.departamento ? (
              <span className={`opx-dept opx-dept--${fila.departamento.toLowerCase()}`}>{DEPARTAMENTOS[fila.departamento] ?? fila.departamento}</span>
            ) : null}
            <span className="opx-zoho">Creada en Zoho</span>
          </p>
        </div>
        <div className="opx-ficha__acciones">
          <MenuMas
            items={[
              ...(trato.dealUrl ? [{ texto: "Abrir en Zoho ↗", href: trato.dealUrl }] : []),
              ...(trato.dealUrl ? [{ texto: copiado ? "Enlace copiado ✓" : "Copiar el enlace", onClick: () => void copiarEnlace() }] : []),
            ]}
          />
        </div>
      </header>

      {fila.detalleRestringido ? (
        <p className="opx-nota">La propuesta de esta oportunidad es de otra persona de tu departamento: aquí ves lo que dice Zoho.</p>
      ) : null}

      <section className={`opx-siguiente opx-t-${paso.tono}`}>
        <div>
          <small>Lo siguiente</small>
          <strong>{paso.texto || "Nada pendiente"}</strong>
          {textoDelCierre(fila, hoy) ? <span>{textoDelCierre(fila, hoy)}</span> : null}
        </div>
        {paso.accion === "abrir-zoho" && trato.dealUrl ? (
          <a className="opx-btn opx-btn--primario" href={trato.dealUrl} target="_blank" rel="noreferrer">
            Abrir en Zoho ↗
          </a>
        ) : null}
        {paso.accion === "mover-fase" ? (
          <button
            type="button"
            className="opx-btn opx-btn--primario"
            onClick={() => document.getElementById("opx-mover")?.scrollIntoView({ behavior: "smooth", block: "center" })}
          >
            Mover de fase
          </button>
        ) : null}
      </section>

      <AvanceDeFase pasos={pasosDeLaFase(fila.fase, colores)} fase={fila.fase} estado={estado} estilo={estilo} />

      <div className="opx-ficha__cuerpo">
        <div>
          <nav className="opx-tabs" role="tablist" aria-label="Detalle">
            {(
              [
                ["resumen", "Resumen"],
                ["presupuestos", ficha && ficha.presupuestos.length > 0 ? `Presupuestos (${ficha.presupuestos.length})` : "Presupuestos"],
                ["historial", "Historial"],
              ] as const
            ).map(([id, etiqueta]) => (
              <button key={id} type="button" role="tab" aria-selected={pestana === id} className={pestana === id ? "is" : ""} onClick={() => setPestana(id)}>
                {etiqueta}
              </button>
            ))}
          </nav>

          {errorDelCrm ? <p className="opx-nota">{errorDelCrm} Se enseña lo que ya sabía la app.</p> : null}
          {leyendoElCrm && !crm ? <p className="opx-muted">Leyendo el CRM…</p> : null}

          {pestana === "resumen" ? (
            <>
              <div className="opx-datos">
                {rango ? <Dato rotulo="Llegada" valor={rango} extra={n !== null && n > 0 ? `${n} noches` : n !== null ? <em className="opx-vencido">salida anterior a la llegada</em> : undefined} /> : null}
                {fila.cierre ? (
                  <Dato
                    rotulo="Cierre previsto"
                    valor={fechaLarga(fila.cierre)}
                    extra={dias === null ? undefined : dias < 0 ? <em className="opx-vencido">vencido hace {-dias} d</em> : `en ${dias} días`}
                  />
                ) : null}
                {fila.importe !== null ? <Dato rotulo="Importe estimado" valor={euros(fila.importe)} /> : null}
                {fila.departamento ? <Dato rotulo="Departamento" valor={DEPARTAMENTOS[fila.departamento] ?? fila.departamento} /> : null}
                {trip.destino ? <Dato rotulo="Destino" valor={trip.destino} /> : null}
                {trip.grupo ? <Dato rotulo="Grupo" valor={trip.grupo} /> : null}
              </div>
              {!ficha && faltan.length > 0 ? (
                <p className="opx-faltan">
                  <b>Faltan datos:</b> {faltan.join(", ")}. Se rellenan en Zoho.
                </p>
              ) : null}

              {ficha ? <InventarioDelCrm items={inventario} /> : null}
              {ficha?.aceptado ? <TarjetaDelAceptado aceptado={ficha.aceptado} /> : null}
              {estado === "perdida" ? (
                ficha?.motivoDePerdida ? (
                  <p className="opx-nota">Motivo de pérdida: {ficha.motivoDePerdida}</p>
                ) : crm ? (
                  <p className="opx-faltan">El CRM no registra el motivo de pérdida de esta oportunidad.</p>
                ) : null
              ) : null}

              {ficha ? <TodosLosCampos campos={ficha.campos} /> : null}
            </>
          ) : null}

          {pestana === "presupuestos" ? (
            <section className="opx-bloque">
              {ficha ? (
                <>
                  <PresupuestosDelCrm presupuestos={ficha.presupuestos} hayAceptado={Boolean(ficha.aceptado)} />
                  {ficha.presupuestos.length === 0 && trip.options.length > 0 ? (
                    <div className="opx-opts" style={{ marginTop: 12 }}>
                      {trip.options.map((o) => (
                        <div key={o.n} className={`opx-opt${trip.chosen === o.n ? " is" : ""}`}>
                          <small>
                            Opción {o.n}
                            {trip.chosen === o.n ? " · elegida ✓" : ""}
                          </small>
                          <div>{o.name}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {ficha.textoLibre ? (
                    <details className="opx-campos-wrap" open={ficha.presupuestos.length === 0}>
                      <summary>Texto de «Opciones de presupuesto» en el CRM</summary>
                      <pre>{ficha.textoLibre}</pre>
                    </details>
                  ) : null}
                </>
              ) : (
                !leyendoElCrm && (
                  <>
                    <p className="opx-muted">No se pudo leer el CRM.</p>
                    {trato.description ? <pre>{trato.description}</pre> : null}
                  </>
                )
              )}
              <ArchivosDelTrato eventos={eventos} estado={estadoDeArchivos} onAbrir={abrirArchivo} />
            </section>
          ) : null}

          {pestana === "historial" ? (
            <section className="opx-bloque">
              <h4>Cambios de fase hechos desde la app</h4>
              {errorHistorial ? <p className="opx-muted">{errorHistorial}</p> : null}
              {cambios === null && !errorHistorial ? <p className="opx-muted">Cargando…</p> : null}
              {cambios !== null && cambios.length === 0 ? (
                <p className="opx-muted">Todavía ninguno. Los que se hagan desde aquí quedarán con quién, cuándo y por qué.</p>
              ) : null}
              {cambios && cambios.length > 0 ? (
                <ul className="opx-hist">
                  {cambios.map((c) => (
                    <li key={c.id} className={c.origen === "AUTOMATICO" ? "is-auto" : ""}>
                      <b>
                        {c.desde || "sin fase"} → {c.hasta}
                      </b>
                      <span>
                        {c.porNombre || (c.origen === "AUTOMATICO" ? "Automático" : "—")} · {fechaLarga(c.cuando)}
                        {c.motivo ? ` · «${c.motivo}»` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <h4 style={{ marginTop: 18 }}>Lo que Zoho guarda del trato</h4>
              {listas === null ? <p className="opx-muted">{errorListas || "Leyendo el CRM…"}</p> : null}
              {sinPermiso.length > 0 ? (
                <p className="opx-nota">
                  Zoho no deja leer {sinPermiso.map((l) => ({ Stage_History: "el historial de fases", Notes: "las notas", Attachments: "los archivos", Emails: "los correos" })[l.lista]).join(", ")}: a la
                  conexión de la app le falta el permiso de lectura. Hay que volver a autorizarla (en producción, con Mateo).
                </p>
              ) : null}
              {listas !== null ? <LineaDeTiempoDelTrato eventos={eventos} /> : null}
              {listas === null && ficha ? <HitosDelCrm hitos={ficha.hitos} /> : null}
            </section>
          ) : null}
        </div>

        <MoverDeFase
          fila={fila}
          fasesDelCrm={stages}
          opciones={opcionesTotal > 0 ? { total: opcionesTotal, elegida: trip.chosen } : undefined}
          onHecho={(m) => {
            setCambios(null);
            onCambio(m);
          }}
          onError={onError}
        />
      </div>
    </article>
  );
}
