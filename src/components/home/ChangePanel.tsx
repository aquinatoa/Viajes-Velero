import { useState } from "react";
import { readTripMessage } from "../../services/mcpTools";
import {
  applyChangeApi,
  previewChangeApi,
  type VistaPreviaCambio,
} from "../../services/apiClient";

/**
 * "Ha cambiado algo": el mensaje que llega cuando el viaje ya está propuesto.
 *
 * Es el caso que planteó Javier en junio y que hasta ahora se rehacía a mano:
 * el colegio escribe "al final seremos 46" y hay que recalcular todo sin
 * equivocarse. Aquí se pega el mensaje, se ve qué cambiaría, y solo entonces
 * se aplica.
 *
 * Aplicar no pisa la propuesta que ya salió: crea una versión nueva. El colegio
 * tiene un PDF con unos precios y esa foto no se toca por detrás.
 */

export interface ChangePanelProps {
  proposalId: string;
  tituloViaje: string;
  onClose: () => void;
  onApplied: () => void;
}

function euros(valor: number | null): string {
  if (valor === null) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(valor);
}

export function ChangePanel({ proposalId, tituloViaje, onClose, onApplied }: ChangePanelProps) {
  const [mensaje, setMensaje] = useState("");
  const [vista, setVista] = useState<VistaPreviaCambio | null>(null);
  const [ocupado, setOcupado] = useState<"" | "leyendo" | "aplicando">("");
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState<{ version: number } | null>(null);

  /** El mensaje se entiende aquí; al servidor solo van los datos ya leídos. */
  function datosDelMensaje() {
    const { normalized } = readTripMessage(mensaje);
    return {
      participants: normalized.participants,
      teachers: normalized.teachers,
      dateFrom: normalized.dateFrom || null,
      dateTo: normalized.dateTo || null,
      regimeRequested: normalized.regimeRequested || null,
      destinationText: normalized.destinationText || null,
    };
  }

  async function verQueCambia() {
    if (!mensaje.trim()) {
      setError("Pega el mensaje que te ha mandado el cliente.");
      return;
    }
    setError("");
    setOcupado("leyendo");
    try {
      setVista(await previewChangeApi(proposalId, datosDelMensaje()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo calcular el cambio.");
    } finally {
      setOcupado("");
    }
  }

  async function aplicar() {
    setError("");
    setOcupado("aplicando");
    try {
      const resultado = await applyChangeApi(proposalId, datosDelMensaje(), mensaje);
      setHecho({ version: resultado.versionNumber });
      onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aplicar el cambio.");
    } finally {
      setOcupado("");
    }
  }

  return (
    <div className="rv" role="dialog" aria-modal="true" aria-label="Cambio del cliente">
      <div className="rv__back" onClick={onClose} />
      <aside className="rv__panel">
        <header className="rv__head">
          <div>
            <p className="rv__k">Ha cambiado algo</p>
            <h2 className="rv__t">{tituloViaje}</h2>
          </div>
          <button type="button" className="cv__ghost cv__ghost--sm" onClick={onClose}>
            Cerrar
          </button>
        </header>

        <div className="rv__body">
          {hecho ? (
            <section className="rv__block">
              <div className="chg__ok">
                <strong>Aplicado · versión {hecho.version}</strong>
                <p>
                  La solicitud queda actualizada y hay una propuesta nueva con los precios
                  recalculados. La versión anterior se conserva tal como se envió.
                </p>
              </div>
            </section>
          ) : (
            <>
              <section className="rv__block">
                <h3 className="rv__bt">El mensaje del cliente</h3>
                <textarea
                  className="cv__composer"
                  rows={4}
                  value={mensaje}
                  onChange={(evento) => setMensaje(evento.target.value)}
                  placeholder="Buenos días, un cambio: al final seremos 52 alumnos…"
                />
                <div className="chg__acciones">
                  <button
                    type="button"
                    className="cv__primary cv__primary--sm"
                    onClick={verQueCambia}
                    disabled={ocupado !== ""}
                  >
                    {ocupado === "leyendo" ? "Leyendo…" : "Ver qué cambia"}
                  </button>
                </div>
              </section>

              {error ? (
                <div className="alert alert--error" role="alert">
                  {error}
                </div>
              ) : null}

              {vista && !vista.hayCambios ? (
                <p className="cv__empty">
                  Ese mensaje no cambia ninguno de los datos del viaje. Si aun así hay que tocar
                  algo, hazlo desde la ficha del viaje.
                </p>
              ) : null}

              {vista?.hayCambios ? (
                <>
                  <section className="rv__block">
                    <h3 className="rv__bt">Esto es lo que cambiaría</h3>
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
                        const sube =
                          opcion.precioAhora !== null &&
                          opcion.precioAntes !== null &&
                          opcion.precioAhora > opcion.precioAntes;
                        return (
                          <li key={opcion.optionNumber}>
                            <div className="chg__optt">
                              Opción {opcion.optionNumber} · {opcion.accommodationName}
                            </div>
                            {opcion.aviso ? (
                              <p className="chg__aviso">{opcion.aviso}</p>
                            ) : (
                              <p className="chg__precios">
                                <span className="chg__antes">{euros(opcion.precioAntes)}</span>
                                <span className="chg__flecha" aria-hidden="true">
                                  →
                                </span>
                                <strong className={sube ? "chg__sube" : "chg__baja"}>
                                  {euros(opcion.precioAhora)}
                                </strong>
                                <span className="chg__unidad">por alumno</span>
                                {opcion.totalAhora !== null ? (
                                  <span className="chg__total">
                                    total {euros(opcion.totalAntes)} → {euros(opcion.totalAhora)}
                                  </span>
                                ) : null}
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>

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
          <span className="cv__note">
            {hecho ? "Hay que enviar la versión nueva al colegio." : "Nada se ha tocado todavía."}
          </span>
          <div className="rv__footr">
            <button type="button" className="cv__ghost" onClick={onClose}>
              {hecho ? "Cerrar" : "Dejarlo como está"}
            </button>
            {!hecho ? (
              <button
                type="button"
                className={vista?.hayCambios ? "cv__send" : "cv__send cv__send--off"}
                onClick={aplicar}
                disabled={!vista?.hayCambios || ocupado !== ""}
              >
                {ocupado === "aplicando" ? "Aplicando…" : "Aplicar el cambio"}
              </button>
            ) : null}
          </div>
        </footer>
      </aside>
    </div>
  );
}
