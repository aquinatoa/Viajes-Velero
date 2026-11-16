import { useEffect, useMemo, useState } from "react";
import { moverFaseApi } from "../../services/apiClient";
import {
  FASES_EN_ORDEN,
  FASES_LATERALES,
  atajos,
  avisoDelMovimiento,
  exigeMotivo,
  tipoDeMovimiento,
} from "../../domain/oportunidadesVista";
import type { OportunidadFila } from "../../domain/oportunidadUnificada";

/** Lo mínimo para que un motivo valga (el servidor lo vuelve a comprobar). */
const MOTIVO_MINIMO = 3;

/**
 * Mover una oportunidad de fase, con constancia: quién, cuándo, de → a y motivo.
 *
 * La fase se mueve libremente, adelante y atrás. Lo único que se exige es un
 * motivo al retroceder, perder o pasar a lista de espera. ESCRIBE en Zoho (la fase
 * y una nota fechada), así que antes de un retroceso o una pérdida se pregunta.
 */
export function MoverDeFase({
  fila,
  fasesDelCrm,
  opciones,
  destino,
  onHecho,
  onError,
}: {
  fila: Pick<OportunidadFila, "crmDealId" | "fase" | "carril">;
  /** Las fases que existen en Zoho (para el desplegable). */
  fasesDelCrm: string[];
  /** La fase que se ha pulsado en la barra de fases de la ficha: llega ya elegida. */
  destino?: string;
  /** Si la oportunidad tiene opciones en Zoho: cuántas y cuál está elegida. */
  opciones?: { total: number; elegida: number | null };
  onHecho: (mensaje: string) => void;
  onError: (mensaje: string) => void;
}) {
  const [nueva, setNueva] = useState("");
  const [motivo, setMotivo] = useState("");
  const [opcion, setOpcion] = useState<number | null>(opciones?.elegida ?? null);
  const [ocupado, setOcupado] = useState(false);

  // Al pasar a otra oportunidad, empezar de cero.
  useEffect(() => {
    setNueva("");
    setMotivo("");
    setOpcion(opciones?.elegida ?? null);
  }, [fila.crmDealId, fila.fase, opciones?.elegida]);

  // La fase pulsada en la barra de la ficha llega elegida; el motivo y el botón siguen siendo de aquí.
  useEffect(() => {
    if (destino && destino !== fila.fase) setNueva(destino);
  }, [destino, fila.fase]);

  const lista = useMemo(() => {
    const conocidas: string[] = [...FASES_EN_ORDEN, ...FASES_LATERALES];
    const delCrm = fasesDelCrm.length > 0 ? new Set(fasesDelCrm) : null;
    const ordenadas = conocidas.filter((f) => !delCrm || delCrm.has(f));
    const otras = (fasesDelCrm ?? []).filter((f) => !conocidas.includes(f));
    return [...ordenadas, ...otras];
  }, [fasesDelCrm]);

  if (!fila.crmDealId) {
    return (
      <aside className="opx-mover" id="opx-mover">
        <h4>Mover de fase</h4>
        <p className="opx-muted">
          Todavía no hay oportunidad en el CRM. Cuando se envíe la propuesta se crea y aquí se podrá mover.
        </p>
      </aside>
    );
  }
  const dealId = fila.crmDealId;
  const actual = fila.fase ?? "";
  const exige = nueva !== "" && exigeMotivo(actual, nueva);
  const aviso = avisoDelMovimiento(actual, nueva);
  const cambiaLaOpcion = opciones !== undefined && opcion !== null && opcion !== opciones.elegida;
  const hayCambio = (nueva !== "" && nueva !== actual) || cambiaLaOpcion || motivo.trim() !== "";
  const motivoValido = !exige || motivo.trim().length >= MOTIVO_MINIMO;
  const puedeGuardar = hayCambio && motivoValido && !ocupado;

  async function guardar() {
    const tipo = tipoDeMovimiento(actual, nueva);
    if (nueva && (tipo === "atras" || tipo === "lateral")) {
      const seguro = window.confirm(
        `¿Pasar la oportunidad de «${actual}» a «${nueva}»?\n\nSe escribe en Zoho y queda anotado el motivo.`,
      );
      if (!seguro) return;
    }
    setOcupado(true);
    try {
      const r = await moverFaseApi(dealId, {
        fase: nueva && nueva !== actual ? nueva : undefined,
        motivo: motivo.trim() || undefined,
        opcion: cambiaLaOpcion ? opcion : undefined,
      });
      setNueva("");
      setMotivo("");
      onHecho(r.cambioDeFase ? `Fase cambiada: ${r.desde || "sin fase"} → ${r.hasta}.` : "Anotado en Zoho.");
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo cambiar la fase.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <aside className="opx-mover" id="opx-mover">
      <h4>Mover de fase</h4>
      <p className="opx-mover__ahora">
        Ahora: <b>{actual || "sin fase"}</b>
      </p>

      {atajos(fila).length > 0 ? (
        <>
          <p className="opx-mover__t">Atajos</p>
          <div className="opx-atajos">
            {atajos(fila).map((a) => (
              <button key={a.fase} type="button" className="opx-atajo" onClick={() => setNueva(a.fase)}>
                {a.texto}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {opciones && opciones.total > 0 ? (
        <label>
          Opción elegida por el cliente
          <span className="opx-opcion">
            {Array.from({ length: opciones.total }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" className={opcion === n ? "is" : ""} onClick={() => setOpcion(n)}>
                {n}
              </button>
            ))}
          </span>
        </label>
      ) : null}

      <label>
        Otra fase
        <select value={nueva} onChange={(e) => setNueva(e.target.value)}>
          <option value="">— elegir —</option>
          {lista.map((f) => (
            <option key={f} value={f} disabled={f === actual}>
              {f}
              {f === actual ? " (actual)" : ""}
            </option>
          ))}
        </select>
      </label>

      {aviso ? <p className={`opx-mover__aviso${exige ? " is-ya" : ""}`}>{aviso}</p> : null}

      <label>
        <span>
          Motivo o nota {exige ? <b className="opx-obl">(obligatorio)</b> : "(opcional)"}
        </span>
        <textarea
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Se añade con la fecha, sin borrar lo existente."
        />
      </label>

      <button type="button" className="opx-btn opx-btn--primario opx-btn--ancho" disabled={!puedeGuardar} onClick={() => void guardar()}>
        {ocupado ? "Guardando…" : "Guardar el cambio"}
      </button>
      <p className="opx-mover__pie">Se escribe en Zoho y queda anotado: quién, cuándo, de → a y motivo.</p>
    </aside>
  );
}
