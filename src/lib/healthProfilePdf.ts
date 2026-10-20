import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  PAIN_MAP_REGIONS,
  formatPainOutOfTen,
  getDefaultQuestionsForRegion,
  isPainMapRegion,
  mergeQuestionOverrides,
  type QuestionOverrideRow,
} from "@/lib/painMap";
import {
  formatAreaPainForText,
  parseAreaPain,
  parseMultiSelect,
  visibleQuestions,
  type IntakeQuestion,
} from "@/lib/conditionIntake";
import { toWinAnsi, toWinAnsiTidy, wrapText } from "@/lib/pdfText";
import type { ProgressExport } from "@/lib/progressExport";

// The patient's own copy of their record, as a document they can hand to
// another clinician -- which is what "export my data" actually means to a
// patient. It used to be a JSON download, which is only useful to a
// developer: nobody carries a JSON file to an orthopaedic appointment.
//
// Built with pdf-lib's standard fonts (no font file to ship, no headless
// browser to run). Those fonts can only encode WinAnsi, so every string
// goes through toWinAnsi() from pdfText -- a Devanagari name would
// otherwise throw at draw time and 500 the whole export.

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
  /** Which question set produced these answers. A clinician receiving
   *  this needs to know; the same PDF with a paediatric set and an
   *  orthopaedic one read as the same document otherwise. */
  specialtyLabel: string;
  /** Paediatric records are somebody speaking for someone else. Printed
   *  in the header block, where a receiving clinician looks for
   *  provenance. Derived in the export route so this module never learns
   *  question key names. */
  respondent?: { name: string; relationship: string } | null;
  questions: IntakeQuestion[];
  answers: Record<string, string>;
  /** Answers from a specialty this patient used to be recorded under.
   *  The screen shows the current specialty only, but an export handed to
   *  another clinician that silently loses the whole prior history is a
   *  clinical loss rather than a simplification. */
  earlierProfiles?: {
    specialtyLabel: string;
    entries: { label: string; value: string }[];
  }[];
  assessments: {
    region: string;
    side: string;
    pain_percent: number;
    submitted_by_role: string;
    answers: Record<string, string> | null;
    created_at: string;
  }[];
  /** Admin-edited question wording, keyed by region - the same key can
   *  carry different wording in two regions, so these can never be
   *  flattened into one list. */
  painMapOverridesByRegion: Record<string, QuestionOverrideRow[]>;
  documents: { title: string; document_type: string; taken_on: string | null; created_at: string }[];
  /** False for a non-orthopaedic profile: the Pain Map section is left
   *  out entirely rather than printed empty. */
  showExaminations: boolean;
  /** True for a neurological profile: its examination chart is printed in
   *  place of the Pain Map. Each exam arrives already as lines of text
   *  (`describeNeuroExamForText` in neuroExam.ts), so this module never
   *  learns a scale. */
  showNeuroExaminations?: boolean;
  neuroExams?: { created_at: string; submitted_by_role: string; lines: string[] }[];
  /** The goal, its steps and the measures table, already as text
   *  (`buildProgressExport` in progressExport.ts). Omitted only by callers
   *  that predate the measurement layer. */
  progress?: ProgressExport;
};

