/**
 * Router mínimo por URL (History API, sin dependencias).
 *
 * La app sigue renderizando sus páginas por estado (`Page`), pero ahora la URL
 * es la fuente de verdad: el sidebar navega a rutas reales, el deep-link y los
 * botones atrás/adelante del navegador funcionan, y `App` deriva la página
 * actual de la ruta. Mantener las rutas alineadas con `sidebar.config.ts`.
 */
export type Page = "new" | "existing" | "inventory" | "users" | "audit" | "profile";

/** Prefijo de ruta → página interna. El primero que coincide gana. */
const ROUTE_PREFIXES: { prefix: string; page: Page }[] = [
  { prefix: "/nuevo-registro", page: "new" },
  { prefix: "/existente", page: "existing" },
  { prefix: "/inventario", page: "inventory" },
  { prefix: "/admin/usuarios", page: "users" },
  { prefix: "/admin/perfiles", page: "profile" },
  { prefix: "/auditoria", page: "audit" },
];

/** Ruta canónica de cada página (a la que navegan logout/login y el normalizado). */
const PAGE_ROUTE: Record<Page, string> = {
  new: "/nuevo-registro",
  existing: "/existente/buscar",
  inventory: "/inventario/documentos-ia",
  users: "/admin/usuarios",
  audit: "/auditoria/acciones",
  profile: "/admin/perfiles",
};

/** Página correspondiente a una ruta, o null si no se reconoce. */
export function pageFromPath(path: string): Page | null {
  for (const { prefix, page } of ROUTE_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)) {
      return page;
    }
  }
  return null;
}

export function routeForPage(page: Page): string {
  return PAGE_ROUTE[page];
}
