/**
 * PDF de la propuesta: las tres opciones en un documento con la marca del
 * departamento, que es lo que hoy se hace copiando y pegando a mano.
 *
 * El PDF es el documento que el colegio archiva y reenvía a dirección o a las
 * familias, así que tiene que sostenerse solo: sin enlaces obligatorios, con la
 * referencia bien visible y con las condiciones al pie.
 *
 * Se dibuja con pdfkit, sin navegador ni plantillas HTML, para que funcione
 * igual en un portátil y en el App Service de Azure.
 */

import { desgloseDeLaOpcion, precioPorEstancia } from "../src/domain/desgloseDeOpcion";
import { limpiarNotas } from "../src/domain/notasDeLaPropuesta";
import {
  desgloseEnLista,
  desgloseParaElCliente,
  estanciaParaElCliente,
  pensionesParaElCliente,
} from "../src/domain/desgloseParaElCliente";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

// Ver `documentStorage.ts`: `ORAVIA_STORAGE_DIR` mueve todo el almacén.
const STORAGE_ROOT = path.resolve(
  process.env.ORAVIA_STORAGE_DIR ?? path.join(process.cwd(), "storage"),
  "proposal-deliveries",
);
const ASSETS = path.resolve(process.cwd(), "src", "assets");

/** Azul y ámbar del logo de Oravia, muestreados del original del cliente. */
const NAVY = "#132E5D";
const AMBER = "#FCBB37";
const INK = "#0E1B33";
const MUTED = "#5B6C86";
const HAIRLINE = "#D9E1EC";

/** Una actividad dentro de una opción. */
export interface PdfActivity {
  name: string;
  provider?: string | null;
  duration?: string | null;
  /** Precio por alumno, ya formateado. */
  priceText?: string | null;
  /** El importe suelto, para poder sumar el total del viaje. */
  amount?: number | null;
  /** Que supone la actividad. Es lo que el colegio ensena a las familias. */
  description?: string | null;
  /** Las líneas con las que se cotizó: «25 × 17,00 € Joven … + 2 × 23,00 € Adulto … = 471,00 €». */
  linesText?: string | null;
  /** Las mismas líneas, una por fila: es como se pintan. */
  linesList?: string[] | null;
  /** El total del grupo, cuando viene de las líneas. */
  groupAmount?: number | null;
  /** Lo que paga cada alumno, sin la parte de los profesores (Ruth, 02/11/2026). */
  studentAmount?: number | null;
  /** Lo que pagan entre todos los profesores de pago. */
  teachersAmount?: number | null;
  /** «29,60 € por profesor · 6 gratis», «Profesores gratis». */
  teachersText?: string | null;
}

export interface PdfOption {
  optionNumber: number;
  accommodationName: string;
  boardType?: string | null;
  nights?: number | null;
  participants?: number | null;
  teachers?: number | null;
  totalPvpText?: string | null;
  /** El total del alojamiento suelto, para el resumen final. */
  totalAmount?: number | null;
  priceBreakdownText?: string | null;
  conditionsText?: string | null;
  observationsText?: string | null;
  /** Las gratuidades del hotel. Cambian el precio: van en su propia linea. */
  freePolicyText?: string | null;
  /** Las actividades de ESTA opción. Se dibujan en la sección 2, no aquí. */
  activities?: PdfActivity[];
}

export interface PdfInput {
  reference: string;
  department?: string | null;
  clientName: string;
  centreName?: string | null;
  tripTitle: string;
  destination?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  participants?: number | null;
  teachers?: number | null;
  options: PdfOption[];
  /**
   * Las actividades de una propuesta sin alojamiento (Ruth, 02/11/2026: «no
   * todas las cotizaciones requieren de alojamiento»). Con opciones, van
   * dentro de cada una y esto queda vacío.
   */
  activities?: PdfActivity[] | null;
  publicUrl?: string | null;
  preparedBy?: string | null;
  /** Las «Notas» que escribió quien cotiza para el cliente (05/11/2026). */
  notes?: string | null;
}

/**
 * Frases que son NUESTRAS, no del cliente, y que no pueden salir en el PDF.
 *
 * Las observaciones y las condiciones se copian tal cual del documento del
 * proveedor, y ahí va mezclado lo que el colegio tiene que saber con la base de
 * coste y la trazabilidad interna. En la primera propuesta que se generó, el
 * PDF que iba a un colegio decía «Precios netos por persona y noche (coste)» y
 * «Fuente: COSTE_ALOJAMIENTO_ESTUDIANTES_2027_ACTUALIZADO_TAIGA (Word)».
 *
 * Se quitan frases enteras, no palabras sueltas: recortar a media frase deja
 * un texto que parece redactado por nadie.
 */
const INTERNO = [
  /^\s*fuente\s*:/i,
  /\bprecios?\s+netos?\b/i,
  /\bpreus?\s+nets?\b/i,
  /\bneto\s+(?:de\s+)?(?:compra|coste)\b/i,
  /\(\s*coste\s*\)/i,
  /\bcoste\s+por\s+(?:persona|pax|alumno)\b/i,
  /\bmargen\b/i,
  /\bpvp\s+interno\b/i,
];

const esInterno = (trozo: string) => INTERNO.some((patron) => patron.test(trozo));

/** Parte un texto en frases sin romper las abreviaturas por la mitad. */
function frasesDe(texto: string): string[] {
  return texto
    .split(/(?<=[.!?])\s+/)
    .map((frase) => frase.trim())
    .filter(Boolean);
}

/**
 * Limpia una frase quitándole solo las partes internas.
 *
 * Se mira primero la frase entera y, si sobra, se baja a las comas: en el
 * camping la nota dice «Preus nets PPPN, IVA 10% inclòs» y tirar la frase
 * completa se llevaba por delante el IVA, que el colegio sí tiene que ver.
 * Devuelve cadena vacía si no queda nada que contar.
 */
function limpiarFrase(frase: string): string {
  if (!esInterno(frase)) return frase;

  const trozos = frase.split(/\s*,\s*/);
  if (trozos.length === 1) return "";

  const utiles = trozos.filter((trozo) => !esInterno(trozo));
  if (utiles.length === 0) return "";

  const limpia = utiles.join(", ").trim();
  // Que no empiece en minúscula ni se quede sin punto por el recorte.
  const conMayuscula = limpia.charAt(0).toUpperCase() + limpia.slice(1);
  return /[.!?]$/.test(conMayuscula) ? conMayuscula : `${conMayuscula}.`;
}

