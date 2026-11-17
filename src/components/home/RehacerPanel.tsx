import { useState } from "react";
import { readTripMessage } from "../../services/mcpTools";
import {
  abrirProposalPdf,
  applyChangeApi,
  prepareProposalDeliveryApi,
  previewChangeApi,
  sendProposalDeliveryApi,
  type DatosLeidosCambio,
  type VistaPreviaCambio,
} from "../../services/apiClient";

/**
 * «Rehacer la propuesta», sin salir de la oportunidad.
 *
 * Anthony, 17/11/2026: «rehacer» mandaba al cotizador y pedía confirmar otra vez la
 * petición entera. «No deberíamos irnos de la oportunidad, sino mantenernos ahí y
 * salirnos una sección como ya lo hace Conversación, y dejarnos ahí indicar los
 * cambios y poder rehacer la propuesta». Aquí, en un panel lateral:
 *
 *   1. se dice qué ha cambiado (alumnos, profesores, fechas), a mano o pegando el
 *      mensaje del cliente;
 *   2. se ve qué pasa con los precios, del alojamiento y de las actividades;
 *   3. se rehace: sale una versión nueva con su documento («ORV-2026-0006-v2»);
 *   4. se revisa el documento y se envía al cliente.
 *
 * La versión que ya salió no se toca: el cliente tiene un documento con unos precios
 * y esa foto no se cambia por detrás. Cambiar un hotel o una actividad sigue siendo
 * cosa del cotizador (`onCotizador`): aquí no hay catálogo donde elegir.
 */

export interface RehacerPanelProps {
  proposalId: string;
  tituloViaje: string;
  /** A quién se le enviará la versión nueva. */
  destinatario: string;
  /** Los datos del viaje como están ahora: con ellos arrancan los campos. */
  actual: { participants: number | null; teachers: number | null; dateFrom: string | null; dateTo: string | null };
  onClose: () => void;
  /** Se ha creado o enviado una versión nueva: quien contiene el panel refresca lo suyo. */
  onCambio: () => void;
  /** Cambiar hoteles o actividades: se abre en el cotizador. */
  onCotizador?: () => void;
}

const euros = (valor: number | null) =>
  valor === null ? "—" : new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);
const soloDia = (iso: string | null) => (iso ? iso.slice(0, 10) : "");
const numero = (texto: string) => (texto.trim() === "" || !Number.isFinite(Number(texto)) ? null : Math.max(0, Math.round(Number(texto))));

interface VersionNueva {
  version: number;
  proposalId: string;
  /** La entrega con su documento; null si la versión se creó pero el documento no se pudo generar. */
  deliveryId: string | null;
  reference: string | null;
}

