/**
 * Router mínimo por URL (History API, sin dependencias).
 *
 * La URL es la fuente de verdad: el menú navega a rutas reales, el enlace
 * directo y los botones atrás/adelante funcionan, y `App` deriva la página
 * actual de la ruta.
 *
 * Los nombres siguen el idioma fijado en PRODUCT.md: solicitud, propuesta,
 * oportunidad, tarifas. Desde el 05/11/2026 «Propuestas» y «Viajes» son una sola
 * pantalla, Oportunidades. Las rutas antiguas se mantienen redirigiendo, porque alguien
 * las tendrá en favoritos.
 */
export type Page =
  | "home"
  | "canvas"
  | "rates"
  | "users"
  | "audit"
  | "profile";

/** Prefijo de ruta → página interna. El primero que coincide gana. */
const ROUTE_PREFIXES: { prefix: string; page: Page }[] = [
  { prefix: "/oportunidades", page: "home" },
  { prefix: "/solicitudes/nueva", page: "canvas" },
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
  // Propuestas y Viajes se unieron en Oportunidades (05/11/2026).
  { prefix: "/viajes/calendario", target: "/oportunidades/calendario" },
  { prefix: "/viajes", target: "/oportunidades" },
  { prefix: "/propuestas", target: "/oportunidades" },
  { prefix: "/inicio", target: "/oportunidades" },
  { prefix: "/confirmar/calendario", target: "/oportunidades/calendario" },
  { prefix: "/confirmar", target: "/oportunidades" },
  { prefix: "/inventario/documentos-ia", target: "/tarifas/documentos" },
  { prefix: "/inventario", target: "/tarifas" },
  { prefix: "/admin/usuarios", target: "/ajustes/usuarios" },
  { prefix: "/admin/perfiles", target: "/ajustes/mi-cuenta" },
  { prefix: "/auditoria/acciones", target: "/ajustes/actividad" },
  { prefix: "/auditoria", target: "/ajustes/actividad" },
  { prefix: "/nuevo-registro", target: "/solicitudes/nueva" },
  { prefix: "/existente", target: "/oportunidades" },
];

/** Ruta canónica de cada página. */
const PAGE_ROUTE: Record<Page, string> = {
  home: "/oportunidades",
  canvas: "/solicitudes/nueva",
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