/**
 * Deja el texto en condiciones de ir a un cliente: sin frases internas y sin
 * caracteres que la fuente no sepa dibujar.
 *
 * Helvetica en pdfkit va en WinAnsi, que no tiene «≤». El primer PDF generado
 * mostraba «Tarifa estudiantes ("d16 años)» donde el proveedor había escrito
 * «≤16 años»: no es que se viera raro, es que decía otra cosa.
 */
export function textoParaElCliente(texto?: string | null): string {
  if (!texto) return "";

  const utiles = frasesDe(texto).map(limpiarFrase).filter(Boolean);

  return utiles
    .join(" ")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/[≠]/g, "!=")
    .replace(/[⁄∕]/g, "/")
    .replace(/[…]/g, "...")
    .replace(/[−]/g, "-")
    // Lo que quede fuera de WinAnsi se dibuja como basura: mejor no dibujarlo.
    // El rango va escrito como \x20-\xFF y no con un espacio literal: un espacio
    // al principio de una clase de caracteres es invisible, y una edición
    // automática lo convirtió una vez en un byte nulo sin que nadie lo notara.
    // El euro y las comillas tipográficas van detrás porque están POR ENCIMA de
    // ÿ: sin nombrarlos, se borrarían de las condiciones.
    .replace(/[^\x20-\xFF€‘’“”–—•·]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(value?: Date | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(value);
}

function departmentLabel(department?: string | null): string {
  return department === "SPORTS" ? "Oravia Sports" : "Oravia Travel Group";
}

function logoPath(): string | null {
  const file = path.join(ASSETS, "oravia-isotipo.png");
  return fs.existsSync(file) ? file : null;
}

/** Cabecera de marca. Devuelve la Y donde puede seguir el contenido. */
function drawHeader(doc: PDFKit.PDFDocument, input: PdfInput): number {
  const logo = logoPath();
  if (logo) doc.image(logo, 50, 46, { width: 42 });

  doc.font("Helvetica-Bold").fontSize(13).fillColor(INK);
  doc.text(departmentLabel(input.department).toUpperCase(), logo ? 104 : 50, 52, { characterSpacing: 1.2 });
  doc.font("Helvetica").fontSize(9).fillColor(MUTED);
  doc.text("Propuesta de viaje de grupo", logo ? 104 : 50, 70);

  doc.font("Helvetica-Bold").fontSize(9).fillColor(NAVY);
  doc.text(input.reference, 380, 52, { width: 165, align: "right" });
  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
  doc.text(formatDate(new Date()), 380, 66, { width: 165, align: "right" });

  doc.moveTo(50, 96).lineTo(545, 96).lineWidth(2).strokeColor(AMBER).stroke();
  return 118;
}

/** Datos del grupo: lo que el colegio comprueba primero. */
function drawTripSummary(doc: PDFKit.PDFDocument, input: PdfInput, top: number): number {
  doc.font("Helvetica-Bold").fontSize(17).fillColor(INK);
  doc.text(input.tripTitle, 50, top, { width: 495 });

  let y = doc.y + 6;
  doc.font("Helvetica").fontSize(10).fillColor(MUTED);
  doc.text(input.centreName ?? input.clientName, 50, y, { width: 495 });

  y = doc.y + 12;
  const facts: Array<[string, string]> = [];
  if (input.destination) facts.push(["Destino", input.destination]);
  if (input.dateFrom || input.dateTo) {
    facts.push(["Fechas", `${formatDate(input.dateFrom)} - ${formatDate(input.dateTo)}`.replace(/^ - | - $/, "")]);
  }
  if (input.participants) facts.push(["Participantes", String(input.participants)]);
  if (input.teachers) facts.push(["Profesores", String(input.teachers)]);

  const columnWidth = 495 / Math.max(facts.length, 1);
  facts.forEach(([label, value], index) => {
    const x = 50 + index * columnWidth;
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
    doc.text(label.toUpperCase(), x, y, { width: columnWidth - 10, characterSpacing: 0.6 });
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK);
    doc.text(value, x, y + 11, { width: columnWidth - 10 });
  });

  return y + 38;
}

/**
 * Cómo se llama en castellano cada etiqueta del importador.
 *
 * Las condiciones se guardan como «[GRATUIDAD] 1 gratuidad cada 25 pax |
 * [CANCELACION] 25-7 días 20%…»: la etiqueta entre corchetes es el tipo de
 * política tal y como lo clasificó el importador. Sacarla tal cual al PDF
 * hacía que el colegio leyera corchetes en mayúsculas y sin tildes, que es el
 * aspecto de una base de datos, no el de una propuesta.
 *
 * Lo que no esté en esta lista se escribe con mayúscula inicial: es preferible
 * una etiqueta imperfecta a perder el dato, porque el importador puede
 * clasificar tipos nuevos en cualquier momento.
 */
const NOMBRE_DE_LA_CONDICION: Record<string, string> = {
  GRATUIDAD: "Gratuidades",
  GRATUIDADES: "Gratuidades",
  FREE: "Gratuidades",
  CANCELACION: "Cancelación",
  MODIFICACION: "Modificaciones",
  PAGO: "Pagos",
  PAGOS: "Pagos",
  DEPOSITO: "Depósito",
  FIANZA: "Fianza",
  SUPLEMENTO: "Suplementos",
  SUPLEMENTOS: "Suplementos",
  TASA: "Tasa turística",
  TASA_TURISTICA: "Tasa turística",
  RELEASE: "Release",
  EDAD: "Edades",
  EDADES: "Edades",
  MINIMO: "Mínimo de plazas",
  OCUPACION: "Ocupación",
  RATIO: "Ratio de monitores",
  BEBIDAS: "Bebidas",
  CONFIRMACION: "Confirmación",
  DESCUENTO: "Descuentos",
  CONTACTO: "Contacto",
  // Los tipos del importador nuevo van en inglés (los de la base de datos). En
  // el PDF de ESCOLA ULL (26/10/2026) salían tal cual: «Gratuity:», «Payment:»,
  // «Special notes:», delante de un colegio.
  GRATUITY: "Gratuidades",
  PAYMENT: "Pago",
  DEPOSIT: "Depósito",
  CANCELLATION: "Cancelación",
  MODIFICATION: "Modificaciones",
  GROUP_SIZE: "Tamaño del grupo",
  AGE: "Edades",
  AGE_RESTRICTION: "Edades",
  INCLUDED: "Incluye",
  INCLUDES: "Incluye",
  SUPPLEMENT: "Suplementos",
  TAX: "Tasas",
  TOURIST_TAX: "Tasa turística",
  RESERVATION: "Reservas",
  BOOKING: "Reservas",
  SPECIAL_NOTES: "",
  NOTES: "",
  OTHER: "",
  UNKNOWN: "",
  OTROS: "",
};

