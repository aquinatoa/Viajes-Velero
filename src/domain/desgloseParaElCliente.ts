import { desgloseDeLaOpcion } from "./desgloseDeOpcion";

/**
 * El desglose y la estancia tal como los lee el colegio.
 *
 * El desglose se guarda en un formato que también relee la aplicación
 * (Servicios Contratados, la ficha): «PC: 38,12 € x 25 alumnos + 43,13 € x 2
 * profesores (sin tarifa de doble: precio de múltiple), por noche x 2 noches».
 * Para el colegio eso son abreviaturas y frases internas: «sin tarifa de
 * doble» se lee como que los profesores van en múltiple (revisión del
 * 20/10/2026). Aquí se pasa a un texto que se entiende, sin tocar lo guardado.
 */

const PENSION: Record<string, string> = {
  PC: "Pensión completa",
  MP: "Media pensión",
  AD: "Alojamiento y desayuno",
  SA: "Solo alojamiento",
};

const pension = (codigo: string) => PENSION[codigo.toUpperCase()] ?? codigo;

/** «MP + PC» → «Media pensión y pensión completa». */
export function pensionesParaElCliente(boardType: string | null | undefined): string {
  // Solo se parte por « + » entre códigos: «PC (PRECIO FINAL: alojamiento + régimen)» es una.
  const partes = (boardType ?? "")
    .split(/\s\+\s(?=(?:PC|MP|AD|SA))/i)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => pension(/^(PC|MP|AD|SA)\b/i.exec(p)?.[1] ?? p));
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1].toLowerCase()}`;
}

/** Lo que va entre paréntesis detrás de profesores o chófer. */
function habitacion(texto: string): string {
  return texto
    .split(",")
    .map((p) => p.trim())
    .map((p) => {
      if (/^sin tarifa/.test(p)) return "al mismo precio que los alumnos";
      if (/^uso individual$|^individual$/.test(p)) return "habitación individual";
      if (/^en doble$/.test(p)) return "habitación doble";
      if (/^en múltiple$/.test(p)) return "habitación múltiple";
      const sup = /^suplemento \+(.+?)\s*(%|€)$/.exec(p);
      if (sup) return sup[2] === "%" ? `suplemento del ${sup[1]} %` : `suplemento de ${sup[1]} €`;
      if (/^(PC|MP|AD|SA)$/.test(p)) return pension(p).toLowerCase();
      return p;
    })
    .join(", ");
}

/** El desglose para el colegio. Si no es de los nuestros, se deja como está. */
export function desgloseParaElCliente(texto: string | null | undefined): string {
  const t = (texto ?? "").trim();
  if (!t) return "";
  return t
    .split(" · ")
    .map((tramo) =>
      tramo
        .replace(/^(PC|MP|AD|SA):\s/, (_, c: string) => `${pension(c)}: `)
        .replace(/ x (\d+) (profesores|chófer) \(([^)]*)\)/g, (_, n: string, quien: string, dentro: string) => {
          const uno = Number(n) === 1;
          const nombre = quien === "profesores" ? (uno ? "profesor" : "profesores") : uno ? "chófer" : "chóferes";
          return ` × ${n} ${nombre} (${habitacion(dentro)})`;
        })
        .replace(/ x (\d+) profesores\b/g, (_, n: string) => ` × ${n} ${Number(n) === 1 ? "profesor" : "profesores"}`)
        .replace(/ x (\d+) alumnos/g, (_, n: string) => ` × ${n} ${Number(n) === 1 ? "alumno" : "alumnos"}`)
        .replace(/por noche x (\d+) noche(s?)/, "por noche × $1 noche$2"),
    )
    .join("; ");
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function fechaLarga(d: Date): string {
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

/**
 * «Toda la estancia, por alumno y noche: …». Con tramos, cada uno con su
 * pensión, su precio y sus fechas («del 7 al 9 de junio»), para que se vea
 * por qué hay dos precios de pensión completa. Los tramos que solo cambian en
 * profesores o chófer se juntan: el alumno paga lo mismo.
 */
export function estanciaParaElCliente(
  priceBreakdownText: string | null | undefined,
  totalPvpText: string | null | undefined,
  fechaEntrada: Date | string | null | undefined,
  euros: (n: number) => string,
): string | null {
  const d = desgloseDeLaOpcion(priceBreakdownText, totalPvpText);
  if (!d) return null;
  const plural = (n: number) => `${n} ${n === 1 ? "noche" : "noches"}`;
  if (d.tramos.length <= 1) return `Toda la estancia: ${plural(d.noches)} a ${euros(d.alumnos.precio)} por alumno y noche.`;

  // Tramos seguidos con la misma pensión y el mismo precio de alumno, juntos.
  const juntos: Array<{ regimen: string | null; noches: number; precio: number; desde: number }> = [];
  let desde = 0;
  for (const t of d.tramos) {
    const ultimo = juntos[juntos.length - 1];
    if (ultimo && ultimo.regimen === t.regimen && ultimo.precio === t.alumnos.precio) ultimo.noches += t.noches;
    else juntos.push({ regimen: t.regimen, noches: t.noches, precio: t.alumnos.precio, desde });
    desde += t.noches;
  }
  if (juntos.length === 1) {
    return `Toda la estancia: ${plural(d.noches)}${juntos[0].regimen ? ` de ${pension(juntos[0].regimen).toLowerCase()}` : ""} a ${euros(juntos[0].precio)} por alumno y noche.`;
  }
  const entrada = fechaEntrada ? new Date(`${String(fechaEntrada instanceof Date ? fechaEntrada.toISOString() : fechaEntrada).slice(0, 10)}T12:00:00Z`) : null;
  const cuando = (desdeNoche: number, noches: number) => {
    if (!entrada || Number.isNaN(entrada.getTime())) return "";
    const a = new Date(entrada.getTime() + desdeNoche * 864e5);
    const b = new Date(entrada.getTime() + (desdeNoche + noches - 1) * 864e5);
    if (noches === 1) return ` (el ${fechaLarga(a)})`;
    return a.getUTCMonth() === b.getUTCMonth()
      ? ` (del ${a.getUTCDate()} al ${fechaLarga(b)})`
      : ` (del ${fechaLarga(a)} al ${fechaLarga(b)})`;
  };
  const partes = juntos.map(
    (j) => `${plural(j.noches)}${j.regimen ? ` de ${pension(j.regimen).toLowerCase()}` : ""} a ${euros(j.precio)}${cuando(j.desde, j.noches)}`,
  );
  return `Toda la estancia, por alumno y noche: ${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}.`;
}
