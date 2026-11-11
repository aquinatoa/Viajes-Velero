import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cambiosDeFaseApi, type CambioDeFaseLeido } from "../../services/apiClient";
import type { OportunidadFila } from "../../domain/oportunidadUnificada";
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
import { parseTrip } from "../confirm/ConfirmRequestsPanel";
import { AvanceDeFase, pasosDeLaFase } from "./AvanceDeFase";
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
 * Sustituye al detalle de Viajes (título repetido tres veces, recuadros vacíos con
 * «—», fechas en formato ISO y un «Confirmar el viaje» que en realidad movía la
 * fase).
 */
export function FichaDeTrato({
  fila,
  stages,
  onCambio,
  onError,
}: {
  fila: OportunidadFila;
  stages: string[];
  onCambio: (mensaje: string) => void;
  onError: (mensaje: string) => void;
}) {
  const hoy = useMemo(() => new Date(), [fila.clave]);
  const trato = useMemo(() => comoTratoDeZoho(fila), [fila]);
  const trip = useMemo(() => parseTrip(trato.opcionesTexto || trato.description), [trato.opcionesTexto, trato.description]);
  const [pestana, setPestana] = useState<"resumen" | "propuesta" | "historial">("resumen");
  const [cambios, setCambios] = useState<CambioDeFaseLeido[] | null>(null);
  const [errorHistorial, setErrorHistorial] = useState("");
  const [copiado, setCopiado] = useState(false);

  const estado = estadoDe(fila);
  const paso = siguientePaso(fila, hoy);
  const faltan = faltanDatos(fila);
  const dias = diasHasta(fila.cierre, hoy);
  const n = noches(fila);
  const rango = rangoLlegada(fila);

  useEffect(() => {
    setPestana("resumen");
    setCambios(null);
    setErrorHistorial("");
  }, [fila.clave]);

  // El historial de fase solo se pide al abrir la pestaña.
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

  // Lo que Zoho cuenta del trato: creación, opción elegida, notas fechadas, última modificación.
  const actividad = useMemo(() => {
    const lista: { cuando: string; texto: string }[] = [];
    if (trato.createdTime) lista.push({ cuando: trato.createdTime.slice(0, 10), texto: "Trato creado en Zoho." });
    if (trip.chosen) lista.push({ cuando: "—", texto: `Opción ${trip.chosen} elegida por el cliente.` });
    for (const nota of trip.notes) lista.push({ cuando: nota.date, texto: nota.text });
    if (trato.modifiedTime) lista.push({ cuando: trato.modifiedTime.slice(0, 10), texto: `Última modificación · fase ${trato.stage || "—"}.` });
    return lista;
  }, [trato, trip]);

  const opcionesTotal = Math.max(trip.options.length, trip.chosen ?? 0);

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
    <article className={`opx-ficha opx-c-${estado}`}>
      <header className="opx-ficha__cab">
        <div>
          <p className="opx-ficha__miga">{[fila.cuenta, fila.contacto].filter(Boolean).join(" · ") || "Sin cuenta"}</p>
          <h3>{fila.nombre || "(sin nombre)"}</h3>
          <p className="opx-ficha__meta">
            <span className={`opx-pastilla opx-c-${estado}`}>{fila.fase ?? "—"}</span>
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

      <AvanceDeFase pasos={pasosDeLaFase(fila.fase)} fase={fila.fase} estado={estado} />

      <div className="opx-ficha__cuerpo">
        <div>
          <nav className="opx-tabs" role="tablist" aria-label="Detalle">
            {(["resumen", "propuesta", "historial"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={pestana === t} className={pestana === t ? "is" : ""} onClick={() => setPestana(t)}>
                {t === "resumen" ? "Resumen" : t === "propuesta" ? "Propuesta" : "Historial"}
              </button>
            ))}
          </nav>

          {pestana === "resumen" ? (
            <>
              <div className="opx-datos">
                {rango ? <Dato rotulo="Llegada" valor={rango} extra={n !== null ? `${n} noches` : undefined} /> : null}
                {fila.cierre ? (
                  <Dato
                    rotulo="Cierre previsto"
                    valor={fechaLarga(fila.cierre)}
                    extra={dias === null ? undefined : dias < 0 ? <em className="opx-vencido">vencido hace {-dias} d</em> : `en ${dias} días`}
                  />
                ) : null}
                {fila.importe !== null ? (
                  <Dato rotulo="Importe estimado" valor={euros(fila.importe)} extra={trip.chosen ? `Opción ${trip.chosen} elegida` : undefined} />
                ) : null}
                {fila.departamento ? <Dato rotulo="Departamento" valor={DEPARTAMENTOS[fila.departamento] ?? fila.departamento} /> : null}
                {trip.destino ? <Dato rotulo="Destino" valor={trip.destino} /> : null}
                {trip.grupo ? <Dato rotulo="Grupo" valor={trip.grupo} /> : null}
              </div>
              {faltan.length > 0 ? (
                <p className="opx-faltan">
                  <b>Faltan datos:</b> {faltan.join(", ")}. Se rellenan en Zoho.
                </p>
              ) : null}

              {trip.options.length > 0 ? (
                <section className="opx-bloque">
                  <h4>Opciones de la propuesta</h4>
                  <div className="opx-opts">
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
                </section>
              ) : null}

              <section className="opx-bloque">
                <h4>Actividad reciente</h4>
                {actividad.length === 0 ? (
                  <p className="opx-muted">Sin actividad registrada todavía.</p>
                ) : (
                  <ul className="opx-hist">
                    {actividad.map((a, i) => (
                      <li key={i}>
                        <b>{a.texto}</b>
                        <span>{a.cuando}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}

          {pestana === "propuesta" ? (
            trato.description ? (
              <section className="opx-bloque">
                <h4>Lo que dice Zoho</h4>
                <pre>{trato.description}</pre>
              </section>
            ) : (
              <section className="opx-bloque">
                <h4>Sin propuesta en la app</h4>
                <p className="opx-muted">
                  Esta oportunidad se creó directamente en Zoho. La propuesta (el documento con sus opciones) se hace desde «Nueva solicitud».
                </p>
              </section>
            )
          ) : null}

          {pestana === "historial" ? (
            <section className="opx-bloque">
              <h4>Cambios de fase</h4>
              {errorHistorial ? <p className="opx-muted">{errorHistorial}</p> : null}
              {cambios === null && !errorHistorial ? <p className="opx-muted">Cargando…</p> : null}
              {cambios !== null && cambios.length === 0 ? (
                <p className="opx-muted">Todavía no hay cambios de fase anotados desde la app. Los que se hagan aquí quedarán con quién, cuándo y por qué.</p>
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
              <h4 style={{ marginTop: 16 }}>Actividad en Zoho</h4>
              <ul className="opx-hist">
                {actividad.map((a, i) => (
                  <li key={i}>
                    <b>{a.texto}</b>
                    <span>{a.cuando}</span>
                  </li>
                ))}
              </ul>
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
