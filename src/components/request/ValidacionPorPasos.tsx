/**
 * Las piezas de «Lo que hemos entendido», validado paso a paso.
 *
 * Maqueta «C» aprobada por Anthony el 06/11/2026, y compactada el mismo día
 * porque había que hacer demasiado scroll: cada paso es UNA línea (título, sus
 * datos como chips con ✓ o ! y el botón de confirmar). Solo se despliega lo que
 * pide una decisión —los avisos de la IA, en tarjetas cortas—; el detalle de cada
 * fila queda detrás de un chevron. Estas piezas solo pintan: el estado vive en
 * `RequestCanvas` y la lógica en `domain/seccionesDeValidacion.ts`.
 */
import { useState, type ReactNode } from "react";

import type { ClaveAuditada, ResultadoAuditoria, ValorAuditado, Veredicto } from "../../domain/auditoriaIa";
import { nombreDelCanal } from "../../domain/clientesEspeciales";
import type { ClienteEspecial } from "../../domain/documentImportTypes";
import { compactadorDeSaltos, trocearConMarcas, type MarcaPedida } from "../../domain/marcasEnTexto";
import type { SeccionDeValidacion, TrozoDeFrase } from "../../domain/seccionesDeValidacion";
import { DEPARTAMENTOS, type FilaParaValidar } from "../../domain/validacionDeLaPeticion";
import type { TextoConOrigen } from "../../services/lecturaDeLaSolicitud";

/** La revisión de la IA de un paso: qué se le dio a revisar, en qué fase está y qué contestó. */
export interface EstadoDeLaAuditoria {
  fase: "inicio" | "apagada" | "cargando" | "lista" | "error";
  resultado: ResultadoAuditoria | null;
  /** Los valores tal como se revisaron: si luego cambian, el veredicto ya no aplica. */
  valores: ValorAuditado[];
  motivo: string | null;
}

export const AUDITORIA_VACIA: EstadoDeLaAuditoria = { fase: "inicio", resultado: null, valores: [], motivo: null };

/** Una cita corta y en una línea. */
export function citaCorta(cita: string, max = 80): string {
  const limpia = cita.replace(/\s+/g, " ").trim();
  return limpia.length > max ? `${limpia.slice(0, max)}…` : limpia;
}

/** Lo que propone la IA, dicho como lo ve quien cotiza (no «GROUPS» ni «SWISS_TTOO»). */
export function sugeridoEnPalabras(clave: ClaveAuditada, sugerido: string, clientes: ClienteEspecial[]): string {
  if (clave === "departamento") return DEPARTAMENTOS[sugerido] ?? sugerido;
  if (clave === "cotizamosPara") return nombreDelCanal(sugerido, clientes, "Colegio, club o agencia");
  return sugerido;
}

// ---------------------------------------------------------------------------
// El mensaje original, con lo usado subrayado
// ---------------------------------------------------------------------------

