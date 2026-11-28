import { PDFDocument, degrees, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { INTER_REGULAR_TTF_BASE64, INTER_SEMIBOLD_TTF_BASE64, JAKARTA_BOLD_TTF_BASE64 } from "@/lib/pdfFontData";
import { LOGO_MARK_PNG_BASE64 } from "@/lib/pdfLogoMark";
import { hasRealEmail, hasRealPhone } from "@/lib/contactLinks";
import { toWinAnsi, truncateToWidth, wrapText } from "@/lib/pdfText";

// One letterhead for every PDF this app produces: the admin's table exports,
// the patient's health profile and the "Your data" copy. The three generators
// lay their own content out; this module owns everything around it so the
// documents cannot drift apart -- the header (the site's own logo lockup and
// four key facts), the "created on" pill and title, the faint word up the
// right edge, and the dark footer band with the contact line and page number.
//
// Typography is the application's own, not a PDF default: Plus Jakarta Sans
// (the display face the clinic name is set in on the web) and Inter (the body
// face), embedded from static cuts of the very woff2 files the site serves.
// Colours are the site's slate and teal. Everything a generator needs to know
// about the page -- where content may start, stop and run to -- comes from
// `layoutFor`, so no generator hard-codes a margin.

export type Orientation = "portrait" | "landscape";

export const LETTERHEAD_COLORS = {
  ink: rgb(0.118, 0.161, 0.231), // #1e293b slate-800
  body: rgb(0.2, 0.255, 0.333), // #334155 slate-700
  muted: rgb(0.392, 0.455, 0.545), // #64748b slate-500
  rule: rgb(0.886, 0.91, 0.941), // #e2e8f0 slate-200
  card: rgb(0.945, 0.961, 0.976), // #f1f5f9 slate-100
  white: rgb(1, 1, 1),
  teal: rgb(0.059, 0.463, 0.431), // #0f766e teal-700
  tealTint: rgb(0.941, 0.992, 0.98), // #f0fdfa teal-50
  tealLight: rgb(0.369, 0.918, 0.831), // #5eead4 teal-300
  footer: rgb(0.118, 0.161, 0.231), // #1e293b
  footerMuted: rgb(0.58, 0.639, 0.722), // #94a3b8
  footerText: rgb(0.886, 0.91, 0.941), // #e2e8f0
  watermark: rgb(0.933, 0.953, 0.961), // #eef3f5
} as const;

const C = LETTERHEAD_COLORS;

/** What to print when Settings holds no real value: the clinic's own. */
export const LETTERHEAD_FALLBACK_EMAIL = "hello@moverestorephysio.com";
export const LETTERHEAD_FALLBACK_CONCIERGE = "+91 82772 04388";
export const LETTERHEAD_WEBSITE = "www.moverestorephysio.com";
const FALLBACK_TAGLINE = "Move better • Live brighter";

export type LetterheadContact = { email: string; concierge: string };

/** Settings first (an admin can change them), the clinic's own as the
 *  fallback -- the shipped phone is a "+91 XXXXX XXXXX" placeholder, which
 *  must never reach a printed page. */
export function letterheadContact(settings: {
  contactEmail?: string | null;
  contactPhone?: string | null;
}): LetterheadContact {
  const email = (settings.contactEmail ?? "").trim();
  const phone = (settings.contactPhone ?? "").trim();
  return {
    email: hasRealEmail(email) ? email : LETTERHEAD_FALLBACK_EMAIL,
    concierge: hasRealPhone(phone) ? phone : LETTERHEAD_FALLBACK_CONCIERGE,
  };
}

/** The tagline under the name, as the site prints it. */
export function letterheadTagline(siteTagline?: string | null): string {
  return (siteTagline ?? "").trim() || FALLBACK_TAGLINE;
}

/**
 * The faint word up the right edge: the document's name in as few words as
 * read well ("Money in - from patients" -> "MONEY IN"). Words are dropped from
 * the end until it is at most `max` characters.
 */
export function watermarkWord(title: string, max = 16): string {
  const head = toWinAnsi(title)
    .split(/\s[-–]\s|:/)[0]
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  if (!head) return "EXPORT";
  const words = head.split(" ");
  while (words.length > 1 && words.join(" ").length > max) words.pop();
  // Never end on a connective: "RATINGS AND" reads as cut off.
  while (words.length > 1 && /^(AND|OF|THE|FOR|TO|OR|A|BY|WITH)$/.test(words[words.length - 1])) words.pop();
  return words.join(" ").slice(0, max);
}

export type LetterheadSpec = {
  orientation: Orientation;
  siteName: string;
  tagline: string;
  contact: LetterheadContact;
  /** Up to four short facts in the header, label over value. */
  facts: { label: string; value: string }[];
  /** "EXPORT CREATED ON :" and the date after it. */
  createdLabel: string;
  createdOn: string;
  /** "REPORT :" / "DOCUMENT :" above the title. */
  reportLabel: string;
  title: string;
  subtitle?: string | null;
  watermark: string;
  /** The confidentiality line in the footer band. */
  notice: string;
};

export type Letterhead = {
  regular: PDFFont;
  /** Inter semibold: labels, emphasis, table headers. */
  bold: PDFFont;
  /** Plus Jakarta Sans bold: the clinic name and every heading. */
  display: PDFFont;
  logo: PDFImage;
};

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

/** Registers fontkit on the document and embeds the app's faces and logo. */
export async function loadLetterhead(doc: PDFDocument): Promise<Letterhead> {
  doc.registerFontkit(fontkit);
  const [regular, bold, display, logo] = await Promise.all([
    doc.embedFont(fromBase64(INTER_REGULAR_TTF_BASE64), { subset: true }),
    doc.embedFont(fromBase64(INTER_SEMIBOLD_TTF_BASE64), { subset: true }),
    doc.embedFont(fromBase64(JAKARTA_BOLD_TTF_BASE64), { subset: true }),
    doc.embedPng(fromBase64(LOGO_MARK_PNG_BASE64)),
  ]);
  return { regular, bold, display, logo };
}

export type PageLayout = {
  width: number;
  height: number;
  /** Left margin, and the x content starts at. */
  left: number;
  /** Where content must stop on the right: the word up the edge lives beyond. */
  right: number;
  contentWidth: number;
  gutter: number;
  /** y (from the page bottom) of the header's hairline. */
  headerBottom: number;
  /** Content must stay above this y: the footer band and a little air. */
  bottom: number;
  footerHeight: number;
};

export function layoutFor(orientation: Orientation): PageLayout {
  const landscape = orientation === "landscape";
  const width = landscape ? 841.89 : 595.28;
  const height = landscape ? 595.28 : 841.89;
  const left = landscape ? 32 : 44;
  const gutter = landscape ? 52 : 58;
  const footerHeight = 40;
  return {
    width,
    height,
    left,
    right: width - left - gutter,
    contentWidth: width - left * 2 - gutter,
    gutter,
    headerBottom: height - 66,
    bottom: footerHeight + 16,
    footerHeight,
  };
}

/** A rounded rectangle, which pdf-lib has no primitive for. `top` is the y of
 *  its upper edge. */
export function drawRoundedRect(
  page: PDFPage,
  x: number,
  top: number,
  width: number,
  height: number,
  radius: number,
  color: RGB
) {
  const r = Math.min(radius, width / 2, height / 2);
  const path =
    `M ${r} 0 H ${width - r} A ${r} ${r} 0 0 1 ${width} ${r} V ${height - r} ` +
    `A ${r} ${r} 0 0 1 ${width - r} ${height} H ${r} A ${r} ${r} 0 0 1 0 ${height - r} ` +
    `V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
  page.drawSvgPath(path, { x, y: top, color, borderWidth: 0 });
}

/** Letter-spaced text, since PDF text has no tracking of its own. Returns the
 *  width drawn. */
function drawTracked(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color: RGB, tracking: number) {
  let cx = x;
  for (const ch of text) {
    page.drawText(ch, { x: cx, y, size, font, color });
    cx += font.widthOfTextAtSize(ch, size) + tracking;
  }
  return cx - x - tracking;
}

function drawHeader(page: PDFPage, kit: Letterhead, spec: LetterheadSpec, lay: PageLayout) {
  const { width, height, left } = lay;
  const top = height - 20;

  // The lockup as the website prints it: the mark, the name in the display
  // face, the tagline in small teal capitals under it.
  const mark = 34;
  page.drawImage(kit.logo, { x: left, y: top - mark, width: mark, height: mark });
  const nameX = left + mark + 9;
  const name = toWinAnsi(spec.siteName);
  const nameSize = 15.5;
  page.drawText(name, { x: nameX, y: top - 14, size: nameSize, font: kit.display, color: C.ink });
  const nameWidth = kit.display.widthOfTextAtSize(name, nameSize);
  // The bullet between the two halves of the tagline is in the embedded font
  // but not in WinAnsi, which toWinAnsi would strip.
  const tagline = spec.tagline.split("\u2022").map((part) => toWinAnsi(part).trim()).join(" \u2022 ").toUpperCase();
  const tagSize = 6.6;
  const natural = [...tagline].reduce((sum, ch) => sum + kit.bold.widthOfTextAtSize(ch, tagSize), 0);
  const gaps = Math.max(1, [...tagline].length - 1);
  // Spread to roughly four-fifths of the name's width, like the site.
  const tracking = Math.max(0.4, Math.min(1.6, (nameWidth * 0.8 - natural) / gaps));
  drawTracked(page, tagline, nameX, top - 28, tagSize, kit.bold, C.teal, tracking);

  // Key facts on the right, label over value, each column centred on itself.
  const brandWidth = nameX - left + nameWidth;
  const facts = spec.facts.slice(0, 4);
  if (facts.length > 0) {
    const gap = lay.width > 700 ? 24 : 12;
    const room = width - left * 2 - brandWidth - 22 - gap * (facts.length - 1);
    const cols = facts.map((f) => {
      const label = toWinAnsi(f.label).toUpperCase();
      const value = toWinAnsi(f.value);
      const w = Math.max(kit.regular.widthOfTextAtSize(label, 6.2), kit.bold.widthOfTextAtSize(value, 7.6));
      return { label, value, w };
    });
    // Shrink only the widest column(s) when the row is too long, so a short
    // reference is never cut to spare a long email.
    for (let guard = 0; guard < 40; guard++) {
      const total = cols.reduce((sum, c) => sum + c.w, 0);
      if (total <= room) break;
      const sorted = [...cols].sort((a, b) => b.w - a.w);
      const next = sorted[1]?.w ?? 40;
      const cut = Math.min(total - room, Math.max(sorted[0].w - Math.max(next, 40), 1));
      sorted[0].w -= cut;
    }
    for (const c of cols) c.value = truncateToWidth(c.value, kit.bold, 7.6, c.w);
    let x = width - left - (cols.reduce((s, c) => s + c.w, 0) + gap * (cols.length - 1));
    for (const c of cols) {
      const cx = x + c.w / 2;
      page.drawText(c.label, { x: cx - kit.regular.widthOfTextAtSize(c.label, 6.2) / 2, y: top - 12, size: 6.2, font: kit.regular, color: C.muted });
      page.drawText(c.value, { x: cx - kit.bold.widthOfTextAtSize(c.value, 7.6) / 2, y: top - 25, size: 7.6, font: kit.bold, color: C.ink });
      x += c.w + gap;
    }
  }

  page.drawLine({ start: { x: 0, y: lay.headerBottom }, end: { x: width, y: lay.headerBottom }, thickness: 0.75, color: C.rule });
}

/** The pill, the report label, the title and what it covers. Returns the y
 *  just under it. */
function drawTitleBlock(page: PDFPage, kit: Letterhead, spec: LetterheadSpec, lay: PageLayout): number {
  let y = lay.headerBottom - 16;
  const created = toWinAnsi(spec.createdLabel);
  const on = toWinAnsi(spec.createdOn);
  const labelW = kit.regular.widthOfTextAtSize(created, 6.8);
  const onW = kit.bold.widthOfTextAtSize(on, 9.4);
  const pillH = 18;
  drawRoundedRect(page, lay.left, y, labelW + onW + 4 + 16, pillH, 5, C.card);
  page.drawText(created, { x: lay.left + 8, y: y - 12.4, size: 6.8, font: kit.regular, color: C.body });
  page.drawText(on, { x: lay.left + 8 + labelW + 4, y: y - 12.8, size: 9.4, font: kit.bold, color: C.ink });
  y -= pillH + 14;

  page.drawText(toWinAnsi(spec.reportLabel), { x: lay.left, y: y - 6, size: 6.8, font: kit.regular, color: C.muted });
  y -= 13;
  const title = toWinAnsi(spec.title).toUpperCase();
  for (const line of wrapText(title, kit.display, 12, lay.contentWidth).slice(0, 2)) {
    page.drawText(line, { x: lay.left, y: y - 11, size: 12, font: kit.display, color: C.ink });
    y -= 15.5;
  }
  if (spec.subtitle) {
    y -= 2;
    for (const line of wrapText(toWinAnsi(spec.subtitle), kit.regular, 8, lay.contentWidth).slice(0, 3)) {
      page.drawText(line, { x: lay.left, y: y - 8, size: 8, font: kit.regular, color: C.muted });
      y -= 11.5;
    }
  }
  y -= 6;
  page.drawLine({ start: { x: lay.left, y }, end: { x: lay.right, y }, thickness: 0.75, color: C.rule });
  return y - 12;
}

/**
 * Adds a page with the letterhead's header on it and returns the y at which
 * content may start. The first page also carries the title block; later pages
 * carry the header alone, so a running table gets all the room.
 */
export function beginLetterheadPage(
  doc: PDFDocument,
  kit: Letterhead,
  spec: LetterheadSpec,
  first: boolean
): { page: PDFPage; y: number; layout: PageLayout } {
  const layout = layoutFor(spec.orientation);
  const page = doc.addPage([layout.width, layout.height]);
  drawHeader(page, kit, spec, layout);
  const y = first ? drawTitleBlock(page, kit, spec, layout) : layout.headerBottom - 16;
  return { page, y, layout };
}

/** Footer band, page numbers and the faint word, on every page. Call once,
 *  after the last page exists. */
export function finishLetterhead(pages: PDFPage[], kit: Letterhead, spec: LetterheadSpec) {
  const lay = layoutFor(spec.orientation);
  const total = pages.length;
  const word = toWinAnsi(spec.watermark).toUpperCase();
  const wordAvail = lay.headerBottom - 18 - (lay.footerHeight + 16);
  const unit = kit.display.widthOfTextAtSize(word, 1) || 1;
  const wordSize = Math.max(14, Math.min(lay.gutter * 0.9, wordAvail / unit));
  const contact = [spec.siteName, LETTERHEAD_WEBSITE, spec.contact.email, spec.contact.concierge]
    .map((part) => toWinAnsi(part))
    .join("  ·  ");

  pages.forEach((page, index) => {
    // The word runs up the right edge, bottom to top, behind nothing: content
    // never enters the gutter.
    page.drawText(word, {
      x: lay.width - 16,
      y: lay.footerHeight + 16,
      size: wordSize,
      font: kit.display,
      color: C.watermark,
      rotate: degrees(90),
    });

    page.drawRectangle({ x: 0, y: 0, width: lay.width, height: lay.footerHeight, color: C.footer });
    const label = `Page ${index + 1} of ${total}`;
    const labelW = kit.bold.widthOfTextAtSize(label, 7.4);
    page.drawText(label, { x: lay.width - lay.left - labelW, y: 17, size: 7.4, font: kit.bold, color: C.tealLight });
    const room = lay.width - lay.left * 2 - labelW - 16;
    page.drawText(truncateToWidth(contact, kit.regular, 6.6, room), { x: lay.left, y: 22, size: 6.6, font: kit.regular, color: C.footerText });
    page.drawText(truncateToWidth(toWinAnsi(spec.notice), kit.regular, 6.4, room), { x: lay.left, y: 12, size: 6.4, font: kit.regular, color: C.footerMuted });
  });
}

/** Table styling shared by the generators: outlined header, grey rows with
 *  white separators, as in the approved design. */
export function drawTableHeaderRow(
  page: PDFPage,
  x: number,
  top: number,
  width: number,
  height: number
) {
  page.drawLine({ start: { x, y: top }, end: { x: x + width, y: top }, thickness: 0.75, color: C.muted });
  page.drawLine({ start: { x, y: top - height }, end: { x: x + width, y: top - height }, thickness: 0.75, color: C.muted });
}
