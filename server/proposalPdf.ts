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
  publicUrl?: string | null;
  preparedBy?: string | null;
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
  UNKNOWN: "",
  OTROS: "",
};

/** Una condición ya lista para imprimir: su etiqueta y su texto. */
interface Condicion {
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
function condicionesEnLista(texto?: string | null): Condicion[] {
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

      return { etiqueta, texto: conEtiqueta[2].trim() };
    })
    .filter((condicion) => condicion.texto.length > 0);
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

/** Una opción por bloque, numerada como la ve el cliente. */
function drawOption(doc: PDFKit.PDFDocument, option: PdfOption, top: number): number {
  const boxTop = top;
  doc.roundedRect(50, boxTop, 495, 22, 4).fill(NAVY);
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#FFFFFF");
  doc.text(`OPCIÓN ${option.optionNumber}`, 62, boxTop + 6, { characterSpacing: 0.8 });
  if (option.totalPvpText) {
    doc.font("Helvetica-Bold").fontSize(10).fillColor(AMBER);
    doc.text(option.totalPvpText, 350, boxTop + 6, { width: 183, align: "right" });
  }

  let y = boxTop + 32;
  doc.font("Helvetica-Bold").fontSize(12).fillColor(INK);
  doc.text(option.accommodationName, 50, y, { width: 495 });
  y = doc.y + 4;

  const details = [
    option.boardType,
    option.nights ? `${option.nights} noches` : null,
    option.participants ? `${option.participants} participantes` : null,
    option.teachers ? `${option.teachers} profesores` : null,
  ].filter(Boolean);

  if (details.length) {
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED);
    doc.text(details.join("  ·  "), 50, y, { width: 495 });
    y = doc.y + 8;
  }

  if (option.priceBreakdownText) {
    y = conSitio(doc, y, 34);
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED);
    doc.text("DESGLOSE", 50, y, { characterSpacing: 0.6 });
    doc.font("Helvetica").fontSize(9.5).fillColor(INK);
    doc.text(option.priceBreakdownText, 50, doc.y + 2, { width: 495 });
    y = doc.y + 8;
  }

  // Las gratuidades, en su propio recuadro y ANTES de las condiciones: es lo
  // primero que mira un colegio, porque cambia lo que acaba pagando.
  const gratuidades = condicionesEnLista(option.freePolicyText);
  if (gratuidades.length > 0) {
    const texto = gratuidades.map((condicion) => condicion.texto).join(" ");
    const alto = doc.font("Helvetica").fontSize(9.5).heightOfString(texto, { width: 455 }) + 26;
    y = conSitio(doc, y, alto);
    doc.roundedRect(50, y, 495, alto, 4).fillAndStroke("#FFF9EC", AMBER);
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED);
    doc.text("GRATUIDADES", 64, y + 8, { characterSpacing: 0.6 });
    doc.font("Helvetica").fontSize(9.5).fillColor(INK);
    doc.text(texto, 64, doc.y + 2, { width: 455 });
    y += alto + 8;
  }

  for (const [titulo, condiciones] of [
    ["Qué incluye y condiciones", condicionesEnLista(option.conditionsText)],
    ["Observaciones", condicionesEnLista(option.observationsText)],
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

/**
 * Las actividades del viaje: la segunda de las tres partes del documento.
 *
 * El programa se elige una vez para todo el viaje, así que repetirlo bajo cada
 * hotel obligaba a leer tres veces lo mismo para poder comparar tres
 * alojamientos. Aquí va el itinerario entero, una sola vez, y el total de lo
 * que suponen todas las actividades juntas.
 *
 * Si alguna opción lleva un programa distinto, cada actividad dice a qué
 * opciones pertenece. Callarlo sería peor que no ponerlo: el colegio estaría
 * leyendo un itinerario que no le corresponde al hotel que acabe eligiendo.
 */
function drawActividades(doc: PDFKit.PDFDocument, input: PdfInput, top: number): number {
  const personas = (input.participants ?? 0) + (input.teachers ?? 0);

  // Cada actividad una sola vez, con las opciones en las que aparece.
  const porNombre = new Map<string, { actividad: PdfActivity; opciones: number[] }>();
  for (const option of input.options) {
    for (const actividad of option.activities ?? []) {
      const yaEsta = porNombre.get(actividad.name);
      if (yaEsta) yaEsta.opciones.push(option.optionNumber);
      else porNombre.set(actividad.name, { actividad, opciones: [option.optionNumber] });
    }
  }

  const itinerario = [...porNombre.values()];
  if (itinerario.length === 0) return top;

  // ¿El mismo programa en todas las opciones? Entonces no hay nada que aclarar.
  const todasIguales = itinerario.every((entrada) => entrada.opciones.length === input.options.length);

  let y = top;

  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
  doc.text("2 · LAS ACTIVIDADES", 50, y, { characterSpacing: 0.8 });
  y = doc.y + 4;

  doc.font("Helvetica").fontSize(9).fillColor(MUTED);
  doc.text(
    todasIguales
      ? "El mismo programa para todas las opciones de alojamiento. Los precios son por persona."
      : "Cada actividad indica en qué opciones va incluida. Los precios son por persona.",
    50,
    y,
    { width: 495 },
  );
  y = doc.y + 12;

  let porPersona = 0;

  for (const { actividad, opciones } of itinerario) {
    // Un salto de página a media actividad separa el nombre de su precio.
    y = conSitio(doc, y, 46);

    porPersona += actividad.amount ?? 0;

    doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK);
    doc.text(textoParaElCliente(actividad.name), 50, y, { width: 340 });
    const finDelNombre = doc.y;

    if (actividad.priceText) {
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK);
      doc.text(actividad.priceText, 400, y, { width: 145, align: "right" });
      if (personas > 0 && (actividad.amount ?? 0) > 0) {
        doc.font("Helvetica").fontSize(8).fillColor(MUTED);
        doc.text(`${formatMoney((actividad.amount ?? 0) * personas)} el grupo`, 400, doc.y + 1, {
          width: 145,
          align: "right",
        });
      }
    }

    y = finDelNombre + 2;

    const detalle = [
      actividad.provider,
      actividad.duration,
      todasIguales
        ? null
        : `En ${opciones.length === 1 ? "la opción" : "las opciones"} ${opciones.join(", ")}`,
    ]
      .filter(Boolean)
      .join("  ·  ");

    if (detalle) {
      doc.font("Helvetica").fontSize(9).fillColor(MUTED);
      doc.text(textoParaElCliente(detalle), 50, y, { width: 340 });
      y = doc.y;
    }

    if (actividad.description) {
      const descripcion = textoParaElCliente(actividad.description);
      if (descripcion) {
        doc.font("Helvetica").fontSize(9).fillColor(INK);
        doc.text(descripcion, 50, y + 3, { width: 340 });
        y = doc.y;
      }
    }

    y += 12;
  }

  // El total del conjunto: por persona y para el grupo entero. Es la cifra que
  // el colegio suma al alojamiento, así que se da en las dos unidades.
  y = conSitio(doc, y, 44);
  doc.moveTo(50, y).lineTo(545, y).lineWidth(1).strokeColor(HAIRLINE).stroke();
  y += 8;

  doc.font("Helvetica-Bold").fontSize(10).fillColor(INK);
  doc.text("Total de las actividades", 50, y, { width: 240 });
  doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY);
  doc.text(`${formatMoney(porPersona)} por persona`, 300, y, { width: 245, align: "right" });
  y = doc.y + 2;

  if (personas > 0) {
    doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
    doc.text(`${formatMoney(porPersona * personas)} para las ${personas} personas del grupo`, 300, y, {
      width: 245,
      align: "right",
    });
    y = doc.y;
  }

  return y + 16;
}