/** Lo que ya dice su nombre delante: «Depósito: Fiança…», «Suplementos: Llits fets». */
const YA_ETIQUETADO = /^([A-ZÁÉÍÓÚÑ][\wáéíóúñü ./()-]{1,30}):\s+(.+)$/s;

/** Una condición ya lista para imprimir: su etiqueta y su texto. */
export interface Condicion {
  etiqueta: string;
  texto: string;
}

/**
 * Parte el texto de condiciones en líneas legibles.
 *
 * El importador las junta con « | » y les pone delante el tipo entre
 * corchetes. Aquí se deshace eso para que cada condición salga en su propia
 * línea con su nombre delante, que es como se lee una ficha de hotel.
 */
export function condicionesEnLista(texto?: string | null): Condicion[] {
  const limpio = textoParaElCliente(texto);
  if (!limpio) return [];

  return limpio
    .split(/\s*\|\s*/)
    .map((trozo) => trozo.trim())
    .filter(Boolean)
    .map((trozo) => {
      const conEtiqueta = trozo.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (!conEtiqueta) return { etiqueta: "", texto: trozo };

      const clave = conEtiqueta[1].trim().toUpperCase().replace(/\s+/g, "_");
      const conocida = NOMBRE_DE_LA_CONDICION[clave];
      const etiqueta =
        conocida !== undefined
          ? conocida
          : clave.charAt(0) + clave.slice(1).toLowerCase().replace(/_/g, " ");

      // Si el texto ya trae su nombre («Depósito: …», «Gratuidades: …»), manda
      // ese: si no salía «Pago: Depósito: …» o «Gratuidades: Gratuidades: …».
      const texto = conEtiqueta[2].trim();
      const propio = YA_ETIQUETADO.exec(texto);
      if (propio) return { etiqueta: propio[1].trim(), texto: propio[2].trim() };
      // «Tasa turística: Tasa turística (0.99)»: si el texto ya empieza así, sobra.
      if (etiqueta && texto.toLowerCase().startsWith(etiqueta.toLowerCase())) return { etiqueta: "", texto };
      return { etiqueta, texto };
    })
    .filter((condicion) => condicion.texto.length > 0)
    // La misma condición dos veces (pasa con las gratuidades y el pago) se dice una.
    .filter((c, i, todas) => todas.findIndex((o) => mismaCondicion(o, c)) === i);
}

function mismaCondicion(a: Condicion, b: Condicion): boolean {
  const clave = (c: Condicion) => `${c.etiqueta}|${c.texto}`.toLowerCase().replace(/\s+/g, " ");
  return clave(a) === clave(b);
}

/** Lo más abajo que se puede empezar a escribir sin invadir el pie. */
const SUELO = 752;

/**
 * Abre página si lo que viene no cabe entero, y devuelve la «y» donde escribir.
 *
 * Hace falta porque aquí se dibuja con coordenadas fijas: cuando un texto no
 * cabía, pdfkit abría página él solo y la siguiente línea se escribía en la
 * «y» vieja, ya en la página nueva. Una propuesta salió con una página entera
 * en blanco que solo contenía el punto de una viñeta, y su texto tres líneas
 * más allá, en la página siguiente.
 */
function conSitio(doc: PDFKit.PDFDocument, y: number, alto: number): number {
  if (y + alto <= SUELO) return y;
  doc.addPage();
  return 60;
}

/**
 * Lo que dice el documento, sin dibujar: los textos y los importes que lee el
 * colegio, opción por opción, las actividades y el resumen.
 *
 * Ruth, 02/11/2026: en la página del enlace «no aparecen las actividades en
 * ningún lado… y se extrae el precio total, no el precio por persona. No
 * debería salir diferente, al contrario, debería poder tener acceso a la misma
 * información en los dos casos». La página tenía su propia selección de datos
 * y se había quedado atrás del PDF. Ahora los dos pintan esto, y lo que cambie
 * aquí sale igual en los dos.
 */
export interface OpcionParaElCliente {
  optionNumber: number;
  nombre: string;
  /** El total de la opción: «23.234,82 €». */
  total: string | null;
  /** Pensión, noches, alumnos, profesores, chófer. */
  detalles: string[];
  /** «206,62 € por alumno», en grande. */
  porAlumno: string | null;
  /** «188,66 € por profesor», «306,62 € por chófer». */
  otrosPrecios: string[];
  /** Qué es la cifra grande, con sus tramos y fechas. */
  estancia: string | null;
  desglose: Array<{ titulo: string; lineas: string[] }>;
  /** El desglose en un párrafo, cuando no se puede partir en tramos. */
  desgloseTexto: string | null;
  gratuidades: string | null;
  condiciones: Condicion[];
  observaciones: Condicion[];
}

export interface ActividadParaElCliente {
  nombre: string;
  /** Quién va con qué entrada, una por línea. */
  lineas: string[];
  /** «29,60 € por alumno». */
  precio: string | null;
  /** «29,60 € por profesor · 6 gratis», «Profesores gratis». */
  profesores: string | null;
  /** «3.078,40 € el grupo». */
  grupo: string | null;
  /** Proveedor, duración y, si no van en todas, en qué opciones. */
  detalle: string | null;
  descripcion: string | null;
}

