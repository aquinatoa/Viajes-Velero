import { useEffect, useMemo, useState } from "react";
import {
  listProposalDeliveriesApi,
  sendProposalDeliveryApi,
  type ProposalDelivery,
} from "../../services/apiClient";
import type { CurrentUser } from "../../domain/types";
import { ChangePanel } from "./ChangePanel";

/**
 * Mesa de propuestas — pantalla de inicio.
 *
 * Sustituye a la portada anterior, que explicaba lo que hacían los dos botones
 * y mostraba dos paneles vacíos. Aquí la unidad de trabajo es la PROPUESTA, no
 * el trato: qué se mandó, si lo han abierto, qué opción eligieron y cuánto
 * queda para el depósito. Eso es lo que Zoho no puede saber, porque el trato no
 * guarda qué tres opciones salieron ni cuándo.
 *
 * Se ordena por urgencia real, no por fecha de creación: primero lo que vence.
 */

export interface ProposalDeskProps {
  currentUser: CurrentUser;
  onNavigate: (path: string) => void;
  planRoute?: string;
  confirmRoute?: string;
}

/** Las cuatro situaciones en las que puede estar una propuesta. */
type Lane = "draft" | "waiting" | "accepted" | "closed";

function laneOf(delivery: ProposalDelivery): Lane {
  if (delivery.depositPaidAt) return "closed";
  if (delivery.chosenOptionNumber) return "accepted";
  if (delivery.status === "SENT" || delivery.status === "SIMULATED") return "waiting";
  return "draft";
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - Date.now()) / 86_400_000);
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const from = new Date(iso).getTime();
  if (Number.isNaN(from)) return null;
  return Math.floor((Date.now() - from) / 86_400_000);
}

/**
 * Nombre de la fila. Con solo el destino salían tres "Salou" seguidos sin poder
 * distinguirlos: hace falta el centro, que es lo que identifica el viaje.
 */
function tripTitleOf(delivery: ProposalDelivery): string {
  const request = delivery.proposal?.tripRequest;
  const centro = delivery.recipientName?.trim();
  const viaje = request?.opportunityName?.trim();
  const destino = request?.destinationText?.trim();

  if (viaje && destino && !viaje.toLowerCase().includes(destino.toLowerCase())) {
    return `${viaje} · ${destino}`;
  }
  if (viaje) return viaje;
  if (centro && destino) return `${centro} · ${destino}`;
  return destino || centro || "Viaje sin nombre";
}

/** Frase que explica por qué esta propuesta está donde está. */
function statusLine(delivery: ProposalDelivery): string {
  if (delivery.status === "FAILED") {
    return `No salió: ${delivery.failureReason ?? "el servidor de correo la rechazó"}`;
  }

  // Lo aceptado manda sobre cómo salió: si ya eligieron opción, contar eso.
  if (delivery.chosenOptionNumber) {
    const left = daysUntil(delivery.depositDueAt);
    if (delivery.depositPaidAt) return `Depósito cobrado, opción ${delivery.chosenOptionNumber}`;
    if (left === null) return `Aceptada la opción ${delivery.chosenOptionNumber}`;
    if (left < 0) return `El depósito venció hace ${Math.abs(left)} días`;
    return `Quedan ${left} días para el depósito`;
  }

  if (delivery.status === "DRAFT") return "Preparada, sin enviar";
  if (delivery.status === "SIMULATED") return "Preparada, pendiente de la clave del buzón";

  const sent = daysSince(delivery.sentAt);
  if (delivery.viewCount > 0) {
    return `Abierta ${delivery.viewCount} ${delivery.viewCount === 1 ? "vez" : "veces"}, sin respuesta`;
  }
  if (sent === null) return "Enviada";
  if (sent === 0) return "Enviada hoy";
  return `Enviada hace ${sent} ${sent === 1 ? "día" : "días"}, sin abrir`;
}

