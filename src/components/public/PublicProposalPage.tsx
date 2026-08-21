import { useEffect, useState } from "react";
import isotipo from "../../assets/oravia-isotipo.png";

/**
 * Página pública de la propuesta: lo que abre el colegio desde el enlace del
 * correo. SIN cuenta ni contraseña, porque un jefe de estudios no va a crearse
 * un usuario para elegir hotel.
 *
 * Lo que resuelve: hoy la opción elegida llega por correo y alguien la teclea a
 * mano. Aquí la elige el cliente, queda registrada con fecha y arranca sola la
 * cuenta atrás del depósito.
 *
 * Regla que no se salta: aquí NO se publica ningún dato personal de alumnos.
 * Solo lo que el colegio ya tiene en su PDF.
 */

interface PublicOption {
  optionNumber: number;
  accommodationName: string | null;
  boardType: string | null;
  nights: number | null;
  totalPvpText: string | null;
  priceBreakdownText: string | null;
  conditionsText: string | null;
}

interface PublicProposal {
  reference: string;
  department: "GROUPS" | "SPORTS" | null;
  tripTitle: string;
  destination: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  participants: number | null;
  teachers: number | null;
  chosenOptionNumber: number | null;
  depositDueAt: string | null;
  options: PublicOption[];
}

// Mismo origen: en dev lo resuelve el proxy de Vite (`/api` -> :8787) y en
// produccion nginx hace de proxy al Node. VITE_API_BASE_URL solo hace falta
// si algun dia el backend vive en otro dominio.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

export function PublicProposalPage({ token }: { token: string }) {
  const [proposal, setProposal] = useState<PublicProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [choosing, setChoosing] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/public/proposals/${encodeURIComponent(token)}`);
        if (!response.ok) throw new Error("Esta propuesta ya no está disponible.");
        const data = (await response.json()) as PublicProposal;
        if (!cancelled) setProposal(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo abrir la propuesta.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function choose(optionNumber: number) {
    if (!proposal || proposal.chosenOptionNumber) return;
    setChoosing(optionNumber);
    setError("");
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/public/proposals/${encodeURIComponent(token)}/choose`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionNumber }),
        },
      );
      if (!response.ok) throw new Error("No se pudo registrar la elección.");
      const data = (await response.json()) as { chosenOptionNumber: number; depositDueAt: string };
      setProposal({ ...proposal, chosenOptionNumber: data.chosenOptionNumber, depositDueAt: data.depositDueAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar la elección.");
    } finally {
      setChoosing(null);
    }
  }

  if (loading) {
    return (
      <div className="pp">
        <p className="pp__loading">Abriendo la propuesta…</p>
      </div>
    );
  }

  if (error && !proposal) {
    return (
      <div className="pp">
        <div className="pp__gone">
          <h1>Esta propuesta ya no está disponible</h1>
          <p>Puede que el enlace haya caducado. Escríbenos y te mandamos uno nuevo.</p>
        </div>
      </div>
    );
  }

  if (!proposal) return null;

  const brandName = proposal.department === "SPORTS" ? "Oravia Sports" : "Oravia Travel Group";
  const chosen = proposal.chosenOptionNumber;

  return (
    <div className="pp">
      <header className="pp__head">
        <img className="pp__mark" src={isotipo} alt="" width={44} height={43} />
        <div>
          <p className="pp__brand">{brandName}</p>
          <p className="pp__ref">{proposal.reference}</p>
        </div>
      </header>

      <main className="pp__main">
        <h1 className="pp__title">{proposal.tripTitle}</h1>
        <ul className="pp__facts">
          {proposal.destination ? (
            <li>
              <span>Destino</span>
              <strong>{proposal.destination}</strong>
            </li>
          ) : null}
          {proposal.dateFrom || proposal.dateTo ? (
            <li>
              <span>Fechas</span>
              <strong>
                {formatDate(proposal.dateFrom)}
                {proposal.dateTo ? ` - ${formatDate(proposal.dateTo)}` : ""}
              </strong>
            </li>
          ) : null}
          {proposal.participants ? (
            <li>
              <span>Participantes</span>
              <strong>{proposal.participants}</strong>
            </li>
          ) : null}
          {proposal.teachers ? (
            <li>
              <span>Profesores</span>
              <strong>{proposal.teachers}</strong>
            </li>
          ) : null}
        </ul>

        {chosen ? (
          <div className="pp__done" role="status">
            <strong>Habéis elegido la opción {chosen}</strong>
            <p>
              Nos ponemos con ello. Para reservar en firme hace falta el depósito
              {proposal.depositDueAt ? ` antes del ${formatDate(proposal.depositDueAt)}` : ""}; os
              escribimos con los datos del pago.
            </p>
          </div>
        ) : (
          <p className="pp__lead">
            Estas son las opciones que hemos preparado. Elegid la que prefiráis y seguimos adelante.
          </p>
        )}

        {error ? (
          <div className="pp__error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="pp__options">
          {proposal.options.map((option) => {
            const isChosen = chosen === option.optionNumber;
            const discarded = Boolean(chosen) && !isChosen;
            return (
              <article
                className={`pp__opt${isChosen ? " is-chosen" : ""}${discarded ? " is-discarded" : ""}`}
                key={option.optionNumber}
              >
                <div className="pp__optnum">Opción {option.optionNumber}</div>
                <h2 className="pp__optname">{option.accommodationName ?? "Alojamiento"}</h2>
                <p className="pp__optmeta">
                  {[option.boardType, option.nights ? `${option.nights} noches` : null]
                    .filter(Boolean)
                    .join("  ·  ")}
                </p>
                {option.totalPvpText ? <p className="pp__optprice">{option.totalPvpText}</p> : null}
                {option.priceBreakdownText ? (
                  <p className="pp__optdetail">{option.priceBreakdownText}</p>
                ) : null}
                {option.conditionsText ? (
                  <details className="pp__optcond">
                    <summary>Qué incluye y condiciones</summary>
                    <p>{option.conditionsText}</p>
                  </details>
                ) : null}

                {isChosen ? (
                  <p className="pp__chosen">Es la que habéis elegido</p>
                ) : chosen ? null : (
                  <button
                    type="button"
                    className="pp__choose"
                    onClick={() => choose(option.optionNumber)}
                    disabled={choosing !== null}
                  >
                    {choosing === option.optionNumber ? "Guardando…" : "Elegir esta"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </main>

      <footer className="pp__foot">
        <p>
          ¿Alguna duda? Respondednos al correo con el que os llegó esta propuesta, indicando la
          referencia {proposal.reference}.
        </p>
      </footer>
    </div>
  );
}
