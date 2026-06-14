import type { AuthUser } from "../services/apiClient";

export type Page = "new" | "existing" | "inventory" | "users" | "audit";

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  user: AuthUser;
  onLogout: () => void;
}

interface PageDef {
  id: Page;
  label: string;
  description: string;
  adminOnly?: boolean;
}

const pages: PageDef[] = [
  {
    id: "new",
    label: "Nuevo registro",
    description: "Solicitud nueva, propuesta y alta de oportunidad CRM",
  },
  {
    id: "existing",
    label: "Existente",
    description: "Buscar oportunidad CRM y aprobar una opción",
  },
  {
    id: "inventory",
    label: "Inventario documental",
    description: "Importar tarifas desde documentos con IA, revisar y publicar",
    adminOnly: true,
  },
  {
    id: "users",
    label: "Usuarios y permisos",
    description: "Gestionar accesos y perfiles",
    adminOnly: true,
  },
  {
    id: "audit",
    label: "Auditoría",
    description: "Registro de acciones realizadas",
    adminOnly: true,
  },
];

export function Sidebar({ currentPage, onNavigate, user, onLogout }: SidebarProps) {
  const isAdmin = user.role === "ADMIN";
  const visiblePages = pages.filter((page) => !page.adminOnly || isAdmin);

  return (
    <aside className="sidebar">
      <div className="brand-block">
        <span className="eyebrow">MVP interno de operaciones</span>
        <h1>Viajes Velero</h1>
        <p>Panel interno de operaciones: propuestas comerciales e inventario documental.</p>
      </div>

      <nav className="steps">
        {visiblePages.map((page) => (
          <button
            key={page.id}
            className={`steps__item ${currentPage === page.id ? "steps__item--active" : ""}`}
            onClick={() => onNavigate(page.id)}
          >
            <strong>{page.label}</strong>
            <span>{page.description}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__user">
          <strong>{user.name || user.email}</strong>
          <span>{isAdmin ? "Administrador" : "Usuario"}</span>
        </div>
        <button type="button" className="sidebar__logout" onClick={onLogout}>
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
