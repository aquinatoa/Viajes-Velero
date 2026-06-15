import { useEffect, useState } from "react";
import type {
  CreateSourceDocumentInput,
  DryRunDeleteDocumentResult,
  InventoryTargetType,
  SourceDocumentSummary,
} from "../../domain/documentImportTypes";
import {
  createInventoryDocumentApi,
  deleteInventoryDocumentApi,
  dryRunDeleteInventoryDocumentApi,
  listInventoryDocumentsApi,
  updateInventoryDocumentApi,
  uploadInventoryDocumentFileApi,
} from "../../services/apiClient";
import { InventoryCatalogView } from "./InventoryCatalogView";
import { DocumentWorkspace } from "./DocumentWorkspace";
import {
  extractionStatusLabels,
  getErrorMessage,
  statusLabels,
  targetTypeLabels,
} from "./inventoryFormatting";

const initialForm: CreateSourceDocumentInput = {
  targetType: "ACCOMMODATION",
  controlName: "",
  controlLocation: "",
  controlYear: new Date().getFullYear(),
  controlCategory: "",
  controlNotes: "",
};

export function InventoryDocumentsPanel() {
  const [documents, setDocuments] = useState<SourceDocumentSummary[]>([]);
  const [documentFilter, setDocumentFilter] = useState("");
  const [form, setForm] = useState<CreateSourceDocumentInput>(initialForm);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | undefined>>({});
  const [uploadingDocumentId, setUploadingDocumentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Documento abierto en el workspace de detalle (lo gestiona DocumentWorkspace).
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedInitialTab, setSelectedInitialTab] = useState<string>("resumen");
  // Se incrementa para forzar que el workspace recargue su detalle (p. ej. tras
  // editar los metadatos del documento abierto), sin desmontarlo.
  const [detailReloadToken, setDetailReloadToken] = useState(0);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  // Vista del panel: gestión documental vs. catálogo global publicado.
  const [panelView, setPanelView] = useState<"documents" | "catalog">("documents");

  // Formulario de registro: plegable y reutilizado para crear o editar.
  const [formOpen, setFormOpen] = useState(false);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);

  // Borrado de documento: confirmación con conteos del dry-run.
  const [deleteConfirm, setDeleteConfirm] = useState<{
    documentId: string;
    controlName: string;
    dryRun: DryRunDeleteDocumentResult;
  } | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);

  async function loadDocuments() {
    setLoading(true);
    try {
      const result = await listInventoryDocumentsApi();
      setDocuments(result);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudieron cargar los documentos."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, []);

  // --- Borrado de documento (bloqueado si tiene publicados) -------------------
  async function handleRequestDeleteDocument(document: SourceDocumentSummary) {
    setErrorMessage(null);
    setFeedbackMessage(null);
    setDeleteBusyId(document.id);
    try {
      const dryRun = await dryRunDeleteInventoryDocumentApi(document.id);
      if (dryRun.blockedByPublished) {
        setErrorMessage(
          `No se puede borrar "${document.controlName}": tiene ${dryRun.publishedAccommodations} alojamiento(s) y ${dryRun.publishedActivities} actividad(es) publicados. Ábrelo y retíralos primero en la pestaña "Publicados".`,
        );
        return;
      }
      setDeleteConfirm({ documentId: document.id, controlName: document.controlName, dryRun });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo preparar el borrado del documento."));
    } finally {
      setDeleteBusyId(null);
    }
  }

  function handleCancelDeleteDocument() {
    setDeleteConfirm(null);
  }

  async function handleConfirmDeleteDocument() {
    if (!deleteConfirm) {
      return;
    }
    const { documentId, controlName } = deleteConfirm;
    setErrorMessage(null);
    setFeedbackMessage(null);
    setDeleteBusyId(documentId);
    try {
      await deleteInventoryDocumentApi(documentId);
      setDeleteConfirm(null);
      if (selectedDocumentId === documentId) {
        handleCloseDetail();
      }
      await loadDocuments();
      setFeedbackMessage(`Documento "${controlName}" borrado (sus candidatos staging se eliminaron).`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo borrar el documento."));
    } finally {
      setDeleteBusyId(null);
    }
  }

  // Abre el formulario en modo edición precargado con los datos del documento.
  function handleEditDocument(document: SourceDocumentSummary) {
    setEditingDocumentId(document.id);
    setForm({
      targetType: document.targetType,
      controlName: document.controlName,
      controlLocation: document.controlLocation ?? "",
      controlYear: document.controlYear ?? null,
      controlCategory: document.controlCategory ?? "",
      controlNotes: "",
    });
    setFormOpen(true);
    setErrorMessage(null);
    setFeedbackMessage(null);
  }

  function handleCancelEdit() {
    setEditingDocumentId(null);
    setForm(initialForm);
    setFormOpen(false);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setFeedbackMessage(null);

    if (!form.controlName.trim()) {
      setErrorMessage("Indica el nombre del alojamiento, actividad o proveedor.");
      return;
    }

    const payload = {
      ...form,
      controlName: form.controlName.trim(),
      controlLocation: form.controlLocation?.trim() || undefined,
      controlCategory: form.controlCategory?.trim() || undefined,
      controlNotes: form.controlNotes?.trim() || undefined,
      controlYear: form.controlYear ? Number(form.controlYear) : null,
    };

    setSaving(true);
    try {
      if (editingDocumentId) {
        await updateInventoryDocumentApi(editingDocumentId, payload);
        setFeedbackMessage("Documento actualizado correctamente.");
        // Si el documento editado está abierto en el workspace, refréscalo.
        if (selectedDocumentId === editingDocumentId) {
          setDetailReloadToken((token) => token + 1);
        }
      } else {
        await createInventoryDocumentApi(payload);
        setFeedbackMessage("Documento registrado correctamente.");
      }

      setForm(initialForm);
      setEditingDocumentId(null);
      setFormOpen(false);
      await loadDocuments();
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          editingDocumentId ? "No se pudo actualizar el documento." : "No se pudo crear el documento.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(documentId: string) {
    const file = selectedFiles[documentId];
    setErrorMessage(null);
    setFeedbackMessage(null);

    if (!file) {
      setErrorMessage("Selecciona un archivo antes de subirlo.");
      return;
    }

    setUploadingDocumentId(documentId);
    try {
      await uploadInventoryDocumentFileApi(documentId, file);
      setSelectedFiles((current) => ({
        ...current,
        [documentId]: undefined,
      }));
      setFeedbackMessage("Archivo subido correctamente.");
      await loadDocuments();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo subir el archivo."));
    } finally {
      setUploadingDocumentId(null);
    }
  }

  // Abre el workspace de detalle del documento en la pestaña indicada. El
  // workspace (DocumentWorkspace) carga y gestiona su propio estado.
  function handleViewDetail(documentId: string, initialTab = "resumen") {
    setSelectedInitialTab(initialTab);
    setSelectedDocumentId(documentId);
    setErrorMessage(null);
    setFeedbackMessage(null);
  }

  function handleCloseDetail() {
    setSelectedDocumentId(null);
    setSelectedInitialTab("resumen");
  }

  const documentQuery = documentFilter.trim().toLowerCase();
  const matchedDocuments = documentQuery
    ? documents.filter((document) =>
        [
          document.controlName,
          document.controlLocation ?? "",
          statusLabels[document.status] ?? document.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(documentQuery),
      )
    : documents;
  // Ordena por "más pendientes primero" sin mutar el array de origen; los
  // documentos sin pendientes mantienen su orden relativo original (sort estable).
  const filteredDocuments = [...matchedDocuments].sort(
    (a, b) => (b.pendingReviewCount ?? 0) - (a.pendingReviewCount ?? 0),
  );

  return (
    <section className="section-card">
      <div className="section-card__header">
        <div>
          <h2>Base documental de alojamientos y actividades</h2>
          <p>
            Registra documentos fuente antes de analizarlos, revisarlos y publicarlos en el
            inventario operativo.
          </p>
        </div>
      </div>

      {errorMessage ? (
        <div className="alert alert--error" role="alert">
          {errorMessage}
        </div>
      ) : null}

      {feedbackMessage ? (
        <div className="alert alert--success" role="status">
          {feedbackMessage}
        </div>
      ) : null}

      <nav className="ws-tabs panel-views">
        <button
          type="button"
          className={`ws-tab ${panelView === "documents" ? "ws-tab--active" : ""}`}
          onClick={() => setPanelView("documents")}
        >
          Documentos
        </button>
        <button
          type="button"
          className={`ws-tab ${panelView === "catalog" ? "ws-tab--active" : ""}`}
          onClick={() => setPanelView("catalog")}
        >
          Catálogo publicado
        </button>
      </nav>

      {panelView === "catalog" ? <InventoryCatalogView /> : null}

      {panelView === "documents" ? (
      <>
      <div className="section-card__header compact">
        <div>
          <h3>{editingDocumentId ? "Editar documento" : "Registrar documento"}</h3>
          <p>
            {editingDocumentId
              ? "Corrige los datos de control de este documento."
              : "Da de alta un documento fuente para luego subir su PDF y analizarlo."}
          </p>
        </div>
        {!editingDocumentId ? (
          <button type="button" onClick={() => setFormOpen((open) => !open)}>
            {formOpen ? "Ocultar formulario" : "＋ Registrar documento"}
          </button>
        ) : null}
      </div>

      {formOpen || editingDocumentId ? (
      <form className="grid two" onSubmit={handleSubmit}>
        <label className="field">
          <span>Tipo de registro</span>
          <select
            value={form.targetType}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                targetType: event.target.value as InventoryTargetType,
              }))
            }
          >
            <option value="ACCOMMODATION">Alojamiento</option>
            <option value="ACTIVITY">Actividad</option>
            <option value="MIXED">Mixto</option>
            <option value="UNKNOWN">No estoy seguro</option>
          </select>
        </label>

        <label className="field">
          <span>Nombre de control</span>
          <input
            value={form.controlName}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                controlName: event.target.value,
              }))
            }
            placeholder="Ej. Hotel Calypso, Camping La Siesta, Actividades Valencia"
          />
        </label>

        <label className="field">
          <span>Ubicación</span>
          <input
            value={form.controlLocation ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                controlLocation: event.target.value,
              }))
            }
            placeholder="Ej. Valencia, Salou, Jaca"
          />
        </label>

        <label className="field">
          <span>Año / temporada</span>
          <input
            type="number"
            value={form.controlYear ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                controlYear: event.target.value ? Number(event.target.value) : null,
              }))
            }
            placeholder="2026"
          />
        </label>

        <label className="field">
          <span>Categoría</span>
          <input
            value={form.controlCategory ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                controlCategory: event.target.value,
              }))
            }
            placeholder="Hotel, Camping, Actividad náutica..."
          />
        </label>

        <label className="field">
          <span>Notas internas</span>
          <input
            value={form.controlNotes ?? ""}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                controlNotes: event.target.value,
              }))
            }
            placeholder="Observaciones para revisión interna"
          />
        </label>

        <div className="stack compact actions-row">
          <button className="primary" type="submit" disabled={saving}>
            {saving
              ? "Guardando..."
              : editingDocumentId
                ? "Guardar cambios"
                : "Registrar documento"}
          </button>
          {editingDocumentId ? (
            <button type="button" disabled={saving} onClick={handleCancelEdit}>
              Cancelar
            </button>
          ) : null}
        </div>
      </form>
      ) : null}

      <div className="section-card__header compact">
        <div>
          <h3>Documentos registrados</h3>
          <p>
            {loading
              ? "Cargando documentos..."
              : `${filteredDocuments.length} de ${documents.length} documento(s)`}
          </p>
        </div>
        <div className="stack compact actions-row">
          <input
            className="doc-search"
            type="search"
            value={documentFilter}
            onChange={(event) => setDocumentFilter(event.target.value)}
            placeholder="Buscar por nombre, ubicación o estado"
          />
          <button type="button" onClick={() => void loadDocuments()}>
            Actualizar
          </button>
        </div>
      </div>

      {deleteConfirm ? (
        <div className="alert alert--warning confirm-box" role="alertdialog">
          <p>
            ¿Borrar el documento <strong>{deleteConfirm.controlName}</strong>? Se eliminarán también
            sus candidatos staging ({deleteConfirm.dryRun.stagingAccommodations} alojamiento(s) y{" "}
            {deleteConfirm.dryRun.stagingActivities} actividad(es)). No afecta al inventario
            operativo ni a datos de Excel. Esta acción no se puede deshacer.
          </p>
          <div className="stack compact actions-row">
            <button
              type="button"
              className="primary"
              disabled={deleteBusyId === deleteConfirm.documentId}
              onClick={() => void handleConfirmDeleteDocument()}
            >
              {deleteBusyId === deleteConfirm.documentId ? "Borrando..." : "Sí, borrar documento"}
            </button>
            <button type="button" onClick={handleCancelDeleteDocument}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {!loading && documents.length === 0 ? (
        <div className="empty-state">
          <h4>Aún no hay documentos. Así funciona:</h4>
          <ol className="empty-state__steps">
            <li>Registra un documento (nombre del hotel/actividad, ubicación y año).</li>
            <li>Sube su PDF de tarifas y ejecuta el análisis de texto.</li>
            <li>Analízalo con IA para generar candidatos revisables.</li>
            <li>Revisa, aprueba o rechaza los candidatos en tablas.</li>
            <li>Publica los aprobados al inventario operativo (con dry-run y confirmación).</li>
          </ol>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setEditingDocumentId(null);
              setForm(initialForm);
              setFormOpen(true);
            }}
          >
            ＋ Registrar el primer documento
          </button>
        </div>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Ubicación</th>
              <th>Año</th>
              <th>Estado</th>
              <th>Por revisar</th>
              <th>Extracción</th>
              <th>Creado</th>
              <th>Acciones</th>
              <th>Archivo fuente</th>
            </tr>
          </thead>
          <tbody>
            {filteredDocuments.map((document) => {
              const selectedFile = selectedFiles[document.id];
              const isUploading = uploadingDocumentId === document.id;
              const isSelected = selectedDocumentId === document.id;

              return (
                <tr key={document.id} className={isSelected ? "is-selected" : undefined}>
                  <td>{document.controlName}</td>
                  <td>{targetTypeLabels[document.targetType]}</td>
                  <td>{document.controlLocation ?? "-"}</td>
                  <td>{document.controlYear ?? "-"}</td>
                  <td>{statusLabels[document.status] ?? document.status}</td>
                  <td>
                    {document.pendingReviewCount && document.pendingReviewCount > 0 ? (
                      <button
                        type="button"
                        className="status-tag status-tag--needs_changes status-tag--action"
                        title="Abrir candidatos pendientes"
                        onClick={() => void handleViewDetail(document.id, "pendientes")}
                      >
                        {document.pendingReviewCount} pendiente(s)
                      </button>
                    ) : document.candidateCount ? (
                      <span className="status-tag status-tag--approved">Revisado</span>
                    ) : (
                      <span className="rate-table__empty">Sin candidatos</span>
                    )}
                  </td>
                  <td>
                    {extractionStatusLabels[document.extractionStatus] ??
                      document.extractionStatus}
                  </td>
                  <td>{new Date(document.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="stack compact">
                      <button type="button" onClick={() => void handleViewDetail(document.id)}>
                        {isSelected ? "Detalle abierto" : "Ver detalle"}
                      </button>
                      <button
                        type="button"
                        className="link-action"
                        onClick={() => handleEditDocument(document)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="link-action link-action--reject"
                        disabled={deleteBusyId === document.id}
                        onClick={() => void handleRequestDeleteDocument(document)}
                      >
                        {deleteBusyId === document.id ? "Comprobando..." : "Eliminar"}
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="file-cell">
                      <input
                        className="file-cell__input"
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,image/*"
                        onChange={(event) => {
                          const file = event.target.files?.[0];

                          setSelectedFiles((current) => ({
                            ...current,
                            [document.id]: file,
                          }));
                        }}
                      />

                      {selectedFile ? (
                        <small className="file-cell__name">
                          Seleccionado: {selectedFile.name} (
                          {Math.round(selectedFile.size / 1024)} KB)
                        </small>
                      ) : (
                        <small className="file-cell__name file-cell__name--empty">
                          Sin archivo seleccionado.
                        </small>
                      )}

                      <button
                        type="button"
                        className="file-cell__button"
                        disabled={!selectedFile || isUploading}
                        onClick={() => void handleUpload(document.id)}
                      >
                        {isUploading ? "Subiendo..." : "Subir archivo"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!loading && filteredDocuments.length === 0 && (
              <tr>
                <td colSpan={10}>
                  {documents.length === 0
                    ? "Todavía no hay documentos registrados."
                    : "Ningún documento coincide con la búsqueda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedDocumentId ? (
        <DocumentWorkspace
          key={selectedDocumentId}
          documentId={selectedDocumentId}
          initialTab={selectedInitialTab}
          reloadToken={detailReloadToken}
          onChanged={loadDocuments}
          onClose={handleCloseDetail}
        />
      ) : null}
      </>
      ) : null}
    </section>
  );
}
