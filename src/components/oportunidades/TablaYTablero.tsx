import type { OportunidadFila } from "../../domain/oportunidadUnificada";
import {
  cierreVencidoHace,
  estadoDe,
  euros,
  eurosCorto,
  fasesPresentes,
  fechaCorta,
  rangoLlegada,
  siguientePaso,
  type OrdenDeOportunidades,
} from "../../domain/oportunidadesVista";
import { ChipDeDepartamento, textoDeFase } from "./ListaDeOportunidades";

/** La tabla: mucha información por pantalla y columnas que se ordenan al pulsar. */
export function TablaDeOportunidades({
  filas,
  seleccion,
  onSeleccionar,
  orden,
  onOrdenar,
  hoy,
}: {
  filas: OportunidadFila[];
  seleccion: string | null;
  onSeleccionar: (clave: string) => void;
  orden: OrdenDeOportunidades;
  onOrdenar: (orden: OrdenDeOportunidades) => void;
  hoy: Date;
}) {
  const cabecera = (id: OrdenDeOportunidades, nombre: string, numerica = false) => (
    <th className={`${orden === id ? "is" : ""} ${numerica ? "is-num" : ""}`} aria-sort={orden === id ? "descending" : "none"}>
      <button type="button" onClick={() => onOrdenar(id)}>
        {nombre}
        {orden === id ? " ↓" : ""}
      </button>
    </th>
  );
  return (
    <div className="opx-tabla-wrap">
      <table className="opx-tabla">
        <thead>
          <tr>
            {cabecera("nombre", "Oportunidad")}
            {cabecera("fase", "Fase")}
            <th className="is-sin-orden">Dept.</th>
            {cabecera("llegada", "Llegada")}
            {cabecera("cierre", "Cierre")}
            {cabecera("importe", "Importe", true)}
            <th className="is-sin-orden">Lo siguiente</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const paso = siguientePaso(f, hoy);
            const vencido = cierreVencidoHace(f, hoy);
            return (
              <tr
                key={f.clave}
                className={`opx-c-${estadoDe(f)}${seleccion === f.clave ? " is" : ""}`}
                onClick={() => onSeleccionar(f.clave)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSeleccionar(f.clave);
                }}
                tabIndex={0}
              >
                <td className="opx-t-nom">
                  <b>{f.nombre}</b>
                  <small>{f.cuenta || "—"}</small>
                </td>
                <td>
                  <span className="opx-pastilla">{textoDeFase(f)}</span>
                </td>
                <td>
                  <ChipDeDepartamento f={f} />
                  {f.origen === "APP" ? <span className="opx-app">App</span> : null}
                </td>
                <td>{rangoLlegada(f) || "—"}</td>
                <td>
                  {f.cierre ? `${fechaCorta(f.cierre)} ${f.cierre.slice(0, 4)}` : "—"}
                  {vencido !== null ? <em className="opx-vencido"> vencido {vencido} d</em> : null}
                </td>
                <td className="opx-t-imp">{f.importe === null ? <span className="opx-muted">sin importe</span> : euros(f.importe)}</td>
                <td className={`opx-t-${paso.tono}`}>{paso.texto}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const MAXIMO_POR_COLUMNA = 30;

/** El tablero: una columna por fase, para ver dónde se acumula el trabajo. */
export function TableroDeOportunidades({
  filas,
  seleccion,
  onSeleccionar,
  hoy,
}: {
  filas: OportunidadFila[];
  seleccion: string | null;
  onSeleccionar: (clave: string) => void;
  hoy: Date;
}) {
  const sinCrm = filas.filter((f) => !f.fase);
  const columnas = [
    ...(sinCrm.length ? [{ nombre: "Aún sin oportunidad en el CRM", filas: sinCrm }] : []),
    ...fasesPresentes(filas).map((nombre) => ({ nombre, filas: filas.filter((f) => f.fase === nombre) })),
  ];
  return (
    <div className="opx-tablero">
      {columnas.map((c) => {
        const est = c.filas.length ? estadoDe(c.filas[0]) : "todas";
        const importe = c.filas.reduce((t, f) => t + (f.importe ?? 0), 0);
        return (
          <section key={c.nombre} className={`opx-col opx-c-${est}`}>
            <header>
              <b>{c.nombre}</b>
              <span>
                {c.filas.length} · {eurosCorto(importe)}
              </span>
            </header>
            {c.filas.slice(0, MAXIMO_POR_COLUMNA).map((f) => {
              const vencido = cierreVencidoHace(f, hoy);
              return (
                <button key={f.clave} type="button" className={`opx-tarjeta${seleccion === f.clave ? " is" : ""}`} onClick={() => onSeleccionar(f.clave)}>
                  <b>{f.nombre}</b>
                  <small>{f.cuenta || "—"}</small>
                  <span className="opx-tarjeta__pie">
                    <span>{f.importe === null ? <i className="opx-muted">sin importe</i> : euros(f.importe)}</span>
                    <span>{rangoLlegada(f)}</span>
                  </span>
                  {vencido !== null ? <em className="opx-vencido">cierre vencido hace {vencido} d</em> : null}
                </button>
              );
            })}
            {c.filas.length > MAXIMO_POR_COLUMNA ? (
              <p className="opx-col__mas">+ {c.filas.length - MAXIMO_POR_COLUMNA} más (se afinan con el buscador y los filtros)</p>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
