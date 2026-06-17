import { useEffect, useMemo, useState } from "react";
import {
  fetchZohoDealStagesApi,
  listZohoOpportunitiesApi,
  updateZohoOpportunityApi,
  type ZohoDealSummary,
} from "../../services/apiClient";

/**
 * Módulo "Confirmar solicitud" como WORKSPACE (no popup):
 *  - Vista "list": 3 columnas → lista de tratos · detalle de la propuesta ·
 *    panel de acción (elegir opción, avanzar de fase, nota) siempre visible.
 *  - Vista "calendar": calendario con dos lecturas conmutables → "Viaje"
 *    (fechas de estancia) y "Gestión" (fechas de cierre).
 * Ambas comparten los mismos datos (tratos de Zoho) y la selección de trato.
 */

type View = "list" | "calendar";

function euro(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return `${Math.round(n).toLocaleString("es-ES")} €`;
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Extrae datos legibles + fechas reales de la Descripción del flujo "Planificar". */
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
  const fechas = get("Fechas");
  const dm = fechas.match(/(\d{4}-\d{2}-\d{2})\s*(?:→|-|a)\s*(\d{4}-\d{2}-\d{2})/);
  // Notas fechadas que añade updateZohoDeal: líneas tipo "[2026-06-17] texto".
  const notes: { date: string; text: string }[] = [];
  for (const line of description.split("\n")) {
    const m = line.match(/^\[(\d{4}-\d{2}-\d{2})\]\s*(.+)$/);
    if (m) notes.push({ date: m[1], text: m[2].trim() });
  }
  return {
    destino: get("Destino"),
    fechas,
    grupo: get("Grupo"),
    options,
    chosen: chosenMatch ? Number(chosenMatch[1]) : null,
    startDate: dm ? dm[1] : null,
    endDate: dm ? dm[2] : null,
    notes,
  };
}

/** Tono de badge por fase (incluye fases reales del pipeline del backend). */
function stageTone(stage: string): "info" | "warn" | "ok" | "lost" | "muted" {
  const s = norm(stage);
  if (!s) return "muted";
  if (/(ganad|finaliz|aprobad)/.test(s)) return "ok";
  if (/(perdid)/.test(s)) return "lost";
  if (/(enviad|seguimiento|deposit|pendiente|espera|analisis)/.test(s)) return "warn";
  if (/(nueva|preparand|qualif)/.test(s)) return "info";
  return "muted";
}

/** Pipeline canónico para la barra de progreso (orden comercial real). */
const PIPELINE = [
  "Preparando Presupuesto",
  "Presupuesto Enviado",
  "Seguimiento al Presupuesto",
  "Pendiente de depósito",
  "Oportunidad Ganada",
];

