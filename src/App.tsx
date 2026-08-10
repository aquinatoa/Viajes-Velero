import { useEffect, useState } from "react";
import { Sidebar } from "./components/sidebar/Sidebar";
import { useSidebar } from "./components/sidebar/useSidebar";
import { Topbar } from "./components/Topbar";
import { type Page, pageFromPath, redirectFor, routeForPage } from "./router";
import { InventoryDocumentsPanel } from "./components/inventory/InventoryDocumentsPanel";
import { LoginPage } from "./components/LoginPage";
import { UsersPanel } from "./components/admin/UsersPanel";
import { AuditPanel } from "./components/admin/AuditPanel";
import { MiCuentaPanel } from "./components/admin/MiCuentaPanel";
import { ConfirmRequestsPanel } from "./components/confirm/ConfirmRequestsPanel";
import { ProposalDesk } from "./components/home/ProposalDesk";
import { RequestCanvas } from "./components/request/RequestCanvas";
import { PublicProposalPage } from "./components/public/PublicProposalPage";
import { SectionCard } from "./components/SectionCard";
import type { CurrentUser } from "./domain/types";
import { exchangeZohoAuthCodeApi } from "./services/apiClient";
import { type AuthUser, getAuthToken, logoutApi, meApi } from "./services/apiClient";

/**
 * Puente al usuario de la pantalla inicial. Hoy se construye desde el usuario
 * autenticado del backend; el día que la app viva dentro de Zoho CRM, este es el
 * ÚNICO punto a cambiar (rellenar desde el SDK de Zoho). El rol del backend
 * (ADMIN/USER) se mapea al modelo de la portada (admin/operativo).
 */
function toCurrentUser(user: AuthUser): CurrentUser {
  // ADMIN y DEPT_ADMIN son perfiles administrativos; QUOTER/USER son operativos.
  const isAdmin = user.role === "ADMIN" || user.role === "DEPT_ADMIN";
  return {
    id: user.id,
    name: user.name ?? user.email,
    email: user.email,
    role: isAdmin ? "admin" : "operativo",
  };
}

