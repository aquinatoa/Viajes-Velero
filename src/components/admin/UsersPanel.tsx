import { useEffect, useState } from "react";
import {
  createAuthUserApi,
  listAuthUsersApi,
  updateAuthUserApi,
  type AuthUser,
  type ManagedUser,
} from "../../services/apiClient";

interface UsersPanelProps {
  currentUser: AuthUser;
}

const roleLabels: Record<string, string> = { ADMIN: "Administrador", USER: "Usuario" };

export function UsersPanel({ currentUser }: UsersPanelProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "USER">("USER");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setUsers((await listAuthUsersApi()).users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los usuarios.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFeedback("");
    if (!email.trim() || password.length < 8) {
      setError("Email válido y contraseña de al menos 8 caracteres.");
      return;
    }
    setSaving(true);
    try {
      await createAuthUserApi({ email: email.trim(), name: name.trim() || undefined, password, role });
      setEmail("");
      setName("");
      setPassword("");
      setRole("USER");
      setFeedback("Usuario creado.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el usuario.");
    } finally {
      setSaving(false);
    }
  }

  async function patch(user: ManagedUser, change: Parameters<typeof updateAuthUserApi>[1], label: string) {
    setError("");
    setFeedback("");
    try {
      await updateAuthUserApi(user.id, change);
      setFeedback(`${user.email}: ${label}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el usuario.");
    }
  }

  function handleResetPassword(user: ManagedUser) {
    const next = window.prompt(`Nueva contraseña para ${user.email} (mín. 8 caracteres):`);
    if (next == null) return;
    if (next.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    void patch(user, { password: next }, "contraseña restablecida");
  }

  return (
    <section className="section-card">
      <div className="section-card__header">
        <div>
          <h2>Usuarios y permisos</h2>
          <p>Gestiona el acceso. Administrador hace todo; Usuario solo el flujo comercial.</p>
        </div>
        <button type="button" onClick={() => void load()}>
          Actualizar
        </button>
      </div>

      {error ? (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      ) : null}
      {feedback ? (
        <div className="alert alert--success" role="status">
          {feedback}
        </div>
      ) : null}

      <form className="form-grid" onSubmit={handleCreate}>
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@viajesvelero.com" />
        </label>
        <label className="field">
          <span>Nombre (opcional)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellidos" />
        </label>
        <label className="field">
          <span>Contraseña (mín. 8)</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </label>
        <label className="field">
          <span>Perfil</span>
          <select value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "USER")}>
            <option value="USER">Usuario (solo propuestas)</option>
            <option value="ADMIN">Administrador (todo)</option>
          </select>
        </label>
        <div className="stack compact actions-row">
          <button className="primary" type="submit" disabled={saving}>
            {saving ? "Creando..." : "Crear usuario"}
          </button>
        </div>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Nombre</th>
              <th>Perfil</th>
              <th>Estado</th>
              <th>Creado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === currentUser.id;
              return (
                <tr key={user.id}>
                  <td>{user.email}{isSelf ? " (tú)" : ""}</td>
                  <td>{user.name ?? "—"}</td>
                  <td>
                    <span className={`status-tag ${user.role === "ADMIN" ? "status-tag--approved" : ""}`}>
                      {roleLabels[user.role]}
                    </span>
                  </td>
                  <td>
                    <span className={`status-tag ${user.isActive ? "status-tag--approved" : "status-tag--rejected"}`}>
                      {user.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="stack compact">
                      <button
                        type="button"
                        className="link-action"
                        onClick={() =>
                          void patch(
                            user,
                            { role: user.role === "ADMIN" ? "USER" : "ADMIN" },
                            "perfil cambiado",
                          )
                        }
                        disabled={isSelf}
                      >
                        {user.role === "ADMIN" ? "Hacer Usuario" : "Hacer Administrador"}
                      </button>
                      <button
                        type="button"
                        className="link-action"
                        onClick={() => void patch(user, { isActive: !user.isActive }, user.isActive ? "desactivado" : "activado")}
                        disabled={isSelf}
                      >
                        {user.isActive ? "Desactivar" : "Activar"}
                      </button>
                      <button type="button" className="link-action" onClick={() => handleResetPassword(user)}>
                        Restablecer contraseña
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && users.length === 0 ? (
              <tr>
                <td colSpan={6}>No hay usuarios.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
