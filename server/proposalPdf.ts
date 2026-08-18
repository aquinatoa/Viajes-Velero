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

export interface PdfOption {
  optionNumber: number;
  accommodationName: string;
  boardType?: string | null;
  nights?: number | null;
  participants?: number | null;
  teachers?: number | null;
  totalPvpText?: string | null;
  priceBreakdownText?: string | null;
  conditionsText?: string | null;
  observationsText?: string | null;
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

  for (const [label, text] of [
    ["Desglose", option.priceBreakdownText],
    ["Incluye y condiciones", option.conditionsText],
    ["Observaciones", option.observationsText],
  ] as Array<[string, string | null | undefined]>) {
    if (!text) continue;
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED);
    doc.text(label.toUpperCase(), 50, y, { characterSpacing: 0.6 });
    doc.font("Helvetica").fontSize(9.5).fillColor(INK);
    doc.text(text, 50, doc.y + 2, { width: 495 });
    y = doc.y + 8;
  }

  doc.moveTo(50, y + 2).lineTo(545, y + 2).lineWidth(1).strokeColor(HAIRLINE).stroke();
  return y + 18;
}

function drawFooter(doc: PDFKit.PDFDocument, input: PdfInput): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
    doc.text(
      `${departmentLabel(input.department)}  ·  ${input.reference}  ·  Página ${i - range.start + 1} de ${range.count}`,
      50,
      790,
      { width: 495, align: "center" },
    );
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
  doc.text("ELIGE UNA DE ESTAS OPCIONES", 50, y, { characterSpacing: 0.8 });
  y = doc.y + 10;

  for (const option of input.options) {
    // 190 pt es el alto mínimo razonable de un bloque de opción con desglose.
    if (y > 620) {
      doc.addPage();
      y = 60;
    }
    y = drawOption(doc, option, y);
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
