import { useEffect, useMemo, useState } from "react";
import {
  fetchZohoDealStagesApi,
  listZohoOpportunitiesApi,
  updateZohoOpportunityApi,
  type ZohoDealSummary,
} from "../../services/apiClient";

/**
 * Panel "Confirmar solicitud": lista todos los tratos del CRM (Zoho Deals) como
 * tarjetas con buscador, filtro por fase y orden. Al abrir un trato se puede
 * confirmarlo: elegir la opción final, avanzar de fase y/o añadir una nota, sin
 * destruir el detalle de la propuesta (Descripción).
 */

function euro(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return `${Math.round(n).toLocaleString("es-ES")} €`;
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const CHOSEN_PREFIX = "▸ Opción elegida por el cliente:";

/** Extrae datos legibles de la Descripción que genera el flujo "Planificar". */
function parseTrip(description: string) {
  const get = (label: string) => {
    const m = description.match(new RegExp(`^${label}:\\s*(.+)$`, "im"));
    return m ? m[1].trim() : "";
  };
  const options: { n: number; name: string }[] = [];
  for (const line of description.split("\n")) {
    const m = line.match(/^(\d+)\)\s+(.+)$/);
    if (m) options.push({ n: Number(m[1]), name: m[2].trim() });
  }
  const chosenMatch = description.match(/Opción elegida por el cliente:\s*Opción\s*(\d+)/i);
  return {
    destino: get("Destino"),
    fechas: get("Fechas"),
    grupo: get("Grupo"),
    options,
    chosen: chosenMatch ? Number(chosenMatch[1]) : null,
  };
}

const STAGE_TONE: Record<string, string> = {
  Nueva: "info",
  "En análisis": "info",
  "Entregada al cliente": "warn",
  Seguimiento: "warn",
  Aprobada: "ok",
  Ganada: "ok",
  "Proyecto Finalizado": "ok",
  "Revisar a futuro": "muted",
};

