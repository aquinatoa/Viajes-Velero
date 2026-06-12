import { useEffect, useState } from "react";
import type {
  CreateSourceDocumentInput,
  InventoryTargetType,
  SourceDocumentSummary,
} from "../../domain/documentImportTypes";
import {
  createInventoryDocumentApi,
  listInventoryDocumentsApi,
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
  const [form, setForm] = useState<CreateSourceDocumentInput>(initialForm);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | undefined>>({});
  const [uploadingDocumentId, setUploadingDocumentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function loadDocuments() {
    setLoading(true);
    try {
      const result = await listInventoryDocumentsApi();
      setDocuments(result);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.controlName.trim()) {
      alert("Indica el nombre del alojamiento, actividad o proveedor.");
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
      await loadDocuments();
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo crear el documento.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(documentId: string) {
    const file = selectedFiles[documentId];

    if (!file) {
      alert("Selecciona un archivo antes de subirlo.");
      return;
    }

    setUploadingDocumentId(documentId);
    try {
      await uploadInventoryDocumentFileApi(documentId, file);
      setSelectedFiles((current) => ({
        ...current,
        [documentId]: undefined,
      }));
      await loadDocuments();
      alert("Archivo subido correctamente.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo subir el archivo.");
    } finally {
      setUploadingDocumentId(null);
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
              <th>Archivo fuente</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => {
              const selectedFile = selectedFiles[document.id];
              const isUploading = uploadingDocumentId === document.id;

              return (
                <tr key={document.id}>
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
                <td colSpan={8}>Todavía no hay documentos registrados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}