export function App() {
  const isZohoCallback = typeof window !== "undefined" && window.location.pathname === "/callback";
  // Enlace que recibe el colegio: /p/<token>. Se lee una vez, de la URL.
  const publicProposalToken =
    typeof window !== "undefined" && window.location.pathname.startsWith("/p/")
      ? decodeURIComponent(window.location.pathname.slice(3))
      : null;

  // Navegación por URL (router propio, History API). currentPage se deriva.
  const [currentPath, setCurrentPath] = useState(() =>
    typeof window !== "undefined" ? window.location.pathname : "/",
  );
  const currentPage: Page = pageFromPath(currentPath) ?? "home";
  const sidebarUi = useSidebar();

  // Reaccionar a los botones atrás/adelante del navegador.
  useEffect(() => {
    const onPop = () => setCurrentPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Navega a una ruta real (actualiza la URL y limpia avisos).
  const navigatePath = (path: string) => {
    if (typeof window !== "undefined" && path !== window.location.pathname) {
      window.history.pushState({}, "", path);
    }
    setCurrentPath(path);
  };

  // Sesión / autenticación.
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Normaliza rutas no reconocidas (p. ej. "/") a la página inicial una vez con
  // sesión, para que la URL y el item activo del menú queden coherentes.
  useEffect(() => {
    if (!currentUser || isZohoCallback) return;
    const destino = redirectFor(currentPath);
    if (destino) {
      window.history.replaceState({}, "", destino);
      setCurrentPath(destino);
      return;
    }
    if (pageFromPath(currentPath) === null) {
      const target = routeForPage("home");
      window.history.replaceState({}, "", target);
      setCurrentPath(target);
    }
  }, [currentUser, currentPath, isZohoCallback]);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!getAuthToken()) {
        setAuthChecking(false);
        return;
      }
      try {
        const { user } = await meApi();
        if (!cancelled) setCurrentUser(user);
      } catch {
        if (!cancelled) setCurrentUser(null);
      } finally {
        if (!cancelled) setAuthChecking(false);
      }
    }
    void check();
    const onUnauth = () => setCurrentUser(null);
    window.addEventListener("velero:unauthenticated", onUnauth);
    return () => {
      cancelled = true;
      window.removeEventListener("velero:unauthenticated", onUnauth);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logoutApi();
    } finally {
      setCurrentUser(null);
      navigatePath(routeForPage("home"));
    }
  };

  const [isProcessingZohoCallback, setIsProcessingZohoCallback] = useState(isZohoCallback);
  const [zohoCallbackMessage, setZohoCallbackMessage] = useState(
    isZohoCallback ? "Validando la autenticación de Zoho..." : "",
  );

  useEffect(() => {
    if (!isZohoCallback) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");

    if (error) {
      setIsProcessingZohoCallback(false);
      setZohoCallbackMessage(`Zoho devolvió un error de autenticación: ${error}`);
      return;
    }

    if (!code) {
      setIsProcessingZohoCallback(false);
      setZohoCallbackMessage("No se recibió código de autorización desde Zoho.");
      return;
    }

    exchangeZohoAuthCodeApi(code)
      .then((result) => {
        setZohoCallbackMessage(
          `Zoho quedó autenticado. Guarda el nuevo refresh token en tu .env si quieres persistirlo tras reiniciar el servidor: ${result.refreshToken}`,
        );
        window.history.replaceState({}, "", "/");
      })
      .catch((exchangeError) => {
        setZohoCallbackMessage(
          exchangeError instanceof Error
            ? exchangeError.message
            : "No se pudo completar la autenticación de Zoho.",
        );
      })
      .finally(() => {
        setIsProcessingZohoCallback(false);
      });
  }, [isZohoCallback]);



  if (isZohoCallback) {
    return (
      <div className="app-shell">
        <main className="main-content">
          <header className="hero">
            <div>
              <span className="eyebrow">Zoho CRM</span>
              <h2>Reautenticación en curso</h2>
              <p>
                Estamos renovando la sesión del CRM para que el backend siga refrescando el access token automáticamente.
              </p>
            </div>
          </header>

          <SectionCard
            title="Estado de autenticación"
            subtitle="Si el refresh token ya no sirve, vuelve a autorizar la app en Zoho y repite el proceso."
          >
            <div className="review-block crm-block">
              <h3>{isProcessingZohoCallback ? "Procesando..." : "Resultado"}</h3>
              <p>{zohoCallbackMessage}</p>
            </div>
            <div className="action-row">
              <button
                className="button button--primary"
                onClick={() => {
                  window.location.href = "/";
                }}
              >
                Volver a la app
              </button>
            </div>
          </SectionCard>
        </main>
      </div>
    );
  }


  // Propuesta pública: la abre el colegio desde el enlace del correo, así que va
  // ANTES del control de sesión. No es parte de la consola: no lleva menú ni
  // barra superior, y no expone más de lo que el cliente ya tiene en su PDF.
  if (publicProposalToken) {
    return <PublicProposalPage token={publicProposalToken} />;
  }

  if (authChecking) {
    return (
      <div className="login-screen">
        <p className="helper-text">Cargando…</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <LoginPage
        onLoggedIn={(user) => {
          setCurrentUser(user);
          navigatePath(routeForPage("home"));
        }}
      />
    );
  }

  // El lienzo de nueva solicitud: a pantalla completa, como la portada. Convive
  // con el asistente antiguo hasta que se valide en uso real.
  if (currentPage === "canvas") {
    return (
      <RequestCanvas
        onExit={() => navigatePath(routeForPage("home"))}
        onFinished={() => undefined}
      />
    );
  }

  // Pantalla inicial (portada del widget): a pantalla completa, SIN sidebar ni
  // topbar, como el login y el callback de Zoho. Las cards entran al shell normal.
  const pageLabels: Record<Page, string> = {
    home: "Propuestas",
    canvas: "Nueva solicitud",
    trips: "Viajes",
    rates: "Tarifas",
    users: "Usuarios",
    audit: "Actividad",
    profile: "Mi cuenta",
  };

  return (
    <div className={`app-shell ${sidebarUi.collapsed ? "app-shell--collapsed" : ""}`}>
      <Sidebar
        user={currentUser}
        currentPath={currentPath}
        onNavigate={navigatePath}
        onLogout={handleLogout}
        ui={sidebarUi}
      />
      <div className="main-area">
      <Topbar
        user={currentUser}
        pageLabel={pageLabels[currentPage]}
        onNavigate={navigatePath}
        onLogout={handleLogout}
      />
      <main className="main-content">
        {currentPage === "home" ? (
          <ProposalDesk
            currentUser={toCurrentUser(currentUser)}
            onNavigate={navigatePath}
          />
        ) : null}

        {currentPage === "rates" ? (
          <header className="hero">
            <div>
              <span className="eyebrow">Tarifas</span>
              <h2>Tarifas de proveedores</h2>
              <p>
                Importa tarifas desde documentos de proveedores con IA, revísalas y publícalas al
                catálogo con el que se cotiza.
              </p>
            </div>
          </header>
        ) : null}

        {currentPage === "trips" ? (
          <ConfirmRequestsPanel
            view={currentPath.startsWith("/viajes/calendario") ? "calendar" : "list"}
            onNavigate={navigatePath}
          />
        ) : null}

        {currentPage === "rates" ? (
          <div className="content-grid">
            <InventoryDocumentsPanel />
          </div>
        ) : null}

        {currentPage === "users" ? (
          <div className="content-grid">
            <UsersPanel currentUser={currentUser} />
          </div>
        ) : null}

        {currentPage === "audit" ? (
          <div className="content-grid">
            <AuditPanel />
          </div>
        ) : null}

        {currentPage === "profile" ? (
          <div className="content-grid">
            <MiCuentaPanel currentUser={currentUser} />
          </div>
        ) : null}
      </main>
      </div>
    </div>
  );
}