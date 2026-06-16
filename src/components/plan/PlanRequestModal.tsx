import { useEffect, useMemo, useState } from "react";
import {
  buildProposal,
  findCandidateOpportunities,
  logCrmSyncAttempt,
  parseTripRequest,
  prepareNewOpportunityPayload,
  saveNormalizedTripRequest,
  upsertClientFromRequest,
  validateTripRequest,
} from "../../services/mcpTools";
import {
  ApiAuthError,
  createZohoOpportunityApi,
  fetchZohoAuthUrlApi,
  searchAccommodationsApi,
  searchActivitiesApi,
} from "../../services/apiClient";
import type {
  Client,
  CrmPayload,
  FindCandidateOpportunitiesResult,
  ParseTripRequestInput,
  ParseTripRequestResult,
  ProposalBuilderState,
  SearchAccommodationsResult,
  SearchActivitiesResult,
  TripProposal,
  TripRequest,
  ValidateTripRequestResult,
} from "../../domain/types";

/**
 * Popup "Planificar solicitud" (slide 1) — flujo completo en 4 pasos con la
 * estética premium de reservas, adaptada al dominio de viajes escolares.
 *
 *   1. Solicitud      → mensaje(s) del cliente (chat) + datos del cliente → Normalizar
 *   2. Datos del viaje→ revisión/corrección de lo que extrajo el parser
 *   3. Alojamientos   → búsqueda real de inventario + elegir hasta 3 + actividades
 *   4. Enviar a CRM   → resumen de propuesta y creación del trato en Zoho
 *
 * Estado propio y autocontenido: llama a los MISMOS servicios que la página
 * /nuevo-registro (no duplica lógica de negocio ni toca backend). El día que el
 * usuario venga de Zoho, la auditoría ya se asocia al usuario autenticado.
 */

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: { n: Step; label: string }[] = [
  { n: 1, label: "Solicitud" },
  { n: 2, label: "Datos del viaje" },
  { n: 3, label: "Alojamientos" },
  { n: 4, label: "Enviar a CRM" },
];

const EMPTY_FORM: ParseTripRequestInput = {
  clientType: "new",
  email: "",
  firstName: "",
  lastName: "",
  opportunityName: "",
  rawTripRequestText: "",
};

const EMPTY_BUILDER: ProposalBuilderState = {
  selectedAccommodationIds: [],
  activitiesByOption: { 1: [], 2: [], 3: [] },
};

const EXAMPLE_MESSAGE =
  "Hola, somos un colegio de Madrid y necesitamos una propuesta para 42 estudiantes y 4 profesores en Salou, del 2026-05-11 al 2026-05-15. Buscamos media pensión y actividades para alumnos de 14-17 años.";

export interface PlanRequestModalProps {
  open: boolean;
  onClose: () => void;
  /** Se llama cuando se crea el trato en CRM (para refrescar la portada si hace falta). */
  onCompleted?: () => void;
}