export interface ActividadesParaElCliente {
  intro: string;
  lista: ActividadParaElCliente[];
  /** «7.206,40 € para el grupo». */
  total: string;
  /** «100 alumnos y 10 profesores · 70,88 € por alumno · 118,40 € los profesores de pago». */
  totalDetalle: string | null;
}

export interface ResumenParaElCliente {
  filas: Array<{
    optionNumber: number;
    nombre: string;
    alojamiento: string;
    actividades: string;
    total: string;
    porAlumno: string | null;
  }>;
  nota: string;
}

export interface DocumentoParaElCliente {
  opciones: OpcionParaElCliente[];
  actividades: ActividadesParaElCliente | null;
  resumen: ResumenParaElCliente | null;
  /** Las notas, tal como las escribió quien cotiza; null si no hay. */
  notas: string | null;
}

/** Una opción como la lee el colegio. */
export function opcionParaElCliente(option: PdfOption, fechaEntrada?: Date | null): OpcionParaElCliente {
  // El chófer, si lo hay, sale del desglose: se cobra y tiene que decirse
  // (revisión del 20/10/2026: el total lo incluía y no aparecía en ningún sitio).
  const desglose = desgloseDeLaOpcion(option.priceBreakdownText, option.totalPvpText);
  const chofer = desglose?.tramos[0]?.chofer?.pax ?? 0;
  const detalles = [
    pensionesParaElCliente(option.boardType) || option.boardType,
    option.nights ? `${option.nights} ${option.nights === 1 ? "noche" : "noches"}` : null,
    option.participants ? `${option.participants} ${option.participants === 1 ? "alumno" : "alumnos"}` : null,
    option.teachers ? `${option.teachers} ${option.teachers === 1 ? "profesor" : "profesores"}` : null,
    chofer ? `${chofer} ${chofer === 1 ? "chófer" : "chóferes"}` : null,
  ].filter((d): d is string => Boolean(d));

  // Lo que paga cada persona por TODA la estancia, en grande. Javier, 29/09/2026:
  // «muchos clientes nos piden el precio por estancia por persona», y lo que
  // había salía «en pequeñito» dentro del desglose.
  let porAlumno: string | null = null;
  let otrosPrecios: string[] = [];
  let estancia: string | null = null;
  if (desglose) {
    const porEstancia = precioPorEstancia(desglose);
    const porChofer = desglose.tramos.reduce((s, tr) => s + (tr.chofer?.precio ?? 0) * tr.noches, 0);
    // Con bloques de alumnos en otra habitación o con otra pensión, la cifra grande
    // es la del grupo principal (05/11/2026): se dice, y el de cada bloque va debajo.
    const bloques = (desglose.tramos[0]?.alumnosGrupos ?? []).map((g, i) => {
      const precio = desglose.tramos.reduce((s, tr) => s + (tr.alumnosGrupos?.[i]?.precio ?? 0) * tr.noches, 0);
      const sitio = { INDIVIDUAL: "habitación individual", DOBLE: "habitación doble", MULTIPLE: "habitación múltiple" }[g.habitacion];
      const pension = g.regimen ? `, ${(pensionesParaElCliente(g.regimen) || g.regimen).toLowerCase()}` : "";
      return `${formatMoney(Math.round(precio * 100) / 100)} por alumno en ${sitio}${pension} (${g.pax} ${g.pax === 1 ? "alumno" : "alumnos"})`;
    });
    porAlumno = `${formatMoney(porEstancia.alumno)} por alumno${bloques.length ? " del grupo principal" : ""}`;
    otrosPrecios = [
      ...bloques,
      porEstancia.profesor !== null && porEstancia.profesor !== porEstancia.alumno
        ? `${formatMoney(porEstancia.profesor)} por profesor`
        : null,
      porChofer > 0 ? `${formatMoney(Math.round(porChofer * 100) / 100)} por chófer` : null,
    ].filter((d): d is string => Boolean(d));
    // Qué es cada cifra: la grande es el alojamiento del alumno; el total de
    // la opción suma además profesores y chófer (revisión del 20/10/2026).
    // Con tramos, cada uno con su pensión, su precio y sus fechas.
    estancia = `Alojamiento de cada alumno para toda la estancia. ${
      estanciaParaElCliente(option.priceBreakdownText, option.totalPvpText, fechaEntrada, formatMoney) ?? ""
    }`.trim();
  }

  // En lista: un bloque por tramo y una línea por grupo. En párrafo eran ocho
  // líneas seguidas que nadie leía (Ruth, 26/10/2026).
  const tramos = option.priceBreakdownText ? desgloseEnLista(option.priceBreakdownText, fechaEntrada) : [];
  const desgloseTexto =
    option.priceBreakdownText && tramos.length === 0 ? desgloseParaElCliente(option.priceBreakdownText) || null : null;

  // Las gratuidades, en su propio recuadro y ANTES de las condiciones: es lo
  // primero que mira un colegio, porque cambia lo que acaba pagando.
  const gratuidades = condicionesEnLista(option.freePolicyText);
  // Las gratuidades ya van en su recuadro: no se repiten debajo.
  const enElRecuadro = new Set(gratuidades.map((g) => g.texto.toLowerCase().replace(/\s+/g, " ")));

  return {
    optionNumber: option.optionNumber,
    nombre: option.accommodationName,
    total: option.totalPvpText ?? null,
    detalles,
    porAlumno,
    otrosPrecios,
    estancia,
    desglose: tramos,
    desgloseTexto,
    gratuidades: gratuidades.length ? gratuidades.map((condicion) => condicion.texto).join(" ") : null,
    condiciones: condicionesEnLista(option.conditionsText).filter(
      (c) => !enElRecuadro.has(c.texto.toLowerCase().replace(/\s+/g, " ")),
    ),
    observaciones: condicionesEnLista(option.observationsText),
  };
}

/** El mayor grupo de las opciones: cada una guarda el suyo. */
function grupoDeLasOpciones(input: PdfInput, campo: "participants" | "teachers"): number {
  return input.options.reduce((mayor, opcion) => Math.max(mayor, opcion[campo] ?? 0), 0);
}

