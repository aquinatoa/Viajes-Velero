import { useEffect, useState } from "react";
import { auditLogApi, type AuditEntry } from "../../services/apiClient";

const actionLabels: Record<string, string> = {
  LOGIN: "Inicio de sesión",
  LOGOUT: "Cierre de sesión",
  USER_CREATE: "Crear usuario",
  USER_UPDATE: "Actualizar usuario",
  PASSWORD_CHANGE: "Cambio de contraseña",
  INVENTORY_PUBLISH: "Publicar inventario",
  INVENTORY_UNPUBLISH: "Retirar inventario",
  INVENTORY_DELETE_DOCUMENT: "Borrar documento",
  CRM_OPPORTUNITY_CREATE: "Crear oportunidad CRM",
};

export function AuditPanel() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setEntries((await auditLogApi(200)).entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la auditoría.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="section-card">
      <div className="section-card__header">
        <div>
          <h2>Auditoría</h2>
          <p>Registro de acciones relevantes realizadas en la herramienta (últimas 200).</p>
        </div>
        <button type="button" onClick={() => void load()}>
          {loading ? "Cargando..." : "Actualizar"}
        </button>
      </div>

      {error ? (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Usuario</th>
              <th>Perfil</th>
              <th>Acción</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{new Date(entry.createdAt).toLocaleString()}</td>
                <td>{entry.userEmail ?? "—"}</td>
                <td>{entry.role ?? "—"}</td>
                <td>{actionLabels[entry.action] ?? entry.action}</td>
                <td>{entry.detail ?? "—"}</td>
              </tr>
            ))}
            {!loading && entries.length === 0 ? (
              <tr>
                <td colSpan={5}>Sin registros todavía.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
