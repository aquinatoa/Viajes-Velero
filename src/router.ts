/**
 * Router mínimo por URL (History API, sin dependencias).
 *
 * La URL es la fuente de verdad: el menú navega a rutas reales, el enlace
 * directo y los botones atrás/adelante funcionan, y `App` deriva la página
 * actual de la ruta.
 *
 * Los nombres siguen el idioma fijado en PRODUCT.md: solicitud, propuesta,
 * viaje, tarifas. Las rutas antiguas se mantienen redirigiendo, porque alguien
 * las tendrá en favoritos.
 */
export type Page =
  | "home"
  | "canvas"
  | "trips"
  | "rates"
  | "users"
  | "audit"
  | "profile";

/** Prefijo de ruta → página interna. El primero que coincide gana. */
const ROUTE_PREFIXES: { prefix: string; page: Page }[] = [
  { prefix: "/propuestas", page: "home" },
  { prefix: "/inicio", page: "home" },
  { prefix: "/solicitudes/nueva", page: "canvas" },
  { prefix: "/viajes", page: "trips" },
  { prefix: "/tarifas", page: "rates" },
  { prefix: "/ajustes/usuarios", page: "users" },
  { prefix: "/ajustes/mi-cuenta", page: "profile" },
  { prefix: "/ajustes/actividad", page: "audit" },
];

/**
 * Rutas anteriores → la de ahora. Se conservan para no romper enlaces
 * guardados; el router redirige y la URL queda limpia.
 */
const ROUTE_ALIASES: { prefix: string; target: string }[] = [
  { prefix: "/confirmar/calendario", target: "/viajes/calendario" },
  { prefix: "/confirmar", target: "/viajes" },
  { prefix: "/inventario/documentos-ia", target: "/tarifas/documentos" },
  { prefix: "/inventario", target: "/tarifas" },
  { prefix: "/admin/usuarios", target: "/ajustes/usuarios" },
  { prefix: "/admin/perfiles", target: "/ajustes/mi-cuenta" },
  { prefix: "/auditoria/acciones", target: "/ajustes/actividad" },
  { prefix: "/auditoria", target: "/ajustes/actividad" },
  { prefix: "/nuevo-registro", target: "/solicitudes/nueva" },
  { prefix: "/existente", target: "/viajes" },
];

/** Ruta canónica de cada página. */
const PAGE_ROUTE: Record<Page, string> = {
  home: "/propuestas",
  canvas: "/solicitudes/nueva",
  trips: "/viajes",
  rates: "/tarifas/documentos",
  users: "/ajustes/usuarios",
  audit: "/ajustes/actividad",
  profile: "/ajustes/mi-cuenta",
};

function matches(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);
}

/** Página correspondiente a una ruta, o null si no se reconoce. */
export function pageFromPath(path: string): Page | null {
  for (const { prefix, page } of ROUTE_PREFIXES) {
    if (matches(path, prefix)) return page;
  }
  return null;
}

/** Ruta actual si la que se pide es antigua; null si ya es la buena. */
export function redirectFor(path: string): string | null {
  for (const { prefix, target } of ROUTE_ALIASES) {
    if (matches(path, prefix)) return target;
  }
  return null;
}

export function routeForPage(page: Page): string {
  return PAGE_ROUTE[page];
}
