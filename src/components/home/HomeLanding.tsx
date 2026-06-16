import type { CurrentUser } from "../../domain/types";

/**
 * Pantalla inicial del widget (portada interna) — "Dirección B: Panel claro".
 *
 * Sin login, sin sidebar, sin menú lateral: es la portada a pantalla completa que
 * ve el usuario al entrar. Ofrece dos acciones principales (Planificar / Confirmar)
 * y deja la Configuración como botón de tuerca en la esquina superior derecha del
 * hero. El resto de la app (flujos, inventario, admin) conserva su shell.
 *
 * Integración: recibe `currentUser` ya normalizado (hoy desde el login propio;
 * mañana desde el SDK de Zoho CRM, sin tocar este componente). La tuerca solo se
 * pinta para administradores. Los datos de "Resumen general" y "Actividad reciente"
 * se muestran como estructura honesta (sin contadores inventados) hasta que exista
 * un endpoint de agregados.
 */

export interface HomeLandingProps {
  currentUser: CurrentUser;
  /** Navega a una ruta real de la app (router por URL del App). */
  onNavigate: (path: string) => void;
  /** Abre la sección de configuración. Sólo se invoca si el usuario es admin. */
  onOpenSettings: () => void;
  /** Acción de la card "Planificar": si se pasa, abre el popup en vez de navegar. */
  onPlan?: () => void;
  /** Rutas destino de las dos acciones (por si cambian en el futuro). */
  planRoute?: string;
  confirmRoute?: string;
}

type Metric = { key: string; label: string; value: string };

const SUMMARY_METRICS: Metric[] = [
  { key: "active", label: "Solicitudes activas", value: "—" },
  { key: "confirmed", label: "Confirmadas", value: "—" },
  { key: "upcoming", label: "Viajes próximos", value: "—" },
  { key: "budget", label: "Presupuesto total", value: "—" },
];

const PLAN_CAPABILITIES = [
  "Crear nueva solicitud",
  "Planificar itinerario y actividades",
  "Organizar documentos y requisitos",
  "Estimación de presupuesto",
];

const CONFIRM_CAPABILITIES = [
  "Revisión de la solicitud",
  "Validación de requisitos",
  "Verificación de información",
  "Confirmar y enviar",
];

function firstName(user: CurrentUser): string {
  const name = user.name?.trim();
  if (!name) return "";
  return name.split(/\s+/)[0];
}

export function HomeLanding({
  currentUser,
  onNavigate,
  onOpenSettings,
  onPlan,
  planRoute = "/nuevo-registro",
  confirmRoute = "/existente/buscar",
}: HomeLandingProps) {
  const isAdmin = currentUser.role === "admin";
  const name = firstName(currentUser);

  return (
    <div className="home">
      <header className="home-header">
        <span className="home-logo" aria-hidden="true">
          <Logo />
        </span>
        <span className="home-brand">Viajes Velero</span>
        <span className="home-header__sep" aria-hidden="true" />
        <span className="home-header__sub">Gestión de viajes escolares</span>
      </header>

      <div className="home-wrap">
        <section className="home-hero">
          {isAdmin ? (
            <button
              type="button"
              className="home-gear"
              aria-label="Configuraciones"
              title="Configuraciones"
              onClick={onOpenSettings}
            >
              <GearIcon />
            </button>
          ) : null}

          <p className="home-welcome">
            Bienvenido{name ? `, ${name}` : ""} <span aria-hidden="true">👋</span>
          </p>
          <h1 className="home-title">Todo listo para crear experiencias inolvidables</h1>
          <p className="home-sub">
            Planifica, confirma y gestiona cada detalle de tus viajes escolares de forma simple y
            eficiente.
          </p>
        </section>

        <div className="home-cards">
          <ActionCard
            variant="plan"
            icon={<CalendarIcon />}
            title="Planificar solicitud"
            chip="Acción principal"
            description="Crea y organiza nuevas solicitudes de viaje, define itinerarios y estima presupuestos."
            capabilities={PLAN_CAPABILITIES}
            cta="Ir a planificar"
            onClick={() => (onPlan ? onPlan() : onNavigate(planRoute))}
          />
          <ActionCard
            variant="conf"
            icon={<FileCheckIcon />}
            title="Confirmar solicitud"
            chip="Revisión"
            description="Revisa, valida y confirma los detalles del viaje antes de enviarlo."
            capabilities={CONFIRM_CAPABILITIES}
            cta="Ir a confirmar"
            onClick={() => onNavigate(confirmRoute)}
          />
        </div>

        <div className="home-bottom">
          <section className="home-panel" aria-labelledby="home-summary-label">
            <h2 className="home-panel__label" id="home-summary-label">
              Resumen general
            </h2>
            <div className="home-metrics">
              {SUMMARY_METRICS.map((metric) => (
                <div className="home-metric" key={metric.key}>
                  <span className="home-metric__n">{metric.value}</span>
                  <span className="home-metric__l">{metric.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="home-panel" aria-labelledby="home-activity-label">
            <h2 className="home-panel__label" id="home-activity-label">
              Actividad reciente
            </h2>
            <div className="home-activity">
              <p className="home-activity__empty">Sin actividad reciente todavía.</p>
              <p className="home-activity__hint">
                <span className="home-activity__dot" aria-hidden="true" />
                Aquí verás las últimas solicitudes y confirmaciones.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

interface ActionCardProps {
  variant: "plan" | "conf";
  icon: React.ReactNode;
  title: string;
  chip: string;
  description: string;
  capabilities: string[];
  cta: string;
  onClick: () => void;
}

function ActionCard({
  variant,
  icon,
  title,
  chip,
  description,
  capabilities,
  cta,
  onClick,
}: ActionCardProps) {
  return (
    <section className={`home-card home-card--${variant}`}>
      <div className="home-card__head">
        <span className="home-card__icon" aria-hidden="true">
          {icon}
        </span>
        <h2 className="home-card__title">{title}</h2>
        <span className="home-card__chip">{chip}</span>
      </div>
      <p className="home-card__desc">{description}</p>
      <ul className="home-card__list">
        {capabilities.map((item) => (
          <li key={item}>
            <CheckIcon />
            {item}
          </li>
        ))}
      </ul>
      <button type="button" className="home-card__cta" onClick={onClick}>
        {cta}
        <ArrowIcon />
      </button>
    </section>
  );
}

/* ── Iconos (SVG inline, sin dependencias) ─────────────────────────────────── */

function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3v15M12 18l7-2-7-11M12 18l-6-1.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 19c1.6 1.2 4 1.6 7 1.6s5.4-.4 7-1.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M19.4 13a7.6 7.6 0 0 0 .05-2l1.6-1.25-1.6-2.77-1.9.77a7.6 7.6 0 0 0-1.73-1l-.3-2H10.5l-.3 2a7.6 7.6 0 0 0-1.73 1l-1.9-.77-1.6 2.77L4.57 11a7.6 7.6 0 0 0 0 2l-1.6 1.25 1.6 2.77 1.9-.77c.53.42 1.1.76 1.73 1l.3 2h3.02l.3-2c.62-.24 1.2-.58 1.73-1l1.9.77 1.6-2.77L19.4 13Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M3 9h18M8 3v4M16 3v4M12 13v4M10 15h4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FileCheckIcon() {
  return (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none">
      <path
        d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M14 3v5h5M9 14l2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12l4 4 10-10"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