/** Lo que cuesta una actividad al grupo, y cómo se reparte entre alumnos y profesores. */
function repartoDe(actividad: PdfActivity, alumnos: number, profesores: number) {
  // Con entradas por tarifa, su total; si no, el precio por persona × el grupo.
  // Antes se sumaba el «por alumno» (que con entradas ya es el total del grupo
  // repartido entre los alumnos) y se multiplicaba por todas las personas:
  // 839,16 € donde eran 805,80 €.
  const conLineas = actividad.groupAmount != null && actividad.groupAmount > 0;
  const grupo = conLineas ? actividad.groupAmount! : (actividad.amount ?? 0) * (alumnos + profesores);
  if (actividad.studentAmount != null) {
    return { grupo, alumno: actividad.studentAmount, profesores: actividad.teachersAmount ?? 0 };
  }
  // Por grupo o por hora: no hay precio por cabeza, se reparte entre los alumnos.
  if (conLineas) return { grupo, alumno: alumnos > 0 ? grupo / alumnos : 0, profesores: 0 };
  return { grupo, alumno: actividad.amount ?? 0, profesores: (actividad.amount ?? 0) * profesores };
}

/**
 * Las actividades del viaje, una sola vez.
 *
 * El programa se elige una vez para todo el viaje, así que repetirlo bajo cada
 * hotel obligaba a leer tres veces lo mismo para poder comparar tres
 * alojamientos. Si alguna opción lleva un programa distinto, cada actividad
 * dice a qué opciones pertenece. Callarlo sería peor que no ponerlo: el colegio
 * estaría leyendo un itinerario que no le corresponde al hotel que acabe
 * eligiendo.
 */
export function actividadesParaElCliente(input: PdfInput): ActividadesParaElCliente | null {
  // El grupo de la solicitud y, si no lo trae, el de las opciones: lo mismo que
  // en el resumen, para que los dos sumen igual.
  const alumnos = input.participants || grupoDeLasOpciones(input, "participants");
  const profesores = input.teachers || grupoDeLasOpciones(input, "teachers");
  const personas = alumnos + profesores;

  // Cada actividad una sola vez, con las opciones en las que aparece.
  const porNombre = new Map<string, { actividad: PdfActivity; opciones: number[] }>();
  // Sin alojamiento, las sueltas: no hay opciones entre las que repartirlas.
  if (input.options.length === 0) {
    for (const actividad of input.activities ?? []) {
      if (!porNombre.has(actividad.name)) porNombre.set(actividad.name, { actividad, opciones: [] });
    }
  }
  for (const option of input.options) {
    for (const actividad of option.activities ?? []) {
      const yaEsta = porNombre.get(actividad.name);
      if (yaEsta) yaEsta.opciones.push(option.optionNumber);
      else porNombre.set(actividad.name, { actividad, opciones: [option.optionNumber] });
    }
  }
  const itinerario = [...porNombre.values()];
  if (itinerario.length === 0) return null;

  // ¿El mismo programa en todas las opciones? Entonces no hay nada que aclarar.
  const todasIguales = itinerario.every((entrada) => entrada.opciones.length === input.options.length);
  const sinAlojamiento = input.options.length === 0;

  let delGrupo = 0;
  let porAlumno = 0;
  let deLosProfesores = 0;
  const lista = itinerario.map(({ actividad, opciones }) => {
    const reparto = repartoDe(actividad, alumnos, profesores);
    delGrupo += reparto.grupo;
    porAlumno += reparto.alumno;
    deLosProfesores += reparto.profesores;

    // Quién va con qué entrada, una por línea (Ruth, 26/10/2026: en texto
    // seguido no se leía). Sin esto el colegio ve «18,84 € por persona» y no
    // sabe que son 25 jóvenes y 2 adultos a precios distintos.
    const lineas = actividad.linesList?.length
      ? actividad.linesList.map((linea) => textoParaElCliente(linea))
      : actividad.linesText
        ? [actividad.linesText]
        : [];

    // Lo que paga cada alumno, sin la parte de los profesores (Ruth, 02/11/2026).
    const precio =
      actividad.studentAmount != null ? `${formatMoney(actividad.studentAmount)} por alumno` : actividad.priceText ?? null;
    const grupo = !precio
      ? null
      : actividad.groupAmount != null && actividad.groupAmount > 0
        ? `${formatMoney(actividad.groupAmount)} el grupo`
        : personas > 0 && (actividad.amount ?? 0) > 0
          ? `${formatMoney((actividad.amount ?? 0) * personas)} el grupo`
          : null;

    const detalle = [
      actividad.provider,
      actividad.duration,
      todasIguales ? null : `En ${opciones.length === 1 ? "la opción" : "las opciones"} ${opciones.join(", ")}`,
    ]
      .filter(Boolean)
      .join("  ·  ");

    return {
      nombre: textoParaElCliente(actividad.name),
      lineas,
      precio,
      profesores: precio ? actividad.teachersText ?? null : null,
      grupo,
      detalle: detalle ? textoParaElCliente(detalle) : null,
      descripcion: actividad.description ? textoParaElCliente(actividad.description) || null : null,
    };
  });

  // El total del conjunto: por persona y para el grupo entero. Es la cifra que
  // el colegio suma al alojamiento, así que se da en las dos unidades. Por
  // alumno, lo que paga cada uno; lo de los profesores que pagan, aparte.
  const redondo = (n: number) => Math.round(n * 100) / 100;
  return {
    intro: sinAlojamiento
      ? "El programa de actividades, sin alojamiento. Los precios son por persona."
      : todasIguales
        ? "El mismo programa para todas las opciones de alojamiento. Los precios son por persona."
        : "Cada actividad indica en qué opciones va incluida. Los precios son por persona.",
    lista,
    total: `${formatMoney(redondo(delGrupo))} para el grupo`,
    totalDetalle:
      alumnos > 0
        ? `${alumnos} alumnos${profesores ? ` y ${profesores} profesores` : ""} · ${formatMoney(redondo(porAlumno))} por alumno${
            redondo(deLosProfesores) > 0 ? ` · ${formatMoney(redondo(deLosProfesores))} los profesores de pago` : ""
          }`
        : null,
  };
}

