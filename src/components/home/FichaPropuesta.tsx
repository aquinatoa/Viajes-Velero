import { ChangePanel } from "./ChangePanel";
import { marcarOpcionApi, sendProposalDeliveryApi } from "../../services/apiClient";
import { siguientePasoDelExpediente } from "../../domain/siguientePaso";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import { fichaDelPresupuestoApi, type FichaPresupuesto } from "../../services/apiClient";
import { CorreoPanel } from "./CorreoPanel";
import type { ProposalDelivery } from "../../services/apiClient";

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
  onClose: () => void;
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

export function FichaPropuesta({ delivery, onClose }: FichaPropuestaProps) {
  const [ficha, setFicha] = useState<FichaPresupuesto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [correo, setCorreo] = useState(false);
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
  const cargar = useCallback(async () => {
    try {
      setFicha(await fichaDelPresupuestoApi(delivery.id));
      setError("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el presupuesto.");
    }
  }, [delivery.id]);

  useEffect(() => {
    let vivo = true;
    fichaDelPresupuestoApi(delivery.id)
      .then((f) => {
        if (vivo) setFicha(f);
      })
      .catch((e: unknown) => {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudo cargar el presupuesto.");
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
        <p className="cv__empty">Cargando el presupuesto…</p>
      </div>
    );
  }

  if (error || !ficha) {
    return (
      <div className="ficha">
        <div className="alert alert--error" role="alert">
          {error || "No se pudo cargar el presupuesto."}
        </div>
        <button type="button" className="cv__ghost" onClick={onClose}>
          Volver
        </button>
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
    <div className="ficha">
      <header className="ficha__top">
        <div>
          <button type="button" className="ficha__volver" onClick={onClose}>
            ← Volver a las propuestas
          </button>
          <h1 className="ficha__t">{ficha.viaje.nombre}</h1>
          <p className="ficha__sub">
            <span className="mono">{ficha.reference}</span>
            {ficha.viaje.centro ? ` · ${ficha.viaje.centro}` : ""}
          </p>
        </div>
        <div className="ficha__acciones">
          <button type="button" className="cv__ghost cv__ghost--sm" onClick={() => setCorreo(true)}>
            Conversación
            {ficha.correo.total > 0 ? <span className="ficha__pill">{ficha.correo.total}</span> : null}
          </button>
          {ficha.pdf ? (
            <a className="cv__ghost cv__ghost--sm" href={ficha.pdf} target="_blank" rel="noreferrer">
              Ver el documento
            </a>
          ) : null}
          {/* Recotizar desde aquí. Estaba solo en la lista de propuestas: si
              entrabas a la ficha a ver qué había, tenías que salir para poder
              cambiar algo. */}
          <button type="button" className="cv__ghost cv__ghost--sm" onClick={() => setRecotizando(true)}>
            Ha cambiado algo
          </button>
          {ficha.crm.dealUrl ? (
            <a className="cv__ghost cv__ghost--sm" href={ficha.crm.dealUrl} target="_blank" rel="noreferrer">
              Abrir en el CRM
            </a>
          ) : null}
        </div>
      </header>

      {/* Los datos del viaje. Lo que en el trato de Zoho cabe a duras penas. */}
      <section className="ficha__datos">
        {[
          ["Destino", ficha.viaje.destino || "—"],
          ["Fechas", `${fecha(ficha.viaje.dateFrom)} — ${fecha(ficha.viaje.dateTo)}`],
          ["Participantes", ficha.viaje.participants ? String(ficha.viaje.participants) : "—"],
          ["Profesores", ficha.viaje.teachers ? String(ficha.viaje.teachers) : "—"],
          ["Contacto", ficha.contacto.email],
        ].map(([k, v]) => (
          <div key={k} className="ficha__dato">
            <span className="ficha__k">{k}</span>
            <span className="ficha__v">{v}</span>
          </div>
        ))}
      </section>

      {/* El embudo. Es lo que ata el presupuesto a la oportunidad: las fechas
          las sabe la app, la casilla en la que está la dice el CRM. */}
      <div className="ficha__cols">
        <div className="ficha__main">
      <section className="ficha__bloque">
        <div className="sec-head">
          <h2 className="ficha__h2">Por dónde va</h2>
          <p className="ficha__nota">
            {ficha.crm.dealId ? (
              ficha.crm.respondio ? (
                <>
                  En el CRM está en <b>{ficha.crm.fase || "sin fase"}</b>
                </>
              ) : (
                "El CRM no ha contestado; las fechas son las que sabe la app."
              )
            ) : (
              "Esta propuesta todavía no tiene oportunidad en el CRM."
            )}
          </p>
        </div>

        <ol className="embudo">
          {ficha.embudo.map((p) => (
            <li
              key={p.fase}
              /* El color es el que esa fase tiene EN SU CRM, leído de Zoho. Va
                 como variable para que lo usen el punto, el borde y el fondo
                 sin repetirlo tres veces. Si el CRM no contesta o la fase no
                 tiene color, no se pone nada y el CSS pinta con lo nuestro. */
              style={p.color ? ({ "--fase": p.color } as CSSProperties) : undefined}
              className={`embudo__p${p.hecho ? " is-hecho" : ""}${p.actual ? " is-actual" : ""}${
                p.color ? " tiene-color" : ""
              }`}
            >
              <span className="embudo__punto" aria-hidden="true" />
              <span className="embudo__fase">{p.fase}</span>
              {p.detalle ? <span className="embudo__det">{p.detalle}</span> : null}
              {p.cuando ? <span className="embudo__cuando">{fechaCorta(p.cuando)}</span> : null}
            </li>
          ))}
        </ol>

        {quedan !== null && !ficha.depositPaidAt ? (
          <p className={quedan < 0 ? "ficha__aviso ficha__aviso--tarde" : "ficha__aviso"}>
            {quedan < 0
              ? `El depósito venció hace ${Math.abs(quedan)} días.`
              : `Quedan ${quedan} días para el depósito.`}
          </p>
        ) : null}
      </section>

      {/* Las tres opciones, con lo que de verdad supone cada una. */}
      <section className="ficha__bloque">
        <div className="sec-head">
          <h2 className="ficha__h2">Lo que se ofreció</h2>
          <p className="ficha__nota">
            {ficha.elegida
              ? `El colegio eligió la opción ${ficha.elegida}.`
              : "Todavía no han elegido ninguna."}
          </p>
        </div>

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
                  {[o.regimen, o.noches ? `${o.noches} noches` : null].filter(Boolean).join(" · ")}
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
      </section>

        </div>

        <aside className="ficha__aside">
          {/* Apuntar la opción que han aceptado.
              El correo que manda la app les pide «respondiendo a este correo nos
              decís cuál preferís», y hasta ahora la ÚNICA vía que marcaba la
              opción era el botón de la página pública. Contestaban por correo y
              no se enteraba nadie: ni arrancaba el plazo del depósito ni se
              movía la fase en el CRM. */}
          {!ficha.elegida ? (
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
                <p className="ficha__tocap">
                  Si te lo han dicho por correo, apúntalo aquí: arranca el plazo del depósito y mueve la
                  fase en el CRM.
                </p>
              )}

              <div className="ficha__elegirbtns">
                {ficha.opciones.map((o) => (
                  <button
                    key={o.optionNumber}
                    type="button"
                    className={
                      ficha.sugerida?.numero === o.optionNumber
                        ? "cv__primary cv__primary--sm"
                        : "cv__ghost cv__ghost--sm"
                    }
                    disabled={marcando}
                    onClick={async () => {
                      // Arranca un plazo de pago y mueve la fase del CRM de un
                      // cliente: se pregunta antes, con el hotel delante.
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

          {/* Lo que hay que hacer AHORA. La ficha decia donde esta el
              expediente y ahi se acababa: «estoy aqui y no se cual es el
              proximo paso que debo hacer». Saber en que fase estas no es saber
              que hacer. */}
          <section className={`ficha__toca ficha__toca--${paso.urgencia}`}>
            <p className="ficha__tocal">Lo siguiente</p>
            <p className="ficha__tocat">{paso.titulo}</p>
            <p className="ficha__tocap">{paso.porque}</p>
            {paso.accion === "correo" ? (
              <button type="button" className="cv__primary cv__primary--sm" onClick={() => setCorreo(true)}>
                Abrir la conversación
              </button>
            ) : null}
            {paso.accion === "enviar" ? (
              <button
                type="button"
                className="cv__primary cv__primary--sm"
                disabled={enviando}
                onClick={() => void enviarAlColegio()}
              >
                {enviando ? "Enviando…" : "Enviar al colegio"}
              </button>
            ) : null}
            {resultadoEnvio ? <p className="ficha__tocap">{resultadoEnvio}</p> : null}
            {paso.accion === "documento" && ficha.pdf ? (
              <a className="cv__ghost cv__ghost--sm" href={ficha.pdf} target="_blank" rel="noreferrer">
                Ver el documento
              </a>
            ) : null}
            {paso.accion === "crm" && ficha.crm.dealUrl ? (
              <a className="cv__ghost cv__ghost--sm" href={ficha.crm.dealUrl} target="_blank" rel="noreferrer">
                Abrir en el CRM
              </a>
            ) : null}
          </section>

          {/* Que hay relleno en la oportunidad. Se enseña TAMBIEN lo vacio:
              Ruth reporto que el trato salia con los campos sin rellenar, y
              comprobarlo obligaba a abrir Zoho y mirar campo por campo. */}
          <section className="ficha__crm">
            <p className="ficha__tocal">
              En el CRM
              {ficha.crm.relleno ? (
                <span className="ficha__crmn">
                  {ficha.crm.relleno.rellenos} de {ficha.crm.relleno.total}
                </span>
              ) : null}
            </p>

            {!ficha.crm.dealId ? (
              <p className="ficha__crmvacio">Este presupuesto no tiene oportunidad en el CRM.</p>
            ) : !ficha.crm.respondio ? (
              <p className="ficha__crmvacio">
                Zoho no ha contestado. La ficha se abre igual; lo de aquí es lo último que se supo.
              </p>
            ) : (
              <dl className="ficha__campos">
                {(ficha.crm.campos ?? []).map((c) => (
                  <div key={c.etiqueta} className={c.valor ? "ficha__campo" : "ficha__campo is-vacio"}>
                    <dt>{c.etiqueta}</dt>
                    <dd>{c.valor || (c.nota ? c.nota : "vacío")}</dd>
                  </div>
                ))}
              </dl>
            )}

            {ficha.crm.dealUrl ? (
              <a className="ficha__crmlink" href={ficha.crm.dealUrl} target="_blank" rel="noreferrer">
                Abrir la oportunidad en Zoho →
              </a>
            ) : null}
          </section>
        </aside>
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
    </div>
  );
}
