import { useEffect, useState } from "react";
import {
  borrarSolicitudApi,
  vistaPreviaDelBorradoApi,
  type ProposalDelivery,
  type VistaPreviaDelBorrado,
} from "../../services/apiClient";

/**
 * Borrar una solicitud de prueba, con lo que arrastra.
 *
 * La app no sabía borrar nada, así que cada recorrido de prueba dejaba una fila
 * en la mesa para siempre y una oportunidad viva en el Zoho de Oravia —que es
 * su CRM de verdad, no uno de juguete—. Había que entrar al CRM, adivinar cuál
 * era y borrarla a mano.
 *
 * Esta pantalla dice ANTES qué se va a llevar por delante, porque no es solo la
 * fila que se ve: es la solicitud entera, con todas sus versiones de propuesta,
 * todos sus envíos, sus PDF y el trato del CRM. Enseñarlo es la mitad del
 * trabajo; una confirmación que solo dice «¿seguro?» no informa de nada.
 *
 * Lo que se enseña lo dice el servidor, incluido el motivo por el que a veces
 * no se puede borrar. La regla vive allí y solo allí: repetida aquí acabaría
 * diciendo una cosa en la pantalla y otra al pulsar.
 */

export interface BorrarSolicitudPanelProps {
  delivery: ProposalDelivery;
  titulo: string;
  onClose: () => void;
  onBorrada: (resumen: string) => void;
}

export function BorrarSolicitudPanel({
  delivery,
  titulo,
  onClose,
  onBorrada,
}: BorrarSolicitudPanelProps) {
  const tripRequestId = delivery.proposal?.tripRequest?.id ?? null;

  const [previa, setPrevia] = useState<VistaPreviaDelBorrado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vigente = true;

    if (!tripRequestId) {
      setCargando(false);
      setError("Esta propuesta no tiene solicitud asociada, así que no hay nada que borrar.");
      return;
    }

    vistaPreviaDelBorradoApi(tripRequestId)
      .then((resultado) => {
        if (vigente) setPrevia(resultado);
      })
      .catch((err: unknown) => {
        if (vigente) {
          setError(err instanceof Error ? err.message : "No se pudo comprobar qué se borraría.");
        }
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
    };
  }, [tripRequestId]);

  async function borrar() {
    if (!tripRequestId) return;

    setBorrando(true);
    setError("");
    try {
      const resultado = await borrarSolicitudApi(tripRequestId);
      const enElCrm =
        resultado.crm === "BORRADO"
          ? " y su oportunidad del CRM"
          : resultado.crm === "NO_ESTABA"
            ? " (en el CRM ya no estaba)"
            : "";
      onBorrada(`Borrada «${resultado.titulo}»${enElCrm}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar la solicitud.");
      setBorrando(false);
    }
  }

  const bloqueada = previa?.motivoNoBorrable ?? null;

  return (
    <div className="rv" role="dialog" aria-modal="true" aria-label="Borrar la solicitud">
      <div className="rv__back" onClick={onClose} />
      <aside className="rv__panel">
        <header className="rv__head">
          <div>
            <p className="rv__k">Borrar la solicitud</p>
            <h2 className="rv__t">{titulo}</h2>
          </div>
          <button type="button" className="cv__ghost cv__ghost--sm" onClick={onClose}>
            Cerrar
          </button>
        </header>

        <div className="rv__body">
          {cargando ? (
            <p className="cv__empty">Mirando qué se llevaría por delante…</p>
          ) : previa ? (
            <>
              {bloqueada ? (
                <div className="alert alert--error" role="alert">
                  {bloqueada}
                </div>
              ) : null}

              <section className="rv__block">
                <h3 className="rv__bt">Esto es lo que desaparece</h3>
                <ul className="borra__lista">
                  <li>
                    La solicitud entera, con sus{" "}
                    {previa.propuestas === 1
                      ? "1 versión de propuesta"
                      : `${previa.propuestas} versiones de propuesta`}{" "}
                    y sus opciones.
                  </li>
                  <li>
                    {previa.referencias.length === 0 ? (
                      "Ningún envío: esta solicitud no llegó a generar propuesta."
                    ) : (
                      <>
                        {previa.referencias.length === 1 ? "El envío " : "Los envíos "}
                        <b>{previa.referencias.join(", ")}</b>, con sus PDF.
                      </>
                    )}
                  </li>
                  <li>
                    {previa.crmDealId ? (
                      <>
                        La oportunidad <b>{previa.crmDealId}</b> del CRM. Zoho la guarda 60 días
                        en su papelera, así que se puede recuperar desde allí.
                      </>
                    ) : (
                      <>
                        En el CRM no hay nada que borrar: esta solicitud nunca llegó a crear
                        oportunidad.
                      </>
                    )}
                  </li>
                </ul>
              </section>

              <section className="rv__block">
                <h3 className="rv__bt">Lo que NO se toca</h3>
                <p className="rv__line">
                  El colegio y su contacto se quedan en el CRM con el resto de su historial. Solo
                  se borra esta oportunidad.
                </p>
              </section>
            </>
          ) : null}

          {error ? (
            <div className="alert alert--error" role="alert">
              {error}
            </div>
          ) : null}
        </div>

        <footer className="rv__foot borra__foot">
          <button type="button" className="cv__ghost" onClick={onClose} disabled={borrando}>
            Dejarlo como está
          </button>
          <button
            type="button"
            className="borra__btn"
            onClick={borrar}
            disabled={borrando || cargando || !previa || Boolean(bloqueada)}
          >
            {borrando ? "Borrando…" : "Borrar la solicitud"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
