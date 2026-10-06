import { useMemo, useRef, useState } from "react";
import type { StagingActivity, StagingEntityKey } from "../../domain/documentImportTypes";
import {
  agruparPorProveedor,
  avisosDeTarifa,
  coincideConBusqueda,
  filaDeOrigen,
  progresoDeRevision,
  textoDeAprobarProveedor,
  type GrupoProveedor,
} from "../../domain/revisionPorProveedor";
import { formatAmount, stagingReviewStatusLabels } from "./inventoryFormatting";
import { POLICY_LABELS, RATE_UNIT_LABELS } from "./RateReviewTable";

/**
 * Revisión de actividades por proveedor: una tabla por proveedor, una fila
 * por tarifa, y sus condiciones una sola vez. Arriba, cuánto queda.
 *
 * Es la vista por defecto cuando el documento es de actividades. La de
 * tarjetas (una por actividad, con su editor) sigue ahí como «Por actividad»,
 * y desde aquí se llega a la ficha de una actividad concreta.
 */

export interface RevisionPorProveedorProps {
  actividades: StagingActivity[];
  /** Si un estado se ve en la pestaña actual (pendientes / aprobados / rechazados). */
  filtro: (estado: unknown) => boolean;
  busy: boolean;
  onBulk: (entity: StagingEntityKey, ids: string[], reviewStatus: string, label: string) => void;
  onApproveWithParent: (
    entity: StagingEntityKey,
    parentEntity: StagingEntityKey,
    parentId: string,
    ids: string[],
    label: string,
  ) => void;
  onAprobarProveedor: (grupo: GrupoProveedor) => void;
  onRechazarProveedor: (grupo: GrupoProveedor) => void;
  onVerFicha: (activityId: string) => void;
}

const ESTADO_AGREGADO: Record<string, string> = {
  ...stagingReviewStatusLabels,
  MIXTO: "Mezcla",
};

function Estado({ estado }: { estado: string }) {
  return (
    <span className={`status-tag status-tag--${estado.toLowerCase()}`}>
      {ESTADO_AGREGADO[estado] ?? estado}
    </span>
  );
}

