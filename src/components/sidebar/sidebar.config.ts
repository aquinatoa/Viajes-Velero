/**
 * Configuración centralizada del menú lateral.
 *
 * La navegación, los permisos, los iconos y los badges se declaran AQUÍ, no en
 * el componente: añadir/quitar opciones o cambiar accesos es editar este archivo.
 *
 * Notas de adaptación al proyecto real:
 * - La app navega por URL con un router propio (History API); cada item activo
 *   apunta a una ruta que el `App` resuelve a una de sus páginas internas.
 * - El modelo de roles del backend hoy es solo ADMIN/USER. La config soporta un
 *   modelo más rico (SidebarRole) y se mapea: ADMIN→admin, USER→comercial.
 * - Las opciones que aún no existen como pantalla se marcan `status: "disabled"`
 *   (se muestran en gris, "próximamente"), no se inventan rutas muertas.
 */

export type SidebarRole = "admin" | "operaciones" | "comercial" | "auditor" | "lectura";

export type SidebarItemStatus = "active" | "disabled";

/** Nombres de icono soportados por `icons.tsx`. */
export type IconName =
  | "circle-plus"
  | "search"
  | "clipboard-check"
  | "file-text"
  | "upload-cloud"
  | "users"
  | "shield-check"
  | "user-cog"
  | "history"
  | "list-checks";

export interface SidebarChildItem {
  id: string;
  label: string;
  route?: string;
  permissions?: SidebarRole[];
  badge?: string | number | null;
  status?: SidebarItemStatus;
}

export interface SidebarItem {
  id: string;
  label: string;
  description?: string;
  icon: IconName;
  route?: string;
  children?: SidebarChildItem[];
  permissions?: SidebarRole[];
  badge?: string | number | null;
  status?: SidebarItemStatus;
  defaultOpen?: boolean;
}

export type SectionAccent = "green" | "blue" | "orange" | "purple" | "neutral";

export interface SidebarSection {
  id: string;
  label: string;
  accent?: SectionAccent;
  items: SidebarItem[];
}

/** Permisos comunes reutilizados. */
const COMMERCIAL: SidebarRole[] = ["admin", "operaciones", "comercial"];
const OPERATIONS: SidebarRole[] = ["admin", "operaciones"];
const ADMIN_ONLY: SidebarRole[] = ["admin"];
const AUDIT: SidebarRole[] = ["admin", "auditor"];

export const sidebarSections: SidebarSection[] = [
  {
    id: "nuevo-registro",
    label: "Nuevo registro",
    accent: "green",
    items: [
      {
        id: "nueva-solicitud",
        label: "Nueva solicitud",
        description: "Crear oportunidad",
        icon: "circle-plus",
        route: "/nuevo-registro",
        permissions: COMMERCIAL,
        status: "active",
        children: [
          {
            id: "nueva-solicitud-base",
            label: "Nueva solicitud",
            route: "/nuevo-registro",
            permissions: COMMERCIAL,
          },
          {
            id: "nueva-una-opcion",
            label: "Nueva con 1 opción",
            permissions: COMMERCIAL,
            status: "disabled",
          },
          {
            id: "nueva-dos-opciones",
            label: "Nueva con 2 opciones",
            permissions: COMMERCIAL,
            status: "disabled",
          },
          {
            id: "nueva-tres-opciones",
            label: "Nueva con 3 opciones",
            permissions: COMMERCIAL,
            status: "disabled",
          },
        ],
      },
    ],
  },
  {
    id: "existente",
    label: "Existente",
    accent: "blue",
    items: [
      {
        id: "buscar-oportunidad",
        label: "Buscar oportunidad",
        description: "Localizar oportunidad CRM",
        icon: "search",
        route: "/existente/buscar",
        permissions: COMMERCIAL,
        status: "active",
      },
      {
        id: "aprobar-opcion",
        label: "Aprobar opción",
        description: "Revisar y aprobar propuesta",
        icon: "clipboard-check",
        route: "/existente/aprobar",
        permissions: COMMERCIAL,
        status: "active",
      },
    ],
  },
  {
    id: "inventario-documental",
    label: "Inventario documental",
    accent: "purple",
    items: [
      {
        id: "documentos-ia",
        label: "Documentos IA",
        description: "Importar y revisar tarifas",
        icon: "file-text",
        route: "/inventario/documentos-ia",
        permissions: OPERATIONS,
        status: "active",
      },
      {
        id: "publicar-documento",
        label: "Publicar documento",
        description: "Publicar tarifas revisadas",
        icon: "upload-cloud",
        permissions: OPERATIONS,
        status: "disabled",
      },
    ],
  },
  {
    id: "usuarios-permisos",
    label: "Usuarios y permisos",
    accent: "orange",
    items: [
      {
        id: "usuarios",
        label: "Usuarios",
        description: "Gestión de usuarios",
        icon: "users",
        route: "/admin/usuarios",
        permissions: ADMIN_ONLY,
        status: "active",
      },
      {
        id: "roles-permisos",
        label: "Roles y permisos",
        description: "Accesos y perfiles",
        icon: "shield-check",
        permissions: ADMIN_ONLY,
        status: "disabled",
      },
      {
        id: "perfiles",
        label: "Mi cuenta",
        description: "Tus datos y contraseña",
        icon: "user-cog",
        route: "/admin/perfiles",
        permissions: ADMIN_ONLY,
        status: "active",
      },
    ],
  },
  {
    id: "auditoria",
    label: "Auditoría",
    accent: "neutral",
    items: [
      {
        id: "acciones-realizadas",
        label: "Acciones realizadas",
        description: "Registro de actividad",
        icon: "history",
        route: "/auditoria/acciones",
        permissions: AUDIT,
        status: "active",
      },
      {
        id: "logs-sistema",
        label: "Logs del sistema",
        description: "Eventos técnicos",
        icon: "list-checks",
        permissions: AUDIT,
        status: "disabled",
      },
    ],
  },
];

/** ¿El rol puede ver un elemento con estas restricciones de permiso? */
export function canSee(permissions: SidebarRole[] | undefined, role: SidebarRole): boolean {
  if (!permissions || permissions.length === 0) return true;
  return permissions.includes(role);
}

/** Secciones filtradas por rol (oculta items sin permiso y secciones vacías). */
export function visibleSections(role: SidebarRole): SidebarSection[] {
  return sidebarSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canSee(item.permissions, role)),
    }))
    .filter((section) => section.items.length > 0);
}
