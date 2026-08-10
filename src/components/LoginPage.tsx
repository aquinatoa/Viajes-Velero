import { useMemo, useState } from "react";
import { loginApi, type AuthUser } from "../services/apiClient";
import { BRAND_SHORT, BRAND_EMAIL_PLACEHOLDER } from "../brand";
import isotipo from "../assets/oravia-isotipo.png";
import isotipoBlanco from "../assets/oravia-isotipo-blanco.png";

interface LoginPageProps {
  onLoggedIn: (user: AuthUser) => void;
}

/**
 * Departamento deducido del correo, NO elegido por el usuario: las cuentas
 * groups@ y sports@ son compartidas y ya llevan el departamento dentro. Esto
 * es solo una confirmación visual; quien manda es el `department` que el
 * backend devuelve tras autenticar.
 */
function departmentFromEmail(email: string): "Groups" | "Sports" | null {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  if (local.startsWith("sports")) return "Sports";
  if (local.startsWith("groups")) return "Groups";
  return null;
}

export function LoginPage({ onLoggedIn }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const department = useMemo(() => departmentFromEmail(email), [email]);

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
    <div
      className="login-screen"
      style={{ ["--login-backdrop" as string]: `url(${isotipoBlanco})` }}
    >
      <form className="login-card" onSubmit={handleSubmit}>
        <header className="login-card__head">
          <div className="login-card__id">
            <img className="login-card__mark" src={isotipo} alt="" width={40} height={39} />
            <div>
              <p className="login-card__name">{BRAND_SHORT}</p>
              <p className="login-card__unit">Consola de operaciones</p>
            </div>
          </div>
          <span
            className={`login-dept${department ? ` login-dept--${department.toLowerCase()}` : ""}`}
            aria-live="polite"
          >
            {department}
          </span>
        </header>

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
            placeholder={BRAND_EMAIL_PLACEHOLDER}
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

        <button className="primary login-card__submit" type="submit" disabled={busy}>
          {busy ? (
            <>
              <span className="login-spinner" aria-hidden="true" />
              Entrando
            </>
          ) : (
            "Entrar"
          )}
        </button>

        <p className="login-card__help">¿No puedes entrar? Avisa a tu administrador.</p>
      </form>
    </div>
  );
}