/**
 * Urgencia: cuanto más bajo, más arriba en la lista. Un depósito que vence
 * mañana pesa más que un presupuesto enviado ayer, y lo cobrado no corre prisa.
 */
function urgencyOf(delivery: ProposalDelivery): number {
  if (delivery.depositPaidAt) return 1000;
  if (delivery.status === "FAILED") return -100;
  if (delivery.chosenOptionNumber) return daysUntil(delivery.depositDueAt) ?? 500;
  if (delivery.status === "DRAFT" || delivery.status === "SIMULATED") return -50;
  const waiting = daysSince(delivery.sentAt) ?? 0;
  return 60 - waiting; // cuanto más lleva esperando, más sube
}


/** Días de plazo para el depósito, acordados con el cliente en junio. */
const PLAZO_DEPOSITO = 40;

/**
 * El plazo del depósito, visto. Un número suelto hay que leerlo; un anillo que
 * se vacía se entiende de un vistazo, que es lo que hace falta cuando tienes
 * catorce propuestas abiertas.
 */
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
        <circle
          className="ring__bar"
          cx="22"
          cy="22"
          r={radio}
          strokeDasharray={vuelta}
          strokeDashoffset={vuelta * (1 - parte)}
        />
      </svg>
      <span className="ring__txt" aria-hidden="true">
        <b>{Math.abs(dias)}</b>
        <small>{dias < 0 ? "pasados" : "días"}</small>
      </span>
    </span>
  );
}


/**
 * Qué toca hacer con esta propuesta, dicho en el botón.
 *
 * "Abrir" obliga a entrar para saber qué pasaba. Cada fila ya sabe en qué punto
 * está, así que el botón puede decirlo: enviar, hacer seguimiento, reclamar el
 * depósito. La mesa es el índice; Viajes, el taller.
 */
function accionDe(delivery: ProposalDelivery): { texto: string; envia: boolean } {
  if (delivery.status === "FAILED") return { texto: "Reintentar envío", envia: true };
  if (delivery.status === "DRAFT") return { texto: "Enviar propuesta", envia: true };
  if (delivery.depositPaidAt) return { texto: "Ver el viaje", envia: false };
  if (delivery.chosenOptionNumber) return { texto: "Reclamar depósito", envia: false };
  return { texto: "Hacer seguimiento", envia: false };
}