/**
 * El resumen del viaje, al final: qué cuesta cada opción entera.
 *
 * Hasta ahora el PDF daba el total del alojamiento de cada opción y nada más.
 * Las actividades ni salían, así que el colegio no podía saber qué le cuesta el
 * viaje completo con cada hotel, que es exactamente la decisión que tiene que
 * tomar. Aquí se suma alojamiento + actividades, opción por opción.
 */
function drawResumen(doc: PDFKit.PDFDocument, input: PdfInput, top: number): number {
  const alumnos = input.participants ?? 0;
  const profesores = input.teachers ?? 0;
  const personas = alumnos + profesores;

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

  for (const option of input.options) {
    const alojamiento = option.totalAmount ?? 0;
    // Una actividad se cobra por persona, así que su importe se multiplica por
    // el grupo entero: alumnos y profesores van a la misma excursión.
    const actividadesPorPersona = (option.activities ?? []).reduce(
      (suma, actividad) => suma + (actividad.amount ?? 0),
      0,
    );
    const actividades = actividadesPorPersona * personas;
    const total = alojamiento + actividades;

    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(INK);
    doc.text(`${option.optionNumber}. ${option.accommodationName}`, 50, y, {
      width: 185,
      lineBreak: false,
      ellipsis: true,
    });

    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED);
    doc.text(formatMoney(alojamiento), 240, y, { width: 95, align: "right" });
    doc.text(actividades > 0 ? formatMoney(actividades) : "—", 340, y, { width: 95, align: "right" });

    // Mismo tamaño que las otras dos columnas: con uno mayor, pdfkit baja la
    // línea base y el total se dibujaba un renglón por debajo de su fila.
    // Destaca por el peso y el color, que es suficiente.
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(NAVY);
    doc.text(formatMoney(total), 440, y, { width: 105, align: "right" });

    y += 16;

    if (alumnos > 0) {
      doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
      doc.text(`${formatMoney(total / alumnos)} por alumno`, 440, y, { width: 105, align: "right" });
      y += 14;
    }
  }

  doc.moveTo(50, y + 2).lineTo(545, y + 2).lineWidth(2).strokeColor(AMBER).stroke();
  y += 12;

  doc.font("Helvetica").fontSize(8.5).fillColor(MUTED);
  doc.text(
    `Cada total incluye el alojamiento y las actividades de esa opción, para ${alumnos} alumnos` +
      (profesores > 0 ? ` y ${profesores} profesores` : "") +
      ".",
    50,
    y,
    { width: 495 },
  );

  return doc.y + 10;
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

  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  let y = drawHeader(doc, input);
  y = drawTripSummary(doc, input, y);

  doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
  doc.text("1 · LOS ALOJAMIENTOS", 50, y, { characterSpacing: 0.8 });
  y = doc.y + 3;
  doc.font("Helvetica").fontSize(9).fillColor(MUTED);
  doc.text("Elige una de estas opciones. El precio incluye las noches del grupo completo.", 50, y, {
    width: 495,
  });
  y = doc.y + 10;

  for (const option of input.options) {
    // 190 pt es el alto mínimo razonable de un bloque de opción con desglose.
    if (y > 620) {
      doc.addPage();
      y = 60;
    }
    y = drawOption(doc, option, y);
  }

  // Las actividades, una sola vez, entre los alojamientos y el resumen.
  if (input.options.some((option) => (option.activities ?? []).length > 0)) {
    if (y > 600) {
      doc.addPage();
      y = 60;
    }
    y = drawActividades(doc, input, y) + 4;
  }

  // El resumen va al final, cuando ya se han visto las opciones enteras.
  // 130 pt es lo que ocupa con tres opciones; si no cabe, a la página siguiente.
  if (input.options.length > 0) {
    if (y > 620) {
      doc.addPage();
      y = 60;
    }
    y = drawResumen(doc, input, y) + 8;
  }

  if (input.publicUrl) {
    if (y > 660) {
      doc.addPage();
      y = 60;
    }
    doc.roundedRect(50, y, 495, 54, 6).fillAndStroke("#FFF9EC", AMBER);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(INK);
    doc.text("Para aceptar una opción", 64, y + 12);
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    doc.text(`Entra en ${input.publicUrl} y pulsa la que prefieras.`, 64, y + 28, { width: 460 });
    y += 66;
  }

  if (input.preparedBy) {
    doc.font("Helvetica").fontSize(9).fillColor(MUTED);
    doc.text(`Preparada por ${input.preparedBy}`, 50, y + 4, { width: 495 });
  }

  drawFooter(doc, input);
  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });

  return path.relative(process.cwd(), filePath);
}
