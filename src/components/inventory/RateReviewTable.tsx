import { Fragment, useEffect, useState } from "react";
import type { StagingEntityKey } from "../../domain/documentImportTypes";
import { patchInventoryStagingApi } from "../../services/apiClient";
import {
  formatAmount,
  getErrorMessage,
  stagingReviewStatusLabels,
  stagingReviewStatusOptions,
} from "./inventoryFormatting";

export type StagingFieldType = "text" | "number" | "date";

export interface StagingFieldDef {
  key: string;
  label: string;
  type: StagingFieldType;
}

export const accommodationFields: StagingFieldDef[] = [
  { key: "accommodationName", label: "Nombre", type: "text" },
  { key: "locality", label: "Localidad", type: "text" },
  { key: "province", label: "Provincia", type: "text" },
  { key: "categoryType", label: "Categoría", type: "text" },
  { key: "accommodationType", label: "Tipo", type: "text" },
  { key: "providerName", label: "Proveedor", type: "text" },
];

export const accommodationRateFields: StagingFieldDef[] = [
  { key: "seasonName", label: "Temporada", type: "text" },
  { key: "year", label: "Año", type: "number" },
  { key: "dateFrom", label: "Fecha inicio", type: "date" },
  { key: "dateTo", label: "Fecha fin", type: "date" },
  { key: "boardType", label: "Régimen", type: "text" },
  { key: "minNights", label: "Noches mínimas", type: "number" },
  { key: "occupancyLabel", label: "Ocupación", type: "text" },
  { key: "pvpAmount", label: "Precio PVP", type: "number" },
  { key: "netAmount", label: "Precio neto", type: "number" },
  { key: "costAmount", label: "Coste", type: "number" },
  { key: "currency", label: "Moneda", type: "text" },
];

export const accommodationAdjustmentFields: StagingFieldDef[] = [
  { key: "adjustmentType", label: "Tipo", type: "text" },
  { key: "concept", label: "Concepto", type: "text" },
  { key: "amountType", label: "Tipo de importe", type: "text" },
  { key: "amount", label: "Importe", type: "number" },
  { key: "appliesPer", label: "Aplica por", type: "text" },
  { key: "conditionText", label: "Condición", type: "text" },
];

export const accommodationPolicyFields: StagingFieldDef[] = [
  { key: "policyType", label: "Tipo", type: "text" },
  { key: "policyText", label: "Texto", type: "text" },
];

export const accommodationBlackoutFields: StagingFieldDef[] = [
  { key: "dateFrom", label: "Fecha inicio", type: "date" },
  { key: "dateTo", label: "Fecha fin", type: "date" },
  { key: "availabilityStatus", label: "Disponibilidad", type: "text" },
  { key: "reason", label: "Motivo", type: "text" },
];

export const activityFields: StagingFieldDef[] = [
  { key: "activityName", label: "Nombre", type: "text" },
  { key: "supplierName", label: "Proveedor", type: "text" },
  { key: "locationMain", label: "Ubicación", type: "text" },
  { key: "activityType", label: "Tipo", type: "text" },
  { key: "durationText", label: "Duración", type: "text" },
  { key: "descriptionText", label: "Descripción", type: "text" },
];

export const activityRateFields: StagingFieldDef[] = [
  { key: "seasonName", label: "Temporada", type: "text" },
  { key: "year", label: "Año", type: "number" },
  { key: "dateFrom", label: "Fecha inicio", type: "date" },
  { key: "dateTo", label: "Fecha fin", type: "date" },
  { key: "ageLabel", label: "Edad", type: "text" },
  { key: "salePvpAmount", label: "Precio PVP", type: "number" },
  { key: "costNetAmount", label: "Coste neto", type: "number" },
  { key: "currency", label: "Moneda", type: "text" },
];

export const activityPolicyFields: StagingFieldDef[] = [
  { key: "policyType", label: "Tipo", type: "text" },
  { key: "policyText", label: "Texto", type: "text" },
];

interface StagingEditableCardProps {
  entity: StagingEntityKey;
  id: string;
  title: string;
  fields: StagingFieldDef[];
  values: object;
  reviewStatus: string;
  rawText?: string | null;
  structuredJson?: unknown;
  summary?: React.ReactNode;
  /** Si true, la tarjeta se muestra plegada (resumen en una línea, editar al expandir). */
  collapsible?: boolean;
  onSaved: () => Promise<void> | void;
}

