import { codigoDeRegimen } from "../../domain/adHoc";
import type { Acompanantes, ComposicionDeLaEstancia, GrupoDeAcompanantes, Habitacion } from "../../domain/estancia";

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

  // Profesores y chóferes repartidos en varias habitaciones (Ruth, 21/10/2026).
  type Clave = "profesoresOtros" | "choferOtros";
  const totalDe = (clave: Clave) => (clave === "profesoresOtros" ? profesores : composicion.chofer.cantidad);
  const otrosDe = (clave: Clave) => composicion[clave] ?? [];
  const enOtras = (clave: Clave) => otrosDe(clave).reduce((s, g) => s + g.cantidad, 0);
  const principalDe = (clave: Clave) => Math.max(totalDe(clave) - enOtras(clave), 0);
  const ponerOtros = (clave: Clave, lista: GrupoDeAcompanantes[]) =>
    onCambiar({ ...composicion, [clave]: lista.length ? lista : undefined });
  const anadirHabitacion = (clave: Clave) => {
    if (principalDe(clave) < 2) return;
    // La otra habitación que más se pide: si los demás van en individual, doble; si no, individual.
    const principal = clave === "profesoresOtros" ? composicion.profesores : composicion.chofer;
    ponerOtros(clave, [
      ...otrosDe(clave),
      { cantidad: 1, habitacion: principal.habitacion === "INDIVIDUAL" ? "DOBLE" : "INDIVIDUAL", regimen: principal.regimen },
    ]);
  };
  const cambiarGrupo = (clave: Clave, i: number, cambios: Partial<GrupoDeAcompanantes>) => {
    const lista = otrosDe(clave).map((g, j) => (j === i ? { ...g, ...cambios } : g));
    // Que la habitación principal no se quede sin nadie: el máximo de este grupo es lo que deja libre.
    const libre = totalDe(clave) - lista.reduce((s, g, j) => (j === i ? s : s + g.cantidad), 0) - 1;
    lista[i] = { ...lista[i], cantidad: Math.max(1, Math.min(lista[i].cantidad, libre)) };
    ponerOtros(clave, lista);
  };
  const quitarGrupo = (clave: Clave, i: number) => ponerOtros(clave, otrosDe(clave).filter((_, j) => j !== i));

  const selectorHabitacion = (valor: Habitacion, alCambiar: (h: Habitacion) => void) => (
    <label className="es__campo">
      <span>Habitación</span>
      <select value={valor} onChange={(e) => alCambiar(e.target.value as Habitacion)}>
        {HABITACIONES.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
  const selectorPension = (valor: string, alCambiar: (r: string) => void) => (
    <label className="es__campo">
      <span>Pensión</span>
      <select value={valor} onChange={(e) => alCambiar(e.target.value)}>
        <option value="">Como el grupo</option>
        {REGIMENES.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
  const otrasHabitaciones = (clave: Clave, quien: string) => (
    <>
      {otrosDe(clave).map((g, i) => (
        <div className="es__fila es__otra" key={i}>
          <span className="es__t">
            {quien} · otra habitación
          </span>
          <label className="es__campo">
            <span>Cuántos</span>
            <input
              type="number"
              min={1}
              max={totalDe(clave) - 1}
              value={g.cantidad}
              onChange={(e) => cambiarGrupo(clave, i, { cantidad: Math.floor(Number(e.target.value) || 1) })}
            />
          </label>
          {selectorHabitacion(g.habitacion, (h) => cambiarGrupo(clave, i, { habitacion: h }))}
          {selectorPension(g.regimen, (r) => cambiarGrupo(clave, i, { regimen: r }))}
          <button type="button" className="es__quitar" onClick={() => quitarGrupo(clave, i)}>
            Quitar
          </button>
        </div>
      ))}
      {principalDe(clave) >= 2 ? (
        <button type="button" className="es__anadir" onClick={() => anadirHabitacion(clave)}>
          + Otra habitación para {quien.toLowerCase()}
        </button>
      ) : null}
    </>
  );

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
        <span className="es__t">
          Profesores ({profesores})
          {enOtras("profesoresOtros") > 0 ? <em> · {principalDe("profesoresOtros")} aquí</em> : null}
        </span>
        {selectorHabitacion(composicion.profesores.habitacion, (h) => acompanantes("profesores", { habitacion: h }))}
        {selectorPension(composicion.profesores.regimen, (r) => acompanantes("profesores", { regimen: r }))}
      </div>
      {profesores >= 2 ? otrasHabitaciones("profesoresOtros", "Profesores") : null}

      <div className="es__fila">
        <span className="es__t">Chófer</span>
        <label className="es__campo">
          <span>Cuántos</span>
          <input
            type="number"
            min={0}
            max={9}
            value={composicion.chofer.cantidad}
            onChange={(e) => {
              const cantidad = Math.max(0, Math.min(9, Number(e.target.value) || 0));
              // Si bajan los chóferes, las otras habitaciones se quitan: no pueden sumar más que el total.
              onCambiar({ ...composicion, chofer: { ...composicion.chofer, cantidad }, ...(cantidad < 2 ? { choferOtros: undefined } : {}) });
            }}
          />
        </label>
        {composicion.chofer.cantidad > 0 ? (
          <>
            {enOtras("choferOtros") > 0 ? <span className="es__t"><em>{principalDe("choferOtros")} aquí</em></span> : null}
            {selectorHabitacion(composicion.chofer.habitacion, (h) => acompanantes("chofer", { habitacion: h }))}
            {selectorPension(composicion.chofer.regimen, (r) => acompanantes("chofer", { regimen: r }))}
          </>
        ) : null}
      </div>
      {composicion.chofer.cantidad >= 2 ? otrasHabitaciones("choferOtros", "Chóferes") : null}
      <p className="es__nota">
        Vale para todas las opciones. Cada hotel calcula con sus tarifas: si no tiene tarifa de individual o doble, aplica su
        suplemento; si tampoco lo tiene, cobra la múltiple y lo avisa en el detalle. Con «+ Otra habitación» se reparten
        profesores o chóferes en habitaciones distintas, cada una con su pensión.
      </p>
    </section>
  );
}
