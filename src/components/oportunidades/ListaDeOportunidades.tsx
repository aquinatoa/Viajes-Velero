import type { OportunidadFila } from "../../domain/oportunidadUnificada";
import {
  abierta,
  cierreVencidoHace,
  claveDeNombre,
  diasHasta,
  estadoDe,
  euros,
  eurosCorto,
  porCuenta,
  rangoLlegada,
  siguientePaso,
} from "../../domain/oportunidadesVista";
import { lineaDeEstado } from "./textos";

const DEPARTAMENTOS: Record<string, string> = { GROUPS: "Groups", SPORTS: "Sports", OTRO: "Otro" };

export function ChipDeDepartamento({ f }: { f: Pick<OportunidadFila, "departamento"> }) {
  if (!f.departamento) return null;
  return <span className={`opx-dept opx-dept--${f.departamento.toLowerCase()}`}>{DEPARTAMENTOS[f.departamento] ?? f.departamento}</span>;
}

/** Lo que dice la pastilla: la fase de Zoho o, si aún no hay oportunidad, el estado de la propuesta. */
export function textoDeFase(f: OportunidadFila): string {
  if (f.fase) return f.fase;
  if (f.entrega) return f.entrega.estado === "DRAFT" || f.entrega.estado === "SIMULATED" ? "Propuesta sin enviar" : "Propuesta enviada";
  return "—";
}

function Semaforo({ f, hoy }: { f: OportunidadFila; hoy: Date }) {
  const d = diasHasta(f.llegada, hoy);
  if (!abierta(f) || d === null) return null;
  const color = d < 0 ? "gris" : d <= 60 ? "rojo" : d <= 120 ? "ambar" : "verde";
  const texto = d < 0 ? "ya llegó" : `llega en ${d} días`;
  return <span className={`opx-semaforo opx-semaforo--${color}`} title={texto} aria-label={texto} />;
}

/** Una fila de la lista: nombre e importe, estado, quién y lo siguiente, cada cosa en su línea. */
export function FilaDeOportunidad({
  f,
  seleccionada,
  onSeleccionar,
  hoy,
  repetidos,
}: {
  f: OportunidadFila;
  seleccionada: boolean;
  onSeleccionar: () => void;
  hoy: Date;
  repetidos: Set<string>;
}) {
  const est = estadoDe(f);
  const paso = siguientePaso(f, hoy);
  const vencido = cierreVencidoHace(f, hoy);
  // Con propuesta de la app, la frase rica (abierta N veces…); sin ella, la de la fase.
  const frase = (f.entrega ? lineaDeEstado(f, hoy) : "") || paso.texto;
  const quedan = est === "aceptada" ? diasHasta(f.deposito.venceEl, hoy) : null;
  const urgente = f.entrega?.estado === "FAILED" || (quedan !== null && quedan <= 7);
  const sinImporte = f.importe === null || f.importe === undefined;
  return (
    <button
      type="button"
      className={`opx-fila opx-c-${est}${seleccionada ? " is" : ""}${urgente ? " opx-fila--ya" : ""}`}
      onClick={onSeleccionar}
      data-clave={f.clave}
      aria-pressed={seleccionada}
    >
      <span className="opx-fila__1">
        <span className="opx-fila__nom">
          <Semaforo f={f} hoy={hoy} />
          {f.nombre}
        </span>
        <span className={`opx-fila__imp${sinImporte ? " is-vacio" : ""}`}>{sinImporte ? "sin importe" : euros(f.importe)}</span>
      </span>
      <span className="opx-fila__2">
        <span className="opx-pastilla">{textoDeFase(f)}</span>
        <ChipDeDepartamento f={f} />
        {f.origen === "APP" ? (
          <span className="opx-app" title="Propuesta hecha en la app">
            App
          </span>
        ) : null}
        {repetidos.has(claveDeNombre(f.nombre)) ? (
          <span className="opx-dup" title="Hay otra oportunidad con el mismo nombre">
            ¿Duplicada?
          </span>
        ) : null}
        <span className="opx-fila__llega">{rangoLlegada(f)}</span>
      </span>
      <span className="opx-fila__3">{[f.cuenta, f.contacto].filter(Boolean).join(" · ") || "—"}</span>
      <span className={`opx-fila__4 opx-t-${paso.tono}`}>
        {frase}
        {vencido !== null ? <em className="opx-vencido"> · cierre vencido hace {vencido} d</em> : null}
      </span>
      {f.opcionContradictoria ? <span className="opx-t-aviso">⚠ La opción aceptada no coincide entre la app y Zoho</span> : null}
    </button>
  );
}

export function ListaDeOportunidades({
  filas,
  seleccion,
  onSeleccionar,
  agrupar,
  hoy,
  repetidos,
  vacio,
}: {
  filas: OportunidadFila[];
  seleccion: string | null;
  onSeleccionar: (clave: string) => void;
  agrupar: boolean;
  hoy: Date;
  repetidos: Set<string>;
  vacio: string;
}) {
  if (filas.length === 0) return <p className="opx-vacia">{vacio}</p>;
  const fila = (f: OportunidadFila) => (
    <FilaDeOportunidad key={f.clave} f={f} seleccionada={seleccion === f.clave} onSeleccionar={() => onSeleccionar(f.clave)} hoy={hoy} repetidos={repetidos} />
  );
  if (!agrupar) return <>{filas.map(fila)}</>;
  return (
    <>
      {porCuenta(filas).map((g) => (
        <div key={g.cuenta} className="opx-grupo">
          <p className="opx-grupo__t">
            <b>{g.cuenta}</b>
            <span>
              {g.filas.length} · {eurosCorto(g.importe)}
            </span>
          </p>
          {g.filas.map(fila)}
        </div>
      ))}
    </>
  );
}
