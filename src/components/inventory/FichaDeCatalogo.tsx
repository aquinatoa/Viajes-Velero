import { useMemo, useState } from "react";
import type { ClienteEspecial } from "../../domain/documentImportTypes";
import {
  condicionesDe,
  juntarIguales,
  separarSuplementos,
  type BloqueDeCondicion,
  type FuenteDeCondiciones,
  type SuplementoPublicado,
} from "../../domain/condicionesDeProveedor";
import {
  canalCompleto,
  canalEnPalabras,
  comparativaDeCanales,
  incluyeDe,
  vigenciaDe,
  type CanalDelGrupo,
  type Comparativa,
  type GrupoDeCatalogo,
  type RegistroDeCatalogo,
} from "../../domain/fichaDeCatalogo";
import { rejillaDeActividad, rejillaDeAlojamiento, type Rejilla } from "../../domain/rejillaDeTarifas";
import { formatAmount } from "./inventoryFormatting";
import { TablaDeTarifas } from "./TablaDeTarifas";

/**
 * La ficha de un alojamiento o una actividad del catálogo: para quién es, cuándo
 * vale, cuánto cuesta en cada canal y qué condiciones pone el proveedor.
 *
 * Nace de un malentendido real: el mismo hotel salía como dos alojamientos y
 * nada decía cuál era el de uso general y cuál el del turoperador. Aquí hay un
 * solo alojamiento, una pestaña por canal y una pestaña «Comparar».
 *
 * Orden de lo que se ve (11/11/2026): cabecera corta → aviso de huecos → tabla
 * con la unidad a la vista → suplementos opcionales y tasas/depósitos aparte →
 * condiciones del proveedor (gratuidades, mínimos, pago, cancelación…).
 */

export type { SuplementoPublicado };

/** Lo que la ficha necesita saber de cada registro que reúne. */
export interface MiembroDeFicha extends RegistroDeCatalogo, FuenteDeCondiciones {
  sourceDocumentName?: string | null;
  suplementos?: SuplementoPublicado[];
}

const COMPARAR = "__comparar__";

function nombreDeDocumento(nombre: string | null | undefined): string {
  return nombre ? nombre : "importado (Excel)";
}

/** Una etiqueta por canal para el resumen de la tarjeta: «General · 18». */
export function EtiquetasDeCanal({ canales }: { canales: CanalDelGrupo[] }) {
  return (
    <>
      {canales.map((c) => (
        <span
          key={c.canal.codigo}
          className={`canal-tag ${c.canal.esGeneral ? "canal-tag--general" : "canal-tag--especial"}`}
          title={`${canalCompleto(c.canal)}: ${c.tarifas.length} tarifa(s)`}
        >
          {c.canal.esGeneral ? "General" : c.canal.nombre}
          <b>{c.tarifas.length}</b>
        </span>
      ))}
    </>
  );
}

