/**
 * Estado de interacción del menú lateral: colapsado (escritorio), drawer (móvil)
 * y submenús abiertos. El colapsado se persiste en localStorage; el drawer móvil
 * arranca cerrado y se cierra con Escape o al navegar.
 */
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "viajes-velero-sidebar-collapsed";
const MOBILE_QUERY = "(max-width: 900px)";

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
  } catch {
    // localStorage no disponible (modo privado/SSR): usa el valor por defecto.
  }
  // Sin preferencia guardada: escritorio expandido, tablet colapsado.
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 1024px)").matches
    : false;
}

export interface SidebarUi {
  collapsed: boolean;
  mobileOpen: boolean;
  isMobile: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (value: boolean) => void;
  openMobile: () => void;
  closeMobile: () => void;
  isMenuOpen: (id: string) => boolean;
  toggleMenu: (id: string) => void;
  openMenu: (id: string) => void;
}

export function useSidebar(): SidebarUi {
  const [collapsed, setCollapsedState] = useState<boolean>(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(MOBILE_QUERY).matches
      : false,
  );
  const [openMenus, setOpenMenus] = useState<Set<string>>(new Set());

  // Seguir el viewport para saber si estamos en modo móvil (drawer).
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => {
      setIsMobile(mql.matches);
      if (!mql.matches) setMobileOpen(false);
    };
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "true" : "false");
    } catch {
      // Ignorar si no se puede persistir.
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "true" : "false");
      } catch {
        // Ignorar.
      }
      return next;
    });
  }, []);

  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const isMenuOpen = useCallback((id: string) => openMenus.has(id), [openMenus]);

  const toggleMenu = useCallback((id: string) => {
    setOpenMenus((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openMenu = useCallback((id: string) => {
    setOpenMenus((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }, []);

  // Cerrar el drawer móvil con la tecla Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return {
    collapsed,
    mobileOpen,
    isMobile,
    toggleCollapsed,
    setCollapsed,
    openMobile,
    closeMobile,
    isMenuOpen,
    toggleMenu,
    openMenu,
  };
}
