import { useEffect } from "react";
import type { CandidateItem } from "./RateReviewTable";
import type { RateFlag } from "../../domain/rateChecks";

/**
 * Las tarifas de un alojamiento, en la forma que tenían en el PDF.
 *
 * Un documento de tarifas suele ser una tabla: el régimen en las filas y, en las
 * columnas, el servicio incluido cruzado con la ocupación. La aplicación la
 * aplanaba en una lista de 18 filas idénticas salvo el precio, y quien revisaba
 * no tenía con qué juzgar si 88 € estaba bien. Aquí se devuelve a su rejilla:
 * comparar con el PDF pasa a ser un vistazo.
 *
 * Si las tarifas no forman rejilla (p. ej. el documento del turoperador suizo,
 * que va por tipo de bungalow), `buildMatrix` devuelve null y quien llama pinta
 * la lista de siempre.
 */

interface Matrix {
  /** Régimen: una fila por valor. */
  rows: string[];
  /** Servicio incluido: un grupo de columnas por valor. */
  groups: string[];
  /** Ocupación: una columna dentro de cada grupo. */
  cols: string[];
  /** precio[fila][grupo][columna], ya formateado. Null si esa celda no existe. */
  cell: (row: string, group: string, col: string) => CandidateItem | null;
}

const BOARD_LABELS: Record<string, string> = {
  PC: "Pensión completa",
  MP: "Media pensión",
  AD: "Alojamiento y desayuno",
  SA: "Solo alojamiento",
};

/** Orden natural del régimen; lo que no se reconozca va al final. */
const BOARD_ORDER = ["PC", "MP", "AD", "SA"];

function texto(valor: unknown): string {
  return String(valor ?? "").trim();
}