function euro(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value).toLocaleString("es-ES")} €`;
}

export function PlanRequestModal({ open, onClose, onCompleted }: PlanRequestModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Paso 1 — mensaje(s) del cliente + datos del cliente
  const [messages, setMessages] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [form, setForm] = useState<ParseTripRequestInput>(EMPTY_FORM);

  // Paso 2 — normalización
  // Bebés: contador del configurador de grupo. Se guarda y se muestra, pero NO se
  // envía aún a búsqueda/CRM (el modelo usa participantes/profesores). Se conectará
  // cuando se necesite.
  const [babies, setBabies] = useState(0);
  const [client, setClient] = useState<Client | null>(null);
  const [parseResult, setParseResult] = useState<ParseTripRequestResult | null>(null);
  const [validation, setValidation] = useState<ValidateTripRequestResult | null>(null);
  const [candidate, setCandidate] = useState<FindCandidateOpportunitiesResult | null>(null);
  const [savedRequest, setSavedRequest] = useState<TripRequest | null>(null);

  // Paso 3 — búsqueda + selección
  const [accommodationSearch, setAccommodationSearch] = useState<SearchAccommodationsResult | null>(null);
  const [activitySearch, setActivitySearch] = useState<SearchActivitiesResult | null>(null);
  const [builder, setBuilder] = useState<ProposalBuilderState>(EMPTY_BUILDER);

  // Paso 4 — propuesta + CRM
  const [proposal, setProposal] = useState<TripProposal | null>(null);
  const [crmPayload, setCrmPayload] = useState<CrmPayload | null>(null);
  const [createdDealId, setCreatedDealId] = useState<string | null>(null);

  const rawText = useMemo(
    () => [...messages, draft].map((m) => m.trim()).filter(Boolean).join("\n\n"),
    [messages, draft],
  );

  // Reset completo al abrir.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setBusy(false);
    setError("");
    setInfo("");
    setMessages([]);
    setDraft("");
    setForm(EMPTY_FORM);
    setBabies(0);
    setClient(null);
    setParseResult(null);
    setValidation(null);
    setCandidate(null);
    setSavedRequest(null);
    setAccommodationSearch(null);
    setActivitySearch(null);
    setBuilder(EMPTY_BUILDER);
    setProposal(null);
    setCrmPayload(null);
    setCreatedDealId(null);
  }, [open]);

  // Escape para cerrar el modal — pero si hay un popover abierto (calendario o
  // configurador de grupo), Escape lo cierra a él primero, no al modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector(".pm-cal, .pm-group-pop")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleApiError = async (err: unknown, fallback: string) => {
    setInfo("");
    if (err instanceof ApiAuthError) {
      const authUrl = err.authUrl ?? (await fetchZohoAuthUrlApi().catch(() => ""));
      setError("La sesión de Zoho ha caducado. Te redirigimos para autenticar de nuevo.");
      if (authUrl) {
        window.location.href = authUrl;
        return;
      }
    }
    setError(err instanceof Error ? err.message : fallback);
  };

  const addMessage = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [...prev, text]);
    setDraft("");
  };

  const removeMessage = (index: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== index));
  };

  // Paso 1 → 2
  const handleNormalize = async () => {
    setError("");
    setInfo("");
    const input: ParseTripRequestInput = { ...form, rawTripRequestText: rawText };
    if (rawText.trim().length < 20) {
      setError("Añade el mensaje del cliente (al menos una frase) para poder normalizar.");
      return;
    }
    setBusy(true);
    try {
      const parsed = parseTripRequest(input);
      const nextValidation = validateTripRequest({
        clientType: input.clientType,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        normalized: parsed.normalized,
      });
      const nextClient = await upsertClientFromRequest(input);
      const opportunities = await findCandidateOpportunities(nextClient, parsed.normalized);

      setForm(input);
      setClient(nextClient);
      setParseResult(parsed);
      setValidation(nextValidation);
      setCandidate(opportunities);
      setStep(2);
      setInfo(
        parsed.missingFields.length > 0
          ? "Normalizado con campos por revisar."
          : "Solicitud normalizada.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo normalizar la solicitud.");
    } finally {
      setBusy(false);
    }
  };

  const updateNormalized = <K extends keyof ParseTripRequestResult["normalized"]>(
    field: K,
    value: ParseTripRequestResult["normalized"][K],
  ) => {
    setParseResult((current) => {
      if (!current) return current;
      const next = { ...current, normalized: { ...current.normalized, [field]: value } };
      setValidation(
        validateTripRequest({
          clientType: form.clientType,
          email: form.email,
          firstName: form.firstName,
          lastName: form.lastName,
          normalized: next.normalized,
        }),
      );
      return next;
    });
  };

  // Paso 2 → 3
  const handleSearch = async () => {
    if (!client || !parseResult) return;
    setError("");
    setInfo("");
    const nextValidation = validateTripRequest({
      clientType: form.clientType,
      email: form.email,
      firstName: form.firstName,
      lastName: form.lastName,
      normalized: parseResult.normalized,
    });
    setValidation(nextValidation);
    if (!nextValidation.isValid) {
      setError("Faltan datos críticos. Corrígelos antes de buscar alojamientos.");
      return;
    }
    setBusy(true);
    try {
      const saved = await saveNormalizedTripRequest(client.id, form, {
        ...parseResult,
        requestStatus: "READY_FOR_SEARCH",
      });
      const filters = {
        destinationText: parseResult.normalized.destinationText,
        destinationCountry: parseResult.normalized.destinationCountry,
        boardType: parseResult.normalized.regimeRequested,
        categoryRequested: parseResult.normalized.categoryRequested,
        dateFrom: parseResult.normalized.dateFrom,
        dateTo: parseResult.normalized.dateTo,
        participants: parseResult.normalized.participants,
        teachers: parseResult.normalized.teachers,
        ageRangeText: parseResult.normalized.ageRangeText,
        averageAgeText: parseResult.normalized.averageAgeText,
      };
      const [acc, act] = await Promise.all([
        searchAccommodationsApi(filters),
        searchActivitiesApi(filters),
      ]);
      setSavedRequest(saved);
      setAccommodationSearch(acc);
      setActivitySearch(act);
      setBuilder(EMPTY_BUILDER);
      setStep(3);
      setInfo(`${acc.matches.length} alojamientos y ${act.matches.length} actividades.`);
    } catch (err) {
      await handleApiError(err, "No se pudo guardar y buscar inventario.");
    } finally {
      setBusy(false);
    }
  };

  const toggleAccommodation = (id: string) => {
    setError("");
    setBuilder((current) => {
      const selected = current.selectedAccommodationIds.includes(id);
      if (selected) {
        return {
          ...current,
          selectedAccommodationIds: current.selectedAccommodationIds.filter((x) => x !== id),
        };
      }
      if (current.selectedAccommodationIds.length >= 3) {
        setError("Solo puedes seleccionar hasta 3 alojamientos.");
        return current;
      }
      return { ...current, selectedAccommodationIds: [...current.selectedAccommodationIds, id] };
    });
  };

  const optionForAccommodation = (id: string): number | null => {
    const idx = builder.selectedAccommodationIds.indexOf(id);
    return idx === -1 ? null : idx + 1;
  };

  const toggleActivity = (optionNumber: number, activityId: string) => {
    setBuilder((current) => {
      const list = current.activitiesByOption[optionNumber] ?? [];
      const active = list.includes(activityId);
      return {
        ...current,
        activitiesByOption: {
          ...current.activitiesByOption,
          [optionNumber]: active ? list.filter((x) => x !== activityId) : [...list, activityId],
        },
      };
    });
  };

  // Paso 3 → 4
  const handleBuildProposal = async () => {
    if (!savedRequest || !parseResult || !accommodationSearch || !activitySearch) return;
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const next = await buildProposal({
        tripRequestId: savedRequest.id,
        normalized: parseResult.normalized,
        accommodationMatches: accommodationSearch.matches,
        activityMatches: activitySearch.matches,
        builderState: builder,
      });
      setProposal(next);
      setStep(4);
      setInfo(`Propuesta con ${next.accommodationOptions.length} opciones.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo construir la propuesta.");
    } finally {
      setBusy(false);
    }
  };

  // Paso 4 — CRM
  const handleSendToCrm = async () => {
    if (!proposal || !parseResult || !client) return;
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const payload = prepareNewOpportunityPayload({
        client,
        request: parseResult.normalized,
        proposal,
        opportunityRecommendation: candidate ?? undefined,
      });
      const created = await createZohoOpportunityApi({
        contact: payload.contact as {
          email: string;
          first_name: string;
          last_name: string;
          full_name: string;
        },
        account: payload.account as { crm_account_id?: string | null },
        opportunity: payload.opportunity as Record<string, unknown>,
        proposalOptions: payload.activities,
      });
      logCrmSyncAttempt(payload);
      setCrmPayload(payload);
      setCreatedDealId(created.dealId);
      setInfo("Trato creado en Zoho CRM con las opciones.");
      onCompleted?.();
    } catch (err) {
      await handleApiError(err, "No se pudo crear el trato en Zoho.");
    } finally {
      setBusy(false);
    }
  };

  const norm = parseResult?.normalized;
  const groupText = norm
    ? `${norm.participants ?? "—"} alumnos${norm.teachers ? ` · ${norm.teachers} prof.` : ""}`
    : "";

  return (
    <div className="pm-overlay" role="dialog" aria-modal="true" aria-label="Planificar solicitud" onMouseDown={onClose}>
      <div className="pm-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pm-head">
          <div className="pm-head__top">
            <div>
              <div className="pm-title">Planificar solicitud</div>
              <div className="pm-sub">
                {form.opportunityName?.trim() || "Nueva solicitud de viaje escolar"}
              </div>
            </div>
            <button className="pm-close" aria-label="Cerrar" onClick={onClose}>
              <Icon.Close />
            </button>
          </div>
          <div className="pm-steps">
            {STEP_LABELS.map(({ n, label }) => (
              <div
                key={n}
                className={`pm-step ${step === n ? "is-active" : ""} ${step > n ? "is-done" : ""}`}
              >
                <b>{step > n ? "✓" : n}</b>
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="pm-body">
          {error ? <div className="pm-alert pm-alert--error">{error}</div> : null}
          {info && !error ? <div className="pm-alert pm-alert--ok">{info}</div> : null}

          {step === 1 ? (
            <StepSolicitud
              messages={messages}
              draft={draft}
              form={form}
              onDraft={setDraft}
              onAdd={addMessage}
              onRemove={removeMessage}
              onForm={setForm}
            />
          ) : null}

          {step === 2 && parseResult ? (
            <StepDatos
              parseResult={parseResult}
              validation={validation}
              candidate={candidate}
              onChange={updateNormalized}
              babies={babies}
              onBabies={setBabies}
            />
          ) : null}

          {step === 3 ? (
            <StepAlojamientos
              norm={norm}
              groupText={groupText}
              accommodationSearch={accommodationSearch}
              activitySearch={activitySearch}
              builder={builder}
              optionForAccommodation={optionForAccommodation}
              onToggleAccommodation={toggleAccommodation}
              onToggleActivity={toggleActivity}
              onEdit={() => setStep(2)}
            />
          ) : null}

          {step === 4 && proposal ? (
            <StepCrm proposal={proposal} createdDealId={createdDealId} crmPayload={crmPayload} />
          ) : null}
        </div>

        <div className="pm-foot">
          {step === 1 ? (
            <button className="pm-ghost" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
          ) : (
            <button className="pm-ghost" onClick={() => setStep((s) => (s - 1) as Step)} disabled={busy}>
              <Icon.ArrowLeft /> Atrás
            </button>
          )}

          {step === 1 ? (
            <button className="pm-primary" onClick={handleNormalize} disabled={busy}>
              {busy ? "Normalizando…" : "Normalizar solicitud"} <Icon.ArrowRight />
            </button>
          ) : null}
          {step === 2 ? (
            <button className="pm-primary" onClick={handleSearch} disabled={busy}>
              {busy ? "Buscando…" : "Buscar alojamientos"} <Icon.ArrowRight />
            </button>
          ) : null}
          {step === 3 ? (
            <button
              className="pm-primary"
              onClick={handleBuildProposal}
              disabled={busy || builder.selectedAccommodationIds.length === 0}
            >
              {busy ? "Construyendo…" : "Construir propuesta"} <Icon.ArrowRight />
            </button>
          ) : null}
          {step === 4 ? (
            createdDealId ? (
              <button className="pm-primary" onClick={onClose}>
                Cerrar
              </button>
            ) : (
              <button className="pm-primary" onClick={handleSendToCrm} disabled={busy}>
                {busy ? "Enviando…" : "Enviar a CRM"} <Icon.ArrowRight />
              </button>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── Paso 1: Solicitud (chat del cliente + datos) ──────────────────────────── */

function StepSolicitud({
  messages,
  draft,
  form,
  onDraft,
  onAdd,
  onRemove,
  onForm,
}: {
  messages: string[];
  draft: string;
  form: ParseTripRequestInput;
  onDraft: (v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onForm: (updater: (f: ParseTripRequestInput) => ParseTripRequestInput) => void;
}) {
  return (
    <div className="pm-grid-2">
      <div className="pm-chat">
        <div className="pm-chat__h">
          <span className="pm-chat__av">
            <Icon.Chat />
          </span>
          <div>
            <div className="pm-chat__t">Mensaje del cliente</div>
            <div className="pm-chat__s">Pega aquí lo que te ha compartido — normalizamos el resto</div>
          </div>
        </div>
        <div className="pm-thread">
          {messages.length === 0 ? (
            <p className="pm-thread__empty">
              Aún no hay mensajes. Pega abajo el email, WhatsApp o nota del cliente.
            </p>
          ) : (
            messages.map((m, i) => (
              <div className="pm-bubble" key={i}>
                <button
                  className="pm-bubble__x"
                  aria-label="Quitar mensaje"
                  onClick={() => onRemove(i)}
                >
                  <Icon.Close />
                </button>
                {m}
              </div>
            ))
          )}
        </div>
        <div className="pm-composer">
          <textarea
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            placeholder="Añade o pega un mensaje, email o nota del cliente…"
            rows={2}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onAdd();
            }}
          />
          <button className="pm-composer__add" aria-label="Añadir mensaje" onClick={onAdd}>
            <Icon.Plus />
          </button>
        </div>
      </div>

      <div className="pm-side">
        <div className="pm-panel">
          <h3 className="pm-panel__h">Datos del cliente</h3>
          <div className="pm-frm">
            <label className="pm-fld">
              <span>Tipo de cliente</span>
              <select
                value={form.clientType}
                onChange={(e) =>
                  onForm((f) => ({ ...f, clientType: e.target.value as ParseTripRequestInput["clientType"] }))
                }
              >
                <option value="new">Nuevo</option>
                <option value="existing">Existente</option>
              </select>
            </label>
            <label className="pm-fld">
              <span>Email</span>
              <input
                value={form.email}
                onChange={(e) => onForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="coordinacion@colegio.es"
              />
            </label>
            <div className="pm-row">
              <label className="pm-fld">
                <span>Nombre</span>
                <input
                  value={form.firstName}
                  onChange={(e) => onForm((f) => ({ ...f, firstName: e.target.value }))}
                  placeholder="Javier"
                />
              </label>
              <label className="pm-fld">
                <span>Apellidos</span>
                <input
                  value={form.lastName}
                  onChange={(e) => onForm((f) => ({ ...f, lastName: e.target.value }))}
                  placeholder="Martínez"
                />
              </label>
            </div>
            <label className="pm-fld">
              <span>Nombre de la oportunidad (opcional)</span>
              <input
                value={form.opportunityName}
                onChange={(e) => onForm((f) => ({ ...f, opportunityName: e.target.value }))}
                placeholder="Viaje fin de curso 2026"
              />
            </label>
          </div>
        </div>

        <div className="pm-extract">
          <h3>
            <Icon.Sparkles /> Qué normalizaremos del mensaje
          </h3>
          <p>Al pulsar Normalizar, extraemos automáticamente del texto:</p>
          <div className="pm-echips">
            {["Destino", "Fechas", "Nº de alumnos", "Profesores", "Edad de los niños", "Régimen", "Categoría"].map(
              (chip) => (
                <span className="pm-echip" key={chip}>
                  {chip}
                </span>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Paso 2: Datos del viaje (revisión de lo normalizado) ──────────────────── */

const SHORT_MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];

function formatDateShort(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${Number(m[3])} ${SHORT_MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

function StepDatos({
  parseResult,
  validation,
  candidate,
  onChange,
  babies,
  onBabies,
}: {
  parseResult: ParseTripRequestResult;
  validation: ValidateTripRequestResult | null;
  candidate: FindCandidateOpportunitiesResult | null;
  onChange: <K extends keyof ParseTripRequestResult["normalized"]>(
    field: K,
    value: ParseTripRequestResult["normalized"][K],
  ) => void;
  babies: number;
  onBabies: (n: number) => void;
}) {
  const n = parseResult.normalized;
  const [popover, setPopover] = useState<null | "dates" | "group">(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const details = [
    n.destinationCountry,
    n.ageRangeText,
    n.regimeRequested,
    n.categoryRequested,
    n.requirementsText,
  ].some((v) => v && v.trim());

  const groupSummary =
    n.participants === null && n.teachers === null
      ? "Añade el grupo"
      : [
          n.participants !== null ? `${n.participants} niños` : null,
          n.teachers !== null ? `${n.teachers} adultos` : null,
          babies > 0 ? `${babies} bebés` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="pm-datos">
      <div className="pm-datos__bar">
        <span className="pm-datos__title">Revisa lo que extrajimos del mensaje</span>
        <span className="pm-datos__crm">CRM: {candidate?.recommendation ?? "pendiente"}</span>
      </div>

      {parseResult.missingFields.length > 0 ? (
        <div className="pm-note pm-note--warn">
          <strong>Por completar:</strong> {parseResult.missingFields.map((m) => m.label).join(" · ")}
        </div>
      ) : null}
      {validation && validation.issues.length > 0 ? (
        <div className="pm-note pm-note--error">
          <strong>Faltan datos críticos:</strong>{" "}
          {validation.issues.map((i) => i.label).join(" · ")}
        </div>
      ) : null}

      {/* Barra tipo reserva: Destino · Entrada · Salida · Grupo · Filtros */}
      <div className="pm-bar">
        <label className={`pm-bar__seg ${!n.destinationText ? "is-missing" : ""}`}>
          <span className="pm-bar__ico">
            <Icon.Pin />
          </span>
          <span className="pm-bar__fld">
            <span className="pm-bar__lab">Destino</span>
            <input
              className="pm-bar__in"
              value={n.destinationText}
              placeholder="¿A dónde viajan?"
              onChange={(e) => onChange("destinationText", e.target.value)}
            />
          </span>
        </label>

        <span className="pm-bar__div" />

        <button
          type="button"
          className={`pm-bar__seg pm-bar__seg--btn ${!n.dateFrom ? "is-missing" : ""} ${popover === "dates" ? "is-open" : ""}`}
          onClick={() => setPopover((p) => (p === "dates" ? null : "dates"))}
        >
          <span className="pm-bar__ico">
            <Icon.Calendar />
          </span>
          <span className="pm-bar__fld">
            <span className="pm-bar__lab">Entrada {!n.dateFrom ? <em>· falta</em> : null}</span>
            <span className="pm-bar__val">{n.dateFrom ? formatDateShort(n.dateFrom) : "Añade fecha"}</span>
          </span>
        </button>

        <span className="pm-bar__div" />

        <button
          type="button"
          className={`pm-bar__seg pm-bar__seg--btn ${!n.dateTo ? "is-missing" : ""} ${popover === "dates" ? "is-open" : ""}`}
          onClick={() => setPopover((p) => (p === "dates" ? null : "dates"))}
        >
          <span className="pm-bar__ico">
            <Icon.Calendar />
          </span>
          <span className="pm-bar__fld">
            <span className="pm-bar__lab">Salida {!n.dateTo ? <em>· falta</em> : null}</span>
            <span className="pm-bar__val">{n.dateTo ? formatDateShort(n.dateTo) : "Añade fecha"}</span>
          </span>
        </button>

        <span className="pm-bar__div" />

        <button
          type="button"
          className={`pm-bar__seg pm-bar__seg--btn ${n.participants === null ? "is-missing" : ""} ${popover === "group" ? "is-open" : ""}`}
          onClick={() => setPopover((p) => (p === "group" ? null : "group"))}
        >
          <span className="pm-bar__ico">
            <Icon.Group />
          </span>
          <span className="pm-bar__fld">
            <span className="pm-bar__lab">Grupo</span>
            <span className="pm-bar__val">{groupSummary}</span>
          </span>
        </button>

        <button
          type="button"
          className={`pm-bar__filter ${filtersOpen ? "is-open" : ""}`}
          aria-label="Detalles del viaje"
          title="Detalles del viaje"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          {details ? <span className="pm-bar__filter-dot" /> : null}
          <Icon.Filter />
        </button>
      </div>

      {popover === "dates" ? (
        <DateRangePicker
          from={n.dateFrom}
          to={n.dateTo}
          onChange={(from, to) => {
            onChange("dateFrom", from);
            onChange("dateTo", to);
          }}
          onClose={() => setPopover(null)}
        />
      ) : null}

      {popover === "group" ? (
        <GroupPopover
          participants={n.participants}
          teachers={n.teachers}
          babies={babies}
          onChange={(field, value) => {
            if (field === "babies") onBabies(value);
            else onChange(field, value);
          }}
          onClose={() => setPopover(null)}
        />
      ) : null}

      {/* Panel de filtros / detalles del viaje (colapsable) */}
      {filtersOpen ? (
        <div className="pm-filters">
          <div className="pm-filters__h">
            <span>Detalles del viaje</span>
            <button
              type="button"
              className="pm-filters__close"
              aria-label="Cerrar detalles"
              onClick={() => setFiltersOpen(false)}
            >
              <Icon.Close />
            </button>
          </div>
          <div className="pm-details__grid">
            <Field label="País del destino">
              <input
                value={n.destinationCountry}
                onChange={(e) => onChange("destinationCountry", e.target.value)}
              />
            </Field>
            <Field label="Edad o rango de edad">
              <input value={n.ageRangeText} onChange={(e) => onChange("ageRangeText", e.target.value)} />
            </Field>
            <Field label="Régimen solicitado">
              <input value={n.regimeRequested} onChange={(e) => onChange("regimeRequested", e.target.value)} />
            </Field>
            <Field label="Categoría solicitada">
              <input
                value={n.categoryRequested}
                onChange={(e) => onChange("categoryRequested", e.target.value)}
              />
            </Field>
            <Field label="Requisitos" full>
              <textarea
                rows={3}
                value={n.requirementsText}
                onChange={(e) => onChange("requirementsText", e.target.value)}
              />
            </Field>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ── Configurador de grupo (Adultos / Niños / Bebés) ───────────────────────── */

function GroupPopover({
  participants,
  teachers,
  babies,
  onChange,
  onClose,
}: {
  participants: number | null;
  teachers: number | null;
  babies: number;
  onChange: (field: "participants" | "teachers" | "babies", value: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows: {
    key: "teachers" | "participants" | "babies";
    title: string;
    sub: string;
    value: number;
  }[] = [
    { key: "teachers", title: "Adultos", sub: "Profesores / acompañantes", value: teachers ?? 0 },
    { key: "participants", title: "Niños", sub: "Alumnos / estudiantes", value: participants ?? 0 },
    { key: "babies", title: "Bebés", sub: "Menores de 2 años", value: babies },
  ];

  return (
    <>
      <div className="pm-pop-backdrop" onClick={onClose} />
      <div className="pm-group-pop" role="dialog" aria-label="Configurar grupo">
        {rows.map((row) => (
          <div className="pm-trow" key={row.key}>
            <span className="pm-trow__i">
              <Icon.Person />
            </span>
            <span className="pm-trow__t">
              <b>{row.title}</b>
              <span>{row.sub}</span>
            </span>
            <span className="pm-stp">
              <button
                type="button"
                aria-label={`Quitar ${row.title}`}
                disabled={row.value <= 0}
                onClick={() => onChange(row.key, Math.max(0, row.value - 1))}
              >
                <Icon.Minus />
              </button>
              <span className="pm-stp__n">{row.value}</span>
              <button
                type="button"
                aria-label={`Añadir ${row.title}`}
                onClick={() => onChange(row.key, row.value + 1)}
              >
                <Icon.Plus />
              </button>
            </span>
          </div>
        ))}
        <div className="pm-group-pop__foot">
          <button type="button" className="pm-primary" onClick={onClose}>
            Listo
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Calendario de rango (selección entrada → salida) ──────────────────────── */

const DOW = ["L", "M", "X", "J", "V", "S", "D"];

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isoOf(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function monthMatrix(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1);
  const startCol = (first.getDay() + 6) % 7; // Lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startCol; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function DateRangePicker({
  from,
  to,
  onChange,
  onClose,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  onClose: () => void;
}) {
  const initial = from.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const [view, setView] = useState(() => {
    const base = initial ? new Date(Number(initial[1]), Number(initial[2]) - 1, 1) : new Date();
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pick = (iso: string) => {
    // Sin inicio, o rango ya completo → empezar de nuevo desde 'iso'.
    if (!from || (from && to)) {
      onChange(iso, "");
      return;
    }
    // Hay inicio y falta fin.
    if (iso < from) onChange(iso, "");
    else onChange(from, iso);
  };

  const shift = (delta: number) => {
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const months = [
    { year: view.year, month: view.month },
    (() => {
      const d = new Date(view.year, view.month + 1, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    })(),
  ];

  const nights =
    from && to ? Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) : 0;

  return (
    <>
      <div className="pm-pop-backdrop" onClick={onClose} />
      <div className="pm-cal" role="dialog" aria-label="Selecciona las fechas">
        <button type="button" className="pm-cal__nav pm-cal__nav--l" onClick={() => shift(-1)} aria-label="Mes anterior">
          <Icon.ChevronLeft />
        </button>
        <button type="button" className="pm-cal__nav pm-cal__nav--r" onClick={() => shift(1)} aria-label="Mes siguiente">
          <Icon.ChevronRight />
        </button>
        <div className="pm-cal__months">
          {months.map(({ year, month }) => (
            <div className="pm-cal__month" key={`${year}-${month}`}>
              <div className="pm-cal__title">
                {MONTH_NAMES[month]} {year}
              </div>
              <div className="pm-cal__dow">
                {DOW.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="pm-cal__days">
                {monthMatrix(year, month).map((day, i) => {
                  if (day === null) return <span className="pm-cal__cell pm-cal__cell--empty" key={i} />;
                  const iso = isoOf(year, month, day);
                  const isStart = iso === from;
                  const isEnd = iso === to;
                  const inRange = from && to && iso > from && iso < to;
                  const cls = [
                    "pm-cal__cell",
                    isStart ? "is-start" : "",
                    isEnd ? "is-end" : "",
                    inRange ? "is-in" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <button type="button" className={cls} key={i} onClick={() => pick(iso)}>
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="pm-cal__foot">
          <span className="pm-cal__sel">
            {from ? (
              <>
                <b>{formatDateShort(from)}</b>
                {to ? (
                  <>
                    {" → "}
                    <b>{formatDateShort(to)}</b> · {nights} noche{nights === 1 ? "" : "s"}
                  </>
                ) : (
                  " → elige la salida"
                )}
              </>
            ) : (
              "Elige la fecha de entrada"
            )}
          </span>
          <button type="button" className="pm-primary" onClick={onClose} disabled={!from || !to}>
            Aplicar
          </button>
        </div>
      </div>
    </>
  );
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/* ── Paso 3: Alojamientos + actividades ────────────────────────────────────── */

function StepAlojamientos({
  norm,
  groupText,
  accommodationSearch,
  activitySearch,
  builder,
  optionForAccommodation,
  onToggleAccommodation,
  onToggleActivity,
  onEdit,
}: {
  norm: ParseTripRequestResult["normalized"] | undefined;
  groupText: string;
  accommodationSearch: SearchAccommodationsResult | null;
  activitySearch: SearchActivitiesResult | null;
  builder: ProposalBuilderState;
  optionForAccommodation: (id: string) => number | null;
  onToggleAccommodation: (id: string) => void;
  onToggleActivity: (optionNumber: number, activityId: string) => void;
  onEdit: () => void;
}) {
  const matches = accommodationSearch?.matches ?? [];
  const selectedCount = builder.selectedAccommodationIds.length;
  const gradients = ["pm-room__img--1", "pm-room__img--2", "pm-room__img--3"];

  return (
    <div className="pm-aloj">
      <div className="pm-searchbar pm-searchbar--summary">
        <SummaryField label="Destino" value={norm?.destinationText || "—"} icon={<Icon.Pin />} />
        <SummaryField
          label="Fechas"
          value={norm?.dateFrom ? `${norm.dateFrom} → ${norm.dateTo}` : "—"}
          icon={<Icon.Calendar />}
        />
        <SummaryField label="Grupo" value={groupText} icon={<Icon.Group />} />
        <SummaryField label="Régimen" value={norm?.regimeRequested || "—"} icon={<Icon.Board />} />
        <button className="pm-searchbar__edit" onClick={onEdit}>
          Editar datos
        </button>
      </div>

      <div className="pm-aloj__head">
        <div>
          <h2>Alojamientos disponibles</h2>
          <p>
            {matches.length} coincidencia{matches.length === 1 ? "" : "s"} en el inventario · elige hasta
            3 opciones
          </p>
        </div>
        <span className="pm-selcount">{selectedCount} de 3 seleccionados</span>
      </div>

      {matches.length === 0 ? (
        <p className="pm-empty">No se encontraron alojamientos para estos filtros. Ajusta los datos del viaje.</p>
      ) : (
        <div className="pm-rooms">
          {matches.map((match, idx) => {
            const a = match.accommodation;
            const option = optionForAccommodation(a.id);
            const price = match.rate.pvpAmount || match.rate.netSaleAmount;
            return (
              <article className={`pm-room ${option ? "is-sel" : ""}`} key={a.id}>
                <div className={`pm-room__img ${gradients[idx % 3]}`}>
                  {a.sourceDocumentName ? (
                    <span className="pm-room__src">Origen: {a.sourceDocumentName}</span>
                  ) : null}
                  <span className="pm-room__pin">🏨</span>
                </div>
                <div className="pm-room__b">
                  <div>
                    <div className="pm-room__name">{a.accommodationName}</div>
                    <div className="pm-room__loc">
                      <Icon.Pin /> {a.locality} · {a.categoryType}
                    </div>
                  </div>
                  <div className="pm-chips">
                    {a.categoryType ? <span className="pm-chip">{a.categoryType}</span> : null}
                    {match.rate.boardType ? <span className="pm-chip">{match.rate.boardType}</span> : null}
                    <span className="pm-chip">{a.accommodationType || "Alojamiento"}</span>
                  </div>
                  <div className="pm-why">
                    <div className="pm-why__h">
                      <Icon.Star /> Por qué encaja · score {match.score}
                    </div>
                    <ul>
                      {(match.matchReasons.length > 0 ? match.matchReasons : ["Coincide con la búsqueda"])
                        .slice(0, 3)
                        .map((reason, i) => (
                          <li key={i}>
                            <Icon.Check /> {reason}
                          </li>
                        ))}
                    </ul>
                  </div>
                  <div className="pm-room__foot">
                    <div className="pm-price">
                      desde
                      <b>
                        {euro(price)}
                        <small> /pax</small>
                      </b>
                    </div>
                    <button
                      className={`pm-selbtn ${option ? "is" : ""}`}
                      onClick={() => onToggleAccommodation(a.id)}
                    >
                      {option ? (
                        <>
                          <Icon.Check /> Opción {option}
                        </>
                      ) : (
                        <>
                          <Icon.Plus /> Elegir
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedCount > 0 && (activitySearch?.matches.length ?? 0) > 0 ? (
        <div className="pm-acts">
          <h2 className="pm-acts__title">Actividades por opción</h2>
          {builder.selectedAccommodationIds.map((accId, idx) => {
            const optionNumber = idx + 1;
            const acc = accommodationSearch?.matches.find((m) => m.accommodation.id === accId);
            return (
              <div className="pm-act-block" key={accId}>
                <div className="pm-act-block__h">
                  <strong>Opción {optionNumber}</strong>
                  <span>{acc?.accommodation.accommodationName}</span>
                </div>
                <div className="pm-act-chips">
                  {activitySearch?.matches.map((m) => {
                    const active = builder.activitiesByOption[optionNumber]?.includes(m.activity.id);
                    return (
                      <button
                        key={`${optionNumber}-${m.activity.id}`}
                        className={`pm-act-chip ${active ? "is" : ""}`}
                        onClick={() => onToggleActivity(optionNumber, m.activity.id)}
                        title={m.activity.sourceDocumentName ? `Origen: ${m.activity.sourceDocumentName}` : undefined}
                      >
                        {m.activity.activityName}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/* ── Paso 4: Enviar a CRM ──────────────────────────────────────────────────── */

function StepCrm({
  proposal,
  createdDealId,
  crmPayload,
}: {
  proposal: TripProposal;
  createdDealId: string | null;
  crmPayload: CrmPayload | null;
}) {
  return (
    <div className="pm-crm">
      {createdDealId ? (
        <div className="pm-crm__done">
          <span className="pm-crm__check">
            <Icon.Check />
          </span>
          <div>
            <strong>Trato creado en Zoho CRM</strong>
            <p>ID del trato: {createdDealId}. Las opciones se han enviado con la propuesta.</p>
          </div>
        </div>
      ) : (
        <p className="pm-crm__lead">
          Revisa el resumen y crea el trato en Zoho con las opciones seleccionadas.
        </p>
      )}

      <div className="pm-crm__summary">
        <h3>Resumen de la propuesta</h3>
        <p className="pm-crm__text">{proposal.summaryText}</p>
        <ul className="pm-crm__opts">
          {proposal.accommodationOptions.map((o) => (
            <li key={o.id}>
              <span className="pm-crm__optnum">Opción {o.optionNumber}</span>
              <span>{o.accommodationNameSnapshot}</span>
              <span className="pm-crm__opttotal">{o.totalPvpText}</span>
            </li>
          ))}
        </ul>
      </div>

      {crmPayload && !createdDealId ? null : null}
    </div>
  );
}

/* ── Helpers de UI ─────────────────────────────────────────────────────────── */

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`pm-fld ${full ? "pm-fld--full" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function SummaryField({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="pm-sfld">
      <span className="pm-sfld__l">{label}</span>
      <span className="pm-sfld__v">
        {icon}
        {value}
      </span>
    </div>
  );
}

/* ── Iconos (SVG inline) ───────────────────────────────────────────────────── */

const Icon = {
  Close: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  Plus: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  Minus: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  Filter: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M3 5h18M6 12h12M10 19h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  ChevronLeft: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  ChevronRight: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Person: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M5 12l4 4 10-10" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  ArrowRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  ArrowLeft: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Chat: () => (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
      <path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-6.5A8 8 0 1 1 21 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  Sparkles: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5L13 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Star: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5L12 3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Pin: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  ),
  Calendar: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  Group: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  Board: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M5 11h14M7 11V7a5 5 0 0 1 10 0v4M4 11h16l-1 9H5l-1-9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
};
