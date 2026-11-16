import { ChangePanel } from "./ChangePanel";
import { marcarOpcionApi, rehacerPropuestaApi, renombrarViajeApi, sendProposalDeliveryApi } from "../../services/apiClient";
import { siguientePasoDelExpediente } from "../../domain/siguientePaso";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { fichaDelPresupuestoApi, type FichaPresupuesto } from "../../services/apiClient";
import { CorreoPanel } from "./CorreoPanel";
import { BorrarSolicitudPanel } from "./BorrarSolicitudPanel";
import type { ProposalDelivery } from "../../services/apiClient";
import { AvanceDeFase } from "../oportunidades/AvanceDeFase";
import { MenuMas } from "../oportunidades/MenuMas";
import { Bloque, Caja, Par } from "../oportunidades/FichaDeTrato";

/**
 * La ficha de un presupuesto: todo lo que hace falta para seguirlo.
 *
 * Sale de la reunión del 17/06, donde quedó dicho que «llevar el seguimiento
 * dentro de la oportunidad no va a ser muy cómodo, porque aquí hay una
 * información básica registrada». En el trato de Zoho caben un nombre, un
 * importe y un texto; no caben las tres opciones con su desglose, ni si el
 * colegio abrió el enlace, ni la conversación.
 *
 * La oportunidad y el presupuesto CONVIVEN: la oportunidad es donde vive el
 * trato, el presupuesto es lo que la alimenta. Por eso la ficha enseña siempre
 * en qué fase está el trato y enlaza a él, en vez de sustituirlo.
 */

export interface FichaPropuestaProps {
  delivery: ProposalDelivery;
  /** Salir de la ficha. Sin él, la ficha no enseña el «Volver». */
  onClose?: () => void;
  /**
   * La ficha vive dentro de otra pantalla (Oportunidades) en vez de ocupar la
   * suya: no hay a dónde «volver», y quien la contiene tiene que enterarse de
   * lo que cambia para refrescar su lista.
   */
  incrustada?: boolean;
  /** Algo cambió (opción aceptada, envío, nombre, cotización). */
  onCambio?: () => void;
  /** Se borró la solicitud entera: la ficha ya no tiene de qué hablar. */
  onBorrada?: (resumen: string) => void;
  /** Algo más para la columna de la derecha (el panel de «Mover de fase»). */
  aside?: ReactNode;
}

function fecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