// Renders one stored answer the way a person reads it, driven off the
// question's input type rather than its key -- so a neurological or
// paediatric scale gets the same treatment for free.
//
// Two gaps this closes. `area_pain` was dumped as raw JSON, which is
// unreadable in a document meant to be handed to another clinician; and a
// 0-10 answer was printed as a bare digit next to exam figures that ARE
// labelled, which is the "one pain scale on screen" rule the rest of the
// app follows.
function answerLines(question: IntakeQuestion, raw: string): string[] {
  const value = (raw ?? "").trim();
  if (!value) return [];
  if (question.inputType === "area_pain_list") {
    const regionLabel = new Map(PAIN_MAP_REGIONS.map((r) => [r.key as string, r.label]));
    const lines = formatAreaPainForText(parseAreaPain(value), (region) =>
      regionLabel.get(region) ?? region
    );
    return lines.length > 0 ? lines : ["None marked"];
  }
  if (question.inputType === "multi_select") {
    const picked = parseMultiSelect(value);
    return picked.length > 0 ? [picked.join(", ")] : [];
  }
  if (question.inputType === "scale_0_10") return [`${value} / 10`];
  return [value];
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
    for (const line of wrapText(toWinAnsi(value), font, size, CONTENT_WIDTH - indent)) {
      this.need(lineHeight);
      this.y -= lineHeight;
      this.page().drawText(line, { x: MARGIN + indent, y: this.y, size, font, color });
    }
    this.y -= gap;
  }

  /**
   * One table row: each cell wraps inside its own column and the row is as
   * tall as its tallest cell. A row is never split across pages.
   */
  row(
    cells: { text: string; x: number; width: number }[],
    { size = 9, bold = false, color = INK, gap = 4 }: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number } = {}
  ) {
    const font = bold ? this.bold : this.regular;
    const lineHeight = size * 1.3;
    const wrapped = cells.map((c) => wrapText(toWinAnsi(c.text), font, size, c.width));
    const lines = Math.max(1, ...wrapped.map((w) => w.length));
    this.need(lines * lineHeight + gap);
    const top = this.y;
    wrapped.forEach((cellLines, i) => {
      cellLines.forEach((line, n) => {
        this.page().drawText(line, { x: MARGIN + cells[i].x, y: top - lineHeight * (n + 1), size, font, color });
      });
    });
    this.y = top - lines * lineHeight - gap;
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

  // A name in a script the standard fonts cannot encode leaves stray
  // spaces around whatever Latin part survives, so it is tidied once here
  // rather than every text run being whitespace-collapsed -- some of them
  // use double spaces as separators on purpose.
  const patientName = toWinAnsiTidy(input.patientName, "Patient");

  doc.setTitle(`Health profile - ${patientName}`);
  doc.setCreator(input.siteName);
  doc.setProducer(input.siteName);

  cur.text(input.siteName, { size: 16, bold: true, gap: 1 });
  cur.text(`${input.specialtyLabel} health profile`, { size: 11, color: MUTED });
  cur.rule();

  cur.text(patientName, { size: 14, bold: true, gap: 1 });
  const idLine = [
    input.patientCode ? `Patient ID ${input.patientCode}` : null,
    input.patientEmail,
  ].filter(Boolean) as string[];
  if (idLine.length > 0) cur.text(idLine.join("  |  "), { size: 10, color: MUTED, gap: 1 });
  if (input.respondent) {
    cur.text(
      `Answered by ${toWinAnsiTidy(input.respondent.name, "a caregiver")}${
        input.respondent.relationship
          ? ` (${toWinAnsiTidy(input.respondent.relationship, "caregiver").toLowerCase()})`
          : ""
      }`,
      { size: 10, color: MUTED, gap: 1 }
    );
  }
  cur.text(`Downloaded ${formatDate(input.exportedAt)}  |  Intake status: ${input.status}`, {
    size: 9,
    color: MUTED,
  });

  cur.heading("What the patient told us");
  // Only the questions these answers ask: a follow-up the condition group
  // has since closed is kept on file, not printed as part of this record.
  const answered = visibleQuestions(input.questions, input.answers).filter((q) => (input.answers[q.key] ?? "").trim());
  if (answered.length === 0) {
    cur.text("No intake answers on record yet.", { size: 10, color: MUTED });
  } else {
    for (const question of answered) {
      cur.need(34);
      cur.text(question.label, { size: 9.5, bold: true, color: MUTED, gap: 1 });
      for (const line of answerLines(question, input.answers[question.key])) {
        cur.text(line, { size: 10.5, gap: 1 });
      }
      cur.space(6);
    }
  }

  if (input.earlierProfiles?.length) {
    for (const earlier of input.earlierProfiles) {
      cur.heading(`Earlier profile (${earlier.specialtyLabel.toLowerCase()})`);
      cur.text(
        "Recorded before this patient's condition type was changed. Kept for continuity; not shown on screen.",
        { size: 9, color: MUTED, gap: 6 }
      );
      for (const entry of earlier.entries) {
        cur.need(34);
        cur.text(entry.label, { size: 9.5, bold: true, color: MUTED, gap: 1 });
        cur.text(entry.value, { size: 10.5, gap: 7 });
      }
    }
  }

  // The goal in the patient's own words, the steps towards it, and the
  // measures table. Already shaped to text, so this draws and never learns
  // the registry. A section is always printed: "nothing recorded yet" is a
  // fact a receiving clinician needs, and a heading that vanishes reads as
  // the section having been left out.
  if (input.progress) {
    const progress = input.progress;
    cur.heading("Goal and progress");
    // The phase and any overrule of the computed status are the treating
    // physiotherapist's own judgement, so they are printed with the date they
    // were made and, for an overrule, the reason given.
    cur.text(
      progress.care.phase
        ? `Current phase of care: ${progress.care.phase.name} (set ${progress.care.phase.setOn})`
        : "Current phase of care: not set",
      { size: 10, bold: !!progress.care.phase, gap: 2 }
    );
    if (progress.care.override) {
      cur.text(
        `Status overruled by the physiotherapist: ${progress.care.override.statusLabel} (${progress.care.override.setOn})`,
        { size: 10, bold: true, gap: 1 }
      );
      cur.text(`Reason: ${progress.care.override.reason}`, { size: 9, color: MUTED, gap: 6 });
    } else {
      cur.space(4);
    }
    // Only what a person wrote; the screen's generated wording is not a
    // clinician's statement and is never printed as one.
    if (progress.care.summary) {
      cur.text(
        `Where things stand (${progress.care.summary.byClinic ? "written by the clinic" : "written by the physiotherapist"}, ${progress.care.summary.setOn})`,
        { size: 9, bold: true, color: MUTED, gap: 1 }
      );
      for (const paragraph of progress.care.summary.text.split("\n").filter((line) => line.trim())) {
        cur.text(paragraph, { size: 10, gap: 1 });
      }
      cur.space(6);
    }
    if (progress.goal) {
      cur.text("Goal, in the patient's own words", { size: 9, bold: true, color: MUTED, gap: 1 });
      cur.text(`\u201C${progress.goal.text}\u201D`, { size: 12, bold: true, gap: 2 });
      cur.text(
        [progress.goal.status, progress.goal.targetDate ? `aiming for ${progress.goal.targetDate}` : null].filter(Boolean).join("  |  "),
        { size: 9, color: MUTED, gap: 6 }
      );
    } else {
      cur.text("No goal recorded yet.", { size: 10, color: MUTED });
    }

    if (progress.milestones.length > 0) {
      cur.space(4);
      cur.text("Steps towards the goal", { size: 9, bold: true, color: MUTED, gap: 2 });
      for (const step of progress.milestones) {
        cur.need(40);
        cur.text(`${step.title}  -  ${step.status}${step.when ? `, ${step.when.charAt(0).toLowerCase()}${step.when.slice(1)}` : ""}`, {
          size: 10,
          bold: true,
          indent: 12,
          gap: 1,
        });
        cur.text(step.criterion + (step.measure ? `  (measured by: ${step.measure})` : ""), { size: 9.5, indent: 12, gap: 4 });
      }
    } else if (progress.goal) {
      cur.text("No steps planned yet.", { size: 10, color: MUTED });
    }

    cur.space(6);
    cur.text("Measures", { size: 9, bold: true, color: MUTED, gap: 2 });
    if (progress.measures.length === 0) {
      cur.text("No measurements recorded yet.", { size: 10, color: MUTED });
    } else {
      const cols = [
        { label: "Measure", x: 0, width: 150 },
        { label: "First", x: 156, width: 100 },
        { label: "Latest", x: 262, width: 100 },
        { label: "Goal", x: 368, width: 60 },
        { label: "Change", x: 434, width: CONTENT_WIDTH - 434 },
      ];
      cur.need(60);
      cur.row(
        cols.map((c) => ({ text: c.label, x: c.x, width: c.width })),
        { size: 8.5, bold: true, color: MUTED, gap: 2 }
      );
      cur.rule();
      for (const m of progress.measures) {
        cur.row(
          [
            { text: m.name, x: cols[0].x, width: cols[0].width },
            { text: m.first, x: cols[1].x, width: cols[1].width },
            { text: m.now, x: cols[2].x, width: cols[2].width },
            { text: m.goal, x: cols[3].x, width: cols[3].width },
            { text: m.change, x: cols[4].x, width: cols[4].width },
          ],
          { size: 9, gap: 6 }
        );
      }
      cur.text(
        "Each reading is the newest taken at that review. A change inside the measurement error of a test is shown as no real change.",
        { size: 8, color: MUTED }
      );
    }
  }

  // Omitted entirely rather than printed with "not applicable" under it:
  // the Pain Map is an ORTHOPAEDIC instrument, and a heading with nothing
  // beneath it reads as missing data rather than an inapplicable section.
  if (input.showExaminations) {
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
  }

  if (input.showNeuroExaminations) {
    cur.heading("Neurological examinations by the therapist");
    const exams = input.neuroExams ?? [];
    if (exams.length === 0) {
      cur.text("No examinations recorded yet.", { size: 10, color: MUTED });
    } else {
      for (const exam of exams) {
        cur.need(44);
        cur.text(`Examination of ${formatDate(exam.created_at)}`, { size: 11, bold: true, gap: 1 });
        cur.text(`Recorded by the ${exam.submitted_by_role}`, { size: 9, color: MUTED, gap: 4 });
        for (const line of exam.lines) {
          const indented = line.startsWith("  ");
          cur.text(line.trim(), { size: 10, indent: indented ? 24 : 12, gap: 1 });
        }
        cur.space(8);
      }
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
