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
 * Dice lo mismo que el PDF, en el mismo orden: alojamientos, actividades y
 * resumen. Ruth, 02/11/2026: «no aparecen las actividades en ningún lado… y se
 * extrae el precio total, no el precio por persona. No debería salir
 * diferente». El servidor saca las dos cosas de la misma función
 * (`documentoParaElCliente`), así que aquí solo se pinta.
 *
 * Regla que no se salta: aquí NO se publica ningún dato personal de alumnos.
 * Solo lo que el colegio ya tiene en su PDF.
 */

interface Condicion {
  etiqueta: string;
  texto: string;
}

interface OpcionDelDocumento {
  optionNumber: number;
  nombre: string;
  total: string | null;
  detalles: string[];
  porAlumno: string | null;
  otrosPrecios: string[];
  estancia: string | null;
  desglose: Array<{ titulo: string; lineas: string[] }>;
  desgloseTexto: string | null;
  gratuidades: string | null;
  condiciones: Condicion[];
  observaciones: Condicion[];
}

interface ActividadDelDocumento {
  nombre: string;
  lineas: string[];
  precio: string | null;
  profesores: string | null;
  grupo: string | null;
  detalle: string | null;
  descripcion: string | null;
}

interface DocumentoDelCliente {
  opciones: OpcionDelDocumento[];
  actividades: {
    intro: string;
    lista: ActividadDelDocumento[];
    total: string;
    totalDetalle: string | null;
  } | null;
  resumen: {
    filas: Array<{
      optionNumber: number;
      nombre: string;
      alojamiento: string;
      actividades: string;
      total: string;
      porAlumno: string | null;
    }>;
    nota: string;
  } | null;
  /** Las notas de quien preparó la propuesta (horarios, condiciones de pago…). */
  notas?: string | null;
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
  documento: DocumentoDelCliente;
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

function Condiciones({ titulo, lista }: { titulo: string; lista: Condicion[] }) {
  if (!lista.length) return null;
  return (
    <div className="pp__block">
      <p className="pp__label">{titulo}</p>
      <ul className="pp__conds">
        {lista.map((c, i) => (
          <li key={i}>
            {c.etiqueta ? <b>{c.etiqueta}: </b> : null}
            {c.texto}
          </li>
        ))}
      </ul>
    </div>
  );
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
  const { opciones, actividades, resumen } = proposal.documento;
  // Solo actividades (Ruth, 02/11/2026): no hay entre qué elegir, se acepta la propuesta.
  const sinAlojamiento = opciones.length === 0;

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
            <strong>{sinAlojamiento ? "Habéis aceptado la propuesta" : `Habéis elegido la opción ${chosen}`}</strong>
            <p>
              Nos ponemos con ello. Para reservar en firme hace falta el depósito
              {proposal.depositDueAt ? ` antes del ${formatDate(proposal.depositDueAt)}` : ""}; os
              escribimos con los datos del pago.
            </p>
          </div>
        ) : (
          <p className="pp__lead">
            {sinAlojamiento
              ? "Esta es la propuesta que hemos preparado. Si os encaja, aceptadla y seguimos adelante."
              : "Estas son las opciones que hemos preparado. Elegid la que prefiráis y seguimos adelante."}
          </p>
        )}

        {error ? (
          <div className="pp__error" role="alert">
            {error}
          </div>
        ) : null}

        {sinAlojamiento ? null : (
        <section className="pp__sec">
          <h2 className="pp__sectitle">1 · Los alojamientos</h2>
          <p className="pp__secintro">Elegid una de estas opciones. El precio incluye las noches del grupo completo.</p>
          <div className="pp__options">
            {opciones.map((opcion) => {
              const isChosen = chosen === opcion.optionNumber;
              const discarded = Boolean(chosen) && !isChosen;
              return (
                <article
                  className={`pp__opt${isChosen ? " is-chosen" : ""}${discarded ? " is-discarded" : ""}`}
                  key={opcion.optionNumber}
                >
                  <div className="pp__opthead">
                    <span className="pp__optnum">Opción {opcion.optionNumber}</span>
                    {opcion.total ? <span className="pp__opttotal">{opcion.total}</span> : null}
                  </div>
                  <h3 className="pp__optname">{opcion.nombre}</h3>
                  {opcion.detalles.length ? <p className="pp__optmeta">{opcion.detalles.join("  ·  ")}</p> : null}
                  {opcion.porAlumno ? (
                    <div className="pp__optper">
                      <p className="pp__optprice">{opcion.porAlumno}</p>
                      {opcion.otrosPrecios.length ? (
                        <p className="pp__optotros">{opcion.otrosPrecios.join("  ·  ")}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {opcion.estancia ? <p className="pp__optnote">{opcion.estancia}</p> : null}

                  {opcion.desglose.length || opcion.desgloseTexto ? (
                    <div className="pp__block">
                      <p className="pp__label">Desglose</p>
                      {opcion.desgloseTexto ? <p className="pp__optdetail">{opcion.desgloseTexto}</p> : null}
                      {opcion.desglose.map((tramo, i) => (
                        <div className="pp__optdetail" key={i}>
                          {tramo.titulo ? <b>{tramo.titulo}</b> : null}
                          <ul>
                            {tramo.lineas.map((l, j) => (
                              <li key={j}>{l}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {opcion.gratuidades ? (
                    <div className="pp__free">
                      <p className="pp__label">Gratuidades</p>
                      <p>{opcion.gratuidades}</p>
                    </div>
                  ) : null}

                  <Condiciones titulo="Qué incluye y condiciones" lista={opcion.condiciones} />
                  <Condiciones titulo="Observaciones" lista={opcion.observaciones} />

                  {isChosen ? (
                    <p className="pp__chosen">Es la que habéis elegido</p>
                  ) : chosen ? null : (
                    <button
                      type="button"
                      className="pp__choose"
                      onClick={() => choose(opcion.optionNumber)}
                      disabled={choosing !== null}
                    >
                      {choosing === opcion.optionNumber ? "Guardando…" : "Elegir esta"}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>
        )}

        {actividades ? (
          <section className="pp__sec">
            <h2 className="pp__sectitle">{sinAlojamiento ? "1" : "2"} · Las actividades</h2>
            <p className="pp__secintro">{actividades.intro}</p>
            <div className="pp__acts">
              {actividades.lista.map((actividad, i) => (
                <article className="pp__act" key={i}>
                  <div className="pp__actmain">
                    <h3 className="pp__actname">{actividad.nombre}</h3>
                    {actividad.lineas.length ? (
                      <ul className="pp__actlines">
                        {actividad.lineas.map((l, j) => (
                          <li key={j}>{l}</li>
                        ))}
                      </ul>
                    ) : null}
                    {actividad.detalle ? <p className="pp__actmeta">{actividad.detalle}</p> : null}
                    {actividad.descripcion ? <p className="pp__actdesc">{actividad.descripcion}</p> : null}
                  </div>
                  {actividad.precio ? (
                    <div className="pp__actprice">
                      <strong>{actividad.precio}</strong>
                      {actividad.profesores ? <span>{actividad.profesores}</span> : null}
                      {actividad.grupo ? <span>{actividad.grupo}</span> : null}
                    </div>
                  ) : null}
                </article>
              ))}
              <div className="pp__acttotal">
                <strong>Total de las actividades</strong>
                <div>
                  <strong className="pp__acttotalnum">{actividades.total}</strong>
                  {actividades.totalDetalle ? <span>{actividades.totalDetalle}</span> : null}
                </div>
              </div>
            </div>
            {sinAlojamiento ? (
              chosen ? (
                <p className="pp__chosen">Es la que habéis aceptado</p>
              ) : (
                <button type="button" className="pp__choose" onClick={() => choose(1)} disabled={choosing !== null}>
                  {choosing === 1 ? "Guardando…" : "Aceptar la propuesta"}
                </button>
              )
            ) : null}
          </section>
        ) : null}

        {resumen ? (
          <section className="pp__sec">
            <h2 className="pp__sectitle">{actividades ? "3" : "2"} · Resumen del viaje</h2>
            <div className="pp__sumwrap">
              <table className="pp__sum">
                <thead>
                  <tr>
                    <th>Opción</th>
                    <th>Alojamiento</th>
                    <th>Actividades</th>
                    <th>Total del viaje</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.filas.map((fila) => (
                    <tr key={fila.optionNumber}>
                      <td>
                        {fila.optionNumber}. {fila.nombre}
                      </td>
                      <td>{fila.alojamiento}</td>
                      <td>{fila.actividades}</td>
                      <td>
                        <strong>{fila.total}</strong>
                        {fila.porAlumno ? <span>{fila.porAlumno}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="pp__optnote">{resumen.nota}</p>
          </section>
        ) : null}

        {proposal.documento.notas ? (
          <section className="pp__sec">
            <h2 className="pp__sectitle">Notas</h2>
            <p className="pp__notas">{proposal.documento.notas}</p>
          </section>
        ) : null}
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