export function RehacerPanel({ proposalId, tituloViaje, destinatario, actual, onClose, onCambio, onCotizador }: RehacerPanelProps) {
  const inicial = {
    alumnos: actual.participants != null ? String(actual.participants) : "",
    profesores: actual.teachers != null ? String(actual.teachers) : "",
    desde: soloDia(actual.dateFrom),
    hasta: soloDia(actual.dateTo),
  };
  const [campos, setCampos] = useState(inicial);
  const [mensaje, setMensaje] = useState("");
  /** El régimen solo se cambia si lo dice el mensaje del cliente. */
  const [regimen, setRegimen] = useState<string | null>(null);
  const [vista, setVista] = useState<VistaPreviaCambio | null>(null);
  const [ocupado, setOcupado] = useState<"" | "calculando" | "rehaciendo" | "documento" | "enviando">("");
  const [error, setError] = useState("");
  const [nueva, setNueva] = useState<VersionNueva | null>(null);
  const [envio, setEnvio] = useState<{ texto: string; enviada: boolean } | null>(null);

  const cambiar = (campo: keyof typeof inicial, valor: string) => {
    setCampos((c) => ({ ...c, [campo]: valor }));
    // Lo que se enseña abajo es siempre de lo que hay escrito arriba.
    setVista(null);
  };
  const cambiado = (campo: keyof typeof inicial) => campos[campo] !== inicial[campo];

  function leido(): DatosLeidosCambio {
    return {
      participants: numero(campos.alumnos),
      teachers: numero(campos.profesores),
      dateFrom: campos.desde || null,
      dateTo: campos.hasta || null,
      regimeRequested: regimen,
    };
  }

  /** Pegar el correo del cliente y que rellene los campos: se revisan antes de seguir. */
  function leerElMensaje() {
    if (!mensaje.trim()) {
      setError("Pega el mensaje que te ha mandado el cliente.");
      return;
    }
    setError("");
    const { normalized } = readTripMessage(mensaje);
    setCampos((c) => ({
      alumnos: normalized.participants != null ? String(normalized.participants) : c.alumnos,
      profesores: normalized.teachers != null ? String(normalized.teachers) : c.profesores,
      desde: normalized.dateFrom || c.desde,
      hasta: normalized.dateTo || c.hasta,
    }));
    setRegimen(normalized.regimeRequested || null);
    setVista(null);
  }

  async function verQueCambia() {
    setError("");
    setOcupado("calculando");
    try {
      setVista(await previewChangeApi(proposalId, leido()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo calcular el cambio.");
    } finally {
      setOcupado("");
    }
  }

  /** El documento de la versión nueva. Aparte, para poder reintentarlo si falla. */
  async function generarDocumento(version: VersionNueva) {
    setOcupado("documento");
    try {
      const preparada = await prepareProposalDeliveryApi(version.proposalId);
      setNueva({ ...version, deliveryId: preparada.id, reference: preparada.reference });
      setError("");
    } catch (err) {
      setError(`La versión ${version.version} está creada, pero no se pudo generar su documento: ${err instanceof Error ? err.message : "error desconocido"}`);
    } finally {
      setOcupado("");
      onCambio();
    }
  }

  async function rehacer() {
    if (!vista?.hayCambios || !sePuedeRehacer) return;
    setError("");
    setOcupado("rehaciendo");
    try {
      // Lo que queda apuntado en la solicitud: el mensaje del cliente o, si no hay, lo indicado a mano.
      const texto = mensaje.trim() || `Cambio indicado desde la ficha: ${vista.campos.map((c) => `${c.etiqueta} ${c.antes} → ${c.ahora}`).join("; ")}.`;
      const r = await applyChangeApi(proposalId, leido(), texto);
      const version: VersionNueva = { version: r.versionNumber, proposalId: r.proposalId, deliveryId: null, reference: null };
      setNueva(version);
      await generarDocumento(version);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo rehacer la propuesta.");
      setOcupado("");
    }
  }

  async function enviar() {
    if (!nueva?.deliveryId) return;
    setOcupado("enviando");
    setEnvio(null);
    try {
      const r = await sendProposalDeliveryApi(nueva.deliveryId);
      if (r.status === "SENT") setEnvio({ texto: `Enviada a ${r.recipientEmail}.`, enviada: true });
      else if (r.simulated) setEnvio({ texto: "No ha salido: el buzón del departamento no tiene clave en el servidor. La versión queda preparada.", enviada: false });
      else setEnvio({ texto: `No salió: ${r.failureReason ?? "el servidor de correo rechazó el envío."}`, enviada: false });
    } catch (err) {
      setEnvio({ texto: err instanceof Error ? err.message : "No se pudo enviar la propuesta.", enviada: false });
    } finally {
      setOcupado("");
      onCambio();
    }
  }

  // Una opción sin precio nuevo viajaría a la versión nueva con el total de antes y el grupo de ahora:
  // con alguna así no se rehace desde aquí, se manda al cotizador.
  const sinRecalcular = (vista?.opciones ?? []).filter((o) => o.totalAhora === null);
  const sePuedeRehacer = Boolean(vista?.hayCambios) && sinRecalcular.length === 0;
  const actividadesDe = (opcion: number) => (vista?.actividades ?? []).filter((a) => a.optionNumber === opcion);
  const suma = (lista: { totalAntes: number | null; totalAhora: number | null }[], cual: "totalAntes" | "totalAhora") => lista.reduce((s, a) => s + (a[cual] ?? 0), 0);

  return (
    <div className="rv" role="dialog" aria-modal="true" aria-label="Rehacer la propuesta">
      <div className="rv__back" onClick={onClose} />
      <aside className="rv__panel">
        <header className="rv__head">
          <div>
            <p className="rv__k">Rehacer la propuesta</p>
            <h2 className="rv__t">{tituloViaje}</h2>
          </div>
          <button type="button" className="cv__ghost cv__ghost--sm" onClick={onClose}>
            Cerrar
          </button>
        </header>

        <div className="rv__body">
          {nueva ? (
            <section className="rv__block">
              <div className="chg__ok">
                <strong>
                  Versión {nueva.version} creada{nueva.reference ? ` · ${nueva.reference}` : ""}
                </strong>
                <p>La solicitud queda con los datos nuevos y hay una propuesta nueva con los precios recalculados. La versión anterior se conserva tal como se envió.</p>
              </div>
              {nueva.deliveryId ? (
                <>
                  <div className="rh__pasos">
                    <button type="button" className="cv__ghost" onClick={() => void abrirProposalPdf(nueva.deliveryId as string).catch((e: unknown) => setError(e instanceof Error ? e.message : "No se pudo abrir el documento."))}>
                      Ver el documento
                    </button>
                    {envio?.enviada ? null : (
                      <button type="button" className="cv__send" onClick={() => void enviar()} disabled={ocupado !== ""}>
                        {ocupado === "enviando" ? "Enviando…" : `Enviar a ${destinatario}`}
                      </button>
                    )}
                  </div>
                  {envio ? <p className={envio.enviada ? "rh__nota rh__nota--ok" : "chg__aviso rh__nota"}>{envio.texto}</p> : <p className="rh__nota">Revisa el documento antes de enviarlo. Hasta que lo envíes, el cliente no recibe nada.</p>}
                </>
              ) : (
                <div className="rh__pasos">
                  <button type="button" className="cv__primary cv__primary--sm" onClick={() => void generarDocumento(nueva)} disabled={ocupado !== ""}>
                    {ocupado === "documento" ? "Generando el documento…" : "Generar el documento"}
                  </button>
                </div>
              )}
              {error ? (
                <div className="alert alert--error" role="alert">
                  {error}
                </div>
              ) : null}
            </section>
          ) : (
            <>
              <section className="rv__block">
                <h3 className="rv__bt">Qué ha cambiado</h3>
                <div className="rh__campos">
                  <label>
                    Alumnos
                    <input type="number" min={0} inputMode="numeric" className={cambiado("alumnos") ? "is-cambiado" : ""} value={campos.alumnos} onChange={(e) => cambiar("alumnos", e.target.value)} />
                    {cambiado("alumnos") ? <small>antes, {inicial.alumnos || "sin dato"}</small> : null}
                  </label>
                  <label>
                    Profesores
                    <input type="number" min={0} inputMode="numeric" className={cambiado("profesores") ? "is-cambiado" : ""} value={campos.profesores} onChange={(e) => cambiar("profesores", e.target.value)} />
                    {cambiado("profesores") ? <small>antes, {inicial.profesores || "sin dato"}</small> : null}
                  </label>
                  <label>
                    Llegada
                    <input type="date" className={cambiado("desde") ? "is-cambiado" : ""} value={campos.desde} onChange={(e) => cambiar("desde", e.target.value)} />
                    {cambiado("desde") ? <small>antes, {inicial.desde || "sin fecha"}</small> : null}
                  </label>
                  <label>
                    Salida
                    <input type="date" className={cambiado("hasta") ? "is-cambiado" : ""} value={campos.hasta} onChange={(e) => cambiar("hasta", e.target.value)} />
                    {cambiado("hasta") ? <small>antes, {inicial.hasta || "sin fecha"}</small> : null}
                  </label>
                </div>
                {regimen ? <p className="rh__nota">El mensaje pide también otro régimen: {regimen}.</p> : null}

                <details className="rh__mensaje">
                  <summary>O pega el mensaje del cliente y que rellene los campos</summary>
                  <textarea className="cv__composer" rows={4} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Buenos días, un cambio: al final seremos 46 alumnos…" />
                  <div className="chg__acciones">
                    <button type="button" className="cv__ghost cv__ghost--sm" onClick={leerElMensaje}>
                      Leer el mensaje
                    </button>
                  </div>
                </details>

                <div className="chg__acciones">
                  <button type="button" className="cv__primary cv__primary--sm" onClick={() => void verQueCambia()} disabled={ocupado !== ""}>
                    {ocupado === "calculando" ? "Calculando…" : "Ver qué cambia"}
                  </button>
                </div>
                {onCotizador ? (
                  <p className="rh__nota">
                    ¿Hay que cambiar un hotel o una actividad?{" "}
                    <button type="button" className="rh__enlace" onClick={onCotizador}>
                      Ábrela en el cotizador
                    </button>
                    : sale también como versión nueva.
                  </p>
                ) : null}
              </section>

              {error ? (
                <div className="alert alert--error" role="alert">
                  {error}
                </div>
              ) : null}

              {vista && !vista.hayCambios ? <p className="cv__empty">Con esos datos no cambia nada: son los que ya tiene la propuesta.</p> : null}

              {vista?.hayCambios ? (
                <>
                  <section className="rv__block">
                    <h3 className="rv__bt">Esto es lo que cambia</h3>
                    <ul className="chg__campos">
                      {vista.campos.map((campo) => (
                        <li key={campo.campo}>
                          <span>{campo.etiqueta}</span>
                          <span className="chg__antes">{campo.antes}</span>
                          <span className="chg__flecha" aria-hidden="true">
                            →
                          </span>
                          <strong>{campo.ahora}</strong>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="rv__block">
                    <h3 className="rv__bt">Efecto en los precios</h3>
                    <ul className="chg__opts">
                      {vista.opciones.map((opcion) => {
                        const actividades = actividadesDe(opcion.optionNumber);
                        const sube = opcion.totalAhora !== null && opcion.totalAntes !== null && opcion.totalAhora > opcion.totalAntes;
                        const totalAntes = opcion.totalAntes !== null ? opcion.totalAntes + suma(actividades, "totalAntes") : null;
                        const totalAhora = opcion.totalAhora !== null ? opcion.totalAhora + suma(actividades, "totalAhora") : null;
                        return (
                          <li key={opcion.optionNumber}>
                            <div className="chg__optt">
                              Opción {opcion.optionNumber} · {opcion.accommodationName}
                            </div>
                            {opcion.aviso && opcion.totalAhora === null ? (
                              <p className="chg__aviso">{opcion.aviso}</p>
                            ) : (
                              <>
                                <p className="chg__precios">
                                  <span className="chg__unidad">Alojamiento</span>
                                  <span className="chg__antes">{euros(opcion.totalAntes)}</span>
                                  <span className="chg__flecha" aria-hidden="true">
                                    →
                                  </span>
                                  <strong className={sube ? "chg__sube" : "chg__baja"}>{euros(opcion.totalAhora)}</strong>
                                  <span className="chg__total">
                                    por alumno {euros(opcion.precioAntes)} → {euros(opcion.precioAhora)}
                                  </span>
                                </p>
                                {opcion.aviso ? <p className="chg__aviso">{opcion.aviso}</p> : null}
                                {actividades.map((a) => (
                                  <p key={a.id} className="chg__precios">
                                    <span className="chg__unidad">{a.nombre}</span>
                                    <span className="chg__antes">{euros(a.totalAntes)}</span>
                                    <span className="chg__flecha" aria-hidden="true">
                                      →
                                    </span>
                                    <strong>{euros(a.totalAhora)}</strong>
                                    {a.aviso ? <span className="chg__aviso rh__avisoact">{a.aviso}</span> : null}
                                  </p>
                                ))}
                                {actividades.length > 0 && totalAhora !== null ? (
                                  <p className="chg__precios rh__total">
                                    <span className="chg__unidad">Total de la opción</span>
                                    <span className="chg__antes">{euros(totalAntes)}</span>
                                    <span className="chg__flecha" aria-hidden="true">
                                      →
                                    </span>
                                    <strong>{euros(totalAhora)}</strong>
                                  </p>
                                ) : null}
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  {sinRecalcular.length > 0 ? (
                    <div className="rv__warn">
                      <p>
                        {sinRecalcular.length === 1 ? "Hay una opción que no se puede" : `Hay ${sinRecalcular.length} opciones que no se pueden`} recalcular desde aquí, así que la propuesta no se rehace en este panel.{" "}
                        {onCotizador ? (
                          <button type="button" className="rh__enlace" onClick={onCotizador}>
                            Ábrela en el cotizador
                          </button>
                        ) : (
                          "Hay que rehacerla en el cotizador"
                        )}
                        .
                      </p>
                    </div>
                  ) : null}

                  {vista.avisos.length ? (
                    <div className="rv__warn">
                      {vista.avisos.map((aviso) => (
                        <p key={aviso}>{aviso}</p>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </div>

        <footer className="rv__foot">
          <span className="cv__note">{nueva ? (envio?.enviada ? "La versión nueva ya está enviada." : "Falta enviar la versión nueva al cliente.") : "Nada se ha tocado todavía."}</span>
          <div className="rv__footr">
            <button type="button" className="cv__ghost" onClick={onClose}>
              {nueva ? "Cerrar" : "Dejarlo como está"}
            </button>
            {!nueva ? (
              <button type="button" className={sePuedeRehacer ? "cv__send" : "cv__send cv__send--off"} onClick={() => void rehacer()} disabled={!sePuedeRehacer || ocupado !== ""}>
                {ocupado === "rehaciendo" || ocupado === "documento" ? "Rehaciendo…" : "Rehacer la propuesta"}
              </button>
            ) : null}
          </div>
        </footer>
      </aside>
    </div>
  );
}
