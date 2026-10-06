import { useEffect, useState } from "react";

import { getConsumoIaApi, type ConsumoIa, type TotalDeConsumoIa } from "../../services/apiClient";

/**
 * Cuánto cuesta leer documentos, visto desde la app.
 *
 * Existe porque el 25/09/2026 la cuenta de Anthropic se quedó sin saldo y nadie
 * lo supo hasta el 06/10: la aplicación no enseñaba el consumo en ningún sitio
 * y el fallo salía como «pendiente de revisar». Esto responde a tres preguntas:
 * cuánto se ha gastado, en qué, y qué se pagó sin obtener nada.
 *
 * Dos límites, dichos en pantalla y no en letra pequeña: el coste es una
 * ESTIMACIÓN con la tabla de precios del proveedor —lo facturado de verdad
 * está en su consola—, y el saldo restante no se puede consultar por API.
 */

const numero = new Intl.NumberFormat("es-ES");
const dolares = new Intl.NumberFormat("es-ES", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function tokens(n: number): string {
  return numero.format(n);
}

function Totales({ titulo, t, tono }: { titulo: string; t: TotalDeConsumoIa; tono?: "ok" | "mal" }) {
  return (
    <div className={`consumo__bloque${tono ? ` consumo__bloque--${tono}` : ""}`}>
      <span className="consumo__titulo">{titulo}</span>
      <strong className="consumo__cifra">{dolares.format(t.dolaresEstimados)}</strong>
      <span className="consumo__detalle">
        {t.lecturas} lectura{t.lecturas === 1 ? "" : "s"} · entrada {tokens(t.inputTokens)} · salida {tokens(t.outputTokens)}
        {t.cacheReadTokens > 0 ? ` · caché ${tokens(t.cacheReadTokens)}` : ""}
      </span>
    </div>
  );
}

export function ConsumoIaView() {
  const [datos, setDatos] = useState<ConsumoIa | null>(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    getConsumoIaApi()
      .then((d) => {
        if (vivo) setDatos(d);
      })
      .catch((e: unknown) => {
        if (vivo) setError(e instanceof Error ? e.message : "No se pudo obtener el consumo de IA.");
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (cargando) return <p>Cargando el consumo…</p>;

  if (error || !datos) {
    return (
      <div className="alert alert--error" role="alert">
        {error || "No se pudo obtener el consumo de IA."}
        {/\b403\b|permiso|administrador/i.test(error) ? " Esta pestaña es solo para administradores." : ""}
      </div>
    );
  }

  const mesActual = new Date().toISOString().slice(0, 7);
  const esteMes = datos.porMes.find((m) => m.mes === mesActual);

  return (
    <>
      <div className="section-card__header compact">
        <div>
          <h4>Consumo de IA</h4>
          <p>
            Lo que cuesta leer los documentos de tarifas. Coste estimado con los precios del
            proveedor a {datos.precios.fecha}; lo facturado de verdad está en la consola de
            Anthropic. <strong>El saldo que queda no se puede consultar desde aquí</strong>: se
            ve solo en esa consola, y conviene activar allí la recarga automática o un aviso de
            saldo bajo.
          </p>
        </div>
      </div>

      <div className="consumo__bloques">
        <Totales titulo="Este mes" t={esteMes ?? { lecturas: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, dolaresEstimados: 0 }} />
        <Totales titulo="Total registrado" t={datos.total} />
        <Totales titulo="Lecturas completadas" t={datos.completadas} tono="ok" />
        <Totales titulo="Pagado sin resultado (fallidas)" t={datos.fallidas} tono={datos.fallidas.lecturas > 0 ? "mal" : undefined} />
      </div>

      {datos.total.lecturas === 0 ? (
        <p className="issue-note">
          Todavía no hay ninguna lectura registrada. El registro empezó con esta versión: las
          lecturas anteriores solo tienen el resumen que se guardó en cada documento.
        </p>
      ) : null}

      {datos.porMes.length > 0 ? (
        <>
          <div className="section-card__header compact">
            <div>
              <h4>Por mes</h4>
            </div>
          </div>
          <div className="table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th>Lecturas</th>
                  <th>Entrada</th>
                  <th>Salida</th>
                  <th>Caché</th>
                  <th>Coste estimado</th>
                </tr>
              </thead>
              <tbody>
                {datos.porMes.map((m) => (
                  <tr key={m.mes}>
                    <td>{m.mes}</td>
                    <td>{m.lecturas}</td>
                    <td>{tokens(m.inputTokens)}</td>
                    <td>{tokens(m.outputTokens)}</td>
                    <td>{tokens(m.cacheReadTokens)}</td>
                    <td>{dolares.format(m.dolaresEstimados)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {datos.porDocumento.length > 0 ? (
        <>
          <div className="section-card__header compact">
            <div>
              <h4>Por documento</h4>
              <p>De más caro a más barato.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Lecturas</th>
                  <th>Entrada</th>
                  <th>Salida</th>
                  <th>Coste estimado</th>
                </tr>
              </thead>
              <tbody>
                {datos.porDocumento.map((d) => (
                  <tr key={d.sourceDocumentId}>
                    <td>{d.documento}</td>
                    <td>{d.lecturas}</td>
                    <td>{tokens(d.inputTokens)}</td>
                    <td>{tokens(d.outputTokens)}</td>
                    <td>{dolares.format(d.dolaresEstimados)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {datos.ultimas.length > 0 ? (
        <>
          <div className="section-card__header compact">
            <div>
              <h4>Últimas lecturas</h4>
              <p>Una fila por intento, también los que fallaron: esos también se pagaron.</p>
            </div>
          </div>
          <ul className="detail-list consumo__lista">
            {datos.ultimas.map((l) => (
              <li key={l.id} className={l.resultado === "OK" ? "" : "consumo__fallida"}>
                <span className={`issue-badge issue-badge--${l.resultado === "OK" ? "historical" : "error"}`}>
                  {l.resultado === "OK" ? "Completada" : "Fallida"}
                </span>{" "}
                <strong>{l.documento}</strong> · {new Date(l.terminadaEn).toLocaleString("es-ES")} · {l.modelo}
                {l.variante ? ` · ${l.variante}` : ""} · {l.llamadas} llamada{l.llamadas === 1 ? "" : "s"} ·
                entrada {tokens(l.inputTokens)} · salida {tokens(l.outputTokens)}
                {l.pensamientoEstimado > 0 ? ` (≈${tokens(l.pensamientoEstimado)} de pensamiento)` : ""} ·{" "}
                {dolares.format(l.dolaresEstimados)}
                {l.error ? <em className="consumo__error"> — {l.error}</em> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