function fechaCorta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function diasHasta(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

export function FichaPropuesta({ delivery, onClose, incrustada = false, onCambio, onBorrada, aside }: FichaPropuestaProps) {
  /** La carpeta abierta a la derecha de la ficha. */
  const [carpeta, setCarpeta] = useState<"propuesta" | "crm">("propuesta");
  const [ficha, setFicha] = useState<FichaPresupuesto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [correo, setCorreo] = useState(false);
  /** Está abierto el panel de borrar la solicitud. */
  const [borrando, setBorrando] = useState(false);
  /** Se está apuntando una opción: evita el doble clic. */
  const [marcando, setMarcando] = useState(false);
  /** Está abierto el panel de recotizar. */
  const [recotizando, setRecotizando] = useState(false);
  /** Se está enviando la propuesta al colegio: evita el doble clic. */
  const [enviando, setEnviando] = useState(false);
  /** Lo que pasó con el último envío lanzado desde aquí. */
  const [resultadoEnvio, setResultadoEnvio] = useState("");

  /**
   * Enviar (o reenviar) la propuesta desde la ficha. Vale para una simulada
   * —preparada sin clave de buzón— y para una fallida. Si el buzón sigue sin
   * clave, el servidor la vuelve a dejar simulada y aquí se dice tal cual, en
   * vez de un «enviada» que no es verdad.
   */
  async function enviarAlColegio() {
    setEnviando(true);
    setResultadoEnvio("");
    try {
      const r = await sendProposalDeliveryApi(delivery.id);
      if (r.status === "SENT") {
        setResultadoEnvio(`Enviada a ${r.recipientEmail}.`);
      } else if (r.simulated) {
        setResultadoEnvio(
          "Sigue sin salir: el buzón del departamento no tiene clave en el servidor. La propuesta queda preparada.",
        );
      } else {
        setResultadoEnvio(`No salió: ${r.failureReason ?? "el servidor de correo rechazó el envío."}`);
      }
      await cargar();
    } catch (err) {
      setResultadoEnvio(err instanceof Error ? err.message : "No se pudo enviar la propuesta.");
    } finally {
      setEnviando(false);
    }
  }

  /**
   * Vuelve a traer la ficha.
   *
   * Hace falta aparte del efecto porque ahora hay dos gestos que la cambian sin
   * cambiar de expediente: apuntar la opción aceptada y recotizar. Sin esto,
   * marcabas la opción y la pantalla seguía diciendo «todavía no han elegido
   * ninguna» hasta recargar.
   */
  // Cambiar el nombre del grupo (Ruth, 19/10/2026).
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [avisoNombre, setAvisoNombre] = useState<string | null>(null);

  async function guardarNombre() {
    if (renombrando === null) return;
    try {
      const r = await renombrarViajeApi(delivery.id, renombrando);
      setRenombrando(null);
      setAvisoNombre(
        r.enElCrm === "CAMBIADO"
          ? "Nombre cambiado, también en la oportunidad del CRM. Lo ya enviado no cambia; lo siguiente que salga, sí."
          : r.enElCrm === "SIN_TRATO"
            ? "Nombre cambiado. Este viaje no tiene oportunidad en el CRM."
            : `Nombre cambiado en la aplicación, pero el CRM no lo aceptó: ${r.motivo ?? "sin motivo"}. Cámbialo allí a mano.`,
      );
      await cargar();
    } catch (e: unknown) {
      setAvisoNombre(e instanceof Error ? e.message : "No se pudo cambiar el nombre.");
    }
  }

  /** «Rehacer la propuesta»: se abre en Nueva solicitud y sale como versión siguiente. */
  async function rehacer() {
    try {
      const r = await rehacerPropuestaApi(delivery.id);
      // Lo que no se pudo recuperar viaja con la dirección: el lienzo lo enseña al abrir.
      const avisos = r.avisos.length ? `&avisos=${encodeURIComponent(r.avisos.join(" "))}` : "";
      window.location.assign(`/solicitudes/nueva?borrador=${encodeURIComponent(r.borradorId)}${avisos}`);
    } catch (e: unknown) {
      setAvisoNombre(e instanceof Error ? e.message : "No se pudo preparar la propuesta para rehacerla.");
    }
  }

  const cargar = useCallback(async () => {
    try {
      setFicha(await fichaDelPresupuestoApi(delivery.id));
      setError("");
      // Esto solo se llama tras una acción (apuntar opción, enviar, renombrar…):
      // quien contiene la ficha refresca su lista.
      onCambio?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la propuesta.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery.id]);

  useEffect(() => {
    let vivo = true;
    fichaDelPresupuestoApi(delivery.id)
      .then((f) => {
        if (vivo) setFicha(f);
      })
      .catch((e: unknown) => {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudo cargar la propuesta.");
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [delivery.id]);

  if (cargando) {
    return (
      <div className="ficha">
        <p className="cv__empty">Cargando la propuesta…</p>
      </div>
    );
  }

  if (error || !ficha) {
    return (
      <div className="ficha">
        <div className="alert alert--error" role="alert">
          {error || "No se pudo cargar la propuesta."}
        </div>
        {onClose && !incrustada ? (
          <button type="button" className="cv__ghost" onClick={onClose}>
            Volver
          </button>
        ) : null}
      </div>
    );
  }

  const quedan = diasHasta(ficha.depositDueAt);

  // Lo siguiente que hay que hacer. Se calcula aquí y no en el servidor porque
  // depende del reloj de quien mira: «quedan 3 días» cambia a medianoche.
  const paso = siguientePasoDelExpediente(
    {
      estado: ficha.estado,
      sentAt: ficha.sentAt,
      firstViewedAt: ficha.firstViewedAt,
      viewCount: ficha.viewCount,
      elegida: ficha.elegida,
      chosenAt: ficha.chosenAt,
      depositDueAt: ficha.depositDueAt,
      depositPaidAt: ficha.depositPaidAt,
      correosEntrantes: ficha.correo.entrantes,
      faseEnElCrm: ficha.crm.fase,
    },
    new Date(),
  );

  return (
    <div className="opc opc--app">
      {/* Mismo diseño que la ficha de las oportunidades de Zoho («C2», Anthony,
          16/11/2026): cabecera con los datos clave y «lo siguiente», el avance,
          cuatro bloques y las carpetas. Lo propio de una propuesta de la app (el
          documento, la conversación, apuntar la opción aceptada, rehacer, borrar)
          sigue aquí: lo siguiente manda en la cabecera y lo demás va en «Más ⋯». */}
      <header className="opc-cab">
        <div className="opc-cab__t">
          {!incrustada && onClose ? (
            <button type="button" className="opc-renombrar" onClick={onClose}>
              ← Volver a las oportunidades
            </button>
          ) : null}
          <p>
            <span className="mono">{ficha.reference}</span>
            {ficha.viaje.centro ? ` · ${ficha.viaje.centro}` : ""}
          </p>
          {renombrando === null ? (
            <h3>
              {ficha.viaje.nombre}
              <span className="opc-fase">{ficha.crm.fase || (ficha.estado === "SENT" ? "Propuesta enviada" : "Sin enviar")}</span>
              <button
                type="button"
                className="opc-renombrar"
                onClick={() => {
                  setAvisoNombre(null);
                  setRenombrando(ficha.viaje.nombre);
                }}
              >
                Cambiar nombre
              </button>
            </h3>
          ) : (
            <form
              className="ficha__nombre"
              onSubmit={(e) => {
                e.preventDefault();
                void guardarNombre();
              }}
            >
              <input
                autoFocus
                value={renombrando}
                onChange={(e) => setRenombrando(e.target.value)}
                aria-label="Nombre del grupo"
                placeholder="AMA GUADALUPEKOA 2027"
              />
              <button type="submit" className="cv__primary cv__primary--sm" disabled={!renombrando.trim()}>
                Guardar
              </button>
              <button type="button" className="cv__ghost cv__ghost--sm" onClick={() => setRenombrando(null)}>
                Cancelar
              </button>
            </form>
          )}
          {avisoNombre ? <p className="opc-cab__aviso">{avisoNombre}</p> : null}
        </div>

        {/* Lo que hay que hacer AHORA y, a su lado, la conversación y el resto de acciones. */}
        <div className="opc-sig">
          <div>
            <small>Lo siguiente</small>
            <strong>{paso.titulo}</strong>
            <span>{paso.porque}</span>
            {resultadoEnvio ? <span>{resultadoEnvio}</span> : null}
          </div>
          <div className="opc-sig__b">
            {paso.accion === "correo" ? (
              <button type="button" className="opx-btn opx-btn--primario" onClick={() => setCorreo(true)}>
                Abrir la conversación
              </button>
            ) : null}
            {paso.accion === "enviar" ? (
              <button type="button" className="opx-btn opx-btn--primario" disabled={enviando} onClick={() => void enviarAlColegio()}>
                {enviando ? "Enviando…" : "Enviar al colegio"}
              </button>
            ) : null}
            {paso.accion === "documento" && ficha.pdf ? (
              <a className="opx-btn opx-btn--primario" href={ficha.pdf} target="_blank" rel="noreferrer">
                Ver el documento
              </a>
            ) : null}
            {paso.accion === "crm" && ficha.crm.dealUrl ? (
              <a className="opx-btn opx-btn--primario" href={ficha.crm.dealUrl} target="_blank" rel="noreferrer">
                Abrir en Zoho ↗
              </a>
            ) : null}
            {paso.accion !== "correo" ? (
              <button type="button" className="opx-btn" onClick={() => setCorreo(true)}>
                Conversación
                {ficha.correo.total > 0 ? <span className="opx-pill">{ficha.correo.total}</span> : null}
              </button>
            ) : null}
            <MenuMas
              items={[
                ...(ficha.pdf ? [{ texto: "Ver el documento", href: ficha.pdf }] : []),
                // Recotizar desde aquí: si entrabas a la ficha a ver qué había, tenías que salir para cambiar algo.
                { texto: "Ha cambiado algo", onClick: () => setRecotizando(true) },
                // Cambiar un hotel o el programa de lo ya enviado (Ruth, 19/10/2026):
                // se abre en Nueva solicitud y sale como versión siguiente.
                { texto: "Rehacer la propuesta", onClick: () => void rehacer() },
                ...(ficha.crm.dealUrl ? [{ texto: "Abrir en Zoho ↗", href: ficha.crm.dealUrl }] : []),
                // Borrar la solicitud, con lo que arrastra.
                { texto: "Borrar la solicitud…", peligro: true, onClick: () => setBorrando(true) },
              ]}
            />
          </div>
        </div>

        <div className="opc-cajas">
          <Caja rotulo="Destino" valor={ficha.viaje.destino} nota={ficha.viaje.destino ? "" : "sin indicar"} tono={ficha.viaje.destino ? "" : "mal"} />
          <Caja
            rotulo="Fechas"
            valor={ficha.viaje.dateFrom || ficha.viaje.dateTo ? `${fecha(ficha.viaje.dateFrom)} — ${fecha(ficha.viaje.dateTo)}` : ""}
            nota={ficha.viaje.dateFrom || ficha.viaje.dateTo ? "" : "sin fechas"}
            tono={ficha.viaje.dateFrom || ficha.viaje.dateTo ? "" : "mal"}
          />
          <Caja rotulo="Participantes" valor={ficha.viaje.participants ? String(ficha.viaje.participants) : ""} nota={ficha.viaje.teachers ? `${ficha.viaje.teachers} profesores` : ""} />
          <Caja
            rotulo="Depósito"
            valor={ficha.depositPaidAt ? "Cobrado" : quedan !== null ? (quedan < 0 ? "Vencido" : `Quedan ${quedan} d`) : ficha.elegida ? "Pendiente" : "Aún no"}
            nota={ficha.depositPaidAt ? "" : quedan !== null && quedan < 0 ? `hace ${Math.abs(quedan)} días` : ficha.elegida ? "" : "no han elegido opción"}
            tono={ficha.depositPaidAt ? "bien" : quedan !== null && quedan < 0 ? "mal" : ""}
          />
          <Caja rotulo="Contacto" valor={ficha.contacto.email} nota={ficha.contacto.email ? "" : "sin correo"} tono={ficha.contacto.email ? "" : "mal"} />
        </div>
      </header>

      {/* El avance. Las fechas las sabe la app; la casilla en la que está la dice el CRM.
          El color de cada fase es el que tiene EN SU CRM; si no contesta, el nuestro. */}
      <section className="opc-fases" aria-label="Por dónde va">
        <div className="opc-fases__t">
          <small>Por dónde va</small>
          <small>
            {ficha.crm.dealId
              ? ficha.crm.respondio
                ? `En el CRM está en ${ficha.crm.fase || "sin fase"}`
                : "El CRM no ha contestado; las fechas son las que sabe la app."
              : "Aún no está en el CRM: la oportunidad se crea al enviar la propuesta."}
          </small>
        </div>
        <AvanceDeFase
          pasos={ficha.embudo.map((p) => ({
            fase: p.fase,
            hecho: p.hecho,
            actual: p.actual,
            detalle: p.detalle,
            cuando: p.cuando ? fechaCorta(p.cuando) : null,
            color: p.color,
          }))}
          fase={ficha.crm.fase}
          sinCrm={!ficha.crm.dealId}
        />
        {/* El panel de «Mover de fase», que pone la pantalla que contiene la ficha. */}
        {aside ? (
          <details className="opc-moverd">
            <summary>Mover de fase</summary>
            <div className="opc-mover">{aside}</div>
          </details>
        ) : null}
      </section>

      <div className="opc-cuerpo">
        <div className="opc-bloques">
          <Bloque letra="C" color="27, 61, 117" titulo="El cliente">
            <p className="opc-grande">{ficha.viaje.centro || ficha.viaje.nombre}</p>
            <dl className="opc-dl">
              <Par rotulo="Correo">{ficha.contacto.email ? <a href={`mailto:${ficha.contacto.email}`}>{ficha.contacto.email}</a> : null}</Par>
              <Par rotulo="Referencia">{ficha.reference}</Par>
            </dl>
          </Bloque>

          <Bloque letra="V" color="22, 138, 239" titulo="El viaje" extra={ficha.viaje.destino}>
            <p className="opc-grande">
              {ficha.viaje.dateFrom || ficha.viaje.dateTo ? `${fecha(ficha.viaje.dateFrom)} — ${fecha(ficha.viaje.dateTo)}` : "Sin fechas"}
            </p>
            <dl className="opc-dl">
              <Par rotulo="Destino">{ficha.viaje.destino}</Par>
              <Par rotulo="Participantes">{ficha.viaje.participants ? String(ficha.viaje.participants) : null}</Par>
              <Par rotulo="Profesores">{ficha.viaje.teachers ? String(ficha.viaje.teachers) : null}</Par>
            </dl>
            <div className="opc-sub">
              <small>Lo que se ofreció · {ficha.elegida ? `eligieron la opción ${ficha.elegida}` : "todavía no han elegido"}</small>
              {ficha.opciones.length === 0 ? <p className="opx-muted">Esta propuesta no tiene opciones guardadas.</p> : null}
              {ficha.opciones.map((o) => (
                <div key={o.optionNumber} className={`opc-opcion${o.elegida ? " is" : ""}`}>
                  <div>
                    <b>Opción {o.optionNumber}</b>
                    {o.elegida ? <span className="opc-sello">ELEGIDA</span> : null}
                    <small>
                      {o.alojamiento}
                      {o.actividades.length > 0 ? ` · ${o.actividades.length} ${o.actividades.length === 1 ? "actividad" : "actividades"}` : ""}
                    </small>
                  </div>
                  <b>{o.totalPvpText}</b>
                </div>
              ))}
            </div>
          </Bloque>

          <Bloque letra="€" color="31, 122, 77" titulo="El dinero">
            {(() => {
              const elegida = ficha.opciones.find((o) => o.elegida);
              return (
                <>
                  <p className="opc-grande">{elegida ? elegida.totalPvpText : ficha.opciones.length > 0 ? `${ficha.opciones.length} ${ficha.opciones.length === 1 ? "opción ofrecida" : "opciones ofrecidas"}` : "Sin opciones"}</p>
                  <dl className="opc-dl">
                    {elegida ? <Par rotulo="Aceptada">Opción {elegida.optionNumber} · {elegida.alojamiento}</Par> : ficha.opciones.map((o) => <Par key={o.optionNumber} rotulo={`Opción ${o.optionNumber}`}>{o.totalPvpText}</Par>)}
                    <Par rotulo="Depósito">
                      {ficha.depositPaidAt ? (
                        <b className="opx-t-ok">cobrado</b>
                      ) : quedan !== null ? (
                        <b className={quedan < 0 ? "opx-vencido" : ""}>{quedan < 0 ? `venció hace ${Math.abs(quedan)} días` : `quedan ${quedan} días`}</b>
                      ) : (
                        "empieza a contar cuando elijan opción"
                      )}
                    </Par>
                  </dl>
                </>
              );
            })()}
          </Bloque>

          <Bloque letra="P" color="216, 148, 18" titulo="Proveedores">
            {(() => {
              const vistas = ficha.opciones.filter((o) => o.elegida || !ficha.elegida);
              const nombres = [...new Set(vistas.map((o) => o.alojamiento).filter(Boolean))];
              const actividades = [...new Set(vistas.flatMap((o) => o.actividades.map((a) => a.nombre)))];
              if (nombres.length === 0 && actividades.length === 0) return <p className="opx-muted">Sin alojamientos ni actividades en la propuesta.</p>;
              return (
                <>
                  {nombres.map((nombre) => (
                    <div key={nombre} className="opc-prov">
                      <div>
                        <b>{nombre}</b>
                        <small>Alojamiento</small>
                      </div>
                    </div>
                  ))}
                  {actividades.map((nombre) => (
                    <div key={nombre} className="opc-prov">
                      <div>
                        <b>{nombre}</b>
                        <small>Actividad</small>
                      </div>
                    </div>
                  ))}
                </>
              );
            })()}
          </Bloque>
        </div>

        <section className="opc-carp" aria-label="Carpetas de la oportunidad">
          <nav role="tablist" aria-label="Carpetas">
            <button type="button" role="tab" aria-selected={carpeta === "propuesta"} className={carpeta === "propuesta" ? "is" : ""} onClick={() => setCarpeta("propuesta")}>
              Propuesta <b>{ficha.opciones.length}</b>
            </button>
            <button type="button" role="tab" aria-selected={carpeta === "crm"} className={carpeta === "crm" ? "is" : ""} onClick={() => setCarpeta("crm")}>
              En el CRM {ficha.crm.relleno ? <b>{ficha.crm.relleno.rellenos} de {ficha.crm.relleno.total}</b> : null}
            </button>
            <button type="button" role="tab" aria-selected={false} onClick={() => setCorreo(true)}>
              Conversación <b>{ficha.correo.total}</b>
            </button>
          </nav>
          <div className="opc-carp__c">
            {carpeta === "propuesta" ? (
              <>
                {/* Apuntar la opción que han aceptado. El correo les pide contestar cuál
                    prefieren, y si contestaban por correo no se enteraba nadie: ni arrancaba
                    el plazo del depósito ni se movía la fase en el CRM. Solo cuando ya salió. */}
                {!ficha.elegida && ficha.estado === "SENT" ? (
                  <section className="ficha__elegir">
                    <p className="ficha__tocal">Han aceptado una opción</p>
                    {ficha.sugerida ? (
                      <div className="ficha__sug">
                        <p className="ficha__sugt">
                          Su respuesta apunta a la <b>opción {ficha.sugerida.numero}</b>
                          {ficha.sugerida.confianza === "media" ? " (no está del todo claro)" : ""}.
                        </p>
                        <p className="ficha__sugq">«{ficha.sugerida.porque}»</p>
                      </div>
                    ) : (
                      <p className="ficha__tocap">Si te lo han dicho por correo, apúntalo aquí: arranca el plazo del depósito y mueve la fase en el CRM.</p>
                    )}
                    <div className="ficha__elegirbtns">
                      {ficha.opciones.map((o) => (
                        <button
                          key={o.optionNumber}
                          type="button"
                          className={ficha.sugerida?.numero === o.optionNumber ? "cv__primary cv__primary--sm" : "cv__ghost cv__ghost--sm"}
                          disabled={marcando}
                          onClick={async () => {
                            // Arranca un plazo de pago y mueve la fase del CRM de un cliente: se pregunta antes, con el hotel delante.
                            const seguro = window.confirm(
                              `¿Apuntar que han aceptado la opción ${o.optionNumber}?\n\n${o.alojamiento}\n\nArranca el plazo del depósito y mueve la fase en el CRM.`,
                            );
                            if (!seguro) return;
                            setMarcando(true);
                            try {
                              await marcarOpcionApi(delivery.id, o.optionNumber);
                              await cargar();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "No se pudo apuntar la opción.");
                            } finally {
                              setMarcando(false);
                            }
                          }}
                        >
                          Opción {o.optionNumber}
                        </button>
                      ))}
                    </div>
                  </section>
                ) : null}

                {/* Las opciones, con lo que de verdad supone cada una. */}
                {ficha.opciones.length === 0 ? (
                  <p className="cv__empty">Esta propuesta no tiene opciones guardadas.</p>
                ) : (
                  <ul className="ficha__ops">
                    {ficha.opciones.map((o) => (
                      <li key={o.optionNumber} className={o.elegida ? "ficha__op is-elegida" : "ficha__op"}>
                        <div className="ficha__opcab">
                          <span className="ficha__opn">Opción {o.optionNumber}</span>
                          <span className="ficha__optotal">{o.totalPvpText}</span>
                        </div>
                        <div className="ficha__opnom">{o.alojamiento}</div>
                        <div className="ficha__opdet">
                          {[o.regimen, o.noches ? `${o.noches} ${o.noches === 1 ? "noche" : "noches"}` : null].filter(Boolean).join(" · ")}
                        </div>
                        {o.desglose ? <div className="ficha__opdesg">{o.desglose}</div> : null}
                        {o.gratuidades ? (
                          <div className="ficha__opgrat">
                            <b>Gratuidades:</b> {o.gratuidades}
                          </div>
                        ) : null}
                        {o.actividades.length > 0 ? (
                          <ul className="ficha__acts">
                            {o.actividades.map((a, i) => (
                              <li key={`${o.optionNumber}-${i}`}>
                                <span>{a.nombre}</span>
                                <span className="ficha__actp">{a.precio}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {o.elegida ? <span className="ficha__elegida">Elegida por el colegio</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}

            {/* Qué hay relleno en la oportunidad. Se enseña TAMBIÉN lo vacío: Ruth reportó que
                el trato salía con los campos sin rellenar, y comprobarlo obligaba a abrir Zoho. */}
            {carpeta === "crm" ? (
              !ficha.crm.dealId ? (
                <p className="opx-muted">Todavía no hay oportunidad en el CRM: se crea al enviar la propuesta.</p>
              ) : !ficha.crm.respondio ? (
                <p className="ficha__crmvacio">Zoho no ha contestado. La ficha se abre igual; lo de aquí es lo último que se supo.</p>
              ) : (
                <>
                  <dl className="ficha__campos">
                    {(ficha.crm.campos ?? []).map((c) => (
                      <div key={c.etiqueta} className={c.valor ? "ficha__campo" : "ficha__campo is-vacio"}>
                        <dt>{c.etiqueta}</dt>
                        <dd>{c.valor || (c.nota ? c.nota : "vacío")}</dd>
                      </div>
                    ))}
                  </dl>
                  {ficha.crm.dealUrl ? (
                    <a className="ficha__crmlink" href={ficha.crm.dealUrl} target="_blank" rel="noreferrer">
                      Abrir la oportunidad en Zoho →
                    </a>
                  ) : null}
                </>
              )
            ) : null}
          </div>
        </section>
      </div>

      {recotizando && delivery.proposalId ? (
        <ChangePanel
          proposalId={delivery.proposalId}
          tituloViaje={ficha.viaje.nombre}
          onClose={() => setRecotizando(false)}
          onApplied={() => {
            setRecotizando(false);
            void cargar();
          }}
        />
      ) : null}

      {correo ? (
        <CorreoPanel
          delivery={delivery}
          titulo={ficha.viaje.nombre}
          onClose={() => setCorreo(false)}
        />
      ) : null}

      {borrando ? (
        <BorrarSolicitudPanel
          delivery={delivery}
          titulo={ficha.viaje.nombre}
          onClose={() => setBorrando(false)}
          onBorrada={(resumen) => {
            setBorrando(false);
            onBorrada?.(resumen);
          }}
        />
      ) : null}
    </div>
  );
}
