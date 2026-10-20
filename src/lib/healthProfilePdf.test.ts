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
    const bytes = await buildHealthProfilePdf({ ...base, progress: { care: { phase: null, override: null }, goal: null, milestones: [], measures: [] } });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("still builds for a caller without progress", async () => {
    await expect(buildHealthProfilePdf(base)).resolves.toBeInstanceOf(Uint8Array);
  });
});
