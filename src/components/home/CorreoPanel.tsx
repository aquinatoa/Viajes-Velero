import { useEffect, useRef, useState } from "react";
import {
  escribirAlContactoApi,
  hiloDelExpedienteApi,
  type MensajeDeCorreo,
  type ProposalDelivery,
} from "../../services/apiClient";

/**
 * La conversación con el colegio, dentro de su propuesta. Piezas C4 y C5.
 *
 * Es lo que pidió Ruth el 17/06: «¿tendríamos que verla por el mail sí o sí?
 * La aplicación no te puede decir, cling, tienes aquí un mensaje de esta
 * oportunidad». Y después: «que ponga enviar email al contacto».
 *
 * Existe porque Zoho no puede hacerlo. Solo vincula un correo por cuenta y solo
 * si sale por IMAP, así que Oravia tuvo que poner a todos sus gestores bajo un
 * único usuario, y aun así los correos se cuelgan de la oportunidad
 * equivocada.
 */

export interface CorreoPanelProps {
  delivery: ProposalDelivery;
  titulo: string;
  onClose: () => void;
}

/** «hoy 09:14», «ayer», «12 sept» — para leer el hilo sin descifrar fechas. */
function cuando(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";

  const hora = fecha.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const dias = Math.floor((Date.now() - fecha.getTime()) / 86_400_000);
  if (dias === 0) return `hoy ${hora}`;
  if (dias === 1) return `ayer ${hora}`;
  return `${fecha.toLocaleDateString("es-ES", { day: "numeric", month: "short" })} · ${hora}`;
}

/** Cómo se supo de qué viaje era este correo. Solo en los que entran. */
function comoSeSupo(mensaje: MensajeDeCorreo): string | null {
  if (mensaje.direccion !== "ENTRANTE") return null;
  if (mensaje.emparejadoPor === "MESSAGE_ID") return "Reconocido por el hilo";
  if (mensaje.emparejadoPor === "ASUNTO") return "Reconocido por la referencia";
  if (mensaje.emparejadoPor === "REMITENTE") return "Reconocido por el remitente";
  return "Asignado a mano";
}

export function CorreoPanel({ delivery, titulo, onClose }: CorreoPanelProps) {
  const [mensajes, setMensajes] = useState<MensajeDeCorreo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const finDelHilo = useRef<HTMLDivElement | null>(null);

  async function cargar(bajarAlFinal = false) {
    try {
      const { mensajes: lista } = await hiloDelExpedienteApi(delivery.id);
      setMensajes(lista);
      if (bajarAlFinal) {
        // Tras escribir, lo que interesa es lo último, no lo primero.
        window.requestAnimationFrame(() =>
          finDelHilo.current?.scrollIntoView({ behavior: "smooth", block: "end" }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la conversación.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
    // Solo al abrir: el hilo no cambia mientras se mira, y recargarlo cada
    // pocos segundos movería el texto que se está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery.id]);

  async function enviar() {
    const cuerpo = texto.trim();
    if (!cuerpo) return;

    setEnviando(true);
    setError("");
    setAviso("");
    try {
      const r = await escribirAlContactoApi(delivery.id, cuerpo);
      setTexto("");
      setAviso(
        r.simulado
          ? "Anotado en la conversación, pero NO ha salido: falta la clave del buzón."
          : `Enviado a ${delivery.recipientEmail}.`,
      );
      await cargar(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el mensaje.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rv" role="dialog" aria-modal="true" aria-label="Conversación con el colegio">
      <div className="rv__back" onClick={onClose} />
      <aside className="rv__panel">
        <header className="rv__head">
          <div>
            <p className="rv__k">La conversación · {delivery.reference}</p>
            <h2 className="rv__t">{titulo}</h2>
          </div>
          <button type="button" className="cv__ghost cv__ghost--sm" onClick={onClose}>
            Cerrar
          </button>
        </header>

        <div className="rv__body">
          {cargando ? (
            <p className="cv__empty">Cargando la conversación…</p>
          ) : mensajes.length === 0 ? (
            <div className="cv__empty">
              <p>Todavía no hay nada en esta conversación.</p>
              <p>
                Cuando se envíe la propuesta aparecerá aquí, y con ella las respuestas del colegio.
              </p>
            </div>
          ) : (
            <ul className="hilo">
              {mensajes.map((m) => {
                const nuestro = m.direccion === "SALIENTE";
                const origen = comoSeSupo(m);
                return (
                  <li key={m.id} className={nuestro ? "hilo__m hilo__m--nuestro" : "hilo__m"}>
                    <div className="hilo__cab">
                      <span className="hilo__quien">{nuestro ? "Nosotros" : m.de}</span>
                      <span className="hilo__cuando">{cuando(m.fecha)}</span>
                    </div>
                    <div className="hilo__asunto">{m.asunto}</div>
                    <div className="hilo__cuerpo">{m.cuerpo}</div>
                    {origen ? <div className="hilo__origen">{origen}</div> : null}
                  </li>
                );
              })}
              <div ref={finDelHilo} />
            </ul>
          )}

          {error ? (
            <div className="alert alert--error" role="alert">
              {error}
            </div>
          ) : null}
          {aviso ? (
            <div className="alert alert--ok" role="status">
              {aviso}
            </div>
          ) : null}
        </div>

        <footer className="rv__foot hilo__pie">
          <label className="hilo__escribir">
            <span className="sr-only">Escribir al colegio</span>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={`Escribir a ${delivery.recipientName ?? delivery.recipientEmail}…`}
              rows={3}
              disabled={enviando}
            />
          </label>
          <button
            type="button"
            className="cv__primary cv__primary--sm"
            onClick={() => void enviar()}
            disabled={enviando || !texto.trim()}
          >
            {enviando ? "Enviando…" : "Enviar"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