function stageStep(stage: string): number {
  const s = norm(stage);
  const idx = PIPELINE.findIndex((p) => norm(p) === s);
  if (idx >= 0) return idx;
  if (/preparand|nueva|qualif/.test(s)) return 0;
  if (/enviad/.test(s)) return 1;
  if (/seguimiento/.test(s)) return 2;
  if (/deposit|pendiente/.test(s)) return 3;
  if (/ganad|finaliz/.test(s)) return 4;
  return 0;
}

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ConfirmRequestsPanel({
  view = "list",
  onNavigate,
}: {
  view?: View;
  onNavigate?: (path: string) => void;
}) {
  const [deals, setDeals] = useState<ZohoDealSummary[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "closing" | "amount">("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  // Mantener una selección válida.
  useEffect(() => {
    if (loading) return;
    if (selectedId && deals.some((d) => d.id === selectedId)) return;
    setSelectedId(filtered[0]?.id ?? deals[0]?.id ?? null);
  }, [loading, filtered, deals, selectedId]);

  const kpis = useMemo(() => {
    let porConfirmar = 0;
    let enviado = 0;
    let ganadas = 0;
    let cartera = 0;
    for (const d of deals) {
      const s = norm(d.stage);
      const chosen = parseTrip(d.description).chosen;
      if (chosen == null && !/ganad|perdid|cerrad|finaliz/.test(s)) porConfirmar += 1;
      if (/enviad/.test(s)) enviado += 1;
      if (/ganad|finaliz/.test(s)) ganadas += 1;
      if (!/perdid|cerrad|finaliz/.test(s)) cartera += d.amount ?? 0;
    }
    return { porConfirmar, enviado, ganadas, cartera };
  }, [deals]);

  const selectedDeal = deals.find((d) => d.id === selectedId) ?? null;

  const handleSelectFromCalendar = (id: string) => {
    setSelectedId(id);
    onNavigate?.("/confirmar");
  };

  return (
    <div className="cw">
      <div className="cw__head">
        <div>
          <h2>Confirmar solicitud</h2>
          <p>
            {loading ? "Cargando tratos de Zoho…" : `${deals.length} tratos en el CRM`} · propuestas
            generadas y oportunidades del CRM.
          </p>
        </div>
        <div className="cw__head-actions">
          <div className="cw__viewtabs" role="tablist" aria-label="Vista">
            <button
              className={view === "list" ? "is" : ""}
              role="tab"
              aria-selected={view === "list"}
              onClick={() => onNavigate?.("/confirmar")}
            >
              Solicitudes
            </button>
            <button
              className={view === "calendar" ? "is" : ""}
              role="tab"
              aria-selected={view === "calendar"}
              onClick={() => onNavigate?.("/confirmar/calendario")}
            >
              Calendario
            </button>
          </div>
          <button className="cw__refresh" onClick={() => void load()} disabled={loading}>
            Actualizar
          </button>
        </div>
      </div>

      {error ? <div className="cf__alert cf__alert--error">{error}</div> : null}
      {info && !error ? <div className="cf__alert cf__alert--ok">{info}</div> : null}

      {view === "calendar" ? (
        <ConfirmCalendar deals={deals} loading={loading} onSelect={handleSelectFromCalendar} />
      ) : (
        <div className="cw__grid">
          {/* ===== Columna 1: lista ===== */}
          <div className="cw__col cw__col--list">
            <div className="cw-kpis">
              <Kpi n={kpis.porConfirmar} label="Por confirmar" dot="w" />
              <Kpi n={kpis.enviado} label="Presup. enviado" dot="i" />
              <Kpi n={kpis.ganadas} label="Ganadas" dot="ok" />
              <Kpi n={euro(kpis.cartera)} label="Cartera activa" dot="m" />
            </div>

            <div className="cw-list">
              <div className="cw-list__head">
                <div className="cf__search">
                  <input
                    placeholder="Buscar por nombre, cuenta o contacto…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <div className="cw-list__filters">
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
              </div>

              <div className="cw-feed">
                {loading ? (
                  <p className="cf__empty">Cargando…</p>
                ) : filtered.length === 0 ? (
                  <p className="cf__empty">
                    {deals.length === 0
                      ? "No hay tratos en el CRM todavía."
                      : "Ningún trato coincide con el filtro."}
                  </p>
                ) : (
                  filtered.map((d) => {
                    const trip = parseTrip(d.description);
                    const tone = stageTone(d.stage);
                    return (
                      <button
                        key={d.id}
                        className={`cw-deal ${selectedId === d.id ? "is" : ""}`}
                        onClick={() => setSelectedId(d.id)}
                      >
                        <div className="cw-deal__top">
                          <span className="cw-deal__name">{d.dealName || "(sin nombre)"}</span>
                          <span className="cw-deal__amt">{euro(d.amount)}</span>
                        </div>
                        <div className="cw-deal__sub">
                          <span className={`cf-stage cf-stage--${tone}`}>{d.stage || "—"}</span>
                          <span className="cw-deal__people">
                            {[d.accountName, d.contactName].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </div>
                        {trip.chosen ? (
                          <span className="cw-deal__chosen">✓ Opción {trip.chosen}</span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* ===== Columna 2: detalle ===== */}
          <div className="cw__col cw__col--detail">
            {selectedDeal ? (
              <DealDetail deal={selectedDeal} />
            ) : (
              <div className="cw-detail cw-detail--empty">
                <p className="cf__empty">Selecciona un trato de la lista para ver su propuesta.</p>
              </div>
            )}
          </div>

          {/* ===== Columna 3: acción ===== */}
          <div className="cw__col cw__col--rail">
            {selectedDeal ? (
              <ActionRail
                deal={selectedDeal}
                stages={stages}
                onSaved={(msg) => {
                  setInfo(msg);
                  void load();
                }}
                onError={(msg) => setError(msg)}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ n, label, dot }: { n: number | string; label: string; dot: "w" | "i" | "ok" | "m" }) {
  return (
    <div className="cw-kpi">
      <div className="cw-kpi__n">{n}</div>
      <div className="cw-kpi__l">
        <span className={`cw-dot cw-dot--${dot}`} />
        {label}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Detalle del trato (columna central)
// ─────────────────────────────────────────────────────────────────────────────

function DealDetail({ deal }: { deal: ZohoDealSummary }) {
  const trip = useMemo(() => parseTrip(deal.description), [deal.description]);
  const [tab, setTab] = useState<"resumen" | "propuesta" | "historial">("resumen");
  const tone = stageTone(deal.stage);

  useEffect(() => {
    setTab("resumen");
  }, [deal.id]);

  const events = useMemo(() => {
    const list: { when: string; what: string; muted?: boolean }[] = [];
    if (deal.createdTime) list.push({ when: deal.createdTime.slice(0, 10), what: "Trato creado en Zoho." });
    if (trip.chosen) list.push({ when: "—", what: `Opción ${trip.chosen} elegida por el cliente.` });
    for (const note of trip.notes) list.push({ when: note.date, what: note.text });
    if (deal.modifiedTime) {
      list.push({ when: deal.modifiedTime.slice(0, 10), what: `Última modificación · fase ${deal.stage || "—"}.` });
    }
    if (list.length === 0) list.push({ when: "—", what: "Sin actividad registrada todavía.", muted: true });
    return list;
  }, [deal, trip]);

  return (
    <div className="cw-detail">
      <div className="cw-detail__head">
        <div className="cw-detail__title-row">
          <div>
            <h3>{deal.dealName || "(sin nombre)"}</h3>
            <div className="cw-detail__sub">
              <span className={`cf-stage cf-stage--${tone}`}>{deal.stage || "—"}</span>
              {[deal.accountName, deal.contactName].filter(Boolean).join(" · ") || "Sin cuenta/contacto"}
            </div>
          </div>
          <div className="cw-detail__amt">
            <div className="n">{euro(deal.amount)}</div>
            <div className="l">{trip.chosen ? `Opción ${trip.chosen}` : "Importe estimado"}</div>
          </div>
        </div>
        <div className="cw-tabs">
          {(["resumen", "propuesta", "historial"] as const).map((t) => (
            <button key={t} className={tab === t ? "is" : ""} onClick={() => setTab(t)}>
              {t === "resumen" ? "Resumen" : t === "propuesta" ? "Propuesta" : "Historial"}
            </button>
          ))}
        </div>
      </div>

      <div className="cw-detail__body">
        {tab === "resumen" ? (
          <>
            <dl className="cw-meta">
              <div>
                <dt>Destino</dt>
                <dd>{trip.destino || "—"}</dd>
              </div>
              <div>
                <dt>Fechas</dt>
                <dd>{trip.fechas || "—"}</dd>
              </div>
              <div>
                <dt>Grupo</dt>
                <dd>{trip.grupo || "—"}</dd>
              </div>
              <div>
                <dt>Cierre</dt>
                <dd>{deal.closingDate || "—"}</dd>
              </div>
            </dl>

            {trip.options.length > 0 ? (
              <div>
                <div className="cw-sect-t">Opciones de la propuesta</div>
                <div className="cw-opts">
                  {trip.options.map((o) => (
                    <div key={o.n} className={`cw-opt ${trip.chosen === o.n ? "is" : ""}`}>
                      {trip.chosen === o.n ? <span className="cw-opt__star">✓</span> : null}
                      <div className="cw-opt__n">
                        Opción {o.n}
                        {trip.chosen === o.n ? " · elegida" : ""}
                      </div>
                      <div className="cw-opt__name">{o.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <div className="cw-sect-t">Actividad reciente</div>
              <div className="cw-timeline">
                {events.map((e, i) => (
                  <div key={i} className={`cw-tl ${e.muted ? "muted" : ""}`}>
                    <div className="when">{e.when}</div>
                    <div className="what">{e.what}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {tab === "propuesta" ? (
          deal.description ? (
            <pre className="cw-desc">{deal.description}</pre>
          ) : (
            <p className="cf__empty">Este trato no tiene detalle de propuesta.</p>
          )
        ) : null}

        {tab === "historial" ? (
          <div className="cw-timeline">
            {events.map((e, i) => (
              <div key={i} className={`cw-tl ${e.muted ? "muted" : ""}`}>
                <div className="when">{e.when}</div>
                <div className="what">{e.what}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel de acción (columna derecha)
// ─────────────────────────────────────────────────────────────────────────────

function ActionRail({
  deal,
  stages,
  onSaved,
  onError,
}: {
  deal: ZohoDealSummary;
  stages: string[];
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const trip = useMemo(() => parseTrip(deal.description), [deal.description]);
  const [chosenOption, setChosenOption] = useState<number | null>(trip.chosen);
  const [stage, setStage] = useState(deal.stage);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const step = stageStep(stage);

  // Reset al cambiar de trato.
  useEffect(() => {
    setChosenOption(trip.chosen);
    setStage(deal.stage);
    setNote("");
  }, [deal.id, trip.chosen, deal.stage]);

  const save = async () => {
    const payload: { stage?: string; chosenOption?: number | null; note?: string } = {};
    if (stage && stage !== deal.stage) payload.stage = stage;
    if (chosenOption != null && chosenOption !== trip.chosen) payload.chosenOption = chosenOption;
    if (note.trim()) payload.note = note.trim();
    if (Object.keys(payload).length === 0) {
      onError("No hay cambios que guardar (cambia la fase, la opción o añade una nota).");
      return;
    }
    setBusy(true);
    try {
      await updateZohoOpportunityApi(deal.id, payload);
      setNote("");
      onSaved(`Trato “${deal.dealName}” actualizado en Zoho.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo actualizar el trato.");
    } finally {
      setBusy(false);
    }
  };

  const optionCount = Math.max(trip.options.length, trip.chosen ?? 0);

  return (
    <>
      <div className="cw-hi">
        <div className="cw-hi__name">{deal.dealName || "(sin nombre)"}</div>
        <div className="cw-hi__meta">Pipeline comercial</div>
        <div className="cw-hi__big">
          {euro(deal.amount)}
          <small>{chosenOption ? `Opción ${chosenOption} elegida` : "Importe estimado"}</small>
        </div>
        <div className="cw-prog">
          {PIPELINE.map((_, i) => (
            <i key={i} className={i <= step ? "on" : ""} />
          ))}
        </div>
        <div className="cw-prog__l">
          <span>{PIPELINE[0]}</span>
          <span>{PIPELINE[PIPELINE.length - 1]}</span>
        </div>
      </div>

      <div className="cw-card">
        <h4>✔ Confirmar solicitud</h4>

        {optionCount > 0 ? (
          <div className="cw-field">
            <span>Opción elegida por el cliente</span>
            <div className="cw-seg">
              {Array.from({ length: optionCount }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  className={chosenOption === n ? "is" : ""}
                  onClick={() => setChosenOption(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="cw-field">
          <span>Avanzar de fase</span>
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
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

        <div className="cw-field">
          <span>Añadir nota (opcional)</span>
          <textarea
            rows={2}
            placeholder="Se añade con la fecha, sin borrar lo existente."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <button className="cw-btn cw-btn--p" onClick={() => void save()} disabled={busy}>
          {busy ? "Guardando…" : "Guardar confirmación"}
        </button>
        <a className="cw-btn cw-btn--g" href={deal.dealUrl} target="_blank" rel="noreferrer">
          Abrir en Zoho ↗
        </a>
        <div className="cw-hint">Los cambios se sincronizan con Zoho CRM.</div>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendario (dos lecturas: Viaje / Gestión)
// ─────────────────────────────────────────────────────────────────────────────

function ConfirmCalendar({
  deals,
  loading,
  onSelect,
}: {
  deals: ZohoDealSummary[];
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const [mode, setMode] = useState<"viaje" | "gestion">("viaje");
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  // Indexa los tratos por día según la lectura elegida.
  const byDay = useMemo(() => {
    const map = new Map<string, { id: string; name: string; tone: string; span?: "start" | "mid" | "end" | "one" }[]>();
    const push = (key: string, entry: { id: string; name: string; tone: string; span?: "start" | "mid" | "end" | "one" }) => {
      const arr = map.get(key) ?? [];
      arr.push(entry);
      map.set(key, arr);
    };
    for (const d of deals) {
      const trip = parseTrip(d.description);
      const tone = stageTone(d.stage);
      if (mode === "gestion") {
        if (d.closingDate) push(d.closingDate.slice(0, 10), { id: d.id, name: d.dealName, tone, span: "one" });
      } else {
        if (trip.startDate && trip.endDate) {
          const start = new Date(`${trip.startDate}T00:00:00`);
          const end = new Date(`${trip.endDate}T00:00:00`);
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
          for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
            const key = ymd(cur);
            const span =
              ymd(cur) === ymd(start) && ymd(cur) === ymd(end)
                ? "one"
                : ymd(cur) === ymd(start)
                  ? "start"
                  : ymd(cur) === ymd(end)
                    ? "end"
                    : "mid";
            push(key, { id: d.id, name: d.dealName, tone, span });
          }
        }
      }
    }
    return map;
  }, [deals, mode]);

  // Construye la rejilla del mes (semanas de lunes a domingo).
  const weeks = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startOffset = (first.getDay() + 6) % 7; // lunes = 0
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - startOffset);
    const out: Date[][] = [];
    const d = new Date(gridStart);
    for (let w = 0; w < 6; w++) {
      const row: Date[] = [];
      for (let i = 0; i < 7; i++) {
        row.push(new Date(d));
        d.setDate(d.getDate() + 1);
      }
      out.push(row);
    }
    return out;
  }, [cursor]);

  const monthDealsCount = useMemo(() => {
    const ids = new Set<string>();
    for (const row of weeks) {
      for (const day of row) {
        if (day.getMonth() !== cursor.getMonth()) continue;
        for (const e of byDay.get(ymd(day)) ?? []) ids.add(e.id);
      }
    }
    return ids.size;
  }, [weeks, byDay, cursor]);

  const todayKey = ymd(today);

  return (
    <div className="cw-cal">
      <div className="cw-cal__bar">
        <div className="cw-cal__nav">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Mes anterior">
            ‹
          </button>
          <strong>
            {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
          </strong>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Mes siguiente">
            ›
          </button>
          <button
            className="cw-cal__today"
            onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
          >
            Hoy
          </button>
        </div>
        <div className="cw-cal__right">
          <span className="cw-cal__count">
            {loading ? "Cargando…" : `${monthDealsCount} ${mode === "viaje" ? "viajes" : "cierres"} este mes`}
          </span>
          <div className="cw__viewtabs">
            <button className={mode === "viaje" ? "is" : ""} onClick={() => setMode("viaje")}>
              Viaje
            </button>
            <button className={mode === "gestion" ? "is" : ""} onClick={() => setMode("gestion")}>
              Gestión
            </button>
          </div>
        </div>
      </div>

      <p className="cw-cal__hint">
        {mode === "viaje"
          ? "Días de estancia de cada viaje (fechas de la propuesta)."
          : "Fechas de cierre de cada oportunidad (gestión comercial)."}
      </p>

      <div className="cw-cal__grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cw-cal__wd">
            {w}
          </div>
        ))}
        {weeks.map((row, wi) =>
          row.map((day, di) => {
            const key = ymd(day);
            const inMonth = day.getMonth() === cursor.getMonth();
            const entries = byDay.get(key) ?? [];
            return (
              <div
                key={`${wi}-${di}`}
                className={`cw-cal__cell ${inMonth ? "" : "out"} ${key === todayKey ? "today" : ""}`}
              >
                <div className="cw-cal__d">{day.getDate()}</div>
                <div className="cw-cal__events">
                  {entries.slice(0, 3).map((e, i) => (
                    <button
                      key={`${e.id}-${i}`}
                      className={`cw-ev cw-ev--${e.tone} ${e.span ? `cw-ev--${e.span}` : ""}`}
                      title={e.name}
                      onClick={() => onSelect(e.id)}
                    >
                      {e.span === "mid" || e.span === "end" ? " " : e.name}
                    </button>
                  ))}
                  {entries.length > 3 ? <span className="cw-ev__more">+{entries.length - 3}</span> : null}
                </div>
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