export function ProposalDesk({
  currentUser,
  onNavigate,
  planRoute = "/solicitudes/nueva",
  confirmRoute = "/viajes",
}: ProposalDeskProps) {
  const [deliveries, setDeliveries] = useState<ProposalDelivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);
  /** Propuesta sobre la que se está mirando un cambio del cliente. */
  const [cambiando, setCambiando] = useState<ProposalDelivery | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await listProposalDeliveriesApi();
      setDeliveries(result.deliveries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las propuestas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const lanes = useMemo(() => {
    const counters: Record<Lane, number> = { draft: 0, waiting: 0, accepted: 0, closed: 0 };
    for (const delivery of deliveries) counters[laneOf(delivery)] += 1;
    return counters;
  }, [deliveries]);

  const sorted = useMemo(
    () => [...deliveries].sort((a, b) => urgencyOf(a) - urgencyOf(b)),
    [deliveries],
  );

  const openDeliveries = sorted.filter((delivery) => laneOf(delivery) !== "closed");

  async function handleSend(delivery: ProposalDelivery) {
    setSendingId(delivery.id);
    try {
      await sendProposalDeliveryApi(delivery.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar la propuesta.");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div className="desk">
      <header className="desk__top">
        <div>
          <h1 className="desk__title">Tus propuestas</h1>
          <p className="desk__sub">
            {currentUser.name ? `${currentUser.name} · ` : ""}
            {openDeliveries.length === 0
              ? "Nada pendiente ahora mismo"
              : `${openDeliveries.length} ${openDeliveries.length === 1 ? "propuesta" : "propuestas"} en marcha`}
          </p>
        </div>
        <div className="desk__actions">
          <button type="button" className="desk__ghost" onClick={() => onNavigate(confirmRoute)}>
            Ver los viajes
          </button>

        </div>
      </header>

      <div className="desk__lanes">
        <Lane label="Sin enviar" value={lanes.draft} />
        <Lane label="Esperando respuesta" value={lanes.waiting} highlight />
        <Lane label="Aceptadas, sin depósito" value={lanes.accepted} />
        <Lane label="Cerradas" value={lanes.closed} />
      </div>

      {error ? (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="desk__card">
        <header className="desk__cardhead">
          <h2>Lo que está en juego</h2>
          <span className="desk__hint">Ordenado por lo que corre más prisa</span>
        </header>

        {loading ? (
          <ul className="desk__skeleton" aria-hidden="true">
            {[0, 1, 2].map((n) => (
              <li key={n} />
            ))}
          </ul>
        ) : openDeliveries.length === 0 ? (
          <div className="desk__empty">
            <p>Todavía no has enviado ninguna propuesta.</p>
            <p className="desk__emptyhint">
              Cuando termines de planificar un viaje y lo envíes al colegio, aparecerá aquí con su
              referencia y el plazo del depósito.
            </p>
            <button type="button" className="desk__primary" onClick={() => onNavigate(planRoute)}>
              Crear la primera
            </button>
          </div>
        ) : (
          <ul className="desk__list">
            {openDeliveries.map((delivery) => {
              const lane = laneOf(delivery);
              const left = daysUntil(delivery.depositDueAt);
              const urgent = lane === "accepted" && left !== null && left <= 7;
              return (
                <li className="desk__row" key={delivery.id}>
                  <span
                    className={`desk__flag desk__flag--${
                      delivery.status === "FAILED" || urgent ? "now" : lane === "accepted" ? "soon" : "calm"
                    }`}
                    aria-hidden="true"
                  />
                  <div className="desk__main">
                    <div className="desk__name">{tripTitleOf(delivery)}</div>
                    <div className="desk__why">{statusLine(delivery)}</div>
                  </div>
                  <span className="desk__ref">{delivery.reference}</span>
                  {lane === "accepted" && left !== null ? <AnilloDeposito dias={left} /> : null}
                  {delivery.department ? (
                    <span className={`desk__dept desk__dept--${delivery.department.toLowerCase()}`}>
                      {delivery.department === "SPORTS" ? "Sports" : "Groups"}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="desk__rowlink"
                    onClick={() => setCambiando(delivery)}
                    title="El cliente ha cambiado algo"
                  >
                    Ha cambiado algo
                  </button>
                  {(() => {
                    const accion = accionDe(delivery);
                    return (
                      <button
                        type="button"
                        className={urgent ? "desk__rowbtn desk__rowbtn--now" : "desk__rowbtn"}
                        onClick={() =>
                          accion.envia
                            ? handleSend(delivery)
                            : // Se abre Viajes ya filtrado por este viaje: sin buscarlo a mano.
                              onNavigate(`${confirmRoute}?buscar=${encodeURIComponent(tripTitleOf(delivery))}`)
                        }
                        disabled={sendingId === delivery.id}
                      >
                        {sendingId === delivery.id ? "Enviando…" : accion.texto}
                      </button>
                    );
                  })()}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {cambiando?.proposalId ? (
        <ChangePanel
          proposalId={cambiando.proposalId}
          tituloViaje={tripTitleOf(cambiando)}
          onClose={() => setCambiando(null)}
          onApplied={() => void load()}
        />
      ) : null}
    </div>
  );
}

function Lane({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`desk__lane${highlight ? " desk__lane--live" : ""}`}>
      <span className="desk__lanen">{value}</span>
      <span className="desk__lanel">{label}</span>
    </div>
  );
}
