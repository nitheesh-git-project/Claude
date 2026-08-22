import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  PAIN_MAP_REGIONS,
  formatPainOutOfTen,
  getDefaultQuestionsForRegion,
  isPainMapRegion,
  mergeQuestionOverrides,
  type QuestionOverrideRow,
} from "@/lib/painMap";
import type { IntakeQuestion } from "@/lib/conditionIntake";

// The patient's own copy of their record, as a document they can hand to
// another clinician -- which is what "export my data" actually means to a
// patient. It used to be a JSON download, which is only useful to a
// developer: nobody carries a JSON file to an orthopaedic appointment.
//
// Built with pdf-lib's standard fonts (no font file to ship, no headless
// browser to run). Those fonts can only encode WinAnsi, so every string
// goes through toWinAnsi() below -- a Devanagari name would otherwise
// throw at draw time and 500 the whole export.

const PAGE_WIDTH = 595.28; // A4 portrait, in points
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const INK = rgb(0.11, 0.16, 0.23);
const MUTED = rgb(0.42, 0.48, 0.55);
const RULE = rgb(0.85, 0.88, 0.91);

export type HealthProfilePdfInput = {
  siteName: string;
  patientName: string;
  patientCode: string | null;
  patientEmail: string | null;
  exportedAt: Date;
  status: string;
  questions: IntakeQuestion[];
  answers: Record<string, string>;
  assessments: {
    region: string;
    side: string;
    pain_percent: number;
    submitted_by_role: string;
    answers: Record<string, string> | null;
    created_at: string;
  }[];
  /** Admin-edited question wording, keyed by region — the same key can
   *  carry different wording in two regions, so these can never be
   *  flattened into one list. */
  painMapOverridesByRegion: Record<string, QuestionOverrideRow[]>;
  documents: { title: string; document_type: string; taken_on: string | null; created_at: string }[];
};

// pdf-lib's standard fonts encode WinAnsi only. Rather than let an
// unencodable character abort the export, transliterate the handful that
// show up in ordinary typing (curly quotes, dashes) and drop the rest.
function toWinAnsi(value: string): string {
  const replaced = value
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/₹/g, "Rs. ");
  // Keep only what the WinAnsi tables can actually encode.
  return replaced.replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, "");
}

// A name is the one string whose leftovers show. Stripping an
// unencodable script (a Devanagari name, say) can leave stray spaces
// around whatever Latin part remains, so the name is tidied once rather
// than every text run being whitespace-collapsed -- some of them use
// double spaces as separators on purpose.
function displayName(raw: string): string {
  return toWinAnsi(raw).replace(/\s+/g, " ").trim() || "Patient";
}

function formatDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (!word) continue;
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A single unbroken token wider than the column (a long URL, a
      // pasted id) would loop forever appending to an empty line, so cut
      // it by character instead.
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
            lines.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        line = chunk;
      } else {
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

// A tiny top-down cursor over a growing list of pages. Everything below
// draws through this, so a section never has to know whether it fits.
class Cursor {
  private pages: PDFPage[] = [];
  y = 0;

  constructor(
    private doc: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont
  ) {
    this.newPage();
  }

  private newPage() {
    const page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(page);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  private page(): PDFPage {
    return this.pages[this.pages.length - 1];
  }

  allPages(): PDFPage[] {
    return this.pages;
  }

  space(amount: number) {
    this.y -= amount;
  }

  need(height: number) {
    // Keep clear of the footer strip drawn at the end.
    if (this.y - height < MARGIN + 24) this.newPage();
  }

  text(
    value: string,
    { size = 10, bold = false, color = INK, indent = 0, gap = 3 }: {
      size?: number;
      bold?: boolean;
      color?: ReturnType<typeof rgb>;
      indent?: number;
      gap?: number;
    } = {}
  ) {
    const font = bold ? this.bold : this.regular;
    const lineHeight = size * 1.35;
    for (const line of wrap(toWinAnsi(value), font, size, CONTENT_WIDTH - indent)) {
      this.need(lineHeight);
      this.y -= lineHeight;
      this.page().drawText(line, { x: MARGIN + indent, y: this.y, size, font, color });
    }
    this.y -= gap;
  }

  rule() {
    this.need(10);
    this.y -= 6;
    this.page().drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: this.y },
      thickness: 0.75,
      color: RULE,
    });
    this.y -= 8;
  }

  heading(value: string) {
    // Never leave a heading stranded at the foot of a page.
    this.need(46);
    this.space(8);
    this.text(value, { size: 13, bold: true, gap: 2 });
    this.rule();
  }
}

