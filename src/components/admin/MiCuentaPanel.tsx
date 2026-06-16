import { useState } from "react";
import { changeOwnPasswordApi, type AuthUser } from "../../services/apiClient";

interface MiCuentaPanelProps {
  currentUser: AuthUser;
}

export function MiCuentaPanel({ currentUser }: MiCuentaPanelProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const isAdmin = currentUser.role === "ADMIN";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!currentPassword) {
      setError("Indica tu contraseña actual.");
      return;
    }
    if (newPassword.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("La nueva contraseña y su confirmación no coinciden.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("La nueva contraseña debe ser distinta de la actual.");
      return;
    }

    setSaving(true);
    try {
      await changeOwnPasswordApi({ currentPassword, newPassword });
      setMessage("Contraseña actualizada. Tus otras sesiones se han cerrado.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="section-card">
      <div className="section-card__header">
        <div>
          <h2>Mi cuenta</h2>
          <p>Consulta tus datos y cambia tu contraseña.</p>
        </div>
      </div>

      <div className="grid two">
        <div className="field">
          <span>Nombre</span>
          <strong>{currentUser.name || "—"}</strong>
        </div>
        <div className="field">
          <span>Email</span>
          <strong>{currentUser.email}</strong>
        </div>
        <div className="field">
          <span>Perfil</span>
          <strong>{isAdmin ? "Administrador" : "Usuario"}</strong>
        </div>
      </div>

      <div className="section-card__header compact">
        <div>
          <h3>Cambiar contraseña</h3>
          <p>Por seguridad, al cambiarla se cerrarán tus otras sesiones abiertas.</p>
        </div>
      </div>

      {error ? (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="alert alert--success" role="status">
          {message}
        </div>
      ) : null}

      <form className="form-grid" onSubmit={handleSubmit}>
        <label className="field">
          <span>Contraseña actual</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
          />
        </label>
        <div />
        <label className="field">
          <span>Nueva contraseña (mín. 8)</span>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label className="field">
          <span>Repetir nueva contraseña</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
          />
        </label>
        <div className="actions-row">
          <button className="primary" type="submit" disabled={saving}>
            {saving ? "Guardando..." : "Cambiar contraseña"}
          </button>
        </div>
      </form>
    </section>
  );
}