function precio(item: CandidateItem): number | null {
  const bruto = item.pvpAmount ?? item.netAmount ?? item.costAmount;
  const numero = Number(bruto);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function formatearPrecio(item: CandidateItem): string {
  const valor = precio(item);
  if (valor === null) return "—";
  return `${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(valor)} €`;
}

/**
 * Decide si estas tarifas forman una rejilla y la construye.
 *
 * Se exige que la rejilla esté COMPLETA (cada cruce tiene su tarifa y no hay
 * dos en el mismo cruce): con huecos o duplicados, la tabla mentiría por
 * omisión y es más honesto enseñar la lista.
 */
export function buildMatrix(rates: CandidateItem[]): Matrix | null {
  if (rates.length < 4) return null;

  const unicos = (obtener: (r: CandidateItem) => string) => {
    const vistos: string[] = [];
    for (const rate of rates) {
      const valor = obtener(rate);
      if (!valor) return null; // si falta el dato en alguna, no hay rejilla
      if (!vistos.includes(valor)) vistos.push(valor);
    }
    return vistos;
  };

  const rows = unicos((r) => texto(r.boardType));
  const groups = unicos((r) => texto(r.includedService));
  const cols = unicos((r) => texto(r.occupancyLabel));

  if (!rows || !groups || !cols) return null;
  if (rows.length < 2 || groups.length < 2) return null;
  if (rows.length * groups.length * cols.length !== rates.length) return null;

  const indice = new Map<string, CandidateItem>();
  for (const rate of rates) {
    const clave = `${texto(rate.boardType)}||${texto(rate.includedService)}||${texto(rate.occupancyLabel)}`;
    if (indice.has(clave)) return null; // dos tarifas en el mismo cruce
    indice.set(clave, rate);
  }

  rows.sort((a, b) => {
    const ia = BOARD_ORDER.indexOf(a);
    const ib = BOARD_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  return {
    rows,
    groups,
    cols,
    cell: (row, group, col) => indice.get(`${row}||${group}||${col}`) ?? null,
  };
}

/** Por debajo de esto, la IA no las tenía todas consigo y conviene mirarlo. */
const CONFIANZA_BAJA = 0.75;

interface Props {
  matrix: Matrix;
  /** Avisos por tarifa de las comprobaciones automáticas. */
  flags?: Map<string, RateFlag[]>;
  /** Tarifa cuyo detalle se está mostrando. */
  selectedId?: string | null;
  onSelectRate: (rateId: string) => void;
}

export function RateMatrix({ matrix, flags, selectedId, onSelectRate }: Props) {
  return (
    <div className="mx-scroll">
      <table className="rate-mx">
        <thead>
          <tr>
            <th rowSpan={2}>Régimen</th>
            {matrix.groups.map((group) => (
              <th key={group} colSpan={matrix.cols.length} className="rate-mx__grp">
                {group}
              </th>
            ))}
          </tr>
          <tr>
            {matrix.groups.flatMap((group) =>
              matrix.cols.map((col, index) => (
                <th
                  key={`${group}-${col}`}
                  className={index === 0 ? "rate-mx__grp" : undefined}
                >
                  {col}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row}>
              <th scope="row">{BOARD_LABELS[row] ?? row}</th>
              {matrix.groups.flatMap((group) =>
                matrix.cols.map((col, index) => {
                  const rate = matrix.cell(row, group, col);
                  return (
                    <td key={`${group}-${col}`} className={index === 0 ? "rate-mx__grp" : undefined}>
                      {rate ? (
                        <button
                          type="button"
                          className={[
                            "rate-mx__cell",
                            `rate-mx__cell--${String(rate.reviewStatus ?? "PENDING").toLowerCase()}`,
                            // Lo que no cuadra manda sobre la confianza baja:
                            // es un hecho comprobado, no una sospecha.
                            (flags?.get(String(rate.id))?.length ?? 0) > 0
                              ? "rate-mx__cell--nocuadra"
                              : Number(rate.confidenceScore ?? 1) < CONFIANZA_BAJA
                                ? "rate-mx__cell--dudosa"
                                : "",
                            String(rate.id) === selectedId ? "rate-mx__cell--sel" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          title={
                            flags?.get(String(rate.id))?.[0]?.message ??
                            "Ver de dónde sale este precio"
                          }
                          onClick={() => onSelectRate(String(rate.id))}
                        >
                          {formatearPrecio(rate)}
                        </button>
                      ) : (
                        <span className="rate-mx__empty">—</span>
                      )}
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface DetailProps {
  rate: CandidateItem | null;
  /** Lo que no cuadra en esta tarifa, si algo no cuadra. */
  flags?: RateFlag[];
  onClose: () => void;
  /** Lleva a la lista, donde está el editor de la tarifa. */
  onEdit: () => void;
  onApprove: (rateId: string) => void;
  onReject: (rateId: string) => void;
}

const CAMPOS: [string, (r: CandidateItem) => string][] = [
  ["Régimen", (r) => BOARD_LABELS[texto(r.boardType)] ?? texto(r.boardType)],
  ["Qué incluye", (r) => texto(r.includedService)],
  ["Ocupación", (r) => texto(r.occupancyLabel)],
  ["Unidad", (r) => texto(r.unitName) || texto(r.unitType)],
  ["Temporada", (r) => texto(r.year)],
  ["Periodo", (r) => [texto(r.dateFrom), texto(r.dateTo)].filter(Boolean).join(" → ")],
  ["Moneda", (r) => texto(r.currency)],
  ["Noches mínimas", (r) => texto(r.minNights)],
  ["Personas mínimas", (r) => texto(r.minPax)],
  ["Temporada del documento", (r) => texto(r.seasonName)],
];

/**
 * Toda la información de una tarifa, incluido el fragmento literal del
 * documento del que salió.
 *
 * Sin el texto de origen, aprobar "88 €" es un acto de fe: la pantalla dice lo
 * que la IA entendió, no de dónde lo sacó. El dato estaba guardado desde el
 * primer día; solo faltaba enseñarlo.
 */
export function RateDetailDialog({ rate, flags, onClose, onEdit, onApprove, onReject }: DetailProps) {
  useEffect(() => {
    if (!rate) return;
    const alSalir = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onClose();
    };
    window.addEventListener("keydown", alSalir);
    return () => window.removeEventListener("keydown", alSalir);
  }, [rate, onClose]);

  if (!rate) return null;

  const confianza = Number(rate.confidenceScore ?? 0);
  const literal = String(rate.rawText ?? "").trim();
  const estado = String(rate.reviewStatus ?? "PENDING");

  const datos = CAMPOS.map(([etiqueta, leer]) => [etiqueta, leer(rate)] as const).filter(
    ([, valor]) => valor,
  );

  return (
    <div className="rdlg" role="dialog" aria-modal="true" aria-label="Detalle de la tarifa">
      <button type="button" className="rdlg__back" aria-label="Cerrar" onClick={onClose} />
      <div className="rdlg__box">
        <header className="rdlg__head">
          <div>
            <span className="rdlg__price">{formatearPrecio(rate)}</span>
            <span className="rdlg__sub">
              {[texto(rate.boardType), texto(rate.includedService), texto(rate.occupancyLabel)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <button type="button" className="rdlg__x" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className="rdlg__body">
          {flags && flags.length > 0 ? (
            <section className="rdlg__flags">
              <span className="rdlg__l">Esto no cuadra</span>
              <ul>
                {flags.map((flag) => (
                  <li key={flag.code}>{flag.message}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <span className="rdlg__l">De dónde sale este precio</span>
            {literal ? (
              <p className="rdlg__raw">{literal}</p>
            ) : (
              <p className="rdlg__raw rdlg__raw--none">
                Esta tarifa no guardó el texto de origen. Compruébala contra el documento antes de
                aprobarla.
              </p>
            )}
            {confianza > 0 ? (
              <p className={`rdlg__conf${confianza < CONFIANZA_BAJA ? " rdlg__conf--low" : ""}`}>
                Leído con <b>{Math.round(confianza * 100)} %</b> de confianza
                {confianza < CONFIANZA_BAJA ? " — conviene comprobarlo" : ""}
              </p>
            ) : null}
          </section>

          <section>
            <span className="rdlg__l">Lo que entendió la aplicación</span>
            <dl className="rdlg__grid">
              {datos.map(([etiqueta, valor]) => (
                <div key={etiqueta}>
                  <dt>{etiqueta}</dt>
                  <dd>{valor}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <footer className="rdlg__foot">
          <span className={`rdlg__state rdlg__state--${estado.toLowerCase()}`}>
            {estado === "APPROVED"
              ? "Aprobada"
              : estado === "REJECTED"
                ? "Descartada"
                : "Por revisar"}
          </span>
          <div className="rdlg__acts">
            <button type="button" className="btn-quiet" onClick={onEdit}>
              Corregir
            </button>
            <button
              type="button"
              className="btn-quiet"
              onClick={() => onReject(String(rate.id))}
            >
              Descartar
            </button>
            <button type="button" className="btn-go" onClick={() => onApprove(String(rate.id))}>
              Aprobar esta tarifa
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
