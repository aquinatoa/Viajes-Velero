import { useEffect, useState } from "react";
import type {
  CreateSourceDocumentInput,
  InventoryDocumentDetail,
  InventoryTargetType,
  SourceDocumentSummary,
} from "../../domain/documentImportTypes";
import {
  analyzeInventoryDocumentApi,
  approveInventoryDocumentApi,
  createInventoryDocumentApi,
  getInventoryDocumentApi,
  listInventoryDocumentsApi,
  publishInventoryDocumentApi,
  rejectInventoryDocumentApi,
  uploadInventoryDocumentFileApi,
} from "../../services/apiClient";

const targetTypeLabels: Record<InventoryTargetType, string> = {
  ACCOMMODATION: "Alojamiento",
  ACTIVITY: "Actividad",
  MIXED: "Mixto",
  UNKNOWN: "No estoy seguro",
};

const statusLabels: Record<string, string> = {
  UPLOADED: "Subido",
  ANALYZING: "Analizando",
  PENDING_REVIEW: "Pendiente de revisión",
  PARTIALLY_REVIEWED: "Revisado parcialmente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  PUBLISHED: "Publicado",
};

const extractionStatusLabels: Record<string, string> = {
  NOT_STARTED: "No iniciado",
  EXTRACTING: "Extrayendo",
  EXTRACTED: "Extraído",
  PARTIALLY_EXTRACTED: "Extraído parcialmente",
  FAILED: "Fallido",
  NEEDS_OCR: "Requiere OCR",
};

const extractionMethodLabels: Record<string, string> = {
  TEXT: "Texto",
  TABLE: "Tabla",
  OCR: "OCR",
  AI: "IA",
  MANUAL: "Manual",
};

const issueSeverityLabels: Record<string, string> = {
  INFO: "Información",
  WARNING: "Aviso",
  ERROR: "Error",
  CRITICAL: "Crítico",
};

type DocumentActionKey = "analyze" | "approve" | "reject" | "publish";

const initialForm: CreateSourceDocumentInput = {
  targetType: "ACCOMMODATION",
  controlName: "",
  controlLocation: "",
  controlYear: new Date().getFullYear(),
  controlCategory: "",
  controlNotes: "",
};

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString();
}