export function StagingEditableCard(props: StagingEditableCardProps) {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const sourceValues = props.values as Record<string, unknown>;
    const initial: Record<string, string> = {};
    for (const field of props.fields) {
      const value = sourceValues[field.key];
      if (value === null || value === undefined) {
        initial[field.key] = "";
      } else if (field.type === "date") {
        initial[field.key] = String(value).slice(0, 10);
      } else {
        initial[field.key] = String(value);
      }
    }
    return initial;
  });
  const [status, setStatus] = useState<string>(props.reviewStatus || "PENDING");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-sincroniza el estado mostrado cuando cambia desde fuera (acciones en
  // lote, regeneración, refresco): la tarjeta se reutiliza por su key y el
  // useState inicial no se vuelve a ejecutar.
  useEffect(() => {
    setStatus(props.reviewStatus || "PENDING");
    setSaved(false);
  }, [props.reviewStatus]);

  async function handleSave() {
    setError(null);
    setSaved(false);

    for (const field of props.fields) {
      const raw = fieldValues[field.key] ?? "";
      if (field.type === "number" && raw.trim() !== "" && !Number.isFinite(Number(raw))) {
        setError(`El campo ${field.label} debe ser numérico.`);
        return;
      }
    }

    setSaving(true);
    try {
      const patch: Record<string, unknown> = { reviewStatus: status };
      for (const field of props.fields) {
        const raw = (fieldValues[field.key] ?? "").trim();
        if (field.type === "number") {
          patch[field.key] = raw === "" ? null : Number(raw);
        } else if (field.type === "date") {
          patch[field.key] = raw === "" ? null : raw;
        } else {
          patch[field.key] = raw;
        }
      }

      await patchInventoryStagingApi(props.entity, props.id, patch);
      setSaved(true);
      await props.onSaved();
    } catch (saveError) {
      setError(getErrorMessage(saveError, "No se pudo guardar el candidato."));
    } finally {
      setSaving(false);
    }
  }

  const statusLabel = stagingReviewStatusLabels[status] ?? status;
  const statusClass = `staging-card__status staging-card__status--${status.toLowerCase()}`;

  const editableBody = (
    <>
      <div className="grid two">
        {props.fields.map((field) => (
          <label className="field" key={field.key}>
            <span>{field.label}</span>
            <input
              type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
              value={fieldValues[field.key] ?? ""}
              onChange={(event) =>
                setFieldValues((current) => ({
                  ...current,
                  [field.key]: event.target.value,
                }))
              }
            />
          </label>
        ))}

        <label className="field">
          <span>Estado de revisión</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {stagingReviewStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {props.rawText ? (
        <>
          <span className="ai-result__label">Texto de origen</span>
          <pre className="extraction-text">{props.rawText}</pre>
        </>
      ) : null}

      {props.structuredJson ? (
        <>
          <span className="ai-result__label">Datos estructurados</span>
          <pre className="extraction-text">{JSON.stringify(props.structuredJson, null, 2)}</pre>
        </>
      ) : null}

      {error ? (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      ) : null}

      {saved ? <small>Cambios guardados.</small> : null}

      <button type="button" disabled={saving} onClick={() => void handleSave()}>
        {saving ? "Guardando..." : "Guardar candidato"}
      </button>
    </>
  );

  if (props.collapsible) {
    return (
      <details className="staging-card staging-card--collapsible">
        <summary className="staging-card__summary-row">
          <span className="staging-card__title">{props.title}</span>
          {props.summary ? (
            <span className="staging-card__summary-inline">{props.summary}</span>
          ) : null}
          <span className={statusClass}>{statusLabel}</span>
        </summary>
        <div className="staging-card__body">{editableBody}</div>
      </details>
    );
  }

  return (
    <div className="staging-card">
      <div className="staging-card__head">
        <strong>{props.title}</strong>
        <span className={statusClass}>{statusLabel}</span>
      </div>

      {props.summary ? <div className="staging-card__summary">{props.summary}</div> : null}

      {editableBody}
    </div>
  );
}

interface RateLike {
  id: string;
  reviewStatus: string;
  year?: number | null;
  seasonName?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  boardType?: string | null;
  occupancyLabel?: string | null;
  minNights?: number | null;
  ageLabel?: string | null;
  currency?: string | null;
  pvpAmount?: number | null;
  netAmount?: number | null;
  costAmount?: number | null;
  salePvpAmount?: number | null;
  costNetAmount?: number | null;
  rawText?: string | null;
}

/** Periodo legible de una tarifa: rango de fechas o temporada. */
function formatRatePeriod(rate: RateLike): string {
  const fmt = (value?: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  };
  const from = fmt(rate.dateFrom);
  const to = fmt(rate.dateTo);
  if (from && to) return `${from} → ${to}`;
  if (from) return `desde ${from}`;
  if (rate.seasonName) return rate.seasonName;
  return "—";
}

/** Precio principal compacto de una tarifa, con su tipo. */
function compactPrice(
  rate: RateLike,
  kind: "accommodation" | "activity",
): { amount: number | null; label: string } {
  if (kind === "accommodation") {
    if (rate.pvpAmount != null) return { amount: Number(rate.pvpAmount), label: "PVP" };
    if (rate.netAmount != null) return { amount: Number(rate.netAmount), label: "neto" };
    if (rate.costAmount != null) return { amount: Number(rate.costAmount), label: "coste" };
    return { amount: null, label: "" };
  }
  if (rate.salePvpAmount != null) return { amount: Number(rate.salePvpAmount), label: "PVP" };
  if (rate.costNetAmount != null) return { amount: Number(rate.costNetAmount), label: "coste" };
  return { amount: null, label: "" };
}

export type CandidateItem = {
  id: string;
  reviewStatus: string;
  rawText?: string | null;
  structuredJson?: unknown;
} & Record<string, unknown>;

export interface CandidateColumn {
  header: string;
  render: (item: CandidateItem) => React.ReactNode;
}

/** Celda de texto segura: muestra "—" si el valor está vacío. */
function cell(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

/** Celda de precio: importe principal con su tipo (PVP/neto/coste). */
function renderPriceCell(rate: RateLike, kind: "accommodation" | "activity"): React.ReactNode {
  const price = compactPrice(rate, kind);
  if (price.amount == null) {
    return <span className="rate-table__empty">sin precio</span>;
  }
  return (
    <>
      <strong>{formatAmount(price.amount, rate.currency)}</strong>{" "}
      <span className="rate-table__pricetype">{price.label}</span>
    </>
  );
}

interface RateReviewTableProps {
  entity: StagingEntityKey;
  parentEntity: StagingEntityKey;
  parentId: string;
  /** Candidatos ya filtrados por la pestaña activa. */
  rates: CandidateItem[];
  columns: CandidateColumn[];
  itemLabel: string;
  editorTitle: string;
  fields: StagingFieldDef[];
  busy: boolean;
  onBulkReview: (
    entity: StagingEntityKey,
    ids: string[],
    reviewStatus: string,
    label: string,
  ) => void;
  onApprove: (
    entity: StagingEntityKey,
    parentEntity: StagingEntityKey,
    parentId: string,
    ids: string[],
    label: string,
  ) => void;
  onSaved: () => Promise<void> | void;
}

/**
 * Tabla de revisión de candidatos (tarifas, suplementos, políticas, fechas):
 * lectura compacta por columnas configurables, selección múltiple, aprobación
 * de un clic por fila y acciones en lote. Pensada para revisar muchos
 * candidatos con poco esfuerzo.
 */
export function RateReviewTable(props: RateReviewTableProps) {
  const { rates, entity, parentEntity, parentId, busy, columns } = props;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visibleIds = rates.map((rate) => rate.id);
  const selectedVisible = visibleIds.filter((id) => selected.has(id));
  const allSelected = rates.length > 0 && selectedVisible.length === rates.length;

  // Limpia la selección si cambian las tarifas (refresco / cambio de pestaña).
  useEffect(() => {
    setSelected((current) => {
      const next = new Set<string>();
      for (const id of visibleIds) {
        if (current.has(id)) next.add(id);
      }
      return next.size === current.size ? current : next;
    });
    setExpandedId((current) => (current && visibleIds.includes(current) ? current : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds.join(",")]);

  if (rates.length === 0) {
    return null;
  }

  const toggleAll = () => setSelected(() => (allSelected ? new Set() : new Set(visibleIds)));
  const toggleOne = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const approveRates = (list: CandidateItem[]) =>
    props.onApprove(
      entity,
      parentEntity,
      parentId,
      list.map((item) => item.id),
      props.itemLabel,
    );

  return (
    <div className="rate-table-wrap">
      <div className="rate-table__bar">
        <span className="rate-table__count">
          {rates.length} {props.itemLabel}
        </span>
        <div className="rate-table__bar-actions">
          {selectedVisible.length > 0 ? (
            <>
              <strong>{selectedVisible.length} seleccionada(s):</strong>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => approveRates(rates.filter((rate) => selected.has(rate.id)))}
              >
                Aprobar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  props.onBulkReview(entity, selectedVisible, "REJECTED", "Rechazar seleccionadas")
                }
              >
                Rechazar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  props.onBulkReview(entity, selectedVisible, "PENDING", "Pasar a pendientes")
                }
              >
                A pendientes
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => approveRates(rates)}
              >
                Aprobar todas
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  props.onBulkReview(entity, visibleIds, "REJECTED", "Rechazar todas")
                }
              >
                Rechazar todas
              </button>
            </>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table className="rate-table">
          <thead>
            <tr>
              <th className="rate-table__check">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Seleccionar todas"
                />
              </th>
              {columns.map((column) => (
                <th key={column.header}>{column.header}</th>
              ))}
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((rate) => {
              const status = String(rate.reviewStatus);
              const isExpanded = expandedId === rate.id;
              return (
                <Fragment key={rate.id}>
                  <tr className={selected.has(rate.id) ? "is-selected" : undefined}>
                    <td className="rate-table__check">
                      <input
                        type="checkbox"
                        checked={selected.has(rate.id)}
                        onChange={() => toggleOne(rate.id)}
                        aria-label="Seleccionar tarifa"
                      />
                    </td>
                    {columns.map((column) => (
                      <td key={column.header}>{column.render(rate)}</td>
                    ))}
                    <td>
                      <span className={`status-tag status-tag--${status.toLowerCase()}`}>
                        {stagingReviewStatusLabels[status] ?? status}
                      </span>
                    </td>
                    <td className="rate-table__actions">
                      {status !== "APPROVED" ? (
                        <button
                          type="button"
                          className="link-action link-action--approve"
                          disabled={busy}
                          onClick={() => approveRates([rate])}
                        >
                          Aprobar
                        </button>
                      ) : null}
                      {status !== "REJECTED" ? (
                        <button
                          type="button"
                          className="link-action link-action--reject"
                          disabled={busy}
                          onClick={() =>
                            props.onBulkReview(entity, [rate.id], "REJECTED", "Rechazar tarifa")
                          }
                        >
                          Rechazar
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="link-action"
                        onClick={() => setExpandedId(isExpanded ? null : rate.id)}
                      >
                        {isExpanded ? "Cerrar" : "Editar"}
                      </button>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="rate-table__editor">
                      <td colSpan={columns.length + 3}>
                        <StagingEditableCard
                          entity={entity}
                          id={rate.id}
                          title={props.editorTitle}
                          fields={props.fields}
                          values={rate}
                          reviewStatus={status}
                          rawText={rate.rawText}
                          structuredJson={rate.structuredJson}
                          onSaved={props.onSaved}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const accommodationRateColumns: CandidateColumn[] = [
  { header: "Periodo", render: (i) => formatRatePeriod(i as unknown as RateLike) },
  { header: "Régimen", render: (i) => cell(i.boardType) },
  { header: "Precio", render: (i) => renderPriceCell(i as unknown as RateLike, "accommodation") },
  { header: "Año", render: (i) => cell(i.year) },
];

export const activityRateColumns: CandidateColumn[] = [
  { header: "Periodo", render: (i) => formatRatePeriod(i as unknown as RateLike) },
  { header: "Edad", render: (i) => cell(i.ageLabel) },
  { header: "Precio", render: (i) => renderPriceCell(i as unknown as RateLike, "activity") },
  { header: "Año", render: (i) => cell(i.year) },
];

export const adjustmentColumns: CandidateColumn[] = [
  { header: "Concepto", render: (i) => cell(i.concept) },
  {
    header: "Importe",
    render: (i) =>
      i.amount != null ? `${i.amount}${i.amountType ? ` ${String(i.amountType)}` : ""}` : "—",
  },
  { header: "Aplica por", render: (i) => cell(i.appliesPer) },
];

export const policyColumns: CandidateColumn[] = [
  { header: "Tipo", render: (i) => cell(i.policyType) },
  {
    header: "Texto",
    render: (i) => <span className="cell-truncate">{cell(i.policyText)}</span>,
  },
];

export const blackoutColumns: CandidateColumn[] = [
  { header: "Fechas", render: (i) => formatRatePeriod(i as unknown as RateLike) },
  { header: "Disponibilidad", render: (i) => cell(i.availabilityStatus) },
  { header: "Motivo", render: (i) => cell(i.reason) },
];
