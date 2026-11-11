import { fechaLegible, type CamposDelTrato, type EventoDelTrato, type HitoDelCrm, type ItemDeInventario, type PresupuestoDelCrm, type ResumenDelAceptado } from "../../domain/fichaDelCrm";
import { fechaCorta, fechaLarga } from "../../domain/oportunidadesVista";

/**
 * Lo que el CRM sabe de una oportunidad, para leerlo: el presupuesto aceptado, los
 * presupuestos que se enviaron con sus líneas, los campos del trato y las fechas.
 *
 * Todo presentacional: recibe datos ya ordenados (`src/domain/fichaDelCrm.ts`) y los
 * pinta. Los costes y márgenes solo se enseñan si llegan (el servidor solo los
 * manda a los administradores).
 */

// «always»: con 4 cifras es-ES no pone el punto de miles por defecto.
const DOS_DECIMALES = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: "always",
} as unknown as Intl.NumberFormatOptions);
const UN_DECIMAL = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function eur(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : `${DOS_DECIMALES.format(n)} €`;
}

function Cifra({ rotulo, valor, apoyo }: { rotulo: string; valor: string; apoyo?: string }) {
  return (
    <div className="opx-cifra">
      <small>{rotulo}</small>
      <strong>{valor}</strong>
      {apoyo ? <span>{apoyo}</span> : null}
    </div>
  );
}

/**
 * El cobro del trato aceptado. Con el presupuesto cargado en el CRM, es «Presupuesto
 * aceptado nº N»; sin él, es solo «Cobro acordado» con los importes que el CRM sí tiene:
 * no se afirma un presupuesto que no existe ni se enseñan totales a 0.
 */
