import type { GrupoDeColumnas, Rejilla } from "../../domain/rejillaDeTarifas";
import { debePartirPorRegimen, partesDePeriodo, tonoDeRegimen } from "../../domain/presentacionDeTarifas";
import { formatAmount } from "./inventoryFormatting";

/**
 * Una rejilla de tarifas pintada como tabla: periodos en las filas, régimen y
 * ocupación en las columnas. Lo que es igual en todas las tarifas va en una
 * línea encima, no repetido en cada celda.
 *
 * Una celda con varios precios se enseña con todos y en otro color: es la
 * señal de que falta la dimensión que los distingue, y esconderla sería peor.
 *
 * Para el ojo (11/11/2026): cada régimen lleva su tono suave de fondo (media
 * pensión azul, pensión completa verde, desayuno ámbar, solo alojamiento gris),
 * cada temporada su etiqueta de color, y una tabla con muchos regímenes y
 * columnas se reparte en una tabla por régimen en vez de obligar a desplazarla.
 */
export function TablaDeTarifas({ rejilla, seleccionadaId }: { rejilla: Rejilla; seleccionadaId?: string | null }) {
  const comun = [rejilla.year ? `Temporada ${rejilla.year}` : null, ...rejilla.comun].filter(
    (parte): parte is string => Boolean(parte),
  );
  const partir = debePartirPorRegimen(rejilla);

  return (
    <div className="tarifas">
      {comun.length ? (
        <p className="tarifas__comun">
          {comun.map((parte, i) => {
            const tono = tonoDeRegimen(parte);
            const clase = tono ? `tarifas__ficha reg--${tono}` : parte.startsWith("Precio ") ? "tarifas__unidad" : undefined;
            return (
              <span key={`${i}-${parte}`}>
                {i > 0 ? " · " : ""}
                <span className={clase}>{parte}</span>
              </span>
            );
          })}
        </p>
      ) : null}

      {partir ? (
        rejilla.grupos.map((g) => {
          const filas = rejilla.filas.filter((f) =>
            g.columnas.some((c) => (rejilla.celda(f, g.nombre, c)?.importes.length ?? 0) > 0),
          );
          return (
            <section key={g.nombre} className="tarifas__regimen">
              <h5 className={`tarifas__regimen-t reg--${tonoDeRegimen(g.nombre) || "x"}`}>{g.nombre}</h5>
              <Tabla rejilla={rejilla} grupos={[g]} filas={filas} seleccionadaId={seleccionadaId} cabeceraDeGrupo={false} />
            </section>
          );
        })
      ) : (
        <Tabla rejilla={rejilla} grupos={rejilla.grupos} filas={rejilla.filas} seleccionadaId={seleccionadaId} cabeceraDeGrupo />
      )}

      {rejilla.celdasAmbiguas > 0 ? (
        <p className="issue-note">
          {rejilla.celdasAmbiguas === 1
            ? "Hay una celda con más de un precio"
            : `Hay ${rejilla.celdasAmbiguas} celdas con más de un precio`}
          : falta el dato que los distingue (la ocupación, el servicio incluido, el canal o las noches). Se enseñan
          todos, de menor a mayor.
        </p>
      ) : null}
    </div>
  );
}

function Tabla({
  rejilla,
  grupos,
  filas,
  seleccionadaId,
  cabeceraDeGrupo,
}: {
  rejilla: Rejilla;
  grupos: GrupoDeColumnas[];
  filas: string[];
  seleccionadaId?: string | null;
  /** Una fila de títulos con el régimen encima de sus columnas (no si ya hay un título aparte). */
  cabeceraDeGrupo: boolean;
}) {
  const hayGrupos = grupos.some((g) => g.nombre);
  // Si cada régimen tiene una única columna y se llama «Precio», la segunda fila
  // de la cabecera («PRECIO, PRECIO, PRECIO») no dice nada: el régimen pasa a ser
  // la cabecera de su columna y la tabla se queda con una sola fila de títulos.
  const soloPrecio = grupos.every((g) => g.columnas.length === 1 && g.columnas[0] === "Precio");
  const filaDeGrupos = hayGrupos && cabeceraDeGrupo && !soloPrecio;

  return (
    <div className="table-wrap">
      <table className="doc-table tarifas__tabla">
        <thead>
          {filaDeGrupos ? (
            <tr>
              <th />
              {grupos.map((g) => (
                <th
                  key={g.nombre || "·"}
                  colSpan={g.columnas.length}
                  className={`tarifas__grupo reg--${tonoDeRegimen(g.nombre) || "x"} tarifas__inicio`}
                >
                  {g.nombre}
                </th>
              ))}
            </tr>
          ) : null}
          <tr>
            <th>{rejilla.ejeFilas}</th>
            {grupos.flatMap((g) =>
              g.columnas.map((c, i) => (
                <th
                  key={`${g.nombre}||${c}`}
                  className={`tarifas__columna reg--${tonoDeRegimen(g.nombre) || "x"}${hayGrupos && i === 0 ? " tarifas__inicio" : ""}`}
                >
                  {hayGrupos && soloPrecio && cabeceraDeGrupo ? g.nombre : c}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => {
            const p = partesDePeriodo(fila);
            return (
              <tr key={fila}>
                <th scope="row" className={`tarifas__fila${p.tono ? ` temp--${p.tono}` : ""}`}>
                  <span className="tarifas__principal">
                    {p.temporada ? <span className={`tarifas__temporada temp--${p.tono}`}>{p.temporada}</span> : null}
                    {p.temporada ? " " : ""}
                    {p.principal}
                  </span>
                  {p.detalle ? <span className="tarifas__detalle">{p.detalle}</span> : null}
                </th>
                {grupos.flatMap((g) =>
                  g.columnas.map((c, i) => {
                    const tono = `reg--${tonoDeRegimen(g.nombre) || "x"}`;
                    const inicio = hayGrupos && i === 0 ? " tarifas__inicio" : "";
                    const celda = rejilla.celda(fila, g.nombre, c);
                    if (!celda || celda.importes.length === 0) {
                      return (
                        <td key={`${g.nombre}||${c}`} className={`tarifas__vacia ${tono}${inicio}`}>
                          —
                        </td>
                      );
                    }
                    const ambigua = celda.importes.length > 1;
                    const elegida = Boolean(seleccionadaId && celda.ids.includes(seleccionadaId));
                    const clases = ["tarifas__precio", tono];
                    if (ambigua) clases.push("tarifas__precio--ambiguo");
                    if (elegida) clases.push("tarifas__precio--elegida");
                    return (
                      <td
                        key={`${g.nombre}||${c}`}
                        className={clases.join(" ") + inicio}
                        title={
                          ambigua
                            ? `${celda.importes.length} precios en la misma celda: falta lo que los distingue`
                            : elegida
                              ? "La tarifa elegida"
                              : undefined
                        }
                      >
                        {celda.importes.map((i) => formatAmount(i, celda.currency)).join(" / ")}
                        {elegida ? <span className="tarifas__marca"> ✓</span> : null}
                      </td>
                    );
                  }),
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
