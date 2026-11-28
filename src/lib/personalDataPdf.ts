import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { toWinAnsi, toWinAnsiTidy, truncateToWidth, wrapText } from "@/lib/pdfText";
import {
  LETTERHEAD_COLORS as C,
  beginLetterheadPage,
  drawRoundedRect,
  drawTableHeaderRow,
  finishLetterhead,
  layoutFor,
  letterheadContact,
  letterheadTagline,
  loadLetterhead,
  watermarkWord,
  type Letterhead,
  type LetterheadSpec,
} from "@/lib/pdfLetterhead";

// "Your data at MoveRestore": the copy a patient, therapist or hospital
// partner downloads from their profile (Phase 3, right of access). A
// designed document, not a dump: the shared letterhead (pdfLetterhead.ts) with
// who it is for, a row of figures, then one section per kind of record --
// label/value pairs for details, tables with a repeating header for lists.
//
// This module only lays out what it is given (PersonalDataDoc); what goes in
// is decided per role by src/lib/personalDataExportServer.ts. pdf-lib's
// standard fonts, like the health profile PDF, so every string passes
// through toWinAnsi.

export type PersonalDataField = [label: string, value: string];

export type PersonalDataColumn = {
  label: string;
  /** Share of the content width, 0-1. The columns of a table add up to 1. */
  width: number;
  align?: "left" | "right";
};

export type PersonalDataBlock =
  | { kind: "fields"; rows: PersonalDataField[] }
  | { kind: "table"; columns: PersonalDataColumn[]; rows: string[][]; empty: string }
  | { kind: "text"; text: string }
  | { kind: "note"; text: string };

export type PersonalDataSection = { heading: string; intro?: string; blocks: PersonalDataBlock[] };

export type PersonalDataDoc = {
  siteName: string;
  personName: string;
  roleLabel: string;
  /** EXP-XXXXXX, also recorded in data_requests. */
  reference: string;
  /** Already formatted in the clinic's zone. */
  generatedAtLabel: string;
  /** Up to four headline figures shown under the cover band. */
  figures: { label: string; value: string }[];
  /** Where to write about the data in this document. */
  contactEmail: string;
  /** Settings' tagline and phone, for the letterhead. */
  tagline?: string | null;
  contactPhone?: string | null;
  /** The clinic's own address for the footer (contactEmail above is where to
   *  write about this document, which can be a different mailbox). */
  clinicEmail?: string | null;
  /** The person's own code (PT.., TH.., HS..), shown in the header. */
  personCode?: string | null;
  sections: PersonalDataSection[];
};

const LAYOUT = layoutFor("portrait");
const M = LAYOUT.left;
const CW = LAYOUT.contentWidth;

const TEAL_DARK = rgb(0.043, 0.231, 0.216); // #0b3b37, note text
const TEAL_TINT = C.tealTint;
const INK = C.ink;
const BODY = C.body;
const MUTED = C.muted;
const RULE = C.rule;
const ZEBRA = C.card;

type Fonts = Letterhead;

class Layout {
  pages: PDFPage[] = [];
  y = 0;
  constructor(private doc: PDFDocument, private f: Fonts, private spec: LetterheadSpec) {}

  get page(): PDFPage {
    return this.pages[this.pages.length - 1];
  }

  /** A new page with the letterhead's header; the first also carries the
   *  title block. */
  addPage() {
    const begun = beginLetterheadPage(this.doc, this.f, this.spec, this.pages.length === 0);
    this.pages.push(begun.page);
    this.y = begun.y;
  }

  /** Room for `h` more points on this page, or a new page. */
  need(h: number): boolean {
    if (this.y - h < LAYOUT.bottom) {
      this.addPage();
      return true;
    }
    return false;
  }

  text(t: string, opts: { x?: number; size: number; font?: PDFFont; color?: RGB; width?: number; lineGap?: number }) {
    const font = opts.font ?? this.f.regular;
    const width = opts.width ?? CW;
    const lh = opts.size * (opts.lineGap ?? 1.45);
    for (const line of wrapText(toWinAnsi(t), font, opts.size, width)) {
      this.need(lh);
      this.page.drawText(line, { x: opts.x ?? M, y: this.y - opts.size, size: opts.size, font, color: opts.color ?? BODY });
      this.y -= lh;
    }
  }
}

