import { useEffect, useRef, useState } from "react";

/**
 * El menú «Más ⋯» de una ficha: lo que no es lo principal.
 *
 * Antes la cabecera tenía cinco botones del mismo peso (Conversación, Ver el
 * documento, Ha cambiado algo, Rehacer la propuesta, Borrar) y no se sabía cuál
 * era el importante. Ahora la acción que toca va en «Lo siguiente», Conversación
 * queda a la vista y esto es lo demás, con lo destructivo al final y en rojo.
 */
export interface ItemDeMenu {
  texto: string;
  onClick?: () => void;
  href?: string;
  /** Lo que borra o deshace: va al final, separado y en rojo. */
  peligro?: boolean;
}

export function MenuMas({ items, etiqueta = "Más" }: { items: ItemDeMenu[]; etiqueta?: string }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alPulsarFuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", alPulsarFuera);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alPulsarFuera);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  const normales = items.filter((i) => !i.peligro);
  const peligrosos = items.filter((i) => i.peligro);

  const pintar = (item: ItemDeMenu) =>
    item.href ? (
      <a key={item.texto} role="menuitem" href={item.href} target="_blank" rel="noreferrer" onClick={() => setAbierto(false)}>
        {item.texto}
      </a>
    ) : (
      <button
        key={item.texto}
        type="button"
        role="menuitem"
        className={item.peligro ? "is-peligro" : undefined}
        onClick={() => {
          setAbierto(false);
          item.onClick?.();
        }}
      >
        {item.texto}
      </button>
    );

  return (
    <div className="opx-mas" ref={raiz}>
      <button type="button" className="opx-btn" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)}>
        {etiqueta} ⋯
      </button>
      {abierto ? (
        <div className="opx-mas__menu" role="menu">
          {normales.map(pintar)}
          {peligrosos.length > 0 && normales.length > 0 ? <hr /> : null}
          {peligrosos.map(pintar)}
        </div>
      ) : null}
    </div>
  );
}