export function ConfirmRequestsPanel() {
  const [deals, setDeals] = useState<ZohoDealSummary[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "closing" | "amount">("recent");

  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [list, st] = await Promise.all([
        listZohoOpportunitiesApi(),
        fetchZohoDealStagesApi().catch(() => ({ stages: [] })),
      ]);
      setDeals(list.deals);
      setStages(st.stages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los tratos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const stagesPresent = useMemo(
    () => [...new Set(deals.map((d) => d.stage).filter(Boolean))],
    [deals],
  );

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    let list = deals.filter((d) => {
      if (stageFilter && d.stage !== stageFilter) return false;
      if (q && !norm(`${d.dealName} ${d.accountName} ${d.contactName}`).includes(q)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortBy === "amount") return (b.amount ?? 0) - (a.amount ?? 0);
      if (sortBy === "closing") return (a.closingDate || "9999").localeCompare(b.closingDate || "9999");
      return (b.modifiedTime || "").localeCompare(a.modifiedTime || "");
    });
    return list;
  }, [deals, query, stageFilter, sortBy]);

  const openDeal = deals.find((d) => d.id === openId) ?? null;

  return (
    <div className="cf">
      <div className="cf__head">
        <div>
          <h2>Confirmar solicitud</h2>
          <p>
            {loading ? "Cargando tratos de Zoho…" : `${deals.length} tratos en el CRM`} · revisa,
            elige la opción final y avanza de fase.
          </p>
        </div>
        <button className="cf__refresh" onClick={() => void load()} disabled={loading}>
          Actualizar
        </button>
      </div>

      {error ? <div className="cf__alert cf__alert--error">{error}</div> : null}
      {info && !error ? <div className="cf__alert cf__alert--ok">{info}</div> : null}

      <div className="cf__tools">
        <div className="cf__search">
          <input
            placeholder="Buscar por nombre, cuenta o contacto…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          <option value="">Todas las fases</option>
          {(stages.length ? stages : stagesPresent).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
          <option value="recent">Recientes</option>
          <option value="closing">Cierre próximo</option>
          <option value="amount">Importe (mayor)</option>
        </select>
      </div>

      {loading ? (
        <p className="cf__empty">Cargando…</p>
      ) : filtered.length === 0 ? (
        <p className="cf__empty">
          {deals.length === 0
            ? "No hay tratos en el CRM todavía. Crea uno desde “Planificar solicitud”."
            : "Ningún trato coincide con el filtro."}
        </p>
      ) : (
        <div className="cf__grid">
          {filtered.map((d) => {
            const trip = parseTrip(d.description);
            const tone = STAGE_TONE[d.stage] ?? "muted";
            return (
              <article className="cf-card" key={d.id}>
                <div className="cf-card__top">
                  <span className={`cf-stage cf-stage--${tone}`}>{d.stage || "—"}</span>
                  <span className="cf-card__amount">{euro(d.amount)}</span>
                </div>
                <h3 className="cf-card__name">{d.dealName || "(sin nombre)"}</h3>
                <div className="cf-card__sub">
                  {[d.accountName, d.contactName].filter(Boolean).join(" · ") || "Sin cuenta/contacto"}
                </div>
                {trip.destino || trip.fechas || trip.grupo ? (
                  <div className="cf-card__trip">
                    {trip.destino ? <span>📍 {trip.destino}</span> : null}
                    {trip.fechas ? <span>🗓 {trip.fechas}</span> : null}
                    {trip.grupo ? <span>👥 {trip.grupo}</span> : null}
                  </div>
                ) : null}
                <div className="cf-card__foot">
                  {trip.chosen ? <span className="cf-card__chosen">✓ Opción {trip.chosen}</span> : <span />}
                  <div className="cf-card__actions">
                    <a className="cf-link" href={d.dealUrl} target="_blank" rel="noreferrer">
                      Zoho
                    </a>
                    <button className="cf-confirm" onClick={() => setOpenId(d.id)}>
                      Confirmar
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {openDeal ? (
        <ConfirmModal
          deal={openDeal}
          stages={stages}
          onClose={() => setOpenId(null)}
          onSaved={(msg) => {
            setOpenId(null);
            setInfo(msg);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function ConfirmModal({
  deal,
  stages,
  onClose,
  onSaved,
}: {
  deal: ZohoDealSummary;
  stages: string[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const trip = useMemo(() => parseTrip(deal.description), [deal.description]);
  const [chosenOption, setChosenOption] = useState<number | null>(trip.chosen);
  const [stage, setStage] = useState(deal.stage);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    setError("");
    const payload: { stage?: string; chosenOption?: number | null; note?: string } = {};
    if (stage && stage !== deal.stage) payload.stage = stage;
    if (chosenOption != null && chosenOption !== trip.chosen) payload.chosenOption = chosenOption;
    if (note.trim()) payload.note = note.trim();
    if (Object.keys(payload).length === 0) {
      setError("No hay cambios que guardar (cambia la fase, la opción o añade una nota).");
      return;
    }
    setBusy(true);
    try {
      await updateZohoOpportunityApi(deal.id, payload);
      onSaved(`Trato “${deal.dealName}” actualizado en Zoho.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el trato.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cf-ov" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="cf-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cf-modal__head">
          <div>
            <div className="cf-modal__title">{deal.dealName || "(sin nombre)"}</div>
            <div className="cf-modal__sub">
              {[deal.accountName, deal.contactName].filter(Boolean).join(" · ") || "Sin cuenta/contacto"}
            </div>
          </div>
          <button className="cf-modal__x" aria-label="Cerrar" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="cf-modal__body">
          {error ? <div className="cf__alert cf__alert--error">{error}</div> : null}

          <dl className="cf-meta">
            <div>
              <dt>Importe</dt>
              <dd>{euro(deal.amount)}</dd>
            </div>
            <div>
              <dt>Fase actual</dt>
              <dd>{deal.stage || "—"}</dd>
            </div>
            <div>
              <dt>Cierre</dt>
              <dd>{deal.closingDate || "—"}</dd>
            </div>
          </dl>

          {deal.description ? (
            <details className="cf-desc" open>
              <summary>Detalle de la propuesta</summary>
              <pre>{deal.description}</pre>
            </details>
          ) : (
            <p className="cf__empty">Este trato no tiene detalle de propuesta.</p>
          )}

          <div className="cf-form">
            {trip.options.length > 0 ? (
              <div className="cf-field">
                <span className="cf-field__l">Opción elegida por el cliente</span>
                <div className="cf-opts">
                  {trip.options.map((o) => (
                    <button
                      key={o.n}
                      className={`cf-opt ${chosenOption === o.n ? "is" : ""}`}
                      onClick={() => setChosenOption(o.n)}
                    >
                      <b>Opción {o.n}</b>
                      <span>{o.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="cf-field">
              <label className="cf-field__l" htmlFor="cf-stage">
                Avanzar de fase
              </label>
              <select id="cf-stage" value={stage} onChange={(e) => setStage(e.target.value)}>
                {!stages.includes(deal.stage) && deal.stage ? (
                  <option value={deal.stage}>{deal.stage} (actual)</option>
                ) : null}
                {stages.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="cf-field">
              <label className="cf-field__l" htmlFor="cf-note">
                Añadir nota (opcional)
              </label>
              <textarea
                id="cf-note"
                rows={2}
                placeholder="Se añade al detalle con la fecha, sin borrar lo existente."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="cf-modal__foot">
          <a className="cf-ghost" href={deal.dealUrl} target="_blank" rel="noreferrer">
            Abrir en Zoho
          </a>
          <button className="cf-save" onClick={() => void save()} disabled={busy}>
            {busy ? "Guardando…" : "Guardar confirmación"}
          </button>
        </div>
      </div>
    </div>
  );
}
