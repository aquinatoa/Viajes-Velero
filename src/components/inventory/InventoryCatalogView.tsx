import { Fragment, useEffect, useState } from "react";
import {
  agruparPorIdentidad,
  canalesDelGrupo,
  coincideConUbicacion,
  opcionesDeUbicacion,
  SIN_UBICACION,
} from "../../domain/fichaDeCatalogo";
import { EtiquetasDeCanal, FichaDeCatalogo } from "./FichaDeCatalogo";
import { useClientesEspeciales } from "../useClientesEspeciales";
import {
  tariffDepartmentLabels,
  type CatalogAccommodation,
  type CatalogActivity,
  type PublishedInventoryCatalog,
  type TariffDepartment,
} from "../../domain/documentImportTypes";
import { getInventoryCatalogApi } from "../../services/apiClient";
import { getErrorMessage } from "./inventoryFormatting";

/** La ubicación en su propia columna. Si el documento no la trae, se dice: no se inventa. */
function Ubicacion({ texto }: { texto?: string | null }) {
  const limpio = texto?.trim();
  return limpio ? (
    <span className="cat-resumen__ubicacion">{limpio}</span>
  ) : (
    <span className="cat-resumen__ubicacion cat-resumen__ubicacion--falta" title="El documento no indica la ubicación">
      Sin ubicación
    </span>
  );
}

/** Los títulos de las columnas, alineados con las filas de abajo. */
function CabeceraDeColumnas({ proveedor }: { proveedor: boolean }) {
  return (
    <div className="cat-cabecera" aria-hidden="true">
      <span>{proveedor ? "Actividad" : "Alojamiento"}</span>
      <span>Ubicación</span>
      <span>Para quién</span>
      <span>Origen</span>
      <span>Tarifas</span>
    </div>
  );
}

/**
 * Catálogo global del inventario operativo publicado: reúne TODOS los
 * alojamientos y actividades (de cualquier documento, e incluso heredados de
 * Excel) en una sola vista de solo lectura, mostrando claramente de qué
 * documento de origen proviene cada uno. Tiene buscador por texto y filtro por
 * departamento (Anthony, 19/10/2026: «lo de filtrar es para el catálogo
 * publicado»): un documento de Grupos sale con Grupos, uno de Turismo
 * Deportivo con Deportivo, y uno «para los dos» con cualquiera, igual que al
 * cotizar.
 */
