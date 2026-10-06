import type { Rejilla } from "../../domain/rejillaDeTarifas";
import { formatAmount } from "./inventoryFormatting";

/**
 * Una rejilla de tarifas pintada como tabla: periodos en las filas, régimen y
 * ocupación en las columnas. Lo que es igual en todas las tarifas va en una
 * línea encima, no repetido en cada celda.
 *
 * Una celda con varios precios se enseña con todos y en otro color: es la
 * señal de que falta la dimensión que los distingue, y esconderla sería peor.
 */
export function TablaDeTarifas({ rejilla }: { rejilla: Rejilla }) {
  const hayGrupos = rejilla.grupos.some((g) => g.nombre);
  const comun = [rejilla.year ? `Temporada ${rejilla.year}` : null, ...rejilla.comun].filter(Boolean);

  return (
    <div className="tarifas">
      {comun.length ? <p className="tarifas__comun">{comun.join(" · ")}</p> : null}
      <div className="table-wrap">
        <table className="doc-table tarifas__tabla">
          <thead>
            {hayGrupos ? (
              <tr>
                <th />
                {rejilla.grupos.map((g) => (
                  <th key={g.nombre || "·"} colSpan={g.columnas.length} className="tarifas__grupo">
                    {g.nombre}
                  </th>
                ))}
              </tr>
            ) : null}
            <tr>
              <th>{rejilla.ejeFilas}</th>
              {rejilla.grupos.flatMap((g) =>
                g.columnas.map((c) => (
                  <th key={`${g.nombre}||${c}`} className="tarifas__columna">
                    {c}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rejilla.filas.map((fila) => (
              <tr key={fila}>
                <th scope="row" className="tarifas__fila">
                  {fila}
                </th>
                {rejilla.grupos.flatMap((g) =>
                  g.columnas.map((c) => {
                    const celda = rejilla.celda(fila, g.nombre, c);
                    if (!celda || celda.importes.length === 0) {
                      return (
                        <td key={`${g.nombre}||${c}`} className="tarifas__vacia">
                          —
                        </td>
                      );
                    }
                    const ambigua = celda.importes.length > 1;
                    return (
                      <td
                        key={`${g.nombre}||${c}`}
                        className={ambigua ? "tarifas__precio tarifas__precio--ambiguo" : "tarifas__precio"}
                        title={ambigua ? `${celda.importes.length} precios en la misma celda: falta lo que los distingue` : undefined}
                      >
                        {celda.importes.map((i) => formatAmount(i, celda.currency)).join(" / ")}
                      </td>
                    );
                  }),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rejilla.celdasAmbiguas > 0 ? (
        <p className="issue-note">
          {rejilla.celdasAmbiguas === 1
            ? "Hay una celda con más de un precio"
            : `Hay ${rejilla.celdasAmbiguas} celdas con más de un precio`}
          : falta el dato que los distingue (la ocupación, el servicio incluido o el canal). Se enseñan
          todos, de menor a mayor.
        </p>
      ) : null}
    </div>
  );
}
