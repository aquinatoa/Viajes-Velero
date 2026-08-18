/**
 * Una sección del menú (cabecera + lista de items). La cabecera se oculta en
 * modo colapsado; el acento de color da identidad a cada bloque.
 */
import type { SidebarSection as SidebarSectionType, SidebarRole } from "./sidebar.config";
import { SidebarItemRow } from "./SidebarItem";

interface SidebarSectionProps {
  section: SidebarSectionType;
  role: SidebarRole;
  currentPath: string;
  collapsed: boolean;
  isMenuOpen: (id: string) => boolean;
  onToggleMenu: (id: string) => void;
  onNavigate: (route: string) => void;
  onExpandForSubmenu: () => void;
}

export function SidebarSection({
  section,
  role,
  currentPath,
  collapsed,
  isMenuOpen,
  onToggleMenu,
  onNavigate,
  onExpandForSubmenu,
}: SidebarSectionProps) {
  return (
    <div className={`sb-section sb-section--${section.accent ?? "neutral"}`}>
      {!collapsed ? <p className="sb-section__title">{section.label}</p> : null}
      <ul className="sb-section__list">
        {section.items.map((item) => (
          <SidebarItemRow
            key={item.id}
            item={item}
            role={role}
            currentPath={currentPath}
            collapsed={collapsed}
            menuOpen={isMenuOpen(item.id)}
            onToggleMenu={onToggleMenu}
            onNavigate={onNavigate}
            onExpandForSubmenu={onExpandForSubmenu}
          />
        ))}
      </ul>
    </div>
  );
}
