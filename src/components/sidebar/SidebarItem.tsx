/**
 * Un item del menú lateral (con su submenú opcional).
 *
 * Estados: activo (ruta actual), hover, deshabilitado ("próximamente") y submenú
 * abierto/cerrado. En modo colapsado solo muestra el icono y un tooltip con
 * label + descripción. Navega por ruta vía `onNavigate`.
 */
import { canSee, type SidebarItem, type SidebarRole } from "./sidebar.config";
import { ChevronIcon, MenuIcon } from "./icons";

interface SidebarItemProps {
  item: SidebarItem;
  role: SidebarRole;
  currentPath: string;
  collapsed: boolean;
  menuOpen: boolean;
  onToggleMenu: (id: string) => void;
  onNavigate: (route: string) => void;
  /** Al pulsar un padre con hijos en modo colapsado: expandir el menú primero. */
  onExpandForSubmenu: () => void;
}

function renderBadge(badge: SidebarItem["badge"]) {
  if (badge == null || badge === 0) return null;
  return <span className="sb-badge">{badge}</span>;
}

export function SidebarItemRow({
  item,
  role,
  currentPath,
  collapsed,
  menuOpen,
  onToggleMenu,
  onNavigate,
  onExpandForSubmenu,
}: SidebarItemProps) {
  const children = (item.children ?? []).filter((child) => canSee(child.permissions, role));
  const hasChildren = children.length > 0;
  const disabled = item.status === "disabled";

  const childActive = children.some((child) => child.route && child.route === currentPath);
  const selfActive = !!item.route && item.route === currentPath;
  const active = selfActive || (childActive && !menuOpen);

  const tooltip = collapsed ? (
    <span className="sb-tooltip" role="tooltip">
      <strong>{item.label}</strong>
      {item.description ? <span>{item.description}</span> : null}
      {disabled ? <span className="sb-tooltip__muted">No disponible</span> : null}
    </span>
  ) : null;

  function handleClick() {
    if (disabled) return;
    if (hasChildren && collapsed) {
      // Colapsado: expandir el menú y abrir el submenú para poder elegir.
      onExpandForSubmenu();
      if (!menuOpen) onToggleMenu(item.id);
      return;
    }
    if (item.route) onNavigate(item.route);
    if (hasChildren && !collapsed && !menuOpen) onToggleMenu(item.id);
  }

  return (
    <li className="sb-item-wrap">
      <div
        className={[
          "sb-item",
          active ? "sb-item--active" : "",
          disabled ? "sb-item--disabled" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          type="button"
          className="sb-item__main"
          onClick={handleClick}
          disabled={disabled}
          aria-current={selfActive ? "page" : undefined}
          aria-disabled={disabled || undefined}
          title={disabled ? "No disponible" : undefined}
        >
          <span className="sb-item__icon">
            <MenuIcon name={item.icon} />
          </span>
          <span className="sb-item__text">
            <span className="sb-item__label">{item.label}</span>
            {item.description ? (
              <span className="sb-item__desc">{item.description}</span>
            ) : null}
          </span>
          {renderBadge(item.badge)}
        </button>

        {hasChildren && !collapsed ? (
          <button
            type="button"
            className={`sb-item__chevron ${menuOpen ? "sb-item__chevron--open" : ""}`}
            onClick={() => onToggleMenu(item.id)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? `Contraer ${item.label}` : `Expandir ${item.label}`}
          >
            <ChevronIcon />
          </button>
        ) : null}

        {tooltip}
      </div>

      {hasChildren && !collapsed ? (
        <ul className={`sb-submenu ${menuOpen ? "sb-submenu--open" : ""}`}>
          {children.map((child) => {
            const childIsActive = !!child.route && child.route === currentPath;
            const childDisabled = child.status === "disabled";
            return (
              <li key={child.id}>
                <button
                  type="button"
                  className={[
                    "sb-subitem",
                    childIsActive ? "sb-subitem--active" : "",
                    childDisabled ? "sb-subitem--disabled" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    if (childDisabled || !child.route) return;
                    onNavigate(child.route);
                  }}
                  disabled={childDisabled}
                  aria-current={childIsActive ? "page" : undefined}
                  aria-disabled={childDisabled || undefined}
                  title={childDisabled ? "No disponible" : undefined}
                >
                  <span className="sb-subitem__dot" aria-hidden />
                  <span className="sb-subitem__label">{child.label}</span>
                  {renderBadge(child.badge)}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}