/** The figures under the title block and the line saying what this is. */
function drawIntro(l: Layout, f: Fonts, d: PersonalDataDoc) {
  const page = l.page;
  const figures = d.figures.slice(0, 4);
  if (figures.length) {
    const gap = 10;
    const tw = (CW - gap * (figures.length - 1)) / figures.length;
    const th = 56;
    l.need(th + 16);
    figures.forEach((fig, i) => {
      const x = M + i * (tw + gap);
      drawRoundedRect(page, x, l.y, tw, th, 8, C.card);
      // Shrinks to fit rather than cutting a date short; truncates only below 10pt.
      const value = toWinAnsi(fig.value);
      let size = 16;
      while (size > 10 && f.display.widthOfTextAtSize(value, size) > tw - 24) size -= 1;
      page.drawText(truncateToWidth(value, f.display, size, tw - 24), { x: x + 12, y: l.y - 27, size, font: f.display, color: INK });
      page.drawText(truncateToWidth(toWinAnsi(fig.label), f.regular, 7.6, tw - 24), { x: x + 12, y: l.y - 44, size: 7.6, font: f.regular, color: MUTED });
    });
    l.y -= th + 18;
  }

  l.text(
    `This is a copy of the personal data ${d.siteName} holds about you, as of the date above. ` +
      `It is yours to keep. If anything here is wrong, you can correct most of it from your profile, ` +
      `or write to ${d.contactEmail} quoting the reference above.`,
    { size: 8.8, color: BODY }
  );
  l.y -= 6;
}

function drawSectionHeading(l: Layout, f: Fonts, s: PersonalDataSection) {
  l.need(52);
  l.y -= 10;
  l.page.drawText(toWinAnsi(s.heading), { x: M, y: l.y - 12, size: 12, font: f.display, color: INK });
  l.y -= 20;
  l.page.drawLine({ start: { x: M, y: l.y + 4 }, end: { x: LAYOUT.right, y: l.y + 4 }, thickness: 0.75, color: RULE });
  l.y -= 4;
  if (s.intro) l.text(s.intro, { size: 8.4, color: MUTED });
  l.y -= 4;
}

function drawFields(l: Layout, f: Fonts, rows: PersonalDataField[]) {
  const labelW = 130;
  const valueW = CW - labelW - 12;
  for (const [label, value] of rows) {
    const lines = wrapText(toWinAnsi(value || "-"), f.regular, 9.5, valueW);
    const h = Math.max(1, lines.length) * 13.5 + 8;
    l.need(h);
    l.page.drawText(truncateToWidth(toWinAnsi(label), f.regular, 9, labelW), { x: M, y: l.y - 12, size: 9, font: f.regular, color: MUTED });
    lines.forEach((line, i) => {
      l.page.drawText(line, { x: M + labelW + 12, y: l.y - 12 - i * 13.5, size: 9.5, font: f.regular, color: INK });
    });
    l.y -= h;
    l.page.drawLine({ start: { x: M, y: l.y + 3 }, end: { x: LAYOUT.right, y: l.y + 3 }, thickness: 0.5, color: RULE });
  }
}