/**
 * El resumen del viaje, al final: qué cuesta cada opción entera.
 *
 * Hasta ahora el PDF daba el total del alojamiento de cada opción y nada más.
 * Las actividades ni salían, así que el colegio no podía saber qué le cuesta el
 * viaje completo con cada hotel, que es exactamente la decisión que tiene que
 * tomar. Aquí se suma alojamiento + actividades, opción por opción.
 */
export function resumenParaElCliente(input: PdfInput): ResumenParaElCliente | null {
  if (input.options.length === 0) return null;
  // El grupo, con red de seguridad.
  //
  // Cada opcion guarda su propio numero de alumnos y profesores, y la
  // solicitud tambien. Cuando la solicitud se guardo con la PRIMERA lectura
  // del mensaje -un fallo que ya esta corregido aguas arriba- el suyo venia a
  // cero mientras las opciones traian 48, y este resumen salia con las
  // actividades a cero (se multiplican por el grupo) y «para 0 alumnos».
  //
  // Un documento que sale hacia un colegio no puede depender de que un solo
  // sitio tenga el dato: si la solicitud no lo trae, manda el de las opciones.
  const alumnos = input.participants || grupoDeLasOpciones(input, "participants");
  const profesores = input.teachers || grupoDeLasOpciones(input, "teachers");
  // El chófer, de la primera opción que lo lleve.
  const chofer = Math.max(
    0,
    ...input.options.map((o) => desgloseDeLaOpcion(o.priceBreakdownText, o.totalPvpText)?.tramos[0]?.chofer?.pax ?? 0),
  );

  const filas = input.options.map((option) => {
    const alojamiento = option.totalAmount ?? 0;
    // Una actividad se cobra por persona, así que su importe se multiplica por
    // el grupo entero: alumnos y profesores van a la misma excursión.
    const actividades =
      Math.round(
        (option.activities ?? []).reduce((suma, actividad) => suma + repartoDe(actividad, alumnos, profesores).grupo, 0) * 100,
      ) / 100;
    const total = alojamiento + actividades;
    return {
      optionNumber: option.optionNumber,
      nombre: option.accommodationName,
      alojamiento: formatMoney(alojamiento),
      actividades: actividades > 0 ? formatMoney(actividades) : "—",
      total: formatMoney(total),
      porAlumno: alumnos > 0 ? `${formatMoney(total / alumnos)} por alumno` : null,
    };
  });

  return {
    filas,
    nota:
      `Cada total incluye el alojamiento y las actividades de esa opción, para ${alumnos} alumnos` +
      (profesores > 0 ? `, ${profesores} profesores` : "") +
      (chofer > 0 ? ` y ${chofer} ${chofer === 1 ? "chófer" : "chóferes"}` : "") +
      ". El precio por alumno reparte entre los alumnos todo lo de la opción, también lo de profesores y chófer.",
  };
}

/** El documento entero, sin dibujar. */
export function documentoParaElCliente(input: PdfInput): DocumentoParaElCliente {
  return {
    opciones: input.options.map((option) => opcionParaElCliente(option, input.dateFrom ?? null)),
    actividades: actividadesParaElCliente(input),
    resumen: resumenParaElCliente(input),
    notas: limpiarNotas(input.notes) || null,
  };
}

/** Una opción por bloque, numerada como la ve el cliente. */
function drawOption(doc: PDFKit.PDFDocument, opcion: OpcionParaElCliente, top: number): number {
  const boxTop = top;
  doc.roundedRect(50, boxTop, 495, 22, 4).fill(NAVY);
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#FFFFFF");
  doc.text(`OPCIÓN ${opcion.optionNumber}`, 62, boxTop + 6, { characterSpacing: 0.8 });
  if (opcion.total) {
    doc.font("Helvetica-Bold").fontSize(10).fillColor(AMBER);
    doc.text(opcion.total, 350, boxTop + 6, { width: 183, align: "right" });
  }

  let y = boxTop + 32;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INK);
  doc.text(opcion.nombre, 50, y, { width: 495 });
  y = doc.y + 4;

  if (opcion.detalles.length) {
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED);
    doc.text(opcion.detalles.join("  ·  "), 50, y, { width: 495 });
    y = doc.y + 8;
  }

  if (opcion.porAlumno) {
    y = conSitio(doc, y, 36);
    doc.font("Helvetica-Bold").fontSize(14).fillColor(NAVY);
    doc.text(opcion.porAlumno, 50, y, { width: 300 });
    if (opcion.otrosPrecios.length) {
      doc.font("Helvetica-Bold").fontSize(11).fillColor(NAVY);
      doc.text(opcion.otrosPrecios.join("  ·  "), 300, y + 3, { width: 245, align: "right" });
    }
    y = doc.y + 3;
    if (opcion.estancia) {
      doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
      doc.text(opcion.estancia, 50, y, { width: 495 });
      y = doc.y + 8;
    }
  }

  if (opcion.desglose.length || opcion.desgloseTexto) {
    y = conSitio(doc, y, 34);
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED);
    doc.text("DESGLOSE", 50, y, { characterSpacing: 0.6 });
    y = doc.y + 3;
    if (opcion.desgloseTexto) {
      doc.font("Helvetica").fontSize(9.5).fillColor(INK);
      doc.text(opcion.desgloseTexto, 50, y, { width: 495 });
      y = doc.y;
    }
    for (const tramo of opcion.desglose) {
      if (tramo.titulo) {
        y = conSitio(doc, y, 14 + tramo.lineas.length * 12);
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK);
        doc.text(tramo.titulo, 50, y, { width: 495 });
        y = doc.y + 1;
      }
      for (const linea of tramo.lineas) {
        y = conSitio(doc, y, doc.font("Helvetica").fontSize(9.5).heightOfString(linea, { width: 475 }));
        doc.font("Helvetica").fontSize(9.5).fillColor(MUTED);
        doc.text("·", 58, y, { width: 8 });
        doc.fillColor(INK).text(linea, 68, y, { width: 477 });
        y = doc.y + 1;
      }
      y += 4;
    }
    y += 4;
  }

  if (opcion.gratuidades) {
    const alto = doc.font("Helvetica").fontSize(9.5).heightOfString(opcion.gratuidades, { width: 455 }) + 26;
    y = conSitio(doc, y, alto);
    doc.roundedRect(50, y, 495, alto, 4).fillAndStroke("#FFF9EC", AMBER);
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED);
    doc.text("GRATUIDADES", 64, y + 8, { characterSpacing: 0.6 });
    doc.font("Helvetica").fontSize(9.5).fillColor(INK);
    doc.text(opcion.gratuidades, 64, doc.y + 2, { width: 455 });
    y += alto + 8;
  }

  for (const [titulo, condiciones] of [
    ["Qué incluye y condiciones", opcion.condiciones],
    ["Observaciones", opcion.observaciones],
  ] as Array<[string, Condicion[]]>) {
    if (condiciones.length === 0) continue;

    y = conSitio(doc, y, 34);
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED);
    doc.text(titulo.toUpperCase(), 50, y, { characterSpacing: 0.6 });
    y = doc.y + 3;

    for (const condicion of condiciones) {
      const completa = condicion.etiqueta
        ? `${condicion.etiqueta}: ${condicion.texto}`
        : condicion.texto;
      y = conSitio(doc, y, doc.font("Helvetica").fontSize(9.5).heightOfString(completa, { width: 485 }));

      doc.font("Helvetica").fontSize(9.5).fillColor(MUTED);
      doc.text("·", 50, y, { width: 8 });

      if (condicion.etiqueta) {
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK);
        doc.text(`${condicion.etiqueta}: `, 60, y, { continued: true });
        doc.font("Helvetica").fillColor(INK).text(condicion.texto, { width: 485 });
      } else {
        doc.font("Helvetica").fontSize(9.5).fillColor(INK);
        doc.text(condicion.texto, 60, y, { width: 485 });
      }

      y = doc.y + 2;
    }

    y += 6;
  }

  // Las actividades NO van aqui. Tienen su propia seccion, porque el programa
  // se elige una vez para todo el viaje y repetirlo bajo cada hotel obligaba a
  // leer tres veces lo mismo para comparar tres alojamientos.

  doc.moveTo(50, y + 2).lineTo(545, y + 2).lineWidth(1).strokeColor(HAIRLINE).stroke();
  return y + 18;
}

