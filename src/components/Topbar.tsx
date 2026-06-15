/**
 * Barra superior de la consola: contexto a la izquierda y acciones a la derecha
 * (notificaciones, ayuda y menú de usuario con "Cerrar sesión"). Los desplegables
 * se cierran al pulsar fuera o con Escape. Honesto: no inventa contadores; la
 * campana muestra "sin notificaciones" mientras no haya una fuente real.
 */
import { useEffect, useRef, useState } from "react";
import type { AuthUser } from "../services/apiClient";

type OpenMenu = "bell" | "help" | "user" | null;

interface TopbarProps {
  user: AuthUser;
  pageLabel: string;
  onLogout: () => void;
}

function initials(user: AuthUser): string {
  const source = (user.name || user.email || "?").trim();
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 2.5" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function Topbar({ user, pageLabel, onLogout }: TopbarProps) {
  const [open, setOpen] = useState<OpenMenu>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Cerrar desplegables al pulsar fuera o con Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (menu: OpenMenu) => setOpen((current) => (current === menu ? null : menu));
  const isAdmin = user.role === "ADMIN";

  return (
    <header className="topbar" ref={rootRef}>
      <div className="topbar__context">
        <span className="topbar__brand">Viajes Velero</span>
        <span className="topbar__sep" aria-hidden>
          /
        </span>
        <span className="topbar__page">{pageLabel}</span>
      </div>

      <div className="topbar__actions">
        {/* Notificaciones */}
        <div className="topbar__menu">
          <button
            type="button"
            className={`topbar__icon-btn ${open === "bell" ? "is-open" : ""}`}
            onClick={() => toggle("bell")}
            aria-label="Notificaciones"
            aria-expanded={open === "bell"}
            aria-haspopup="true"
          >
            <BellIcon />
          </button>
          {open === "bell" ? (
            <div className="topbar__popover" role="menu">
              <p className="topbar__popover-title">Notificaciones</p>
              <p className="topbar__popover-empty">No tienes notificaciones.</p>
            </div>
          ) : null}
        </div>

        {/* Ayuda */}
        <div className="topbar__menu">
          <button
            type="button"
            className={`topbar__icon-btn ${open === "help" ? "is-open" : ""}`}
            onClick={() => toggle("help")}
            aria-label="Ayuda"
            aria-expanded={open === "help"}
            aria-haspopup="true"
          >
            <HelpIcon />
          </button>
          {open === "help" ? (
            <div className="topbar__popover" role="menu">
              <p className="topbar__popover-title">Ayuda</p>
              <p className="topbar__popover-text">
                Consola interna de operaciones: propuestas comerciales (Nuevo/Existente) e
                inventario documental. Usa el menú lateral para moverte entre módulos.
              </p>
            </div>
          ) : null}
        </div>

        {/* Menú de usuario */}
        <div className="topbar__menu">
          <button
            type="button"
            className={`topbar__user ${open === "user" ? "is-open" : ""}`}
            onClick={() => toggle("user")}
            aria-label="Menú de usuario"
            aria-expanded={open === "user"}
            aria-haspopup="true"
          >
            <span className="topbar__avatar" aria-hidden>
              {initials(user)}
            </span>
            <span className="topbar__user-meta">
              <strong>{user.name || user.email}</strong>
              <span>{isAdmin ? "Administrador" : "Usuario"}</span>
            </span>
            <span className="topbar__chevron" aria-hidden>
              <ChevronDownIcon />
            </span>
          </button>
          {open === "user" ? (
            <div className="topbar__popover topbar__popover--user" role="menu">
              <div className="topbar__popover-head">
                <strong>{user.name || user.email}</strong>
                <span>{user.email}</span>
                <span className={`topbar__role topbar__role--${isAdmin ? "admin" : "user"}`}>
                  {isAdmin ? "Administrador" : "Usuario"}
                </span>
              </div>
              <button
                type="button"
                className="topbar__logout"
                role="menuitem"
                onClick={() => {
                  setOpen(null);
                  onLogout();
                }}
              >
                Cerrar sesión
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