function drawTable(l: Layout, f: Fonts, block: Extract<PersonalDataBlock, { kind: "table" }>) {
  const pad = 6;
  const widths = block.columns.map((c) => c.width * CW);
  const header = () => {
    l.need(22);
    drawTableHeaderRow(l.page, M, l.y, CW, 18);
    let x = M;
    block.columns.forEach((c, i) => {
      const label = truncateToWidth(toWinAnsi(c.label.toUpperCase()), f.bold, 6.6, widths[i] - pad * 2);
      const tx = c.align === "right" ? x + widths[i] - pad - f.bold.widthOfTextAtSize(label, 6.6) : x + pad;
      l.page.drawText(label, { x: tx, y: l.y - 12, size: 6.6, font: f.bold, color: MUTED });
      x += widths[i];
    });
    l.y -= 18;
  };

  if (block.rows.length === 0) {
    l.need(28);
    l.page.drawRectangle({ x: M, y: l.y - 24, width: CW, height: 24, color: ZEBRA });
    l.page.drawText(toWinAnsi(block.empty), { x: M + pad, y: l.y - 15, size: 9, font: f.regular, color: MUTED });
    l.y -= 30;
    return;
  }

  header();
  block.rows.forEach((row) => {
    const cells = block.columns.map((c, i) => wrapText(toWinAnsi(row[i] ?? "-"), f.regular, 8.5, widths[i] - pad * 2));
    const lines = Math.max(1, ...cells.map((c) => c.length));
    const h = lines * 12 + 8;
    if (l.need(h)) header();
    l.page.drawRectangle({ x: M, y: l.y - h + 1.5, width: CW, height: h - 1.5, color: ZEBRA });
    let x = M;
    block.columns.forEach((c, i) => {
      cells[i].forEach((line, j) => {
        const tx = c.align === "right" ? x + widths[i] - pad - f.regular.widthOfTextAtSize(line, 8.5) : x + pad;
        l.page.drawText(line, { x: tx, y: l.y - 12 - j * 12, size: 8.5, font: f.regular, color: INK });
      });
      x += widths[i];
    });
    l.y -= h;
  });
  l.page.drawLine({ start: { x: M, y: l.y }, end: { x: LAYOUT.right, y: l.y }, thickness: 0.6, color: RULE });
  l.y -= 8;
}

function drawNote(l: Layout, f: Fonts, text: string) {
  const lines = wrapText(toWinAnsi(text), f.regular, 8.5, CW - 24);
  const h = lines.length * 12 + 14;
  l.need(h);
  l.page.drawRectangle({ x: M, y: l.y - h, width: CW, height: h, color: TEAL_TINT });
  lines.forEach((line, i) => {
    l.page.drawText(line, { x: M + 12, y: l.y - 16 - i * 12, size: 8.5, font: f.regular, color: TEAL_DARK });
  });
  l.y -= h + 8;
}

export async function buildPersonalDataPdf(d: PersonalDataDoc): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(toWinAnsi(`Your data - ${d.siteName}`));
  doc.setAuthor(toWinAnsi(d.siteName));
  doc.setSubject(toWinAnsi(`Personal data held about ${d.personName}`));
  const fonts = await loadLetterhead(doc);
  const personName = toWinAnsiTidy(d.personName, "You");
  const spec: LetterheadSpec = {
    orientation: "portrait",
    siteName: d.siteName,
    tagline: letterheadTagline(d.tagline),
    contact: letterheadContact({ contactEmail: d.clinicEmail, contactPhone: d.contactPhone }),
    facts: [
      { label: "Name", value: personName },
      { label: "Role", value: d.roleLabel },
      ...(d.personCode ? [{ label: "ID", value: d.personCode }] : []),
      { label: "Ref", value: d.reference },
    ],
    createdLabel: "EXPORT CREATED ON :",
    createdOn: d.generatedAtLabel,
    reportLabel: "DOCUMENT :",
    title: "Your data",
    subtitle: toWinAnsiTidy(`Prepared for ${d.personName} - ${d.roleLabel}`, `Prepared for you - ${d.roleLabel}`),
    watermark: watermarkWord("Your data"),
    notice: `Confidential - personal data of ${personName}. Keep it private.`,
  };
  const l = new Layout(doc, fonts, spec);
  l.addPage();
  drawIntro(l, fonts, d);
  for (const section of d.sections) {
    drawSectionHeading(l, fonts, section);
    for (const block of section.blocks) {
      if (block.kind === "fields") drawFields(l, fonts, block.rows);
      else if (block.kind === "table") drawTable(l, fonts, block);
      else if (block.kind === "note") drawNote(l, fonts, block.text);
      else l.text(block.text, { size: 8.8 });
    }
  }
  finishLetterhead(l.pages, fonts, spec);
  return doc.save();
}
