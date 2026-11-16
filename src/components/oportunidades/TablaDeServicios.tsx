import type { PresupuestoDelCrm } from "../../domain/fichaDelCrm";
import { fechaLarga } from "../../domain/oportunidadesVista";
import { eur } from "./InfoDelCrm";

/**
 * El subformulario «Servicios Contratados» tal como está en la ficha del trato en
 * Zoho: mismas columnas, una fila por servicio. Si está vacío, se dice que está
 * vacío y nada más (Anthony, 16/11/2026). Lo usan las dos fichas: la de las
 * oportunidades de Zoho y la de las propuestas hechas en la app.
 */
export function TablaDeServicios({ presupuestos, verCoste }: { presupuestos: PresupuestoDelCrm[]; verCoste: boolean }) {
  const hayLineas = presupuestos.some((p) => p.lineas.length > 0);
  const columnas = verCoste ? 14 : 13;
  return (
    <div className="opc-serv">
      <h4>Servicios Contratados</h4>
      <div className="opc-serv__wrap">
        <table>
          <thead>
            <tr>
              <th title="Número de presupuesto">Nº</th>
              <th title="Validado">V.</th>
              <th>Servicio</th>
              <th>Proveedor</th>
              <th>Comentarios</th>
              <th>Régimen</th>
              <th>Fecha entrada</th>
              <th>Fecha salida</th>
              <th className="is-num">Pasajeros</th>
              <th className="is-num">Cantidad</th>
              <th>Unidad</th>
              <th className="is-num">Precio</th>
              <th className="is-num">Total</th>
              {verCoste ? <th className="is-num">Coste</th> : null}
            </tr>
          </thead>
          <tbody>
            {!hayLineas ? (
              <tr className="opc-serv__vacia">
                <td colSpan={columnas}>No se encontraron datos.</td>
              </tr>
            ) : null}
            {presupuestos.flatMap((p) =>
              p.lineas.map((l, i) => (
                <tr key={`${p.numero}-${i}`} className={p.aceptado ? "is-aceptado" : ""}>
                  <td>{p.numero}</td>
                  <td>{l.validado ? "✓" : ""}</td>
                  <td>
                    <b>{l.servicio || "—"}</b>
                    {l.tipo ? <small>{l.tipo}</small> : null}
                  </td>
                  <td>{l.proveedor}</td>
                  <td>{l.comentarios}</td>
                  <td>{l.regimen}</td>
                  <td className="opx-t-fecha">{l.entrada ? fechaLarga(l.entrada) : ""}</td>
                  <td className="opx-t-fecha">{l.salida ? fechaLarga(l.salida) : ""}</td>
                  <td className="is-num">{l.viajeros ?? ""}</td>
                  <td className="is-num">{l.cantidad ?? ""}</td>
                  <td>{l.unidad}</td>
                  <td className="is-num">{l.precio != null ? eur(l.precio) : ""}</td>
                  <td className="is-num">{l.total != null ? eur(l.total) : ""}</td>
                  {verCoste ? <td className="is-num">{l.coste != null ? eur(l.coste) : ""}</td> : null}
                </tr>
              )),
            )}
          </tbody>
          {hayLineas ? (
            <tfoot>
              {presupuestos.map((p) => (
                <tr key={p.numero}>
                  <td colSpan={12}>
                    Total del presupuesto {p.numero}
                    {p.aceptado ? " · aceptado" : ""}
                  </td>
                  <td className="is-num">{eur(p.total)}</td>
                  {verCoste ? <td className="is-num">{p.coste != null ? eur(p.coste) : ""}</td> : null}
                </tr>
              ))}
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

/** Los servicios de un proveedor, sacados de la tabla: los del presupuesto aceptado o, si no hay, los de todos. */
export function proveedoresDeLaTabla(presupuestos: PresupuestoDelCrm[]) {
  const hayAceptado = presupuestos.some((p) => p.aceptado);
  const mapa = new Map<string, { lineas: PresupuestoDelCrm["lineas"]; total: number }>();
  for (const p of presupuestos.filter((x) => x.aceptado || !hayAceptado)) {
    for (const l of p.lineas) {
      const nombre = l.proveedor || "Sin proveedor";
      const x = mapa.get(nombre) ?? { lineas: [], total: 0 };
      x.lineas.push(l);
      x.total += l.total ?? 0;
      mapa.set(nombre, x);
    }
  }
  return [...mapa.entries()].map(([nombre, x]) => ({ nombre, ...x }));
}

/**
 * Qué hay contratado con cada proveedor: cada servicio con sus pasajeros, su
 * cantidad, su precio y su total, y el total del proveedor (Anthony, 16/11/2026:
 * «sé que es un alojamiento o una actividad, pero no qué hay contratado con cada
 * uno, ni qué cantidad, ni qué importe»).
 */
export function ProveedoresDeLaTabla({ presupuestos, vacio }: { presupuestos: PresupuestoDelCrm[]; vacio: string }) {
  const proveedores = proveedoresDeLaTabla(presupuestos);
  if (proveedores.length === 0) return <p className="opx-muted">{vacio}</p>;
  return (
    <>
      {proveedores.map((p) => (
        <div key={p.nombre} className="opc-provd">
          <header>
            <b>{p.nombre}</b>
            <b>{eur(p.total)}</b>
          </header>
          <ul>
            {p.lineas.map((l, i) => (
              <li key={i}>
                <span>
                  {l.servicio || l.tipo || "Servicio"}
                  {l.comentarios ? <small>{l.comentarios}</small> : null}
                  <small>
                    {[
                      l.tipo,
                      l.regimen,
                      l.entrada ? `${fechaLarga(l.entrada)}${l.salida ? ` → ${fechaLarga(l.salida)}` : ""}` : "",
                      l.viajeros != null ? `${l.viajeros} pasajeros` : "",
                      l.cantidad != null ? `× ${l.cantidad}` : "",
                      l.precio != null ? `${eur(l.precio)} ${l.unidad || ""}`.trim() : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
                <b>{l.total != null ? eur(l.total) : "—"}</b>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