function formatFileSize(bytes?: number | null) {
  if (bytes == null) {
    return "-";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${Math.round(kilobytes)} KB`;
  }

  return `${(kilobytes / 1024).toFixed(2)} MB`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function InventoryDocumentsPanel() {
  const [documents, setDocuments] = useState<SourceDocumentSummary[]>([]);
  const [form, setForm] = useState<CreateSourceDocumentInput>(initialForm);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | undefined>>({});
  const [uploadingDocumentId, setUploadingDocumentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InventoryDocumentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<DocumentActionKey | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

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

  async function refreshDetail(documentId: string) {
    const updatedDetail = await getInventoryDocumentApi(documentId);
    setDetail(updatedDetail);
    return updatedDetail;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setFeedbackMessage(null);

    if (!form.controlName.trim()) {
      setErrorMessage("Indica el nombre del alojamiento, actividad o proveedor.");
      return;
    }

    setSaving(true);
    try {
      await createInventoryDocumentApi({
        ...form,
        controlName: form.controlName.trim(),
        controlLocation: form.controlLocation?.trim() || undefined,
        controlCategory: form.controlCategory?.trim() || undefined,
        controlNotes: form.controlNotes?.trim() || undefined,
        controlYear: form.controlYear ? Number(form.controlYear) : null,
      });

      setForm(initialForm);
      setFeedbackMessage("Documento registrado correctamente.");
      await loadDocuments();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo crear el documento."));
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

      if (selectedDocumentId === documentId) {
        await refreshDetail(documentId);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo subir el archivo."));
    } finally {
      setUploadingDocumentId(null);
    }
  }

  async function handleViewDetail(documentId: string) {
    setSelectedDocumentId(documentId);
    setDetail(null);
    setErrorMessage(null);
    setFeedbackMessage(null);
    setDetailLoading(true);
    try {
      await refreshDetail(documentId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo cargar el detalle del documento."));
    } finally {
      setDetailLoading(false);
    }
  }

  function handleCloseDetail() {
    setSelectedDocumentId(null);
    setDetail(null);
    setActionInProgress(null);
  }

  async function handleDocumentAction(action: DocumentActionKey) {
    if (!selectedDocumentId) {
      return;
    }

    setErrorMessage(null);
    setFeedbackMessage(null);
    setActionInProgress(action);

    try {
      if (action === "analyze") {
        await analyzeInventoryDocumentApi(selectedDocumentId);
        setFeedbackMessage("Análisis ejecutado. El documento quedó pendiente de revisión.");
      } else if (action === "approve") {
        await approveInventoryDocumentApi(selectedDocumentId);
        setFeedbackMessage("Documento aprobado.");
      } else if (action === "reject") {
        await rejectInventoryDocumentApi(selectedDocumentId);
        setFeedbackMessage("Documento rechazado.");
      } else if (action === "publish") {
        await publishInventoryDocumentApi(selectedDocumentId);
        setFeedbackMessage("Documento publicado.");
      }

      await refreshDetail(selectedDocumentId);
      await loadDocuments();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "No se pudo completar la acción sobre el documento."));
    } finally {
      setActionInProgress(null);
    }
  }

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

        <div>
          <button className="primary" type="submit" disabled={saving}>
            {saving ? "Guardando..." : "Registrar documento"}
          </button>
        </div>
      </form>

      <div className="section-card__header compact">
        <div>
          <h3>Documentos registrados</h3>
          <p>{loading ? "Cargando documentos..." : `${documents.length} documento(s)`}</p>
        </div>
        <button type="button" onClick={() => void loadDocuments()}>
          Actualizar
        </button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Ubicación</th>
              <th>Año</th>
              <th>Estado</th>
              <th>Extracción</th>
              <th>Creado</th>
              <th>Acciones</th>
              <th>Archivo fuente</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => {
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
                    {extractionStatusLabels[document.extractionStatus] ??
                      document.extractionStatus}
                  </td>
                  <td>{new Date(document.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button type="button" onClick={() => void handleViewDetail(document.id)}>
                      {isSelected ? "Detalle abierto" : "Ver detalle"}
                    </button>
                  </td>
                  <td>
                    <div className="stack compact">
                      <input
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
                        <small>
                          Seleccionado: {selectedFile.name} (
                          {Math.round(selectedFile.size / 1024)} KB)
                        </small>
                      ) : null}

                      <button
                        type="button"
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

            {!loading && documents.length === 0 && (
              <tr>
                <td colSpan={9}>Todavía no hay documentos registrados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedDocumentId ? (
        <div className="section-card__detail">
          <div className="section-card__header compact">
            <div>
              <h3>Detalle del documento</h3>
              <p>Revisión humana del documento seleccionado.</p>
            </div>
            <button type="button" onClick={handleCloseDetail}>
              Cerrar detalle
            </button>
          </div>

          {detailLoading ? <p>Cargando detalle...</p> : null}

          {!detailLoading && detail ? (
            <div className="stack">
              <div className="grid two">
                <div className="field">
                  <span>Nombre de control</span>
                  <strong>{detail.controlName}</strong>
                </div>
                <div className="field">
                  <span>Tipo de registro</span>
                  <strong>{targetTypeLabels[detail.targetType]}</strong>
                </div>
                <div className="field">
                  <span>Estado</span>
                  <strong>{statusLabels[detail.status] ?? detail.status}</strong>
                </div>
                <div className="field">
                  <span>Extracción</span>
                  <strong>
                    {extractionStatusLabels[detail.extractionStatus] ??
                      detail.extractionStatus}
                  </strong>
                </div>
                <div className="field">
                  <span>Creado</span>
                  <strong>{formatDateTime(detail.createdAt)}</strong>
                </div>
                <div className="field">
                  <span>Actualizado</span>
                  <strong>{formatDateTime(detail.updatedAt)}</strong>
                </div>
                {detail.processedAt ? (
                  <div className="field">
                    <span>Procesado</span>
                    <strong>{formatDateTime(detail.processedAt)}</strong>
                  </div>
                ) : null}
                {detail.controlNotes ? (
                  <div className="field">
                    <span>Notas internas</span>
                    <strong>{detail.controlNotes}</strong>
                  </div>
                ) : null}
              </div>

              <div className="section-card__header compact">
                <div>
                  <h4>Archivo fuente</h4>
                </div>
              </div>

              {detail.originalFileName ? (
                <div className="grid two">
                  <div className="field">
                    <span>Nombre original</span>
                    <strong>{detail.originalFileName}</strong>
                  </div>
                  <div className="field">
                    <span>Tipo MIME</span>
                    <strong>{detail.fileMimeType ?? "-"}</strong>
                  </div>
                  <div className="field">
                    <span>Tamaño</span>
                    <strong>{formatFileSize(detail.fileSizeBytes)}</strong>
                  </div>
                  <div className="field">
                    <span>Hash</span>
                    <strong className="break-all">{detail.fileHash ?? "-"}</strong>
                  </div>
                </div>
              ) : (
                <p>Todavía no se ha subido ningún archivo fuente para este documento.</p>
              )}

              <div className="section-card__header compact">
                <div>
                  <h4>Acciones de revisión</h4>
                  <p>El análisis es un marcador de posición; la extracción real llegará después.</p>
                </div>
              </div>

              <div className="stack compact actions-row">
                <button
                  type="button"
                  className="primary"
                  disabled={actionInProgress !== null}
                  onClick={() => void handleDocumentAction("analyze")}
                >
                  {actionInProgress === "analyze" ? "Analizando..." : "Ejecutar análisis"}
                </button>
                <button
                  type="button"
                  disabled={actionInProgress !== null}
                  onClick={() => void handleDocumentAction("approve")}
                >
                  {actionInProgress === "approve" ? "Aprobando..." : "Aprobar"}
                </button>
                <button
                  type="button"
                  disabled={actionInProgress !== null}
                  onClick={() => void handleDocumentAction("reject")}
                >
                  {actionInProgress === "reject" ? "Rechazando..." : "Rechazar"}
                </button>
                <button
                  type="button"
                  disabled={actionInProgress !== null}
                  onClick={() => void handleDocumentAction("publish")}
                >
                  {actionInProgress === "publish" ? "Publicando..." : "Publicar"}
                </button>
              </div>

              <div className="section-card__header compact">
                <div>
                  <h4>Incidencias de importación</h4>
                  <p>{detail.importIssues.length} incidencia(s)</p>
                </div>
              </div>

              {detail.importIssues.length > 0 ? (
                <ul className="detail-list">
                  {detail.importIssues.map((issue) => (
                    <li key={issue.id}>
                      <strong>{issueSeverityLabels[issue.severity] ?? issue.severity}</strong>
                      {" · "}
                      <span>{issue.issueType}</span>
                      <br />
                      <span>{issue.message}</span>
                      {issue.resolved ? <em> (resuelta)</em> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No hay incidencias registradas.</p>
              )}

              <div className="section-card__header compact">
                <div>
                  <h4>Extracciones</h4>
                  <p>{detail.extractions.length} extracción(es)</p>
                </div>
              </div>

              {detail.extractions.length > 0 ? (
                <ul className="detail-list">
                  {detail.extractions.map((extraction) => (
                    <li key={extraction.id}>
                      <strong>
                        {extractionMethodLabels[extraction.extractionMethod] ??
                          extraction.extractionMethod}
                      </strong>
                      {extraction.pageNumber != null ? (
                        <span> · Página {extraction.pageNumber}</span>
                      ) : null}
                      {extraction.confidenceScore != null ? (
                        <span> · Confianza {extraction.confidenceScore}</span>
                      ) : null}
                      {extraction.rawText ? (
                        <>
                          <br />
                          <span>{extraction.rawText}</span>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No hay extracciones registradas.</p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
