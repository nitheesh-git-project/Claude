import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { toWinAnsi, toWinAnsiTidy, truncateToWidth, wrapText } from "@/lib/pdfText";

// "Your data at MoveRestore": the copy a patient, therapist or hospital
// partner downloads from their profile (Phase 3, right of access). A
// designed document, not a dump: a teal cover band with who it is for, a row
// of figures, then one section per kind of record -- label/value pairs for
// details, tables with a repeating header for lists -- and a footer on every
// page saying whose data it is.
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
  sections: PersonalDataSection[];
};

const W = 595.28; // A4 portrait, points
const H = 841.89;
const M = 48;
const CW = W - M * 2;

const TEAL = rgb(0.059, 0.463, 0.431); // #0f766e
const TEAL_DARK = rgb(0.043, 0.231, 0.216); // #0b3b37
const MINT = rgb(0.369, 0.918, 0.831); // #5eead4
const TEAL_TINT = rgb(0.941, 0.992, 0.98); // #f0fdfa
const INK = rgb(0.059, 0.09, 0.165); // #0f172a
const BODY = rgb(0.2, 0.255, 0.333); // #334155
const MUTED = rgb(0.392, 0.455, 0.545); // #64748b
const RULE = rgb(0.886, 0.91, 0.941); // #e2e8f0
const ZEBRA = rgb(0.973, 0.98, 0.988); // #f8fafc
const HEAD_BG = rgb(0.945, 0.961, 0.976); // #f1f5f9
const WHITE = rgb(1, 1, 1);

const FOOTER_SPACE = 44;
const HEADER_SPACE = 64;

type Fonts = { regular: PDFFont; bold: PDFFont };

class Layout {
  pages: PDFPage[] = [];
  y = 0;
  constructor(private doc: PDFDocument, private f: Fonts, private meta: PersonalDataDoc) {}

  get page(): PDFPage {
    return this.pages[this.pages.length - 1];
  }

  /** A continuation page: a slim running header, then content. */
  addPage() {
    const page = this.doc.addPage([W, H]);
    this.pages.push(page);
    if (this.pages.length > 1) {
      page.drawText(toWinAnsi(`Your data at ${this.meta.siteName}`), {
        x: M, y: H - 34, size: 8.5, font: this.f.bold, color: TEAL,
      });
      const who = toWinAnsiTidy(this.meta.personName, "You");
      const ww = this.f.regular.widthOfTextAtSize(who, 8.5);
      page.drawText(who, { x: W - M - ww, y: H - 34, size: 8.5, font: this.f.regular, color: MUTED });
      page.drawLine({ start: { x: M, y: H - 44 }, end: { x: W - M, y: H - 44 }, thickness: 0.6, color: RULE });
      this.y = H - HEADER_SPACE;
    }
  }

  /** Room for `h` more points on this page, or a new page. */
  need(h: number): boolean {
    if (this.y - h < FOOTER_SPACE + 12) {
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

function drawCover(l: Layout, f: Fonts, d: PersonalDataDoc) {
  const page = l.page;
  const bandH = 178;
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: TEAL_DARK });
  // A soft accent stripe, the mint of the site's Accept button.
  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: 4, color: MINT });

  page.drawText(toWinAnsi(d.siteName.toUpperCase()), { x: M, y: H - 52, size: 9, font: f.bold, color: MINT });
  page.drawText("Your data", { x: M, y: H - 92, size: 30, font: f.bold, color: WHITE });
  const sub = toWinAnsiTidy(`Prepared for ${d.personName} - ${d.roleLabel}`, `Prepared for you - ${d.roleLabel}`);
  page.drawText(truncateToWidth(sub, f.regular, 12, CW), { x: M, y: H - 118, size: 12, font: f.regular, color: rgb(0.81, 0.914, 0.898) });
  page.drawText(toWinAnsi(`Generated ${d.generatedAtLabel}`), { x: M, y: H - 146, size: 9, font: f.regular, color: rgb(0.81, 0.914, 0.898) });
  const ref = toWinAnsi(`Reference ${d.reference}`);
  const rw = f.bold.widthOfTextAtSize(ref, 9);
  page.drawText(ref, { x: W - M - rw, y: H - 146, size: 9, font: f.bold, color: WHITE });

  l.y = H - bandH - 24;

  // Figures: up to four tiles across.
  const figures = d.figures.slice(0, 4);
  if (figures.length) {
    const gap = 10;
    const tw = (CW - gap * (figures.length - 1)) / figures.length;
    const th = 62;
    figures.forEach((fig, i) => {
      const x = M + i * (tw + gap);
      page.drawRectangle({ x, y: l.y - th, width: tw, height: th, color: TEAL_TINT, borderColor: rgb(0.8, 0.984, 0.945), borderWidth: 0.8 });
      // Shrinks to fit rather than cutting a date short; truncates only below 11pt.
      const value = toWinAnsi(fig.value);
      let size = 18;
      while (size > 11 && f.bold.widthOfTextAtSize(value, size) > tw - 24) size -= 1;
      page.drawText(truncateToWidth(value, f.bold, size, tw - 24), { x: x + 12, y: l.y - 30, size, font: f.bold, color: TEAL_DARK });
      page.drawText(truncateToWidth(toWinAnsi(fig.label), f.regular, 8.5, tw - 24), { x: x + 12, y: l.y - 48, size: 8.5, font: f.regular, color: MUTED });
    });
    l.y -= th + 22;
  }

  l.text(
    `This is a copy of the personal data ${d.siteName} holds about you, as of the date above. ` +
      `It is yours to keep. If anything here is wrong, you can correct most of it from your profile, ` +
      `or write to ${d.contactEmail} quoting the reference above.`,
    { size: 9.5, color: BODY }
  );
  l.y -= 8;
}

