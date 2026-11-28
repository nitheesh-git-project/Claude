import { PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import { toWinAnsi, truncateToWidth } from "@/lib/pdfText";
import {
  LETTERHEAD_COLORS as C,
  beginLetterheadPage,
  drawTableHeaderRow,
  finishLetterhead,
  layoutFor,
  letterheadContact,
  letterheadTagline,
  loadLetterhead,
  watermarkWord,
  type LetterheadSpec,
} from "@/lib/pdfLetterhead";

// The printable half of every admin data export. The same rows the admin
// is looking at go out as CSV (for a spreadsheet) or as this (for a person
// -- a partner, an accountant, a file). Both are built from one column
// definition at the call site, so the two formats can't drift apart.
//
// Landscape A4: these tables are wide, and a portrait page would truncate
// half the columns to fit. The page furniture (logo lockup, title block,
// footer band, the word up the edge) is the shared letterhead in
// pdfLetterhead.ts; this file only lays out the table inside it.

const LAYOUT = layoutFor("landscape");
const CONTENT_WIDTH = LAYOUT.contentWidth;
const ROW_HEIGHT = 16;
const HEADER_HEIGHT = 20;
const BODY_SIZE = 7.8;
const HEADER_SIZE = 6.4;
const CELL_PADDING = 5;
const ROW_GAP = 1.5;

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
  /**
   * Who asked for it.
   *
   * This route typesets rows the browser sent, deliberately -- that is what
   * guarantees the CSV and the PDF are the same table rather than two
   * queries that might disagree, and it means the route discloses nothing
   * the caller did not already have.
   *
   * What it does not guarantee is that the rows are the clinic's. An admin
   * could post anything and get back a document carrying the clinic's name,
   * which for a *financial* export is worth closing the honest way: the
   * document says who generated it. Attribution rather than verification,
   * because verification would mean re-querying and losing the agreement
   * between the two formats.
   */
  generatedBy?: string | null;
  /** Settings' tagline and contact details for the letterhead; the clinic's
   *  own are used when absent. */
  tagline?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  /** One line printed under the stamp saying what this document is (and is
   *  not), so a reproduction of a screen is not mistaken for the books. */
  provenance?: string | null;
};

/** Column widths from the widest cell in each column, scaled to the page.
 *  Sampled over the first 200 rows: measuring every cell of a 5,000-row
 *  export costs more than it improves the layout. */
function columnWidths(input: TablePdfInput, font: PDFFont, headerFont: PDFFont): number[] {
  const sample = input.rows.slice(0, 200);
  const natural = input.columns.map((header, index) => {
    let widest = headerFont.widthOfTextAtSize(toWinAnsi(header).toUpperCase(), HEADER_SIZE) + 2;
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

const NUMBER = /^-?[\d,]+(\.\d+)?$/;

/** Money and counts line up on the right, text on the left. */
function numericColumns(input: TablePdfInput): boolean[] {
  return input.columns.map((header, index) => {
    if (/\(INR\)/i.test(header)) return true;
    const sample = input.rows.slice(0, 50).map((r) => (r[index] ?? "").trim()).filter(Boolean);
    return sample.length > 0 && sample.every((cell) => NUMBER.test(cell));
  });
}

function clinicStamp(date: Date): string {
  return `${date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  })} IST`;
}

function exportReference(date: Date): string {
  const day = date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }).replace(/-/g, "");
  const time = date
    .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })
    .replace(":", "");
  return `MR-EXP-${day}-${time}`;
}

export async function buildTablePdf(input: TablePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const kit = await loadLetterhead(doc);
  const widths = columnWidths(input, kit.regular, kit.bold);
  const numeric = numericColumns(input);

  doc.setTitle(toWinAnsi(input.title));
  doc.setCreator(input.siteName);
  doc.setProducer(input.siteName);

  const spec: LetterheadSpec = {
    orientation: "landscape",
    siteName: input.siteName,
    tagline: letterheadTagline(input.tagline),
    contact: letterheadContact({ contactEmail: input.contactEmail, contactPhone: input.contactPhone }),
    // Only when known, so nothing prints "Generated by null".
    facts: [
      ...(input.generatedBy ? [{ label: "Generated by", value: input.generatedBy }] : []),
      { label: "Rows", value: input.rows.length.toLocaleString("en-IN") },
      { label: "Ref", value: exportReference(input.generatedAt) },
    ],
    createdLabel: "EXPORT CREATED ON :",
    createdOn: clinicStamp(input.generatedAt),
    reportLabel: "REPORT :",
    title: input.title,
    subtitle: input.subtitle,
    watermark: watermarkWord(input.title),
    notice: input.provenance || "Confidential - contains clinic records. Handle as private information.",
  };

  let page!: PDFPage;
  let y = 0;
  const pages: PDFPage[] = [];

  const cellX = (index: number, text: string, font: PDFFont, size: number): number => {
    let x = LAYOUT.left;
    for (let i = 0; i < index; i++) x += widths[i];
    if (!numeric[index]) return x + CELL_PADDING;
    return x + widths[index] - CELL_PADDING - font.widthOfTextAtSize(text, size);
  };

  const drawHeaderRow = () => {
    // Outlined, not filled: a hairline above and below, small grey capitals.
    drawTableHeaderRow(page, LAYOUT.left, y, CONTENT_WIDTH, HEADER_HEIGHT);
    y -= HEADER_HEIGHT;
    input.columns.forEach((header, index) => {
      const text = truncateToWidth(toWinAnsi(header).toUpperCase(), kit.bold, HEADER_SIZE, widths[index] - CELL_PADDING * 2);
      page.drawText(text, { x: cellX(index, text, kit.bold, HEADER_SIZE), y: y + 7, size: HEADER_SIZE, font: kit.bold, color: C.muted });
    });
    y -= ROW_GAP;
  };

  const startPage = (first: boolean) => {
    const begun = beginLetterheadPage(doc, kit, spec, first);
    page = begun.page;
    y = begun.y;
    pages.push(page);
    // The header row repeats on every page: a printed table whose columns
    // are only labelled on page 1 is unreadable from page 2 onward.
    drawHeaderRow();
  };

  startPage(true);

  input.rows.forEach((row) => {
    if (y - ROW_HEIGHT < LAYOUT.bottom) startPage(false);
    y -= ROW_HEIGHT;
    page.drawRectangle({ x: LAYOUT.left, y: y + ROW_GAP / 2, width: CONTENT_WIDTH, height: ROW_HEIGHT - ROW_GAP, color: C.card });
    row.forEach((cell, index) => {
      if (index >= input.columns.length) return;
      const text = truncateToWidth(toWinAnsi(cell ?? ""), kit.regular, BODY_SIZE, widths[index] - CELL_PADDING * 2);
      page.drawText(text, { x: cellX(index, text, kit.regular, BODY_SIZE), y: y + 5.4, size: BODY_SIZE, font: kit.regular, color: C.ink });
    });
  });

  if (input.rows.length === 0) {
    y -= ROW_HEIGHT;
    page.drawText("No rows matched the filters in view.", {
      x: LAYOUT.left + CELL_PADDING,
      y: y + 5,
      size: BODY_SIZE,
      font: kit.regular,
      color: C.muted,
    });
  }

  finishLetterhead(pages, kit, spec);
  return doc.save();
}
