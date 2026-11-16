import type { OportunidadFila } from "../../domain/oportunidadUnificada";
import {
  cierreVencidoHace,
  estadoDe,
  euros,
  fasesPresentes,
  fechaCorta,
  rangoLlegada,
  siguientePaso,
  type OrdenDeOportunidades,
} from "../../domain/oportunidadesVista";
import type { CSSProperties } from "react";
import { enElOrdenDelCrm, estiloDeFase, type ColoresDeFase } from "../../domain/colorDeFase";
import { ChipDeDepartamento, textoDeFase } from "./ListaDeOportunidades";

/**
 * Las dos vistas de Oportunidades, hechas a imagen de las del CRM (Anthony,
 * 16/11/2026): la LISTA (una fila por oportunidad, con las columnas del CRM y
 * dos nuestras: origen y «lo siguiente») y el KANBAN (una columna por fase).
 * En las dos, pulsar una oportunidad abre su ficha a pantalla completa.
 */

/** La lista: las columnas del CRM, que se ordenan al pulsar la cabecera. */
export function TablaDeOportunidades({
  filas,
  seleccion,
  onSeleccionar,
  orden,
  onOrdenar,
  hoy,
  colores,
  vacio,
}: {
  filas: OportunidadFila[];
  seleccion: string | null;
  onSeleccionar: (clave: string) => void;
  orden: OrdenDeOportunidades;
  onOrdenar: (orden: OrdenDeOportunidades) => void;
  hoy: Date;
  colores: ColoresDeFase;
  vacio?: string;
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
            {cabecera("llegada", "Llegada")}
            {cabecera("importe", "Importe", true)}
            {cabecera("fase", "Fase")}
            {cabecera("cierre", "Fecha de cierre")}
            {cabecera("cuenta", "Cuenta")}
            <th className="is-sin-orden">Contacto</th>
            <th className="is-sin-orden">Propietario</th>
            <th className="is-sin-orden">Dept.</th>
            <th className="is-sin-orden">Lo siguiente</th>
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 ? (
            <tr className="opx-tabla__vacia">
              <td colSpan={10}>{vacio ?? "Ninguna oportunidad coincide con los filtros."}</td>
            </tr>
          ) : null}
          {filas.map((f) => {
            const paso = siguientePaso(f, hoy);
            const vencido = cierreVencidoHace(f, hoy);
            return (
              <tr
                key={f.clave}
                className={`opx-c-${estadoDe(f)}${seleccion === f.clave ? " is" : ""}`}
                style={estiloDeFase(f.fase, colores) as CSSProperties | undefined}
                onClick={() => onSeleccionar(f.clave)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSeleccionar(f.clave);
                }}
                tabIndex={0}
              >
                <td className="opx-t-nom">
                  <b>{f.nombre}</b>
                  {f.origen === "APP" ? <span className="opx-app" title="Tiene propuesta hecha en la app">App</span> : null}
                </td>
                <td className="opx-t-fecha">{rangoLlegada(f) || "—"}</td>
                <td className="opx-t-imp">{f.importe === null ? <span className="opx-muted">—</span> : euros(f.importe)}</td>
                <td>
                  <span className="opx-pastilla">{textoDeFase(f)}</span>
                </td>
                <td className="opx-t-fecha">
                  {f.cierre ? `${fechaCorta(f.cierre)} ${f.cierre.slice(0, 4)}` : "—"}
                  {vencido !== null ? <em className="opx-vencido"> vencido {vencido} d</em> : null}
                </td>
                <td className="opx-t-corta" title={f.cuenta || undefined}>
                  {f.cuenta || "—"}
                </td>
                <td className="opx-t-corta" title={f.contacto || undefined}>
                  {f.contacto || "—"}
                </td>
                <td className="opx-t-corta" title={f.propietario || undefined}>
                  {f.propietario || "—"}
                </td>
                <td>
                  <ChipDeDepartamento f={f} />
                </td>
                <td className={`opx-t-corta opx-t-${paso.tono}`} title={paso.texto}>
                  {paso.texto}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Nombre de la columna de lo que todavía no existe en el CRM (se crea al enviar la propuesta). */
export const COLUMNA_SIN_ENVIAR = "Sin enviar";

/**
 * Texto claro u oscuro sobre el color de la fase, para que la cabecera se lea:
 * el CRM tiene fases amarillas y verde claro (texto oscuro) y azules o naranjas
 * (texto blanco). `c` es la terna «r, g, b».
 */
export function tintaSobre(c: string | undefined): string | undefined {
  if (!c) return undefined;
  const [r, g, b] = c.split(",").map((x) => Number(x.trim()));
  if (![r, g, b].every((x) => Number.isFinite(x))) return undefined;
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.62 ? "#1a2233" : "#ffffff";
}

/** El kanban: una columna por fase del CRM, con su color, cuántas hay y cuánto suman. */
export function TableroDeOportunidades({
  filas,
  seleccion,
  onSeleccionar,
  hoy,
  colores,
  ordenDelCrm = [],
}: {
  filas: OportunidadFila[];
  seleccion: string | null;
  onSeleccionar: (clave: string) => void;
  hoy: Date;
  colores: ColoresDeFase;
  /** Las fases en el orden en que las tiene el CRM: las columnas salen igual que allí. */
  ordenDelCrm?: string[];
}) {
  const sinCrm = filas.filter((f) => !f.fase);
  const enOrden = enElOrdenDelCrm(fasesPresentes(filas), ordenDelCrm);
  const columnas = [
    ...(sinCrm.length ? [{ nombre: COLUMNA_SIN_ENVIAR, filas: sinCrm, propia: true }] : []),
    ...enOrden.map((nombre) => ({ nombre, filas: filas.filter((f) => f.fase === nombre), propia: false })),
  ];
  if (columnas.length === 0) return <p className="opx-vacia">Ninguna oportunidad coincide con los filtros.</p>;
  return (
    <div className="opx-tablero">
      {columnas.map((c) => {
        const est = c.propia ? "sin_enviar" : c.filas.length ? estadoDe(c.filas[0]) : "todas";
        const importe = c.filas.reduce((t, f) => t + (f.importe ?? 0), 0);
        const tonos = c.propia ? undefined : estiloDeFase(c.nombre, colores);
        const tinta = tintaSobre(tonos?.["--c"]);
        return (
          <section key={c.nombre} className={`opx-col opx-c-${est}`} style={tonos as CSSProperties | undefined} aria-label={c.nombre}>
            <header style={tinta ? { color: tinta } : undefined} title={c.propia ? "Propuestas preparadas en la app que todavía no están en el CRM: la oportunidad se crea al enviarlas." : undefined}>
              <span className="opx-col__t">
                <b>{c.nombre}</b>
                <i>{c.filas.length}</i>
              </span>
              <span className="opx-col__imp">{euros(importe)}</span>
            </header>
            <div className="opx-col__lista">
              {c.filas.map((f) => {
                const vencido = cierreVencidoHace(f, hoy);
                return (
                  <button key={f.clave} type="button" className={`opx-tarjeta${seleccion === f.clave ? " is" : ""}`} onClick={() => onSeleccionar(f.clave)}>
                    <b>{f.nombre}</b>
                    <small>{f.cuenta || "—"}</small>
                    <span className="opx-tarjeta__pie">
                      <span>{rangoLlegada(f) || "sin fecha"}</span>
                      <span>{f.importe === null ? <i className="opx-muted">sin importe</i> : euros(f.importe)}</span>
                    </span>
                    <span className="opx-tarjeta__meta">
                      <ChipDeDepartamento f={f} />
                      {f.origen === "APP" ? <span className="opx-app">App</span> : null}
                      {f.propietario ? <small>{f.propietario}</small> : null}
                    </span>
                    {vencido !== null ? <em className="opx-vencido">cierre vencido hace {vencido} d</em> : null}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