export function FichaDeCatalogo<T extends MiembroDeFicha>({
  grupo,
  canales,
  clientes,
  tipo,
}: {
  grupo: GrupoDeCatalogo<T>;
  canales: CanalDelGrupo[];
  clientes: ClienteEspecial[];
  tipo: "alojamiento" | "actividad";
}) {
  const [vista, setVista] = useState<string>(canales[0]?.canal.codigo ?? "");
  const nombreCanal = (codigo: string) => canalEnPalabras(codigo, clientes).nombre;
  const miembroPorId = useMemo(() => new Map(grupo.miembros.map((m) => [m.id, m])), [grupo]);

  if (canales.length === 0) return <p className="rate-table__empty">Sin tarifas publicadas.</p>;

  const activa = canales.find((c) => c.canal.codigo === vista) ?? canales[0];
  const comparar = vista === COMPARAR && canales.length > 1;

  const rejillaDe = (c: CanalDelGrupo): Rejilla | null =>
    tipo === "alojamiento"
      ? rejillaDeAlojamiento(c.tarifas, { nombreDelCanal: nombreCanal })
      : rejillaDeActividad(c.tarifas, { nombreDelCanal: nombreCanal });

  const nombreCorto = (c: CanalDelGrupo) => (c.canal.esGeneral ? "General" : c.canal.nombre);
  const unicoCanal = canales.length === 1;

  return (
    <div className="ficha-cat">
      <div className={`ficha__canales${unicoCanal ? " ficha__canales--uno" : ""}`}>
        {canales.map((c) => {
          // Si el servicio es el mismo en todas las tarifas ya sale en la línea
          // de la tabla («… · PRECIO FINAL: alojamiento + régimen · Precio por…»):
          // decirlo también en la cabecera era repetirlo.
          const comunDeLaTabla = rejillaDe(c)?.comun ?? [];
          const incluyeTodo = incluyeDe(c.tarifas);
          const incluye = incluyeTodo.length === 1 && comunDeLaTabla.includes(incluyeTodo[0]) ? [] : incluyeTodo;
          const vigencia = vigenciaDe(c.tarifas);
          const documentos = c.miembroIds.map((id) => nombreDeDocumento(miembroPorId.get(id)?.sourceDocumentName));
          // Con un solo canal el origen ya está en la fila de arriba; solo se repite
          // si el canal sale de varios documentos (ahí sí hay algo que decir).
          const muestraOrigen = !unicoCanal || new Set(documentos).size > 1;
          return (
            <section key={c.canal.codigo} className="ficha__canal">
              <header>
                <span className={`canal-tag ${c.canal.esGeneral ? "canal-tag--general" : "canal-tag--especial"}`}>
                  {nombreCorto(c)}
                </span>
                <span className="ficha__para">
                  {c.canal.esGeneral
                    ? "Uso general: vale para cualquier colegio, club o agencia."
                    : `Solo para ${canalCompleto(c.canal)}.`}
                </span>
              </header>
              <dl>
                {incluye.length > 0 ? (
                  <div className="ficha__par">
                    <dt>Incluye</dt>
                    <dd>{incluye.join(" · ")}</dd>
                  </div>
                ) : null}
                <div className="ficha__par">
                  <dt>Vigencia</dt>
                  <dd>{vigencia.texto}</dd>
                </div>
                {muestraOrigen ? (
                  <div className="ficha__par">
                    <dt>Origen</dt>
                    <dd>{documentos.join(" · ")}</dd>
                  </div>
                ) : null}
              </dl>
              {c.miembroIds.length > 1 ? (
                <p className="issue-note">
                  Este canal está cargado en {c.miembroIds.length} documentos. Si se solapan, las celdas con más de un
                  precio salen en rojo.
                </p>
              ) : null}
            </section>
          );
        })}
      </div>

      {canales.length > 1 ? (
        <div className="ficha__pestanas" role="tablist" aria-label="Ver tarifas de">
          {canales.map((c) => (
            <button
              key={c.canal.codigo}
              type="button"
              role="tab"
              aria-selected={!comparar && activa.canal.codigo === c.canal.codigo}
              className={!comparar && activa.canal.codigo === c.canal.codigo ? "is-active" : ""}
              onClick={() => setVista(c.canal.codigo)}
            >
              {nombreCorto(c)} <small>({c.tarifas.length})</small>
            </button>
          ))}
          <button
            type="button"
            role="tab"
            aria-selected={comparar}
            className={`ficha__comparar ${comparar ? "is-active" : ""}`}
            onClick={() => setVista(COMPARAR)}
          >
            Comparar
          </button>
        </div>
      ) : null}

      {comparar ? (
        <>
          <TablaComparativa comparativa={comparativaDeCanales(canales)} />
          <div className="cond__porcanal">
            {canales.map((c) => (
              <details key={c.canal.codigo} className="cond__desplegable">
                <summary>Condiciones y suplementos · {nombreCorto(c)}</summary>
                <SuplementosDelCanal canal={c} miembroPorId={miembroPorId} />
                <CondicionesDelCanal canal={c} miembroPorId={miembroPorId} />
              </details>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* La tabla a la izquierda y, a su lado, lo que se suma o se paga aparte:
              así no queda media pantalla en blanco a la derecha de la tabla. */}
          <div className="ficha__cuerpo">
            <div className="ficha__tabla">
              <AvisoDeHuecos huecos={vigenciaDe(activa.tarifas).huecos} />
              {(() => {
                const rejilla = rejillaDe(activa);
                return rejilla ? <TablaDeTarifas rejilla={rejilla} /> : <p className="rate-table__empty">Sin tarifas publicadas.</p>;
              })()}
            </div>
            <SuplementosDelCanal canal={activa} miembroPorId={miembroPorId} />
          </div>
          <CondicionesDelCanal canal={activa} miembroPorId={miembroPorId} />
        </>
      )}
    </div>
  );
}

/**
 * Un periodo sin precio en medio del año. Es una inferencia a partir de las
 * propias fechas de las tarifas, no un dato del proveedor: puede ser un cierre
 * real o una temporada que no se cargó. Por eso se pregunta, no se afirma.
 */
function AvisoDeHuecos({ huecos }: { huecos: string[] }) {
  if (huecos.length === 0) return null;
  return (
    <p className="ficha__sinprecio" role="note">
      <strong>Sin tarifa del {huecos.join(" y del ")}.</strong> El documento no trae precio en{" "}
      {huecos.length === 1 ? "ese periodo" : "esos periodos"}: ¿está cerrado o falta esa temporada? Conviene
      preguntárselo al proveedor.
    </p>
  );
}

/** Lo que se puede elegir (sábanas, individual…) aparte de lo que se paga o se deposita (tasa, fianza). */
function SuplementosDelCanal<T extends MiembroDeFicha>({
  canal,
  miembroPorId,
}: {
  canal: CanalDelGrupo;
  miembroPorId: Map<string, T>;
}) {
  const vistos = new Set<string>();
  const suplementos: SuplementoPublicado[] = [];
  for (const id of canal.miembroIds) {
    for (const s of miembroPorId.get(id)?.suplementos ?? []) {
      const clave = `${s.concepto}|${s.importe ?? ""}|${s.condicion ?? ""}`;
      if (!vistos.has(clave)) {
        vistos.add(clave);
        suplementos.push(s);
      }
    }
  }
  const algunMiembroLosTrae = canal.miembroIds.some((id) => miembroPorId.get(id)?.suplementos !== undefined);
  if (!algunMiembroLosTrae) return null;
  if (suplementos.length === 0) return <p className="sup-pub__nada">Sin suplementos publicados.</p>;
  const { extras, tasasYDepositos } = separarSuplementos(juntarIguales(suplementos));
  return (
    <div className="ficha__extras">
      <ListaDeSuplementos titulo="Suplementos opcionales" items={extras} />
      <ListaDeSuplementos titulo="Tasas y depósitos" items={tasasYDepositos} />
    </div>
  );
}

function ListaDeSuplementos({ titulo, items }: { titulo: string; items: SuplementoPublicado[] }) {
  if (items.length === 0) return null;
  return (
    <div className="sup-pub">
      <p className="sup-pub__t">
        {titulo} ({items.length})
      </p>
      <ul>
        {items.map((s, i) => (
          <li key={i}>
            <span>{s.concepto}</span>
            {s.importe ? <b>{s.importe}</b> : null}
            {s.condicion ? <small>{s.condicion}</small> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Lo que el proveedor pone por escrito: gratuidades, mínimos, IVA, pago,
 * cancelación, contacto. Se enseña tal cual viene (a veces en catalán): aquí se
 * reparte por temas, no se traduce ni se reinterpreta.
 */
function CondicionesDelCanal<T extends MiembroDeFicha>({
  canal,
  miembroPorId,
}: {
  canal: CanalDelGrupo;
  miembroPorId: Map<string, T>;
}) {
  const bloques = useMemo(
    () => condicionesDe(canal.miembroIds.map((id) => miembroPorId.get(id)).filter((m): m is T => Boolean(m))),
    [canal, miembroPorId],
  );
  if (bloques.length === 0) {
    return <p className="sup-pub__nada">Este documento no trae condiciones del proveedor.</p>;
  }
  return (
    <section className="cond" aria-label="Condiciones del proveedor">
      <h5 className="cond__t">Condiciones del proveedor</h5>
      <div className="cond__bloques">
        {bloques.map((b) => (
          <BloqueDeCondiciones key={b.clave} bloque={b} />
        ))}
      </div>
    </section>
  );
}

function BloqueDeCondiciones({ bloque }: { bloque: BloqueDeCondicion }) {
  return (
    <div className={`cond__bloque cond__bloque--${bloque.clave}`}>
      <h6>{bloque.titulo}</h6>
      <ul>
        {bloque.lineas.map((l, i) => (
          <li key={i}>
            {l.rotulo ? <b>{l.rotulo}: </b> : null}
            {l.texto}
          </li>
        ))}
      </ul>
    </div>
  );
}

function porcentaje(valor: number): string {
  const texto = Math.abs(valor).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${valor > 0 ? "+" : valor < 0 ? "−" : ""}${texto} %`;
}

/** Los canales lado a lado: una fila por periodo, régimen, ocupación y servicio. */
function TablaComparativa({ comparativa }: { comparativa: Comparativa }) {
  const dosCanales = comparativa.canales.length === 2;
  let periodoAnterior = "";
  return (
    <div className="tarifas">
      <p className="tarifas__comun">
        Mismo alojamiento en {comparativa.canales.map((c) => (c.esGeneral ? "General" : c.nombre)).join(" y ")}. Las filas
        se emparejan por periodo, régimen, ocupación y tipo de campo, aunque cada documento lo escriba de otra manera.
      </p>
      <div className="table-wrap">
        <table className="doc-table tarifas__tabla">
          <thead>
            <tr>
              <th>Periodo</th>
              <th>Qué es</th>
              {comparativa.canales.map((c) => (
                <th key={c.codigo} className="tarifas__columna">
                  {c.esGeneral ? "General" : c.nombre}
                </th>
              ))}
              {dosCanales ? (
                <th className="tarifas__columna" title={`${comparativa.canales[1].nombre} frente a ${comparativa.canales[0].nombre}`}>
                  Diferencia
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {comparativa.filas.map((fila, i) => {
              const mostrarPeriodo = fila.periodo !== periodoAnterior;
              periodoAnterior = fila.periodo;
              return (
                <tr key={i}>
                  <th scope="row" className="tarifas__fila">
                    {mostrarPeriodo ? fila.periodo : ""}
                  </th>
                  <td>{fila.concepto}</td>
                  {comparativa.canales.map((c) => {
                    const importes = fila.precios[c.codigo];
                    if (!importes?.length) {
                      return (
                        <td key={c.codigo} className="tarifas__vacia" title="Este canal no tiene este precio">
                          —
                        </td>
                      );
                    }
                    const ambiguo = importes.length > 1;
                    return (
                      <td
                        key={c.codigo}
                        className={`tarifas__precio${ambiguo ? " tarifas__precio--ambiguo" : ""}`}
                        title={ambiguo ? "Más de un precio en esta fila: falta lo que los distingue" : undefined}
                      >
                        {importes.map((x) => formatAmount(x, comparativa.currency)).join(" / ")}
                      </td>
                    );
                  })}
                  {dosCanales ? (
                    <td
                      className={`tarifas__precio${fila.diferencia === null ? " tarifas__vacia" : ""}`}
                      title={fila.diferencia === null ? "No se puede comparar: falta un precio o hay varios" : undefined}
                    >
                      {fila.diferencia === null ? "—" : porcentaje(fila.diferencia)}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {comparativa.filasIncompletas > 0 ? (
        <p className="issue-note">
          {comparativa.filasIncompletas === 1
            ? "Hay una fila en la que un canal no tiene precio"
            : `Hay ${comparativa.filasIncompletas} filas en las que un canal no tiene precio`}
          : puede ser que ese canal no lo ofrezca, o que no se haya cargado. Merece preguntarlo al proveedor.
        </p>
      ) : null}
    </div>
  );
}
