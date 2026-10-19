import { codigoDeRegimen } from "../../domain/adHoc";
import type { Acompanantes, ComposicionDeLaEstancia, Habitacion } from "../../domain/estancia";

/**
 * Cómo es la estancia: la pensión de cada noche y la habitación y pensión de
 * profesores y chófer (Ruth, 19/10/2026). Vale para todas las opciones; el
 * precio de cada hotel sale de sus propias tarifas y suplementos.
 */

const REGIMENES: Array<[string, string]> = [
  ["PC", "PC"],
  ["MP", "MP"],
  ["AD", "AD"],
  ["SA", "SA"],
];
const HABITACIONES: Array<[Habitacion, string]> = [
  ["INDIVIDUAL", "Individual"],
  ["DOBLE", "Doble"],
  ["MULTIPLE", "Múltiple"],
];

function sumarDias(iso: string, n: number): Date {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

const fechaCorta = (d: Date) =>
  new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" }).format(d);

export function PanelEstancia({
  composicion,
  onCambiar,
  fechaEntrada,
  noches,
  profesores,
  regimenPedido,
}: {
  composicion: ComposicionDeLaEstancia;
  onCambiar: (c: ComposicionDeLaEstancia) => void;
  fechaEntrada: string;
  noches: number;
  profesores: number;
  regimenPedido: string;
}) {
  if (!fechaEntrada || noches <= 0) return null;
  const base = codigoDeRegimen(regimenPedido) || "";
  const regimenDe = (i: number) => composicion.regimenPorNoche[i] || base;

  function ponerNoche(i: number, regimen: string) {
    const lista = Array.from({ length: noches }, (_, j) => regimenDe(j));
    lista[i] = regimen;
    // Si todas quedan como la pedida, la lista vacía: «como la tarifa elegida».
    onCambiar({ ...composicion, regimenPorNoche: lista.every((r) => r === base) ? [] : lista });
  }

  const acompanantes = (clave: "profesores" | "chofer", cambios: Partial<Acompanantes & { cantidad: number }>) =>
    onCambiar({ ...composicion, [clave]: { ...composicion[clave], ...cambios } });

  const mezcla = new Set(Array.from({ length: noches }, (_, i) => regimenDe(i)).filter(Boolean)).size > 1;

  return (
    <section className="es" aria-label="La estancia">
      <div className="es__fila">
        <span className="es__t">Pensión por noche{mezcla ? <em> · mezclada</em> : null}</span>
        <div className="es__noches">
          {Array.from({ length: noches }, (_, i) => (
            <label key={i} className={regimenDe(i) !== base ? "es__noche is-cambiada" : "es__noche"}>
              <span>{fechaCorta(sumarDias(fechaEntrada, i))}</span>
              <select value={regimenDe(i)} onChange={(e) => ponerNoche(i, e.target.value)}>
                {!base ? <option value="">—</option> : null}
                {REGIMENES.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>

      <div className="es__fila">
        <span className="es__t">Profesores ({profesores})</span>
        <label className="es__campo">
          <span>Habitación</span>
          <select
            value={composicion.profesores.habitacion}
            onChange={(e) => acompanantes("profesores", { habitacion: e.target.value as Habitacion })}
          >
            {HABITACIONES.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="es__campo">
          <span>Pensión</span>
          <select value={composicion.profesores.regimen} onChange={(e) => acompanantes("profesores", { regimen: e.target.value })}>
            <option value="">Como el grupo</option>
            {REGIMENES.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="es__fila">
        <span className="es__t">Chófer</span>
        <label className="es__campo">
          <span>Cuántos</span>
          <input
            type="number"
            min={0}
            max={9}
            value={composicion.chofer.cantidad}
            onChange={(e) => acompanantes("chofer", { cantidad: Math.max(0, Math.min(9, Number(e.target.value) || 0)) })}
          />
        </label>
        {composicion.chofer.cantidad > 0 ? (
          <>
            <label className="es__campo">
              <span>Habitación</span>
              <select
                value={composicion.chofer.habitacion}
                onChange={(e) => acompanantes("chofer", { habitacion: e.target.value as Habitacion })}
              >
                {HABITACIONES.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="es__campo">
              <span>Pensión</span>
              <select value={composicion.chofer.regimen} onChange={(e) => acompanantes("chofer", { regimen: e.target.value })}>
                <option value="">Como el grupo</option>
                {REGIMENES.map(([v, t]) => (
                  <option key={v} value={v}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>
      <p className="es__nota">
        Vale para todas las opciones. Cada hotel calcula con sus tarifas: si no tiene tarifa de individual o doble, aplica su
        suplemento; si tampoco lo tiene, cobra la múltiple y lo avisa en el detalle.
      </p>
    </section>
  );
}
