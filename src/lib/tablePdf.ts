import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { toWinAnsi, truncateToWidth } from "@/lib/pdfText";

// The printable half of every admin data export. The same rows the admin
// is looking at go out as CSV (for a spreadsheet) or as this (for a person
// -- a partner, an accountant, a file). Both are built from one column
// definition at the call site, so the two formats can't drift apart.
//
// Landscape A4: these tables are wide, and a portrait page would truncate
// half the columns to fit.

const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 32;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const ROW_HEIGHT = 16;
const HEADER_HEIGHT = 20;
const BODY_SIZE = 8;
const HEADER_SIZE = 8;
const CELL_PADDING = 5;

const INK = rgb(0.11, 0.16, 0.23);
const MUTED = rgb(0.42, 0.48, 0.55);
const RULE = rgb(0.87, 0.89, 0.91);
const HEADER_FILL = rgb(0.95, 0.96, 0.97);
const ZEBRA_FILL = rgb(0.98, 0.98, 0.99);

export type TablePdfInput = {
  siteName: string;
  title: string;
  /** What this table is and what it is scoped to -- the date range, the
   *  filters that were applied. Without it a printed export is a page of
   *  numbers nobody can date. */
  subtitle?: string;
  columns: string[];
  rows: string[][];
  generatedAt: Date;
};

/** Column widths from the widest cell in each column, scaled to the page.
 *  Sampled over the first 200 rows: measuring every cell of a 5,000-row
 *  export costs more than it improves the layout. */
function columnWidths(input: TablePdfInput, font: PDFFont, headerFont: PDFFont): number[] {
  const sample = input.rows.slice(0, 200);
  const natural = input.columns.map((header, index) => {
    let widest = headerFont.widthOfTextAtSize(toWinAnsi(header), HEADER_SIZE);
    for (const row of sample) {
      const width = font.widthOfTextAtSize(toWinAnsi(row[index] ?? ""), BODY_SIZE);
      if (width > widest) widest = width;
    }
    return widest + CELL_PADDING * 2;
  });

  const total = natural.reduce((sum, width) => sum + width, 0);
  if (total <= CONTENT_WIDTH) {
    // Spread the slack proportionally rather than leaving a ragged right
    // edge on a table that would otherwise fit comfortably.
    return natural.map((width) => width * (CONTENT_WIDTH / total));
  }

  // Too wide: give every column a readable floor and squeeze the rest.
  const floor = Math.min(52, CONTENT_WIDTH / input.columns.length);
  const overFloor = natural.map((width) => Math.max(0, width - floor));
  const slack = CONTENT_WIDTH - floor * input.columns.length;
  const overTotal = overFloor.reduce((sum, width) => sum + width, 0);
  if (slack <= 0 || overTotal === 0) return natural.map(() => CONTENT_WIDTH / input.columns.length);
  return overFloor.map((over) => floor + (over / overTotal) * slack);
}

export function tablePdfFilename(base: string, generatedAt: Date): string {
  const safe = toWinAnsi(base).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "export";
  const day = generatedAt.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  return `${safe}-${day}.pdf`;
}

export async function buildTablePdf(input: TablePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const widths = columnWidths(input, font, bold);

  doc.setTitle(toWinAnsi(input.title));
  doc.setCreator(input.siteName);
  doc.setProducer(input.siteName);

  const stamp = `${input.siteName} · ${input.generatedAt.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  })}`;

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = 0;

  const drawHeaderRow = () => {
    y -= HEADER_HEIGHT;
    page.drawRectangle({
      x: MARGIN,
      y,
      width: CONTENT_WIDTH,
      height: HEADER_HEIGHT,
      color: HEADER_FILL,
    });
    let x = MARGIN;
    input.columns.forEach((header, index) => {
      page.drawText(
        truncateToWidth(toWinAnsi(header), bold, HEADER_SIZE, widths[index] - CELL_PADDING * 2),
        { x: x + CELL_PADDING, y: y + 6, size: HEADER_SIZE, font: bold, color: INK }
      );
      x += widths[index];
    });
  };

  const startPage = (first: boolean) => {
    if (!first) page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
    if (first) {
      page.drawText(toWinAnsi(input.title), { x: MARGIN, y: y - 14, size: 15, font: bold, color: INK });
      y -= 20;
      if (input.subtitle) {
        page.drawText(
          truncateToWidth(toWinAnsi(input.subtitle), font, 9, CONTENT_WIDTH),
          { x: MARGIN, y: y - 11, size: 9, font, color: MUTED }
        );
        y -= 15;
      }
      page.drawText(toWinAnsi(stamp), { x: MARGIN, y: y - 10, size: 8, font, color: MUTED });
      y -= 20;
    }
    // The header row repeats on every page: a printed table whose columns
    // are only labelled on page 1 is unreadable from page 2 onward.
    drawHeaderRow();
  };

  startPage(true);

  input.rows.forEach((row, rowIndex) => {
    if (y - ROW_HEIGHT < MARGIN + 14) startPage(false);
    y -= ROW_HEIGHT;
    if (rowIndex % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y, width: CONTENT_WIDTH, height: ROW_HEIGHT, color: ZEBRA_FILL });
    }
    let x = MARGIN;
    row.forEach((cell, index) => {
      if (index >= input.columns.length) return;
      page.drawText(
        truncateToWidth(toWinAnsi(cell ?? ""), font, BODY_SIZE, widths[index] - CELL_PADDING * 2),
        { x: x + CELL_PADDING, y: y + 5, size: BODY_SIZE, font, color: INK }
      );
      x += widths[index];
    });
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: MARGIN + CONTENT_WIDTH, y },
      thickness: 0.4,
      color: RULE,
    });
  });

  if (input.rows.length === 0) {
    y -= ROW_HEIGHT;
    page.drawText("No rows matched the filters in view.", {
      x: MARGIN + CELL_PADDING,
      y: y + 5,
      size: BODY_SIZE,
      font,
      color: MUTED,
    });
  }

  const pages = doc.getPages();
  pages.forEach((p, index) => {
    p.drawText(
      toWinAnsi(`${input.title} — ${input.rows.length} row${input.rows.length === 1 ? "" : "s"} · page ${index + 1} of ${pages.length}`),
      { x: MARGIN, y: MARGIN - 18, size: 7.5, font, color: MUTED }
    );
  });

  return doc.save();
}