function drawSectionHeading(l: Layout, f: Fonts, s: PersonalDataSection) {
  l.need(52);
  l.y -= 14;
  l.page.drawRectangle({ x: M, y: l.y - 14, width: 3, height: 14, color: TEAL });
  l.page.drawText(toWinAnsi(s.heading), { x: M + 10, y: l.y - 12, size: 13, font: f.bold, color: INK });
  l.y -= 22;
  if (s.intro) l.text(s.intro, { size: 9, color: MUTED });
  l.y -= 4;
}

function drawFields(l: Layout, f: Fonts, rows: PersonalDataField[]) {
  const labelW = 150;
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
    l.page.drawLine({ start: { x: M, y: l.y + 3 }, end: { x: W - M, y: l.y + 3 }, thickness: 0.5, color: RULE });
  }
}

function drawTable(l: Layout, f: Fonts, block: Extract<PersonalDataBlock, { kind: "table" }>) {
  const pad = 6;
  const widths = block.columns.map((c) => c.width * CW);
  const header = () => {
    l.need(22);
    l.page.drawRectangle({ x: M, y: l.y - 18, width: CW, height: 18, color: HEAD_BG });
    let x = M;
    block.columns.forEach((c, i) => {
      const label = truncateToWidth(toWinAnsi(c.label.toUpperCase()), f.bold, 7.5, widths[i] - pad * 2);
      const tx = c.align === "right" ? x + widths[i] - pad - f.bold.widthOfTextAtSize(label, 7.5) : x + pad;
      l.page.drawText(label, { x: tx, y: l.y - 12, size: 7.5, font: f.bold, color: MUTED });
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
  block.rows.forEach((row, r) => {
    const cells = block.columns.map((c, i) => wrapText(toWinAnsi(row[i] ?? "-"), f.regular, 8.5, widths[i] - pad * 2));
    const lines = Math.max(1, ...cells.map((c) => c.length));
    const h = lines * 12 + 8;
    if (l.need(h)) header();
    if (r % 2 === 1) l.page.drawRectangle({ x: M, y: l.y - h, width: CW, height: h, color: ZEBRA });
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
  l.page.drawLine({ start: { x: M, y: l.y }, end: { x: W - M, y: l.y }, thickness: 0.6, color: RULE });
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

function drawFooters(l: Layout, f: Fonts, d: PersonalDataDoc) {
  const total = l.pages.length;
  l.pages.forEach((page, i) => {
    page.drawLine({ start: { x: M, y: 34 }, end: { x: W - M, y: 34 }, thickness: 0.5, color: RULE });
    page.drawText(
      truncateToWidth(toWinAnsiTidy(`Confidential - personal data of ${d.personName}`, "Confidential - personal data"), f.regular, 7.5, CW - 80),
      { x: M, y: 22, size: 7.5, font: f.regular, color: MUTED }
    );
    const label = `Page ${i + 1} of ${total}`;
    page.drawText(label, { x: W - M - f.regular.widthOfTextAtSize(label, 7.5), y: 22, size: 7.5, font: f.regular, color: MUTED });
  });
}

export async function buildPersonalDataPdf(d: PersonalDataDoc): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(toWinAnsi(`Your data - ${d.siteName}`));
  doc.setAuthor(toWinAnsi(d.siteName));
  doc.setSubject(toWinAnsi(`Personal data held about ${d.personName}`));
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const l = new Layout(doc, fonts, d);
  l.addPage();
  drawCover(l, fonts, d);
  for (const section of d.sections) {
    drawSectionHeading(l, fonts, section);
    for (const block of section.blocks) {
      if (block.kind === "fields") drawFields(l, fonts, block.rows);
      else if (block.kind === "table") drawTable(l, fonts, block);
      else if (block.kind === "note") drawNote(l, fonts, block.text);
      else l.text(block.text, { size: 9.5 });
    }
  }
  drawFooters(l, fonts, d);
  return doc.save();
}