export function RevisionPorProveedor(props: RevisionPorProveedorProps) {
  const { actividades, filtro, busy } = props;
  const [busqueda, setBusqueda] = useState("");
  // Qué bloques están abiertos. Sin decisión, abierto si le queda algo por
  // revisar: los completos se pliegan solos y la lista se acorta al avanzar.
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});

  // Lo que se enseña: las actividades que tienen algo en la pestaña actual
  // y encajan con lo que se ha buscado.
  const visibles = useMemo(
    () =>
      actividades.filter(
        (a) =>
          coincideConBusqueda(a, busqueda) &&
          (filtro(a.reviewStatus) ||
            a.rates.some((r) => filtro(r.reviewStatus)) ||
            a.policies.some((p) => filtro(p.reviewStatus))),
      ),
    [actividades, filtro, busqueda],
  );
  const grupos = useMemo(() => agruparPorProveedor(visibles), [visibles]);
  // El progreso es sobre TODAS, no sobre las de la pestaña: «revisadas 40 de 130».
  const progreso = useMemo(() => progresoDeRevision(actividades), [actividades]);

  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const refs = useRef<Record<string, HTMLElement | null>>({});

  const estaAbierto = (g: GrupoProveedor) => abiertos[g.proveedor] ?? g.pendientes > 0;

  const irAlSiguientePendiente = () => {
    const grupo = grupos.find((g) => g.pendientes > 0);
    if (!grupo) return;
    setAbiertos((a) => ({ ...a, [grupo.proveedor]: true }));
    refs.current[grupo.proveedor]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const alternar = (id: string) =>
    setSeleccion((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  const porcentaje = progreso.total === 0 ? 0 : Math.round((progreso.revisadas / progreso.total) * 100);

  return (
    <div className="rpp">
      <div className="rpp__progreso" role="status">
        <div className="rpp__progreso-texto">
          <strong>
            Revisadas {progreso.revisadas} de {progreso.total} actividades
          </strong>
          <span>
            · {progreso.proveedoresCompletos} de {progreso.proveedores} proveedores completos
          </span>
        </div>
        <div className="rpp__barra" aria-hidden="true">
          <div className="rpp__barra-relleno" style={{ width: `${porcentaje}%` }} />
        </div>
        {grupos.some((g) => g.pendientes > 0) ? (
          <button type="button" className="link-action" onClick={irAlSiguientePendiente}>
            Ir al siguiente pendiente ↓
          </button>
        ) : null}
        <input
          type="search"
          className="rpp__buscar"
          placeholder="Buscar actividad, proveedor, tipo o zona…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          aria-label="Buscar en las actividades"
        />
      </div>

      {grupos.length === 0 ? (
        <p className="empty-hint">
          {busqueda.trim() ? `Nada coincide con «${busqueda.trim()}».` : "No hay actividades en este estado."}
        </p>
      ) : null}

      {grupos.map((grupo) => {
        const tarifasVisibles = grupo.actividades.flatMap((a) =>
          a.rates
            .filter((r) => filtro(r.reviewStatus) || filtro(a.reviewStatus))
            .map((r) => ({ actividad: a, tarifa: r })),
        );
        const idsVisibles = tarifasVisibles.map((t) => t.tarifa.id);
        const seleccionadas = tarifasVisibles.filter((t) => seleccion.has(t.tarifa.id));
        const todasSeleccionadas = idsVisibles.length > 0 && seleccionadas.length === idsVisibles.length;

        // Aprobar tarifas sueltas: cada una con su actividad, que es lo que
        // exige el inventario para publicarla.
        const aprobarSeleccionadas = () => {
          const porActividad = new Map<string, string[]>();
          for (const t of seleccionadas) {
            porActividad.set(t.actividad.id, [...(porActividad.get(t.actividad.id) ?? []), t.tarifa.id]);
          }
          for (const [actividadId, ids] of porActividad) {
            props.onApproveWithParent("activity-rates", "activities", actividadId, ids, "tarifa(s)");
          }
          setSeleccion(new Set());
        };

        const abierto = estaAbierto(grupo);

        return (
          <section
            key={grupo.proveedor}
            className={`rpp__grupo${abierto ? "" : " rpp__grupo--plegado"}`}
            ref={(el) => {
              refs.current[grupo.proveedor] = el;
            }}
          >
            <header className="rpp__cabecera">
              <button
                type="button"
                className="rpp__plegar"
                aria-expanded={abierto}
                onClick={() => setAbiertos((a) => ({ ...a, [grupo.proveedor]: !abierto }))}
              >
                <span className="rpp__flecha" aria-hidden="true">
                  {abierto ? "▾" : "▸"}
                </span>
                <span>
                  <span className="rpp__proveedor">{grupo.proveedor}</span>
                  <span className="rpp__cuenta">
                    {grupo.actividades.length} actividad(es) · {grupo.tarifas} tarifa(s) ·{" "}
                    {grupo.condiciones.length} condición(es) · {grupo.aprobadas} aprobada(s)
                    {grupo.rechazadas > 0 ? ` · ${grupo.rechazadas} rechazada(s)` : ""}
                    {grupo.pendientes > 0 ? ` · ${grupo.pendientes} pendiente(s)` : " · completo"}
                    {grupo.avisos > 0 ? (
                      <span className="rpp__aviso-cuenta"> · {grupo.avisos} con aviso</span>
                    ) : null}
                  </span>
                </span>
              </button>
              <div className="rpp__acciones">
                {grupo.pendientes > 0 ? (
                  <button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() => props.onAprobarProveedor(grupo)}
                  >
                    {textoDeAprobarProveedor(grupo)}
                  </button>
                ) : null}
                {grupo.pendientes > 0 ? (
                  <button type="button" disabled={busy} onClick={() => props.onRechazarProveedor(grupo)}>
                    Rechazar las de {grupo.proveedor}
                  </button>
                ) : null}
              </div>
            </header>

            {!abierto ? null : (
            <>
            {grupo.condiciones.length > 0 ? (
              <div className="rpp__condiciones">
                <p className="rpp__sub">
                  Condiciones de {grupo.proveedor} — valen para sus {grupo.actividades.length}{" "}
                  actividad(es); se aprueban una vez.
                </p>
                <div className="table-wrap">
                  <table className="rate-table rpp__tabla">
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th>Texto</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.condiciones.map((c) => (
                        <tr key={c.clave}>
                          <td>{POLICY_LABELS[c.policyType] ?? c.policyType}</td>
                          <td className="rpp__texto">{c.policyText}</td>
                          <td>
                            <Estado estado={c.estado} />
                          </td>
                          <td className="rate-table__actions">
                            {c.estado !== "APPROVED" ? (
                              <button
                                type="button"
                                className="link-action link-action--approve"
                                disabled={busy}
                                onClick={() =>
                                  props.onBulk("activity-policies", c.ids, "APPROVED", "Aprobar condición")
                                }
                              >
                                Aprobar
                              </button>
                            ) : null}
                            {c.estado !== "REJECTED" ? (
                              <button
                                type="button"
                                className="link-action link-action--reject"
                                disabled={busy}
                                onClick={() =>
                                  props.onBulk("activity-policies", c.ids, "REJECTED", "Rechazar condición")
                                }
                              >
                                Rechazar
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="rate-table__bar">
              <span className="rate-table__count">
                {tarifasVisibles.length} tarifa(s)
                {seleccionadas.length > 0 ? ` · ${seleccionadas.length} seleccionada(s)` : ""}
              </span>
              {seleccionadas.length > 0 ? (
                <div className="rate-table__bar-actions">
                  <button type="button" className="primary" disabled={busy} onClick={aprobarSeleccionadas}>
                    Aprobar las {seleccionadas.length} seleccionadas
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      props.onBulk(
                        "activity-rates",
                        seleccionadas.map((t) => t.tarifa.id),
                        "REJECTED",
                        "Rechazar seleccionadas",
                      );
                      setSeleccion(new Set());
                    }}
                  >
                    Rechazar las {seleccionadas.length} seleccionadas
                  </button>
                </div>
              ) : null}
            </div>

            <div className="table-wrap">
              <table className="rate-table rpp__tabla">
                <thead>
                  <tr>
                    <th className="rate-table__check">
                      <input
                        type="checkbox"
                        checked={todasSeleccionadas}
                        onChange={() =>
                          setSeleccion((actual) => {
                            const siguiente = new Set(actual);
                            if (todasSeleccionadas) idsVisibles.forEach((id) => siguiente.delete(id));
                            else idsVisibles.forEach((id) => siguiente.add(id));
                            return siguiente;
                          })
                        }
                        aria-label={`Seleccionar todas las tarifas de ${grupo.proveedor}`}
                      />
                    </th>
                    <th>Actividad</th>
                    <th>Variante</th>
                    <th>Cómo se cobra</th>
                    <th>Venta</th>
                    <th>Coste</th>
                    <th>Fila</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {tarifasVisibles.map(({ actividad, tarifa }) => {
                    const estado = String(tarifa.reviewStatus);
                    const unidad = RATE_UNIT_LABELS[String(tarifa.rateUnit ?? "")] ?? tarifa.rateUnit ?? "—";
                    const fila = filaDeOrigen(tarifa.rawText);
                    const avisos = avisosDeTarifa(tarifa);
                    const clases = [
                      seleccion.has(tarifa.id) ? "is-selected" : "",
                      avisos.length > 0 ? "rpp__fila--aviso" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <tr key={tarifa.id} className={clases || undefined}>
                        <td className="rate-table__check">
                          <input
                            type="checkbox"
                            checked={seleccion.has(tarifa.id)}
                            onChange={() => alternar(tarifa.id)}
                            aria-label="Seleccionar tarifa"
                          />
                        </td>
                        <td className="rpp__actividad">
                          <strong>{actividad.activityName}</strong>
                          {actividad.activityType ? (
                            <span className="rpp__tipo"> · {actividad.activityType}</span>
                          ) : null}
                          {avisos.length > 0 ? (
                            <span className="rpp__aviso" title={avisos.join(" · ")}>
                              ⚠ {avisos.join(" · ")}
                            </span>
                          ) : null}
                        </td>
                        <td>{tarifa.ageLabel || "—"}</td>
                        <td>{tarifa.durationText ? `${unidad} · ${tarifa.durationText}` : unidad}</td>
                        <td>
                          {tarifa.salePvpAmount != null ? (
                            <strong>{formatAmount(Number(tarifa.salePvpAmount), tarifa.currency)}</strong>
                          ) : (
                            <span className="rate-table__empty">sin precio</span>
                          )}
                        </td>
                        <td>
                          {tarifa.costNetAmount != null
                            ? formatAmount(Number(tarifa.costNetAmount), tarifa.currency)
                            : "—"}
                        </td>
                        <td>{fila ?? "—"}</td>
                        <td>
                          <Estado estado={estado} />
                        </td>
                        <td className="rate-table__actions">
                          {estado !== "APPROVED" ? (
                            <button
                              type="button"
                              className="link-action link-action--approve"
                              disabled={busy}
                              onClick={() =>
                                props.onApproveWithParent(
                                  "activity-rates",
                                  "activities",
                                  actividad.id,
                                  [tarifa.id],
                                  "tarifa",
                                )
                              }
                            >
                              Aprobar
                            </button>
                          ) : null}
                          {estado !== "REJECTED" ? (
                            <button
                              type="button"
                              className="link-action link-action--reject"
                              disabled={busy}
                              onClick={() =>
                                props.onBulk("activity-rates", [tarifa.id], "REJECTED", "Rechazar tarifa")
                              }
                            >
                              Rechazar
                            </button>
                          ) : null}
                          <button type="button" className="link-action" onClick={() => props.onVerFicha(actividad.id)}>
                            Ficha
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
            )}
          </section>
        );
      })}
    </div>
  );
}