export function healthProfilePdfFilename(patientName: string, patientCode: string | null): string {
  // "Priya Sharma" + "PT0042" -> "Priya_Sharma_PT0042.pdf". Anything a
  // filesystem or a Content-Disposition header would argue about is
  // stripped rather than escaped.
  const safe = (value: string) =>
    toWinAnsi(value)
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const name = safe(patientName) || "Patient";
  const code = patientCode ? safe(patientCode) : "";
  return `${code ? `${name}_${code}` : name}.pdf`;
}

export async function buildHealthProfilePdf(input: HealthProfilePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const cur = new Cursor(doc, regular, bold);

  const patientName = displayName(input.patientName);

  doc.setTitle(`Health profile - ${patientName}`);
  doc.setCreator(input.siteName);
  doc.setProducer(input.siteName);

  cur.text(input.siteName, { size: 16, bold: true, gap: 1 });
  cur.text("Patient health profile", { size: 11, color: MUTED });
  cur.rule();

  cur.text(patientName, { size: 14, bold: true, gap: 1 });
  const idLine = [
    input.patientCode ? `Patient ID ${input.patientCode}` : null,
    input.patientEmail,
  ].filter(Boolean) as string[];
  if (idLine.length > 0) cur.text(idLine.join("  |  "), { size: 10, color: MUTED, gap: 1 });
  cur.text(`Downloaded ${formatDate(input.exportedAt)}  |  Intake status: ${input.status}`, {
    size: 9,
    color: MUTED,
  });

  cur.heading("What the patient told us");
  const answered = input.questions.filter((q) => (input.answers[q.key] ?? "").trim());
  if (answered.length === 0) {
    cur.text("No intake answers on record yet.", { size: 10, color: MUTED });
  } else {
    for (const question of answered) {
      cur.need(34);
      cur.text(question.label, { size: 9.5, bold: true, color: MUTED, gap: 1 });
      cur.text(input.answers[question.key].trim(), { size: 10.5, gap: 7 });
    }
  }

  cur.heading("Examinations by the therapist");
  if (input.assessments.length === 0) {
    cur.text("No examinations recorded yet.", { size: 10, color: MUTED });
  } else {
    const regionLabel = new Map(PAIN_MAP_REGIONS.map((r) => [r.key as string, r.label]));
    for (const exam of input.assessments) {
      const side = exam.side === "na" ? "" : ` (${exam.side})`;
      cur.need(44);
      cur.text(
        `${regionLabel.get(exam.region) ?? exam.region}${side} - pain ${formatPainOutOfTen(exam.pain_percent)}`,
        { size: 11, bold: true, gap: 1 }
      );
      cur.text(`${formatDate(exam.created_at)}  |  recorded by the ${exam.submitted_by_role}`, {
        size: 9,
        color: MUTED,
        gap: 4,
      });
      const answers = exam.answers ?? {};
      const questions = isPainMapRegion(exam.region)
        ? mergeQuestionOverrides(
            getDefaultQuestionsForRegion(exam.region),
            input.painMapOverridesByRegion[exam.region] ?? []
          )
        : [];
      for (const question of questions) {
        const value = (answers[question.key] ?? "").toString().trim();
        if (!value) continue;
        cur.text(`${question.text}: ${value}`, { size: 10, indent: 12, gap: 1 });
      }
      cur.space(8);
    }
  }

  // Listed, not embedded: the files themselves live in storage and are
  // downloaded individually. A patient handing this to another clinician
  // still needs to see what is on file.
  cur.heading("Test reports and scans on file");
  if (input.documents.length === 0) {
    cur.text("No reports uploaded.", { size: 10, color: MUTED });
  } else {
    for (const document of input.documents) {
      const dated = document.taken_on ? `taken ${formatDate(document.taken_on)}` : `uploaded ${formatDate(document.created_at)}`;
      cur.text(`${document.title}  -  ${document.document_type}, ${dated}`, { size: 10, gap: 2 });
    }
  }

  cur.space(10);
  cur.text(
    "This document is generated from the patient's own record. Clinicians' private session notes are not included.",
    { size: 8, color: MUTED }
  );

  const pages = cur.allPages();
  pages.forEach((page, index) => {
    const label = toWinAnsi(
      `${patientName}${input.patientCode ? ` (${input.patientCode})` : ""}  -  page ${index + 1} of ${pages.length}`
    );
    page.drawText(label, {
      x: MARGIN,
      y: MARGIN - 16,
      size: 8,
      font: regular,
      color: MUTED,
    });
  });

  return doc.save();
}
