import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildHealthProfilePdf, type HealthProfilePdfInput } from "@/lib/healthProfilePdf";

const base: HealthProfilePdfInput = {
  siteName: "MoveRestore",
  patientName: "Priya Sharma",
  patientCode: "PT0042",
  patientEmail: null,
  exportedAt: new Date("2026-10-20T06:00:00.000Z"),
  status: "Approved",
  specialtyLabel: "Orthopaedic",
  questions: [],
  answers: {},
  assessments: [],
  painMapOverridesByRegion: {},
  documents: [],
  showExaminations: false,
};

describe("buildHealthProfilePdf progress section", () => {
  it("builds a document with the goal, steps and measures table", async () => {
    const bytes = await buildHealthProfilePdf({
      ...base,
      progress: {
        care: {
          phase: { name: "Strengthen", setOn: "12 Oct 2026" },
          override: { statusLabel: "Needs attention", reason: "Swelling returned after the stairs test - कुछ", setOn: "14 Oct 2026" },
          summary: { text: "Walking further each week.\n\nNext: the stairs - कुछ", setOn: "15 Oct 2026", byClinic: false },
        },
        goal: { text: "Play badminton again क", targetDate: "1 Dec 2026", status: "In progress" },
        milestones: [{ title: "Knee bends to 125°", criterion: "Bends to 125 degrees", status: "Working on it", when: "Target 1 Oct 2026", measure: "Knee bend, right" }],
        measures: Array.from({ length: 60 }, (_, i) => ({
          name: `Measure ${i}`,
          first: "85° (3 Sep 2026)",
          now: "122° (12 Oct 2026)",
          goal: "125°",
          change: "Better",
          reviews: 2,
        })),
      },
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it("prints the empty states rather than dropping the section", async () => {
    const bytes = await buildHealthProfilePdf({ ...base, progress: { care: { phase: null, override: null, summary: null }, goal: null, milestones: [], measures: [] } });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("still builds for a caller without progress", async () => {
    await expect(buildHealthProfilePdf(base)).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe("buildHealthProfilePdf paediatric examination", () => {
  it("prints the latest exam with the age line, and the empty state", async () => {
    const withExam = await buildHealthProfilePdf({
      ...base,
      specialtyLabel: "Paediatric",
      showPedsExamination: true,
      pedsAgeLine: "14 months (11.7 months corrected, born at 30 weeks)",
      pedsVerificationNote: "WHO windows; to be verified by a senior physiotherapist.",
      pedsExam: {
        created_at: "2026-10-12T06:00:00.000Z",
        submitted_by_role: "therapist",
        lines: ["Movement milestones (WHO):", "  Sitting without support: Achieved, first seen 3 Feb 2026, at 8 months corrected, parent reports"],
        earlierCount: 2,
      },
    });
    expect((await PDFDocument.load(withExam)).getPageCount()).toBe(1);
    const empty = await buildHealthProfilePdf({ ...base, showPedsExamination: true, pedsAgeLine: "date of birth not on file", pedsExam: null });
    expect((await PDFDocument.load(empty)).getPageCount()).toBe(1);
  });
});

describe("buildHealthProfilePdf diary section", () => {
  it("prints the diary as counts, and the empty diary as empty", async () => {
    const withDiary = await buildHealthProfilePdf({
      ...base,
      diary: {
        firstOn: "7 Oct 2026",
        lastOn: "14 Oct 2026",
        lines: [{ label: "Falls", unit: "falls", total: 3, patientReported: 1, confirmed: 2 }],
        freezingWeeks: [{ weekOf: "5 Oct 2026", episodes: 5, confirmed: false, partial: false }],
      },
    });
    expect((await PDFDocument.load(withDiary)).getPageCount()).toBe(1);
    const empty = await buildHealthProfilePdf({ ...base, diary: { firstOn: null, lastOn: null, lines: [], freezingWeeks: [] } });
    expect((await PDFDocument.load(empty)).getPageCount()).toBe(1);
  });
});
