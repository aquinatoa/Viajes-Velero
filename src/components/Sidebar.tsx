interface SidebarProps {
  currentPage: "new" | "existing" | "inventory";
  onNavigate: (page: "new" | "existing" | "inventory") => void;
}

const pages = [
  {
    id: "new" as const,
    label: "Nuevo registro",
    description: "Solicitud nueva, propuesta y alta de oportunidad CRM"
  },
  {
    id: "existing" as const,
    label: "Existente",
    description: "Buscar oportunidad CRM y aprobar una opción"
  },
  {
    id: "inventory" as const,
    label: "Inventario documental",
    description: "Importar tarifas desde documentos con IA, revisar y publicar"
  }
];

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand-block">
        <span className="eyebrow">MVP interno de operaciones</span>
        <h1>Viajes Velero</h1>
        <p>Panel interno separado por flujos reales de trabajo para nuevo, existente y gestión de datos.</p>
      </div>

      <nav className="steps">
        {pages.map((page) => (
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
    </aside>
  );
}