export function TarjetaDelAceptado({ aceptado }: { aceptado: ResumenDelAceptado }) {
  const hayEconomia = aceptado.coste !== null || aceptado.margen !== null;
  return (
    <section className={`opx-aceptado${aceptado.hayDetalle ? "" : " is-sin-detalle"}`} aria-label={aceptado.hayDetalle ? "Presupuesto aceptado" : "Cobro acordado"}>
      <h4>
        {aceptado.hayDetalle ? (
          <>
            Presupuesto aceptado{aceptado.numero ? ` · nº ${aceptado.numero}` : ""} <span className="opx-marca-ok">✓ elegido por el cliente</span>
          </>
        ) : (
          <>
            Cobro acordado <span className="opx-muted">· importes que el CRM tiene; el presupuesto línea a línea no está cargado</span>
          </>
        )}
      </h4>
      <div className="opx-cifras">
        {aceptado.total !== null ? <Cifra rotulo="Total" valor={eur(aceptado.total)} /> : null}
        {aceptado.pvpPorViajero !== null ? <Cifra rotulo="Por viajero" valor={eur(aceptado.pvpPorViajero)} /> : null}
        {aceptado.deposito !== null ? <Cifra rotulo="Depósito" valor={eur(aceptado.deposito)} apoyo={aceptado.formaDeCobro || undefined} /> : null}
        {aceptado.pendiente !== null ? <Cifra rotulo="Pendiente" valor={eur(aceptado.pendiente)} /> : null}
        {hayEconomia && aceptado.coste !== null ? <Cifra rotulo="Coste" valor={eur(aceptado.coste)} apoyo="solo administradores" /> : null}
        {hayEconomia && aceptado.margen !== null ? <Cifra rotulo="Margen" valor={`${UN_DECIMAL.format(aceptado.margen)} %`} apoyo="solo administradores" /> : null}
      </div>
      <p className="opx-aceptado__pie">
        {[
          aceptado.tipoDePago ? `Tipo de pago: ${aceptado.tipoDePago}` : "",
          aceptado.depositoCobrado ? `Depósito cobrado: ${aceptado.depositoCobrado}` : "",
          `Cobrado al 100 %: ${aceptado.cobradoAl100 ? "sí" : "no"}`,
          aceptado.fechaDeReserva ? `Reserva: ${fechaLarga(aceptado.fechaDeReserva)}` : "",
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {aceptado.enlace ? (
        <a className="opx-btn" href={aceptado.enlace} target="_blank" rel="noreferrer">
          Ver el presupuesto {aceptado.idPresupuesto ? `${aceptado.idPresupuesto} ` : ""}en Zoho Books ↗
        </a>
      ) : null}
    </section>
  );
}

/** Los presupuestos que se enviaron (las opciones), cada uno con sus líneas, y cuál se aceptó. */
export function PresupuestosDelCrm({ presupuestos, hayAceptado }: { presupuestos: PresupuestoDelCrm[]; hayAceptado: boolean }) {
  if (presupuestos.length === 0) {
    return (
      <p className="opx-muted">
        Este trato no tiene presupuesto cargado en el CRM: el subformulario «Servicios Contratados» está vacío. Las opciones, si las hay, suelen estar escritas en el
        texto de abajo.
      </p>
    );
  }
  return (
    <div className="opx-presus">
      {presupuestos.length > 1 ? (
        <p className="opx-nota">
          Se enviaron {presupuestos.length} presupuestos (opciones).
          {hayAceptado ? " El que eligió el cliente va marcado." : " El cliente todavía no ha elegido ninguno en el CRM."}
        </p>
      ) : null}
      {presupuestos.map((p) => (
        <article key={p.numero} className={`opx-presu${p.aceptado ? " is-aceptado" : ""}`}>
          <header>
            <h4>
              Presupuesto {p.numero}
              {p.aceptado ? <span className="opx-marca-ok">✓ aceptado</span> : null}
            </h4>
            <span className="opx-presu__total">
              {eur(p.total)}
              {p.coste !== null && p.margen !== null ? (
                <small>
                  {" "}
                  · coste {eur(p.coste)} · margen {UN_DECIMAL.format(p.margen)} %
                </small>
              ) : null}
            </span>
          </header>
          <div className="opx-lineas-wrap">
            <table className="opx-lineas">
              <thead>
                <tr>
                  <th>Servicio</th>
                  <th>Proveedor</th>
                  <th>Fechas</th>
                  <th className="is-num">Viajeros</th>
                  <th className="is-num">Precio</th>
                  <th className="is-num">Total</th>
                </tr>
              </thead>
              <tbody>
                {p.lineas.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <b>{l.servicio || l.tipo || "—"}</b>
                      <small>{[l.tipo && l.servicio ? l.tipo : "", l.regimen, l.comentarios].filter(Boolean).join(" · ")}</small>
                    </td>
                    <td>{l.proveedor || "—"}</td>
                    <td>
                      {l.entrada ? fechaCorta(l.entrada) : "—"}
                      {l.salida && l.salida !== l.entrada ? ` → ${fechaCorta(l.salida)}` : ""}
                    </td>
                    <td className="is-num">{l.viajeros ?? "—"}</td>
                    <td className="is-num">
                      {eur(l.precio)}
                      {l.unidad ? <small>{l.unidad}</small> : null}
                    </td>
                    <td className="is-num">{eur(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
    </div>
  );
}

const MARCA: Record<ItemDeInventario["estado"], string> = { si: "✓", no: "✗", aviso: "!", na: "–" };

/** Qué tiene esta oportunidad en el CRM y qué le falta, de un vistazo. */
export function InventarioDelCrm({ items }: { items: ItemDeInventario[] }) {
  return (
    <section className="opx-inv" aria-label="Qué tiene esta oportunidad en el CRM">
      <h4>Qué tiene esta oportunidad en el CRM</h4>
      <ul>
        {items.map((it) => (
          <li key={it.texto} className={`is-${it.estado}`}>
            <span className="opx-inv__marca" aria-hidden="true">
              {MARCA[it.estado]}
            </span>
            <span className="opx-inv__txt">
              <b>{it.texto}</b>
              <small>
                {it.detalle}
                {it.enlace ? (
                  <>
                    {" · "}
                    <a href={it.enlace} target="_blank" rel="noreferrer">
                      abrir ↗
                    </a>
                  </>
                ) : null}
              </small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Todos los campos del trato que tienen valor, con los nombres de Zoho, y la lista de los vacíos. */
export function TodosLosCampos({ campos }: { campos: CamposDelTrato }) {
  return (
    <section className="opx-campos-wrap" aria-label="Todo lo que hay en el CRM">
      <h4>
        Todo lo que hay en el CRM <span className="opx-muted">({campos.rellenos} campos con valor)</span>
      </h4>
      {campos.grupos.map((g) => (
        <div key={g.titulo} className="opx-campos-grupo">
          <h5>{g.titulo}</h5>
          <dl className="opx-campos">
            {g.campos.map((c) => (
              <div key={c.etiqueta}>
                <dt>{c.etiqueta}</dt>
                <dd>{c.valor}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      {campos.vacios.length > 0 ? (
        <p className="opx-vacios">
          <b>Sin rellenar ({campos.vacios.length}):</b> {campos.vacios.join(" · ")}
        </p>
      ) : null}
    </section>
  );
}

/**
 * Los archivos subidos al trato en Zoho (el presupuesto o la hoja que se mandó por fuera de la app).
 * Se abren desde aquí: así se puede ver qué se envió sin entrar a Zoho.
 */
export function ArchivosDelTrato({
  eventos,
  estado,
  onAbrir,
}: {
  eventos: EventoDelTrato[];
  /** Si la lista no se pudo leer: se dice, no se enseña «ningún archivo». */
  estado: "cargando" | "ok" | "sin_leer";
  onAbrir: (adjuntoId: string, nombre: string) => void;
}) {
  const archivos = eventos.filter((e) => e.tipo === "adjunto" && e.adjuntoId);
  return (
    <section className="opx-archivos" aria-label="Archivos del trato en el CRM">
      <h4>Archivos subidos al trato en el CRM</h4>
      {estado === "cargando" ? <p className="opx-muted">Leyendo el CRM…</p> : null}
      {estado === "sin_leer" ? <p className="opx-muted">No se pudieron leer los archivos del trato (mira el aviso de arriba).</p> : null}
      {estado === "ok" && archivos.length === 0 ? <p className="opx-muted">Nadie ha subido ningún archivo a este trato en Zoho.</p> : null}
      {archivos.length > 0 ? (
        <ul>
          {archivos.map((a) => (
            <li key={a.adjuntoId}>
              <span className="opx-archivos__nom">
                <b>{a.titulo}</b>
                <small>{[a.detalle, a.quien ? `subido por ${a.quien}` : "", fechaLegible(a.cuando)].filter(Boolean).join(" · ")}</small>
              </span>
              <button type="button" className="opx-btn" onClick={() => onAbrir(a.adjuntoId as string, a.titulo)}>
                Abrir
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const ETIQUETA_DE_TIPO: Record<EventoDelTrato["tipo"], string> = { fase: "Fase", nota: "Nota", adjunto: "Archivo", correo: "Correo" };

/** Todo lo que ha pasado en el trato según Zoho, del más reciente al más antiguo. */
export function LineaDeTiempoDelTrato({ eventos }: { eventos: EventoDelTrato[] }) {
  if (eventos.length === 0) return <p className="opx-muted">Zoho no tiene registros de este trato.</p>;
  return (
    <ol className="opx-tiempo">
      {eventos.map((e, i) => (
        <li key={i} className={`is-${e.tipo}`}>
          <span className="opx-tiempo__tipo">{ETIQUETA_DE_TIPO[e.tipo]}</span>
          <div>
            <b>{e.titulo}</b>
            {e.detalle ? <p>{e.detalle}</p> : null}
            <small>{[fechaLegible(e.cuando), e.quien].filter(Boolean).join(" · ")}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Las fechas que el propio trato guarda (si Zoho no deja leer su historial, es lo que hay). */
export function HitosDelCrm({ hitos }: { hitos: HitoDelCrm[] }) {
  if (hitos.length === 0) return <p className="opx-muted">El CRM no guarda fechas de este trato.</p>;
  return (
    <ul className="opx-hist">
      {hitos.map((h, i) => (
        <li key={i}>
          <b>{h.texto}</b>
          <span>{fechaLarga(h.cuando)}</span>
        </li>
      ))}
    </ul>
  );
}
