import { useEffect, useState } from "react";
import type {
  CatalogAccommodation,
  CatalogActivity,
  PublishedInventoryCatalog,
} from "../../domain/documentImportTypes";
import { getInventoryCatalogApi } from "../../services/apiClient";
import { formatAmount, getErrorMessage } from "./inventoryFormatting";

/**
 * Catálogo global del inventario operativo publicado: reúne TODOS los
 * alojamientos y actividades (de cualquier documento, e incluso heredados de
 * Excel) en una sola vista de solo lectura, mostrando claramente de qué
 * documento de origen proviene cada uno. Tiene buscador por texto.
 */
export function InventoryCatalogView() {
  const [catalog, setCatalog] = useState<PublishedInventoryCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function loadCatalog() {
    setLoading(true);
    setError(null);
    try {
      setCatalog(await getInventoryCatalogApi());
    } catch (loadError) {
      setError(getErrorMessage(loadError, "No se pudo cargar el catálogo del inventario."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCatalog();
  }, []);

  const normalized = query.trim().toLowerCase();
  const matchesAccommodation = (item: CatalogAccommodation) =>
    !normalized ||
    [item.accommodationName, item.locality, item.categoryType ?? "", item.sourceDocumentName ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  const matchesActivity = (item: CatalogActivity) =>
    !normalized ||
    [item.activityName, item.locationMain ?? "", item.supplierName ?? "", item.sourceDocumentName ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(normalized);

  const accommodations = (catalog?.accommodations ?? []).filter(matchesAccommodation);
  const activities = (catalog?.activities ?? []).filter(matchesActivity);

  const originLabel = (name?: string | null) =>
    name ? `Origen: ${name}` : "Origen: importado (Excel)";

  return (
    <div className="catalog-view">
      <div className="section-card__header compact">
        <div>
          <h3>Catálogo del inventario publicado</h3>
          <p>
            {loading
              ? "Cargando catálogo..."
              : catalog
                ? `${catalog.accommodationCount} alojamiento(s) y ${catalog.activityCount} actividad(es) en el inventario operativo.`
                : "Inventario operativo (todo lo publicado, de todos los documentos)."}
          </p>
        </div>
        <div className="stack compact actions-row">
          <input
            className="doc-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, ubicación, proveedor o documento"
          />
          <button type="button" disabled={loading} onClick={() => void loadCatalog()}>
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      ) : null}

      {catalog ? (
        <div className="catalog-grid">
          <section>
            <h4>Alojamientos ({accommodations.length})</h4>
            {accommodations.length === 0 ? (
              <p className="rate-table__empty">Sin alojamientos que coincidan.</p>
            ) : (
              <ul className="published-list">
                {accommodations.map((accommodation) => (
                  <li key={accommodation.id} className="published-item">
                    <details>
                      <summary>
                        <strong>{accommodation.accommodationName}</strong>
                        {accommodation.locality ? (
                          <span className="published-item__meta">{accommodation.locality}</span>
                        ) : null}
                        {accommodation.categoryType ? (
                          <span className="published-item__meta">{accommodation.categoryType}</span>
                        ) : null}
                        <span className="origin-tag">{originLabel(accommodation.sourceDocumentName)}</span>
                        <span className="published-item__count">
                          {accommodation.rates.length} tarifa(s)
                        </span>
                      </summary>
                      <ul className="detail-list">
                        {accommodation.rates.map((rate) => (
                          <li key={rate.id}>
                            {rate.year} · {rate.label ?? "—"}
                            {rate.period ? ` · ${rate.period}` : ""} ·{" "}
                            {rate.amount != null
                              ? formatAmount(rate.amount, rate.currency)
                              : "sin precio"}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4>Actividades ({activities.length})</h4>
            {activities.length === 0 ? (
              <p className="rate-table__empty">Sin actividades que coincidan.</p>
            ) : (
              <ul className="published-list">
                {activities.map((activity) => (
                  <li key={activity.id} className="published-item">
                    <details>
                      <summary>
                        <strong>{activity.activityName}</strong>
                        {activity.locationMain ? (
                          <span className="published-item__meta">{activity.locationMain}</span>
                        ) : null}
                        {activity.supplierName ? (
                          <span className="published-item__meta">{activity.supplierName}</span>
                        ) : null}
                        <span className="origin-tag">{originLabel(activity.sourceDocumentName)}</span>
                        <span className="published-item__count">
                          {activity.rates.length} tarifa(s)
                        </span>
                      </summary>
                      <ul className="detail-list">
                        {activity.rates.map((rate) => (
                          <li key={rate.id}>
                            {rate.year} · {rate.label ?? "—"} ·{" "}
                            {rate.amount != null
                              ? formatAmount(rate.amount, rate.currency)
                              : "sin precio"}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
