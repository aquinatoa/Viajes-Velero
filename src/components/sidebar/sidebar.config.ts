/**
 * Configuración centralizada del menú lateral.
 *
 * La navegación, los permisos, los iconos y los badges se declaran AQUÍ, no en
 * el componente: añadir/quitar opciones o cambiar accesos es editar este archivo.
 *
 * Reglas:
 * - Cada entrada lleva a una pantalla que existe. Nada de accesos en gris
 *   prometiendo lo que no hay: si no está construido, no está en el menú.
 * - Los nombres son los del idioma fijado en PRODUCT.md.
 * - Los roles del backend (ADMIN / DEPT_ADMIN / QUOTER) se mapean abajo.
 */

export type SidebarRole = "admin" | "operaciones" | "comercial" | "auditor" | "lectura";

export type SidebarItemStatus = "active" | "disabled";

/** Nombres de icono soportados por `icons.tsx`. */
export type IconName =
  | "home"
  | "circle-plus"
  | "search"
  | "clipboard-check"
  | "file-text"
  | "upload-cloud"
  | "users"
  | "shield-check"
  | "user-cog"
  | "history"
  | "list-checks"
  | "calendar";

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
    // Lo que se abre cada día. "Nueva solicitud" no está aquí a propósito: es
    // una acción, no un sitio, y vive como botón fijo en la barra superior.
    id: "trabajo",
    label: "Día a día",
    accent: "neutral",
    items: [
      {
        id: "propuestas",
        label: "Propuestas",
        description: "Qué has mandado y qué espera",
        icon: "home",
        route: "/propuestas",
        permissions: COMMERCIAL,
        status: "active",
      },
      {
        id: "viajes",
        label: "Viajes",
        description: "En qué punto está cada expediente",
        icon: "clipboard-check",
        route: "/viajes",
        permissions: COMMERCIAL,
        status: "active",
        children: [
          { id: "viajes-lista", label: "Todos los viajes", route: "/viajes", permissions: COMMERCIAL },
          { id: "viajes-calendario", label: "Calendario", route: "/viajes/calendario", permissions: COMMERCIAL },
        ],
      },
    ],
  },
  {
    // Catálogo y permisos: se tocan por temporada o cuando entra alguien nuevo,
    // no a diario. Y el backend ya restringe las tarifas a administradores.
    id: "gestion",
    label: "Gestión",
    accent: "orange",
    items: [
      {
        id: "tarifas",
        label: "Tarifas",
        description: "Documentos de proveedores y catálogo",
        icon: "file-text",
        route: "/tarifas/documentos",
        permissions: OPERATIONS,
        status: "active",
      },
      {
        id: "usuarios",
        label: "Usuarios",
        description: "Quién entra y con qué permisos",
        icon: "users",
        route: "/ajustes/usuarios",
        permissions: ADMIN_ONLY,
        status: "active",
      },
      {
        id: "actividad",
        label: "Actividad",
        description: "Registro de lo que se ha hecho",
        icon: "history",
        route: "/ajustes/actividad",
        permissions: AUDIT,
        status: "active",
      },
    ],
  },
];

/**
 * Sección que vive en la barra lateral (el módulo principal de trabajo). El resto
 * de secciones se acceden desde el menú "Configuración" del topbar.
 */
export const PRIMARY_SECTION_ID = "trabajo";

/**
 * Mapea el rol del backend al modelo de permisos del menú:
 * - ADMIN (global) → admin: todo, incluidos Usuarios y Auditoría.
 * - DEPT_ADMIN (departamento) → operaciones: Nueva, Confirmar y Tarifas/Catálogo,
 *   pero NO gestión global de usuarios ni auditoría.
 * - QUOTER (cotizador) / USER → comercial: solo Nueva y Confirmar.
 */
export function sidebarRoleFromBackend(role: string): SidebarRole {
  if (role === "ADMIN") return "admin";
  if (role === "DEPT_ADMIN") return "operaciones";
  return "comercial";
}

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
