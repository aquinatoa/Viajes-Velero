import type { CSSProperties } from "react";
import { FASES_EN_ORDEN, FASES_LATERALES, estadoDe } from "../../domain/oportunidadesVista";

/**
 * Por dónde va una oportunidad: una línea fina con sus fases, no cinco cajas.
 *
 * Si todavía no está en el CRM se pinta en gris con UN aviso (antes decía
 * «Preparando Presupuesto» resaltado y, debajo, «todavía no tiene oportunidad en
 * el CRM»: las dos cosas a la vez).
 */
export interface PasoDeAvance {
  fase: string;
  hecho: boolean;
  actual: boolean;
  /** Lo que la app sabe de ese paso («El documento se generó»). */
  detalle?: string | null;
  /** Cuándo pasó, ya escrito («6 nov»). */
  cuando?: string | null;
  /** El color que esa fase tiene en el CRM (hexadecimal), si se conoce. */
  color?: string | null;
}

/** Los pasos del embudo completo a partir de la fase de Zoho (para las oportunidades sin propuesta de la app). */
export function pasosDeLaFase(fase: string | null): PasoDeAvance[] {
  const indice = (FASES_EN_ORDEN as readonly string[]).indexOf(fase ?? "");
  const lateral = (FASES_LATERALES as readonly string[]).includes(fase ?? "");
  return FASES_EN_ORDEN.map((f, i) => ({
    fase: f,
    hecho: !lateral && indice >= 0 && i < indice,
    actual: !lateral && i === indice,
  }));
}

export function AvanceDeFase({
  pasos,
  fase,
  sinCrm = false,
  estado,
}: {
  pasos: PasoDeAvance[];
  /** La fase en la que está ahora (para marcar «Lista de espera» / «Perdida»). */
  fase: string | null;
  /** Todavía no hay oportunidad en el CRM. */
  sinCrm?: boolean;
  /** Para el color del trazo. */
  estado?: ReturnType<typeof estadoDe>;
}) {
  const color = (estado ? `opx-c-${estado}` : "opx-c-todas") + (sinCrm ? " opx-avance--sin" : "");
  const actual = pasos.find((p) => p.actual);
  return (
    <div className={`opx-avance ${color}`} style={{ "--pasos": pasos.length } as CSSProperties}>
      <ol>
        {pasos.map((p) => (
          <li
            key={p.fase}
            className={`${p.hecho ? "is-hecho" : ""} ${p.actual ? "is-actual" : ""}`}
            style={p.actual && p.color && !sinCrm ? ({ "--c": hexARgb(p.color) } as CSSProperties) : undefined}
            title={[p.detalle, p.cuando].filter(Boolean).join(" · ") || undefined}
          >
            <i />
            <span>
              {p.fase}
              {p.actual && (p.detalle || p.cuando) ? (
                <small className="opx-avance__cuando">{[p.detalle, p.cuando].filter(Boolean).join(" · ")}</small>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      {!sinCrm && fase && (FASES_LATERALES as readonly string[]).includes(fase) ? (
        <div className="opx-avance__lat">
          {FASES_LATERALES.map((f) => (
            <span key={f} className={f === fase ? "is" : ""}>
              {f}
            </span>
          ))}
        </div>
      ) : null}
      {sinCrm ? (
        <p className="opx-avance__nota">
          Aún no está en el CRM: la oportunidad se crea al enviar la propuesta, y desde ahí se podrá mover de fase.
        </p>
      ) : actual === undefined && fase && !(FASES_LATERALES as readonly string[]).includes(fase) ? (
        <p className="opx-avance__nota">En el CRM está en «{fase}», que no es una de las fases del camino habitual.</p>
      ) : null}
    </div>
  );
}

/** «#d89412» → «216, 148, 18» para poder dar la intensidad con rgba(). */
function hexARgb(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? `${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}` : "19, 46, 93";
}
