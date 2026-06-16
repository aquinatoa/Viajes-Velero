/**
 * Set de iconos SVG inline (sin dependencias).
 *
 * Estilo lucide: 24×24, trazo `currentColor` de 1.8, esquinas redondeadas.
 * Heredan el color del texto, así que se tiñen solos según el estado del item.
 * Para añadir uno nuevo: crea el path aquí y referencia su nombre en la config.
 */
import type { ReactElement } from "react";
import type { IconName } from "./sidebar.config";

type SvgProps = { className?: string };

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

// --- Iconos del menú (mapeados desde IconName) ---------------------------------

const menuIcons: Record<IconName, () => ReactElement> = {
  home: () => (
    <svg {...base}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  ),
  "circle-plus": () => (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  ),
  search: () => (
    <svg {...base}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  ),
  "clipboard-check": () => (
    <svg {...base}>
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <path d="m9 14 2 2 4-4" />
    </svg>
  ),
  "file-text": () => (
    <svg {...base}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  ),
  "upload-cloud": () => (
    <svg {...base}>
      <path d="M16 16l-4-4-4 4" />
      <path d="M12 12v9" />
      <path d="M20.4 14.9A5 5 0 0 0 18 6h-1.3A7 7 0 1 0 5 12.3" />
    </svg>
  ),
  users: () => (
    <svg {...base}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  "shield-check": () => (
    <svg {...base}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  "user-cog": () => (
    <svg {...base}>
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21v-2a4 4 0 0 1 4-4h4" />
      <circle cx="18" cy="17" r="2.5" />
      <path d="M18 13.5v1M18 19.5v1M21 17h-1M16 17h-1M20 15l-.7.7M16.7 18.3l-.7.7M20 19l-.7-.7M16.7 15.7l-.7-.7" />
    </svg>
  ),
  history: () => (
    <svg {...base}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  "list-checks": () => (
    <svg {...base}>
      <path d="M11 6h10M11 12h10M11 18h10" />
      <path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17" />
    </svg>
  ),
};

export function MenuIcon({ name, className }: { name: IconName; className?: string }) {
  const Render = menuIcons[name];
  if (!Render) return null;
  return <span className={className}>{Render()}</span>;
}

// --- Iconos de chrome (no van en la config) ------------------------------------

export function SailboatIcon({ className }: SvgProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 18h18l-2 3H5z" />
      <path d="M12 3 5 16h7z" />
      <path d="M13 6l6 10h-6z" />
      <path d="M12 3v13" />
    </svg>
  );
}

export function ChevronIcon({ className }: SvgProps) {
  return (
    <svg {...base} className={className} width={16} height={16}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CollapseIcon({ className }: SvgProps) {
  return (
    <svg {...base} className={className} width={18} height={18}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}

export function MenuBarsIcon({ className }: SvgProps) {
  return (
    <svg {...base} className={className}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function CloseIcon({ className }: SvgProps) {
  return (
    <svg {...base} className={className} width={18} height={18}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function LogoutIcon({ className }: SvgProps) {
  return (
    <svg {...base} className={className} width={18} height={18}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}
