/**
 * Menú lateral de Viajes Velero · Operaciones.
 *
 * Moderno, colapsable, animado, modular y responsive. Conserva la identidad
 * (azul-petróleo de marca + acento verde) y navega por ruta. La configuración
 * de items/permisos vive en `sidebar.config.ts`; el estado de interacción
 * (colapso/drawer/submenús) en `useSidebar.ts`. El contenedor (`App`) es dueño
 * del estado de UI para que el layout principal ajuste su ancho.
 */
import type { AuthUser } from "../../services/apiClient";
import { visibleSections, type SidebarRole } from "./sidebar.config";
import type { SidebarUi } from "./useSidebar";
import { SidebarSection } from "./SidebarSection";
import {
  CloseIcon,
  CollapseIcon,
  LogoutIcon,
  MenuBarsIcon,
  SailboatIcon,
} from "./icons";

interface SidebarProps {
  user: AuthUser;
  currentPath: string;
  onNavigate: (route: string) => void;
  onLogout: () => void;
  ui: SidebarUi;
}

/** Mapea el rol del backend (ADMIN/USER) al modelo de permisos del menú. */
function roleFromUser(user: AuthUser): SidebarRole {
  return user.role === "ADMIN" ? "admin" : "comercial";
}

export function Sidebar({ user, currentPath, onNavigate, onLogout, ui }: SidebarProps) {
  const role = roleFromUser(user);
  const sections = visibleSections(role);
  const { collapsed, mobileOpen } = ui;

  function navigate(route: string) {
    onNavigate(route);
    ui.closeMobile();
  }

  return (
    <>
      {/* Botón hamburguesa (solo móvil, vía CSS). */}
      <button
        type="button"
        className="sb-hamburger"
        onClick={ui.openMobile}
        aria-label="Abrir menú"
        aria-expanded={mobileOpen}
      >
        <MenuBarsIcon />
      </button>

      {/* Overlay del drawer móvil. */}
      {mobileOpen ? (
        <div className="sb-overlay" onClick={ui.closeMobile} aria-hidden />
      ) : null}

      <aside
        className={[
          "sb-sidebar",
          collapsed ? "sb-sidebar--collapsed" : "",
          mobileOpen ? "sb-sidebar--open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        aria-label="Navegación principal"
      >
        <div className="sb-brand">
          <span className="sb-brand__logo" aria-hidden>
            <SailboatIcon />
          </span>
          {!collapsed ? (
            <div className="sb-brand__text">
              <strong>Viajes Velero</strong>
              <span>Operaciones</span>
            </div>
          ) : null}

          {/* Contraer/expandir (escritorio). */}
          <button
            type="button"
            className="sb-brand__collapse"
            onClick={ui.toggleCollapsed}
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
            title={collapsed ? "Expandir menú" : "Contraer menú"}
          >
            <CollapseIcon />
          </button>

          {/* Cerrar drawer (móvil). */}
          <button
            type="button"
            className="sb-brand__close"
            onClick={ui.closeMobile}
            aria-label="Cerrar menú"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="sb-nav" aria-label="Secciones">
          {sections.map((section) => (
            <SidebarSection
              key={section.id}
              section={section}
              role={role}
              currentPath={currentPath}
              collapsed={collapsed}
              isMenuOpen={ui.isMenuOpen}
              onToggleMenu={ui.toggleMenu}
              onNavigate={navigate}
              onExpandForSubmenu={() => ui.setCollapsed(false)}
            />
          ))}
        </nav>

        <div className="sb-footer">
          <div className="sb-footer__user" title={user.name || user.email}>
            <span className="sb-footer__avatar" aria-hidden>
              {(user.name || user.email || "?").trim().charAt(0).toUpperCase()}
            </span>
            {!collapsed ? (
              <span className="sb-footer__meta">
                <strong>{user.name || user.email}</strong>
                <span>{role === "admin" ? "Administrador" : "Usuario"}</span>
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="sb-footer__logout"
            onClick={onLogout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogoutIcon />
            {!collapsed ? <span>Cerrar sesión</span> : null}
          </button>
        </div>
      </aside>
    </>
  );
}