/** Las actividades del viaje: la segunda de las tres partes del documento. */
function drawActividades(doc: PDFKit.PDFDocument, actividades: ActividadesParaElCliente, top: number, numero: number): number {
  let y = top;

  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
  doc.text(`${numero} · LAS ACTIVIDADES`, 50, y, { characterSpacing: 0.8 });
  y = doc.y + 4;

  doc.font("Helvetica").fontSize(9).fillColor(MUTED);
  doc.text(actividades.intro, 50, y, { width: 495 });
  y = doc.y + 12;

  for (const actividad of actividades.lista) {
    // Un salto de página a media actividad separa el nombre de su precio.
    y = conSitio(doc, y, 46);

    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK);
    doc.text(actividad.nombre, 50, y, { width: 340 });
    for (const linea of actividad.lineas) {
      doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
      doc.text(`·  ${linea}`, 50, doc.y + 1, { width: 340 });
    }
    const finDelNombre = doc.y;

    if (actividad.precio) {
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK);
      doc.text(actividad.precio, 400, y, { width: 145, align: "right" });
      for (const debajo of [actividad.profesores, actividad.grupo]) {
        if (!debajo) continue;
        doc.font("Helvetica").fontSize(8).fillColor(MUTED);
        doc.text(debajo, 400, doc.y + 1, { width: 145, align: "right" });
      }
    }

    y = Math.max(finDelNombre, doc.y) + 2;

    if (actividad.detalle) {
      doc.font("Helvetica").fontSize(9).fillColor(MUTED);
      doc.text(actividad.detalle, 50, y, { width: 340 });
      y = doc.y;
    }

    if (actividad.descripcion) {
      doc.font("Helvetica").fontSize(9).fillColor(INK);
      doc.text(actividad.descripcion, 50, y + 3, { width: 340 });
      y = doc.y;
    }

    y += 12;
  }

  y = conSitio(doc, y, 44);
  doc.moveTo(50, y).lineTo(545, y).lineWidth(1).strokeColor(HAIRLINE).stroke();
  y += 8;

  doc.font("Helvetica-Bold").fontSize(10).fillColor(INK);
  doc.text("Total de las actividades", 50, y, { width: 240 });
  doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY);
  doc.text(actividades.total, 300, y, { width: 245, align: "right" });
  y = doc.y + 2;

  if (actividades.totalDetalle) {
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
    doc.text(actividades.totalDetalle, 50, y, { width: 495, align: "right" });
    y = doc.y;
  }

  return y + 16;
}

/** El resumen del viaje, al final: qué cuesta cada opción entera. */
function drawResumen(doc: PDFKit.PDFDocument, resumen: ResumenParaElCliente, top: number): number {
  let y = top;

  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
  doc.text("3 · RESUMEN DEL VIAJE", 50, y, { characterSpacing: 0.8 });
  y = doc.y + 8;

  // Cabecera de la tabla.
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED);
  doc.text("OPCIÓN", 50, y, { width: 190 });
  doc.text("ALOJAMIENTO", 240, y, { width: 95, align: "right" });
  doc.text("ACTIVIDADES", 340, y, { width: 95, align: "right" });
  doc.text("TOTAL DEL VIAJE", 440, y, { width: 105, align: "right" });
  y = doc.y + 4;
  doc.moveTo(50, y).lineTo(545, y).lineWidth(1).strokeColor(HAIRLINE).stroke();
  y += 8;

  for (const fila of resumen.filas) {
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK);
    doc.text(`${fila.optionNumber}. ${fila.nombre}`, 50, y, {
      width: 185,
      lineBreak: false,
      ellipsis: true,
    });

    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED);
    doc.text(fila.alojamiento, 240, y, { width: 95, align: "right" });
    doc.text(fila.actividades, 340, y, { width: 95, align: "right" });

    // Mismo tamaño que las otras dos columnas: con uno mayor, pdfkit baja la
    // línea base y el total se dibujaba un renglón por debajo de su fila.
    // Destaca por el peso y el color, que es suficiente.
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(NAVY);
    doc.text(fila.total, 440, y, { width: 105, align: "right" });

    y += 16;

    if (fila.porAlumno) {
      doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
      doc.text(fila.porAlumno, 440, y, { width: 105, align: "right" });
      y += 14;
    }
  }

  doc.moveTo(50, y + 2).lineTo(545, y + 2).lineWidth(2).strokeColor(AMBER).stroke();
  y += 12;

  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
  doc.text(resumen.nota, 50, y, { width: 495 });

  return doc.y + 10;
}