export function InventoryCatalogView() {
  const [catalog, setCatalog] = useState<PublishedInventoryCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [departamento, setDepartamento] = useState<TariffDepartment | "">("");
  // Una sola lista a todo el ancho, no dos columnas: la tabla de tarifas necesita
  // sitio, y a medio ancho se cortaba y obligaba a desplazarla de lado.
  const [seccion, setSeccion] = useState<"alojamientos" | "actividades">("alojamientos");
  // Filtro por población (clave normalizada) de la pestaña que se está viendo.
  const [ubicacion, setUbicacion] = useState("");
  const cambiarSeccion = (nueva: "alojamientos" | "actividades") => {
    setSeccion(nueva);
    setUbicacion("");
  };
  const clientesEspeciales = useClientesEspeciales();

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

  /** Sin departamento en el documento: vale para los dos. */
  const delDepartamento = (item: { sourceDocumentDepartment?: TariffDepartment | null }) =>
    !departamento || !item.sourceDocumentDepartment || item.sourceDocumentDepartment === departamento;

  const accommodationRecords = (catalog?.accommodations ?? []).filter(
    (item) => matchesAccommodation(item) && delDepartamento(item),
  );
  const activityRecords = (catalog?.activities ?? []).filter((item) => matchesActivity(item) && delDepartamento(item));

  // El mismo alojamiento cargado en dos documentos (el general y el del
  // turoperador) se enseña como UNO, con una pestaña por canal. Agrupar es una
  // forma de mirar el catálogo: en la base siguen siendo dos registros.
  const alojamientosTodos = agruparPorIdentidad(accommodationRecords, (a) => a.accommodationName, (a) => a.locality);
  const actividadesTodas = agruparPorIdentidad(activityRecords, (a) => a.activityName, (a) => a.supplierName);

  // Filtro por ubicación. Las opciones salen de lo que hay ahora mismo (tras la
  // búsqueda y el departamento), con cuántos hay en cada población.
  const ubicacionesAloj = (g: (typeof alojamientosTodos)[number]) => [g.lugar];
  const ubicacionesAct = (g: (typeof actividadesTodas)[number]) => g.miembros.map((m) => m.locationMain);
  const opcionesAloj = opcionesDeUbicacion(alojamientosTodos.map(ubicacionesAloj));
  const opcionesAct = opcionesDeUbicacion(actividadesTodas.map(ubicacionesAct));
  const opcionesActuales = seccion === "alojamientos" ? opcionesAloj : opcionesAct;
  // Si la búsqueda deja sin esa población, el filtro se ignora en vez de dejar la lista vacía.
  const ubicacionVigente =
    ubicacion === SIN_UBICACION
      ? opcionesActuales.sinUbicacion > 0
        ? ubicacion
        : ""
      : opcionesActuales.poblaciones.some((p) => p.clave === ubicacion)
        ? ubicacion
        : "";
  const accommodations =
    seccion === "alojamientos"
      ? alojamientosTodos.filter((g) => coincideConUbicacion(ubicacionesAloj(g), ubicacionVigente))
      : alojamientosTodos;
  const activities =
    seccion === "actividades"
      ? actividadesTodas.filter((g) => coincideConUbicacion(ubicacionesAct(g), ubicacionVigente))
      : actividadesTodas;

  const etiquetaDepartamento = (valor?: TariffDepartment | null) =>
    valor ? (
      <span className={`dept-tag dept-tag--${valor.toLowerCase()}`}>{tariffDepartmentLabels[valor]}</span>
    ) : null;

  const originLabel = (name?: string | null) =>
    name ? `Origen: ${name}` : "Origen: importado (Excel)";

  /** Un documento: su nombre. Varios: cuántos, y el detalle va dentro de la ficha. */
  const origenDelGrupo = (miembros: Array<{ sourceDocumentName?: string | null; sourceDocumentId?: string | null }>) => {
    const documentos = new Map(miembros.map((m) => [m.sourceDocumentId ?? "", m.sourceDocumentName ?? null]));
    if (documentos.size === 1) return originLabel([...documentos.values()][0]);
    return `Origen: ${documentos.size} documentos`;
  };
  const departamentosDelGrupo = (miembros: Array<{ sourceDocumentDepartment?: TariffDepartment | null }>) =>
    [...new Set(miembros.map((m) => m.sourceDocumentDepartment ?? null))].map((d) => (
      <Fragment key={d ?? "ambos"}>{etiquetaDepartamento(d)}</Fragment>
    ));

  return (
    <div className="catalog-view">
      <div className="section-card__header compact">
        <div>
          <h3>Catálogo del inventario publicado</h3>
          <p>
            {loading
              ? "Cargando catálogo..."
              : catalog
                ? `${catalog.accommodationCount} alojamiento(s) y ${catalog.activityCount} actividad(es) en el inventario operativo. Lo que está cargado en varios documentos o para varios clientes se enseña junto, con una pestaña por cliente.`
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
          <select
            className="doc-search"
            aria-label="Departamento"
            value={departamento}
            onChange={(event) => setDepartamento(event.target.value as TariffDepartment | "")}
          >
            <option value="">Todos los departamentos</option>
            <option value="GROUPS">Grupos</option>
            <option value="SPORTS">Turismo Deportivo</option>
          </select>
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
        <div className="catalogo">
          <div className="catalogo__secciones" role="tablist" aria-label="Qué ver">
            <button
              type="button"
              role="tab"
              aria-selected={seccion === "alojamientos"}
              className={seccion === "alojamientos" ? "is-active" : ""}
              onClick={() => cambiarSeccion("alojamientos")}
            >
              Alojamientos <small>({accommodations.length})</small>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={seccion === "actividades"}
              className={seccion === "actividades" ? "is-active" : ""}
              onClick={() => cambiarSeccion("actividades")}
            >
              Actividades <small>({activities.length})</small>
            </button>
            <label className="catalogo__filtro">
              <span>Ubicación</span>
              <select
                className="doc-search"
                aria-label="Filtrar por ubicación"
                value={ubicacionVigente}
                onChange={(event) => setUbicacion(event.target.value)}
              >
                <option value="">Todas las ubicaciones</option>
                {opcionesActuales.poblaciones.map((p) => (
                  <option key={p.clave} value={p.clave}>
                    {p.nombre} ({p.cantidad})
                  </option>
                ))}
                {opcionesActuales.sinUbicacion > 0 ? (
                  <option value={SIN_UBICACION}>Sin ubicación ({opcionesActuales.sinUbicacion})</option>
                ) : null}
              </select>
              {ubicacionVigente ? (
                <button type="button" className="catalogo__quitar" onClick={() => setUbicacion("")}>
                  Quitar filtro
                </button>
              ) : null}
            </label>
          </div>

          {seccion === "alojamientos" ? (
          <section>
            {accommodations.length === 0 ? (
              <p className="rate-table__empty">
                {departamento
                  ? `Sin alojamientos de ${tariffDepartmentLabels[departamento]} que coincidan.`
                  : "Sin alojamientos que coincidan."}
              </p>
            ) : (
              <>
              <CabeceraDeColumnas proveedor={false} />
              <ul className="published-list">
                {accommodations.map((grupo) => {
                  const canales = canalesDelGrupo(grupo, clientesEspeciales);
                  const primero = grupo.miembros[0];
                  return (
                    <li key={grupo.clave} className="published-item">
                      <details>
                        <summary className="cat-resumen">
                          <span className="cat-resumen__titulo">
                            <strong>{grupo.nombre}</strong>
                            {primero.categoryType ? (
                              <span className="published-item__meta">{primero.categoryType}</span>
                            ) : null}
                          </span>
                          <Ubicacion texto={grupo.lugar} />
                          <span className="cat-resumen__chips">
                            <EtiquetasDeCanal canales={canales} />
                            {departamentosDelGrupo(grupo.miembros)}
                          </span>
                          <span className="origin-tag cat-resumen__origen">{origenDelGrupo(grupo.miembros)}</span>
                          <span className="published-item__count">
                            {canales.reduce((t, c) => t + c.tarifas.length, 0)} tarifa(s)
                          </span>
                        </summary>
                        <FichaDeCatalogo grupo={grupo} canales={canales} clientes={clientesEspeciales} tipo="alojamiento" />
                      </details>
                    </li>
                  );
                })}
              </ul>
              </>
            )}
          </section>
          ) : (
          <section>
            {activities.length === 0 ? (
              <p className="rate-table__empty">
                {departamento
                  ? `Sin actividades de ${tariffDepartmentLabels[departamento]} que coincidan.`
                  : "Sin actividades que coincidan."}
              </p>
            ) : (
              <>
              <CabeceraDeColumnas proveedor />
              <ul className="published-list">
                {activities.map((grupo) => {
                  const canales = canalesDelGrupo(grupo, clientesEspeciales);
                  return (
                    <li key={grupo.clave} className="published-item">
                      <details>
                        <summary className="cat-resumen">
                          <span className="cat-resumen__titulo">
                            <strong>{grupo.nombre}</strong>
                            {grupo.lugar ? (
                              <span className="published-item__meta">Proveedor: {grupo.lugar}</span>
                            ) : null}
                          </span>
                          <Ubicacion texto={grupo.miembros[0].locationMain} />
                          <span className="cat-resumen__chips">
                            <EtiquetasDeCanal canales={canales} />
                            {departamentosDelGrupo(grupo.miembros)}
                          </span>
                          <span className="origin-tag cat-resumen__origen">{origenDelGrupo(grupo.miembros)}</span>
                          <span className="published-item__count">
                            {canales.reduce((t, c) => t + c.tarifas.length, 0)} tarifa(s)
                          </span>
                        </summary>
                        <FichaDeCatalogo grupo={grupo} canales={canales} clientes={clientesEspeciales} tipo="actividad" />
                      </details>
                    </li>
                  );
                })}
              </ul>
              </>
            )}
          </section>
          )}
        </div>
      ) : null}
    </div>
  );
}
