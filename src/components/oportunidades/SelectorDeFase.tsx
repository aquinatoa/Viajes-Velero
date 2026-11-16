import { useEffect, useRef, useState, type CSSProperties } from "react";
import { estadoDeLaFase, estiloDeFase, type ColoresDeFase } from "../../domain/colorDeFase";

/**
 * El filtro de fase, con cada fase pintada de su color del CRM (Anthony,
 * 16/11/2026: «aplícales el color»). Un `<select>` del sistema no deja pintar
 * sus opciones, así que es un desplegable propio: cada opción es la misma
 * pastilla que se ve en la columna «Fase» de la lista, con cuántas hay.
 *
 * Teclado: Esc lo cierra; ↑ ↓ mueven el foco entre las opciones; Enter elige.
 */
export function SelectorDeFase({
  fases,
  valor,
  onCambio,
  colores,
  cuantas,
  total,
}: {
  /** Las fases que se pueden elegir, ya en el orden en que deben salir. */
  fases: string[];
  /** La fase elegida, o "" si son todas. */
  valor: string;
  onCambio: (fase: string) => void;
  colores: ColoresDeFase;
  /** Cuántas oportunidades hay en cada fase. */
  cuantas: Record<string, number>;
  total: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        caja.current?.querySelector<HTMLElement>(".opx-fase__btn")?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const opciones = [...(caja.current?.querySelectorAll<HTMLElement>(".opx-fase__menu > button") ?? [])];
      if (opciones.length === 0) return;
      e.preventDefault();
      const i = opciones.indexOf(document.activeElement as HTMLElement);
      const siguiente = e.key === "ArrowDown" ? Math.min(opciones.length - 1, i + 1) : Math.max(0, i - 1);
      opciones[siguiente < 0 ? 0 : siguiente].focus();
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    // Al abrir, el foco va a la opción elegida (o a la primera).
    const id = window.requestAnimationFrame(() => {
      (caja.current?.querySelector<HTMLElement>(".opx-fase__menu > button.is") ?? caja.current?.querySelector<HTMLElement>(".opx-fase__menu > button"))?.focus();
    });
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
      window.cancelAnimationFrame(id);
    };
  }, [abierto]);

  const elegir = (fase: string) => {
    onCambio(fase);
    setAbierto(false);
  };

  /** La pastilla de una fase: su color del CRM o, si no tiene, el del estado de la pantalla. */
  const pastilla = (fase: string) => (
    <span className={`opx-pastilla opx-c-${estadoDeLaFase(fase) ?? "perdida"}`} style={estiloDeFase(fase, colores) as CSSProperties | undefined}>
      {fase}
    </span>
  );

  return (
    <div className="opx-fase" ref={caja}>
      <button type="button" className={`opx-fase__btn${valor ? " is" : ""}`} aria-haspopup="listbox" aria-expanded={abierto} aria-label="Fase" onClick={() => setAbierto(!abierto)}>
        {valor ? pastilla(valor) : <span>Todas las fases</span>}
        <span className="opx-fase__flecha" aria-hidden="true">
          ▾
        </span>
      </button>
      {abierto ? (
        <div className="opx-fase__menu" role="listbox" aria-label="Fase">
          <button type="button" role="option" aria-selected={valor === ""} className={valor === "" ? "is" : ""} onClick={() => elegir("")}>
            <span className="opx-fase__todas">Todas las fases</span>
            <em>{total}</em>
          </button>
          {fases.map((f) => (
            <button key={f} type="button" role="option" aria-selected={valor === f} className={valor === f ? "is" : ""} onClick={() => elegir(f)}>
              {pastilla(f)}
              <em>{cuantas[f] ?? 0}</em>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
