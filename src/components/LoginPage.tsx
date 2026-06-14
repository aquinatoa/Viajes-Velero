import { useState } from "react";
import { loginApi, type AuthUser } from "../services/apiClient";

interface LoginPageProps {
  onLoggedIn: (user: AuthUser) => void;
}

export function LoginPage({ onLoggedIn }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Introduce tu email y contraseña.");
      return;
    }
    setBusy(true);
    try {
      const result = await loginApi(email.trim(), password);
      onLoggedIn(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="eyebrow">MVP interno de operaciones</span>
          <h1>Viajes Velero</h1>
          <p>Accede con tu cuenta para continuar.</p>
        </div>

        {error ? (
          <div className="alert alert--error" role="alert">
            {error}
          </div>
        ) : null}

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tu@viajesvelero.com"
            autoFocus
          />
        </label>

        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
          />
        </label>

        <button className="primary" type="submit" disabled={busy}>
          {busy ? "Entrando..." : "Iniciar sesión"}
        </button>
      </form>
    </div>
  );
}
