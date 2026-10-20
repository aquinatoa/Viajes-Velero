import type { ResultadoDeLaEstancia } from "./estancia";
import type { ComprobacionDeEncaje } from "./types";

/**
 * Lo que pidió el centro, comprobado con la estancia que se va a cobrar.
 *
 * La búsqueda comprueba la pensión y el tope con UNA tarifa × noches. Con la
 * estancia (pensión por noche, temporadas, profesores) eso ya no es lo que se
 * cobra: el 4R decía «✓ 191 € por alumno · Su tope era 210 €» con la tarjeta
 * a 211,36 € «+1,36 €», y seguía en el podio; y con noches en MP seguía
 * diciendo «✓ Pensión completa» (revisión del 20/10/2026). Aquí se rehacen
 * esas dos líneas; las demás no dependen de la estancia.
 */

const NOMBRE: Record<string, string> = {
  PC: "Pensión completa",
  MP: "Media pensión",
  AD: "Alojamiento y desayuno",
  SA: "Solo alojamiento",
  "MP+PICNIC": "Media pensión con pícnic",
};

const nombre = (codigo: string) => NOMBRE[codigo] ?? codigo;

/** «1.234,5» → «1234,50 €»; sin céntimos si es entero. */
function euros(n: number): string {
  const r = Math.round(n * 100) / 100;
  return `${Number.isInteger(r) ? String(r) : r.toFixed(2).replace(".", ",")} €`;
}

export function encajeConLaEstancia(
  encaje: ComprobacionDeEncaje[] | undefined,
  estancia: ResultadoDeLaEstancia | null | undefined,
  peticion: {
    /** PC, MP…: la que pidió el centro. */
    pension?: string | null;
    tope?: number | null;
    /** Lo que suman por alumno las actividades del programa. */
    extraPorAlumno?: number;
  },
): ComprobacionDeEncaje[] | undefined {
  if (!encaje || !estancia || estancia.noches.length === 0) return encaje;
  const pedida = (peticion.pension ?? "").toUpperCase().slice(0, 2);

  // Cuántas noches de cada pensión, en el orden en que salen.
  const cuenta = new Map<string, number>();
  for (const n of estancia.noches) cuenta.set(n.regimen, (cuenta.get(n.regimen) ?? 0) + 1);
  const pensiones = [...cuenta.keys()];

  const precio = Math.round((estancia.porAlumno + (peticion.extraPorAlumno ?? 0)) * 100) / 100;

  // Lo que el cálculo no pudo comprobar no entra en el podio como «cumple»:
  // noches sin tarifa (no cumple) o temporadas sin fechas (por confirmar).
  const sinTarifa = estancia.noches.filter((n) => n.sinTarifa).length;
  const sinFechas = estancia.avisos.some((a) => /no tienen fechas|excepciones que no se pueden leer/.test(a));
  const fechas: ComprobacionDeEncaje | null = sinTarifa
    ? {
        clave: "fechas",
        que: `Sin tarifa para ${sinTarifa === 1 ? "una noche" : `${sinTarifa} noches`}`,
        estado: "no_cumple",
        detalle: "Se ha puesto otra tarifa: pide precio al hotel",
      }
    : sinFechas
      ? { clave: "fechas", que: "Temporada sin fechas en el catálogo", estado: "no_consta", detalle: "Precio sin confirmar" }
      : null;
  const base = fechas ? [...encaje.filter((c) => c.clave !== "fechas"), fechas] : encaje;

  return base.map((c): ComprobacionDeEncaje => {
    if (c.clave === "regimen" && pedida) {
      // «MP+PICNIC» es media pensión con el almuerzo de pícnic: cumple MP.
      if (pensiones.length === 1 && pensiones[0].startsWith(pedida)) return { clave: "regimen", que: nombre(pensiones[0]), estado: "cumple" };
      if (pensiones.length === 1) {
        return { clave: "regimen", que: nombre(pensiones[0]), estado: "no_cumple", detalle: `Pedían ${nombre(pedida).toLowerCase()}` };
      }
      const partes = pensiones.map((p) => `${cuenta.get(p)} ${cuenta.get(p) === 1 ? "noche" : "noches"} ${p}`);
      return {
        clave: "regimen",
        que: `Pensión mezclada: ${partes.join(" + ")}`,
        estado: "no_consta",
        detalle: `Pedían ${nombre(pedida).toLowerCase()}`,
      };
    }
    if (c.clave === "tope" && peticion.tope) {
      return precio <= peticion.tope
        ? { clave: "tope", que: `${euros(precio)} por alumno`, estado: "cumple", detalle: `Su tope era ${euros(peticion.tope)}` }
        : {
            clave: "tope",
            que: `${euros(precio)} por alumno`,
            estado: "no_cumple",
            detalle: `${euros(precio - peticion.tope)} por encima de su tope`,
          };
    }
    return c;
  });
}
