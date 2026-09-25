import { useEffect, useState } from "react";
import { fichaDelPresupuestoApi, type FichaPresupuesto } from "../../services/apiClient";
import { CorreoPanel } from "./CorreoPanel";
import type { ProposalDelivery } from "../../services/apiClient";

/**
 * La ficha de un presupuesto: todo lo que hace falta para seguirlo.
 *
 * Sale de la reunión del 17/06, donde quedó dicho que «llevar el seguimiento
 * dentro de la oportunidad no va a ser muy cómodo, porque aquí hay una
 * información básica registrada». En el trato de Zoho caben un nombre, un
 * importe y un texto; no caben las tres opciones con su desglose, ni si el
 * colegio abrió el enlace, ni la conversación.
 *
 * La oportunidad y el presupuesto CONVIVEN: la oportunidad es donde vive el
 * trato, el presupuesto es lo que la alimenta. Por eso la ficha enseña siempre
 * en qué fase está el trato y enlaza a él, en vez de sustituirlo.
 */

export interface FichaPropuestaProps {
  delivery: ProposalDelivery;
  onClose: () => void;
}

function fecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

function fechaCorta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function diasHasta(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

export function FichaPropuesta({ delivery, onClose }: FichaPropuestaProps) {
  const [ficha, setFicha] = useState<FichaPresupuesto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [correo, setCorreo] = useState(false);

  useEffect(() => {
    let vivo = true;
    fichaDelPresupuestoApi(delivery.id)
      .then((f) => {
        if (vivo) setFicha(f);
      })
      .catch((e: unknown) => {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudo cargar el presupuesto.");
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [delivery.id]);

  if (cargando) {
    return (
      <div className="ficha">
        <p className="cv__empty">Cargando el presupuesto…</p>
      </div>
    );
  }

  if (error || !ficha) {
    return (
      <div className="ficha">
        <div className="alert alert--error" role="alert">
          {error || "No se pudo cargar el presupuesto."}
        </div>
        <button type="button" className="cv__ghost" onClick={onClose}>
          Volver
        </button>
      </div>
    );
  }

  const quedan = diasHasta(ficha.depositDueAt);

  return (
    <div className="ficha">
      <header className="ficha__top">
        <div>
          <button type="button" className="ficha__volver" onClick={onClose}>
            ← Volver a las propuestas
          </button>
          <h1 className="ficha__t">{ficha.viaje.nombre}</h1>
          <p className="ficha__sub">
            <span className="mono">{ficha.reference}</span>
            {ficha.viaje.centro ? ` · ${ficha.viaje.centro}` : ""}
          </p>
        </div>
        <div className="ficha__acciones">
          <button type="button" className="cv__ghost cv__ghost--sm" onClick={() => setCorreo(true)}>
            Conversación
            {ficha.correo.total > 0 ? <span className="ficha__pill">{ficha.correo.total}</span> : null}
          </button>
          {ficha.pdf ? (
            <a className="cv__ghost cv__ghost--sm" href={ficha.pdf} target="_blank" rel="noreferrer">
              Ver el documento
            </a>
          ) : null}
          {ficha.crm.dealUrl ? (
            <a className="cv__ghost cv__ghost--sm" href={ficha.crm.dealUrl} target="_blank" rel="noreferrer">
              Abrir en el CRM
            </a>
          ) : null}
        </div>
      </header>

      {/* Los datos del viaje. Lo que en el trato de Zoho cabe a duras penas. */}
      <section className="ficha__datos">
        {[
          ["Destino", ficha.viaje.destino || "—"],
          ["Fechas", `${fecha(ficha.viaje.dateFrom)} — ${fecha(ficha.viaje.dateTo)}`],
          ["Participantes", ficha.viaje.participants ? String(ficha.viaje.participants) : "—"],
          ["Profesores", ficha.viaje.teachers ? String(ficha.viaje.teachers) : "—"],
          ["Contacto", ficha.contacto.email],
        ].map(([k, v]) => (
          <div key={k} className="ficha__dato">
            <span className="ficha__k">{k}</span>
            <span className="ficha__v">{v}</span>
          </div>
        ))}
      </section>

      {/* El embudo. Es lo que ata el presupuesto a la oportunidad: las fechas
          las sabe la app, la casilla en la que está la dice el CRM. */}
      <section className="ficha__bloque">
        <div className="sec-head">
          <h2 className="ficha__h2">Por dónde va</h2>
          <p className="ficha__nota">
            {ficha.crm.dealId ? (
              ficha.crm.respondio ? (
                <>
                  En el CRM está en <b>{ficha.crm.fase || "sin fase"}</b>
                </>
              ) : (
                "El CRM no ha contestado; las fechas son las que sabe la app."
              )
            ) : (
              "Esta propuesta todavía no tiene oportunidad en el CRM."
            )}
          </p>
        </div>

        <ol className="embudo">
          {ficha.embudo.map((p) => (
            <li
              key={p.fase}
              className={`embudo__p${p.hecho ? " is-hecho" : ""}${p.actual ? " is-actual" : ""}`}
            >
              <span className="embudo__punto" aria-hidden="true" />
              <span className="embudo__fase">{p.fase}</span>
              {p.detalle ? <span className="embudo__det">{p.detalle}</span> : null}
              {p.cuando ? <span className="embudo__cuando">{fechaCorta(p.cuando)}</span> : null}
            </li>
          ))}
        </ol>

        {quedan !== null && !ficha.depositPaidAt ? (
          <p className={quedan < 0 ? "ficha__aviso ficha__aviso--tarde" : "ficha__aviso"}>
            {quedan < 0
              ? `El depósito venció hace ${Math.abs(quedan)} días.`
              : `Quedan ${quedan} días para el depósito.`}
          </p>
        ) : null}
      </section>

      {/* Las tres opciones, con lo que de verdad supone cada una. */}
      <section className="ficha__bloque">
        <div className="sec-head">
          <h2 className="ficha__h2">Lo que se ofreció</h2>
          <p className="ficha__nota">
            {ficha.elegida
              ? `El colegio eligió la opción ${ficha.elegida}.`
              : "Todavía no han elegido ninguna."}
          </p>
        </div>

        {ficha.opciones.length === 0 ? (
          <p className="cv__empty">Esta propuesta no tiene opciones guardadas.</p>
        ) : (
          <ul className="ficha__ops">
            {ficha.opciones.map((o) => (
              <li key={o.optionNumber} className={o.elegida ? "ficha__op is-elegida" : "ficha__op"}>
                <div className="ficha__opcab">
                  <span className="ficha__opn">Opción {o.optionNumber}</span>
                  <span className="ficha__optotal">{o.totalPvpText}</span>
                </div>
                <div className="ficha__opnom">{o.alojamiento}</div>
                <div className="ficha__opdet">
                  {[o.regimen, o.noches ? `${o.noches} noches` : null].filter(Boolean).join(" · ")}
                </div>
                {o.desglose ? <div className="ficha__opdesg">{o.desglose}</div> : null}
                {o.gratuidades ? (
                  <div className="ficha__opgrat">
                    <b>Gratuidades:</b> {o.gratuidades}
                  </div>
                ) : null}
                {o.actividades.length > 0 ? (
                  <ul className="ficha__acts">
                    {o.actividades.map((a, i) => (
                      <li key={`${o.optionNumber}-${i}`}>
                        <span>{a.nombre}</span>
                        <span className="ficha__actp">{a.precio}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {o.elegida ? <span className="ficha__elegida">Elegida por el colegio</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {correo ? (
        <CorreoPanel
          delivery={delivery}
          titulo={ficha.viaje.nombre}
          onClose={() => setCorreo(false)}
        />
      ) : null}
    </div>
  );
}