export function MensajesMarcados({
  textos,
  marcas,
  foco,
  onFoco,
}: {
  textos: TextoConOrigen[];
  marcas: MarcaPedida[];
  /** El dato sobre el que está el ratón (en un chip o en el subrayado). */
  foco: string | null;
  onFoco: (clave: string | null) => void;
}) {
  return (
    <>
      {textos.map((t, i) => {
        const compactar = compactadorDeSaltos(t.texto);
        return (
        <div className="cv__vcmsg" key={i}>
          <span className={t.origen === "chat" ? "cv__vcquien is-tu" : "cv__vcquien"}>
            {t.origen === "chat" ? "Tú, en el chat" : "El cliente"}
          </span>
          <pre>
            {trocearConMarcas(t.texto, marcas).map((tr, j) =>
              tr.claves.length === 0 ? (
                <span key={j}>{compactar(tr.texto)}</span>
              ) : (
                <mark
                  key={j}
                  className={["cv__vcmark", tr.aviso ? "is-aviso" : "", foco && tr.claves.includes(foco) ? "is-foco" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  onMouseEnter={() => onFoco(tr.claves[0])}
                  onMouseLeave={() => onFoco(null)}
                >
                  {compactar(tr.texto)}
                </mark>
              ),
            )}
          </pre>
        </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// La frase de arriba (y, en su esquina, qué hace la IA)
// ---------------------------------------------------------------------------

export interface EstadoDeLaIaEnPantalla {
  tono: "espera" | "ok" | "error" | "apagada";
  texto: string;
  /** Más detalle, al pasar el ratón (p. ej. por qué falló). */
  detalle?: string;
}

export function FraseDeLaPeticion({ frase, ia }: { frase: TrozoDeFrase[]; ia?: EstadoDeLaIaEnPantalla | null }) {
  return (
    <div className="cv__vcfrase">
      <div className="cv__vcfraseh">
        <p className="cv__ventbt">En una frase</p>
        {ia ? (
          <span className={`cv__vcia is-${ia.tono}`} title={ia.detalle}>
            {ia.texto}
          </span>
        ) : null}
      </div>
      <p>{frase.map((t, i) => (t.dato ? <b key={i}>{t.texto}</b> : <span key={i}>{t.texto}</span>))}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Un paso: una línea, y debajo solo lo que pide una decisión
// ---------------------------------------------------------------------------

export interface FilaDelPaso {
  fila: FilaParaValidar;
  clave: ClaveAuditada | null;
  /** El veredicto vigente de la IA, o null si no lo hay o el dato ha cambiado desde entonces. */
  v: Veredicto | null;
  /** El dato cambió después de la revisión de la IA. */
  cambiado: boolean;
  /** Quien cotiza ha dicho «dejarlo como está». */
  dejado: boolean;
}

const ETIQUETA_CORTA: Record<string, string> = {
  "Presupuesto por alumno": "Presupuesto",
  "Requisitos especiales": "Requisitos",
};

const SIN_DECIR = (valor: string) => ["", "—", "no lo han dicho", "ninguno"].includes(valor.trim().toLowerCase());

/** Un dato del paso, en una línea: lo que se ve sin abrir nada. */
function Chip({
  f,
  foco,
  onFoco,
}: {
  f: FilaDelPaso;
  foco: string | null;
  onFoco: (clave: string | null) => void;
}) {
  const aviso = f.v?.estado === "no_cuadra" && !f.dejado;
  const ok = f.v?.estado === "correcto" && f.v.cita !== "";
  const sin = f.v?.estado === "sin_respaldo";
  const marca = aviso || f.dejado ? "!" : ok ? "✓" : sin ? "○" : "";
  const etiqueta = ETIQUETA_CORTA[f.fila.que] ?? f.fila.que;
  const ayuda = [
    `${f.fila.que}: ${f.fila.valor}`,
    aviso && f.v?.motivo ? f.v.motivo : "",
    f.dejado ? "Lo has dejado como está" : "",
    ok && f.v ? `Comprobado con «${citaCorta(f.v.cita, 120)}»` : "",
    sin ? "No aparece en lo escrito" : "",
    f.cambiado ? "Cambiado tras la revisión de la IA" : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      className={["cv__vcchip", aviso ? "is-aviso" : "", f.dejado ? "is-dejado" : "", ok ? "is-ok" : "", sin ? "is-sin" : "", f.clave && foco === f.clave ? "is-foco" : ""]
        .filter(Boolean)
        .join(" ")}
      title={ayuda}
      onMouseEnter={() => f.clave && onFoco(f.clave)}
      onMouseLeave={() => onFoco(null)}
    >
      {marca ? <i>{marca}</i> : null}
      <small>{etiqueta}</small> <span>{citaCorta(f.fila.valor, 34)}</span>
    </span>
  );
}

/** Un aviso de la IA: qué dato, qué cambiaría, y los botones. Corta: son los que hay que decidir. */
function TarjetaDeAviso({
  datos,
  clientes,
  onAplicar,
  onDejar,
}: {
  datos: FilaDelPaso;
  clientes: ClienteEspecial[];
  onAplicar: (clave: ClaveAuditada, valor: string | null) => void;
  onDejar: (clave: ClaveAuditada) => void;
}) {
  const { fila, v, clave } = datos;
  if (!v || !clave) return null;
  const nuevo = v.sugerido ? sugeridoEnPalabras(clave, v.sugerido, clientes) : "";
  return (
    <article className="cv__vccard" data-clave={clave} title={v.cita ? `El texto dice: «${citaCorta(v.cita, 160)}»` : undefined}>
      <div className="cv__vccardh">
        <b>{fila.que}</b>
        {nuevo || v.vaciar ? (
          <span className="cv__vcdiff">
            <span className="cv__vcviejo">{citaCorta(fila.valor, 46)}</span>
            <span className="cv__vcflecha">→</span>
            {nuevo ? <span className="cv__vcnuevo">{citaCorta(nuevo, 46)}</span> : <span className="cv__vcvacio">(vacío)</span>}
          </span>
        ) : (
          <span className="cv__vcvalor">{citaCorta(fila.valor, 60)}</span>
        )}
      </div>
      <div className="cv__vccardf">
        <span className="cv__vcporque">{v.motivo || "No cuadra con lo escrito."}</span>
        <span className="cv__vcacc">
          {v.sugerido ? (
            <button type="button" className="cv__primary cv__primary--sm" onClick={() => onAplicar(clave, v.sugerido)}>
              Usar «{citaCorta(nuevo, 28)}»
            </button>
          ) : null}
          {v.vaciar ? (
            <button type="button" className="cv__primary cv__primary--sm" onClick={() => onAplicar(clave, null)}>
              Quitar este dato
            </button>
          ) : null}
          <button type="button" className="cv__vcsutil" onClick={() => onDejar(clave)}>
            Dejarlo como está
          </button>
        </span>
      </div>
    </article>
  );
}

/** El detalle de las filas de un paso (las notas, las frases que lo respaldan): detrás del chevron. */
function DetalleDelPaso({ filas, foco, onFoco }: { filas: FilaDelPaso[]; foco: string | null; onFoco: (clave: string | null) => void }) {
  const sinDecir = filas.filter((f) => f.fila.valor.trim().toLowerCase() === "no lo han dicho").map((f) => f.fila.que);
  return (
    <div className="cv__vcdetalle">
      {filas
        .filter((f) => !SIN_DECIR(f.fila.valor))
        .map((f) => (
          <div
            key={f.fila.que}
            className={["cv__vcfila", f.clave && foco === f.clave ? "is-foco" : ""].filter(Boolean).join(" ")}
            onMouseEnter={() => f.clave && onFoco(f.clave)}
            onMouseLeave={() => onFoco(null)}
          >
            <span className="cv__vce">{f.fila.que}</span>
            <span className="cv__vcd">
              {f.fila.valor}
              {f.clave === null ? <small> · lo calcula la app</small> : null}
              {f.v?.estado === "correcto" && f.v.cita ? <small> · comprobado con «{citaCorta(f.v.cita, 90)}»</small> : null}
              {f.v?.estado === "sin_respaldo" ? <small> · no aparece en lo escrito</small> : null}
              {f.cambiado ? <small> · cambiado tras la revisión de la IA</small> : null}
            </span>
            {f.fila.nota ? <span className="cv__vcnota">{f.fila.nota}</span> : null}
          </div>
        ))}
      {sinDecir.length > 0 ? <p className="cv__vcsin">No lo han dicho: {sinDecir.join(" · ")}.</p> : null}
    </div>
  );
}

export function PasoDeValidacion({
  seccion,
  filas,
  confirmado,
  resumen,
  falta,
  pendientes,
  comprobando,
  revisadoPorIa,
  foco,
  onFoco,
  clientes,
  onAplicar,
  onDejar,
  onConfirmar,
  onCambiar,
  nota,
  detalleAbierto,
}: {
  seccion: SeccionDeValidacion;
  filas: FilaDelPaso[];
  confirmado: boolean;
  resumen: string;
  /** Lo que falta y hace falta: sin eso no se puede confirmar. */
  falta: string[];
  /** Avisos de la IA sin resolver. */
  pendientes: number;
  comprobando: boolean;
  /** La IA ha revisado este paso (si no, hay que mirarlo a mano). */
  revisadoPorIa: boolean;
  foco: string | null;
  onFoco: (clave: string | null) => void;
  clientes: ClienteEspecial[];
  onAplicar: (clave: ClaveAuditada, valor: string | null) => void;
  onDejar: (clave: ClaveAuditada) => void;
  onConfirmar: () => void;
  onCambiar: () => void;
  /** Un aviso propio de este paso (p. ej. «reabierto porque la IA ha encontrado algo»). */
  nota?: ReactNode;
  /** El detalle de las filas, abierto (por defecto, cerrado). */
  detalleAbierto?: boolean;
}) {
  const [verDetalle, setVerDetalle] = useState(detalleAbierto ?? false);
  const clase = ["cv__vcsec", confirmado ? "is-ok" : "", seccion.bloquea ? "" : "is-luego", pendientes > 0 ? "is-aviso" : ""].filter(Boolean).join(" ");

  if (confirmado) {
    return (
      <section className={clase} aria-label={seccion.titulo}>
        <div className="cv__vcsech">
          <span className="cv__vcn">✓</span>
          <h3>{seccion.titulo}</h3>
          <span className="cv__vcres" title={resumen}>
            {citaCorta(resumen, 90)}
          </span>
          <button type="button" className="cv__vcsutil" onClick={onCambiar}>
            Cambiar
          </button>
        </div>
      </section>
    );
  }

  const avisos = filas.filter((f) => f.v?.estado === "no_cuadra" && !f.dejado);
  const chips = filas.filter((f) => f.clave !== null && !SIN_DECIR(f.fila.valor));
  const bloqueo = falta.length > 0 ? `Falta: ${falta.join(", ")}` : pendientes > 0 ? `${pendientes} ${pendientes === 1 ? "aviso" : "avisos"} sin resolver` : "";
  const sinMirar = !revisadoPorIa && !comprobando;

  return (
    <section className={clase} aria-label={seccion.titulo}>
      <div className="cv__vcsech">
        <span className="cv__vcn">{seccion.numero ?? "·"}</span>
        <h3 title={seccion.para}>
          {seccion.titulo}
          {seccion.bloquea ? null : <small> · al enviar</small>}
        </h3>
        <div className="cv__vcchips">
          {chips.map((f) => (
            <Chip key={f.fila.que} f={f} foco={foco} onFoco={onFoco} />
          ))}
          {falta.length > 0 ? <span className="cv__vcchip is-aviso">Falta: {falta.join(", ")}</span> : null}
          {pendientes > 0 && falta.length === 0 ? <span className="cv__vctag is-aviso">{bloqueo}</span> : null}
          {comprobando ? <span className="cv__vctag">La IA lo está comprobando…</span> : null}
          {sinMirar && bloqueo === "" ? (
            <span className="cv__vctag" title="La IA no ha comprobado este paso: míralo tú">
              sin comprobar
            </span>
          ) : null}
        </div>
        <div className="cv__vcsecacc">
          <button
            type="button"
            className="cv__vcchev"
            aria-expanded={verDetalle}
            aria-label={verDetalle ? "Ocultar el detalle" : "Ver el detalle"}
            title={verDetalle ? "Ocultar el detalle" : "Ver el detalle"}
            onClick={() => setVerDetalle((v) => !v)}
          >
            {verDetalle ? "▴" : "▾"}
          </button>
          <button type="button" className="cv__primary cv__primary--sm" disabled={bloqueo !== ""} title={bloqueo || undefined} onClick={onConfirmar}>
            {revisadoPorIa || comprobando ? "Confirmar" : "He revisado esto"}
          </button>
        </div>
      </div>
      {nota}
      {avisos.length > 0 ? (
        <div className="cv__vcavisos">
          {avisos.map((a) => (
            <TarjetaDeAviso key={a.clave} datos={a} clientes={clientes} onAplicar={onAplicar} onDejar={onDejar} />
          ))}
        </div>
      ) : null}
      {verDetalle ? <DetalleDelPaso filas={filas} foco={foco} onFoco={onFoco} /> : null}
    </section>
  );
}