/**
 * Las notas de la propuesta, al final del documento, antes de cómo aceptarla.
 * Es texto libre que escribió quien cotiza para el cliente: se imprime tal cual,
 * respetando los saltos de línea.
 */
function drawNotas(doc: PDFKit.PDFDocument, notas: string, top: number): number {
  let y = top;
  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
  doc.text("NOTAS", 50, y, { characterSpacing: 0.8 });
  y = doc.y + 6;
  doc.font("Helvetica").fontSize(9.5).fillColor(INK);
  doc.text(notas, 50, y, { width: 495, lineGap: 2 });
  return doc.y + 12;
}

/**
 * Importes del resumen: con céntimos y con el punto de los miles SIEMPRE.
 *
 * El español no agrupa los números de cuatro cifras, así que sin forzarlo una
 * columna salía «5520,00 €» encima de «11.016,00 €». En una tabla de importes
 * que se comparan de un vistazo, eso se lee mal.
 */
function formatMoney(amount: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: "always",
  }).format(amount);
}

/**
 * El pie, en TODAS las páginas y sin crear ninguna.
 *
 * Escribir a 790 pt en un A4 con margen inferior de 50 cae DENTRO del margen,
 * y pdfkit reacciona a eso pasando de página: el pie de cada página acababa
 * dibujado en una página nueva y vacía. Una propuesta de dos páginas salía con
 * cuatro, dos de ellas en blanco con un pie que además decía «Página 1 de 2».
 *
 * Se anula el margen inferior mientras se dibuja y se pide `lineBreak: false`,
 * que es la forma de decirle a pdfkit que esto no fluye.
 */
function drawFooter(doc: PDFKit.PDFDocument, input: PdfInput): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);

    const margenInferior = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
    doc.text(
      `${departmentLabel(input.department)}  ·  ${input.reference}  ·  Página ${i - range.start + 1} de ${range.count}`,
      50,
      doc.page.height - 40,
      { width: 495, align: "center", lineBreak: false },
    );

    doc.page.margins.bottom = margenInferior;
  }
}

/** Genera el PDF y devuelve la ruta donde ha quedado guardado. */
export async function buildProposalPdf(input: PdfInput): Promise<string> {
  const folder = path.join(STORAGE_ROOT, input.reference);
  fs.mkdirSync(folder, { recursive: true });
  const filePath = path.join(folder, `Propuesta-${input.reference}.pdf`);
  // Se escribe en un fichero aparte y solo al final se pone en su sitio. Quien
  // abre «Ver el documento» mientras otra persona lo rehace (05/11/2026) nunca
  // se encuentra un PDF a medias, y dos escrituras simultáneas no se mezclan.
  const provisional = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;

  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  const stream = fs.createWriteStream(provisional);
  doc.pipe(stream);

  let y = drawHeader(doc, input);
  y = drawTripSummary(doc, input, y);

  const documento = documentoParaElCliente(input);

  // Solo actividades: no hay alojamientos que enseñar (Ruth, 02/11/2026).
  if (documento.opciones.length > 0) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
    doc.text("1 · LOS ALOJAMIENTOS", 50, y, { characterSpacing: 0.8 });
    y = doc.y + 3;
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    doc.text("Elige una de estas opciones. El precio incluye las noches del grupo completo.", 50, y, {
      width: 495,
    });
    y = doc.y + 10;
  }

  for (const opcion of documento.opciones) {
    // 190 pt es el alto mínimo razonable de un bloque de opción con desglose.
    if (y > 620) {
      doc.addPage();
      y = 60;
    }
    y = drawOption(doc, opcion, y);
  }

  // Las actividades, una sola vez, entre los alojamientos y el resumen.
  if (documento.actividades) {
    if (y > 600) {
      doc.addPage();
      y = 60;
    }
    y = drawActividades(doc, documento.actividades, y, documento.opciones.length > 0 ? 2 : 1) + 4;
  }

  // El resumen va al final, cuando ya se han visto las opciones enteras.
  // 130 pt es lo que ocupa con tres opciones; si no cabe, a la página siguiente.
  if (documento.resumen) {
    if (y > 620) {
      doc.addPage();
      y = 60;
    }
    y = drawResumen(doc, documento.resumen, y) + 8;
  }

  // Las notas de quien cotiza. Pueden ser largas: si no caben, a otra página.
  if (documento.notas) {
    const alto = doc.heightOfString(documento.notas, { width: 495, lineGap: 2 }) + 30;
    if (y + alto > 740) {
      doc.addPage();
      y = 60;
    }
    y = drawNotas(doc, documento.notas, y);
  }

  if (input.publicUrl) {
    if (y > 660) {
      doc.addPage();
      y = 60;
    }
    doc.roundedRect(50, y, 495, 54, 6).fillAndStroke("#FFF9EC", AMBER);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(INK);
    const sinAlojamiento = documento.opciones.length === 0;
    doc.text(sinAlojamiento ? "Para aceptar la propuesta" : "Para aceptar una opción", 64, y + 12);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    doc.text(
      sinAlojamiento
        ? `Entra en ${input.publicUrl} y pulsa «Aceptar la propuesta».`
        : `Entra en ${input.publicUrl} y pulsa la que prefieras.`,
      64,
      y + 28,
      { width: 460 },
    );
    y += 66;
  }

  if (input.preparedBy) {
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    doc.text(`Preparada por ${input.preparedBy}`, 50, y + 4, { width: 495 });
  }

  drawFooter(doc, input);
  doc.end();

  try {
    await new Promise<void>((resolve, reject) => {
      stream.on("finish", () => resolve());
      stream.on("error", reject);
    });
    fs.renameSync(provisional, filePath);
  } catch (error) {
    fs.rmSync(provisional, { force: true });
    throw error;
  }

  return path.relative(process.cwd(), filePath);
}
