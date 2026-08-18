import { useEffect, useState } from "react";
import {
  createAuthUserApi,
  listAuthUsersApi,
  updateAuthUserApi,
  type AuthUser,
  type BackendDepartment,
  type BackendRole,
  type ManagedUser,
} from "../../services/apiClient";

interface UsersPanelProps {
  currentUser: AuthUser;
}

/** Los roles con ámbito de departamento (Groups/Sports); los globales no lo llevan. */
function roleUsesDepartment(role: BackendRole): boolean {
  return role === "DEPT_ADMIN" || role === "QUOTER";
}

export function UsersPanel({ currentUser }: UsersPanelProps) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<BackendRole>("QUOTER");
  const [department, setDepartment] = useState<BackendDepartment>("GROUPS");
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
      await createAuthUserApi({
        email: email.trim(),
        name: name.trim() || undefined,
        password,
        role,
        department: roleUsesDepartment(role) ? department : null,
      });
      setEmail("");
      setName("");
      setPassword("");
      setRole("QUOTER");
      setDepartment("GROUPS");
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

  function handleChangeRole(user: ManagedUser, nextRole: BackendRole) {
    // Al pasar a un rol de departamento sin tenerlo, se asigna Groups por defecto.
    const nextDepartment = roleUsesDepartment(nextRole)
      ? (user.department ?? "GROUPS")
      : null;
    void patch(user, { role: nextRole, department: nextDepartment }, "perfil cambiado");
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
          <p>
            Administrador global = todo · Administrador de departamento = su marca (Groups/Sports) ·
            Cotizador = crea cotizaciones y ve solo las suyas.
          </p>
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
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="persona@oraviatravel.com" />
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
          <select value={role} onChange={(e) => setRole(e.target.value as BackendRole)}>
            <option value="QUOTER">Cotizador (crea, ve solo lo suyo)</option>
            <option value="DEPT_ADMIN">Administrador de departamento</option>
            <option value="ADMIN">Administrador global (todo)</option>
          </select>
        </label>
        <label className="field" style={{ opacity: roleUsesDepartment(role) ? 1 : 0.45 }}>
          <span>Departamento</span>
          <select
            value={department}
            onChange={(e) => setDepartment(e.target.value as BackendDepartment)}
            disabled={!roleUsesDepartment(role)}
          >
            <option value="GROUPS">Groups</option>
            <option value="SPORTS">Sports</option>
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
              <th>Departamento</th>
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
                    <select
                      value={user.role}
                      onChange={(e) => handleChangeRole(user, e.target.value as BackendRole)}
                      disabled={isSelf}
                      aria-label={`Perfil de ${user.email}`}
                    >
                      <option value="QUOTER">Cotizador</option>
                      <option value="DEPT_ADMIN">Admin. departamento</option>
                      <option value="ADMIN">Admin. global</option>
                      {user.role === "USER" ? <option value="USER">Usuario (heredado)</option> : null}
                    </select>
                  </td>
                  <td>
                    {roleUsesDepartment(user.role) ? (
                      <select
                        value={user.department ?? "GROUPS"}
                        onChange={(e) =>
                          void patch(
                            user,
                            { department: e.target.value as BackendDepartment },
                            "departamento cambiado",
                          )
                        }
                        aria-label={`Departamento de ${user.email}`}
                      >
                        <option value="GROUPS">Groups</option>
                        <option value="SPORTS">Sports</option>
                      </select>
                    ) : (
                      <span className="status-tag">Todos</span>
                    )}
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
                <td colSpan={7}>No hay usuarios.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
