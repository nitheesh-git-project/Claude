import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  LETTERHEAD_FALLBACK_CONCIERGE,
  LETTERHEAD_FALLBACK_EMAIL,
  LETTERHEAD_WEBSITE,
  layoutFor,
  letterheadContact,
  letterheadTagline,
  watermarkWord,
} from "./pdfLetterhead";
import { buildTablePdf } from "./tablePdf";
import { buildHealthProfilePdf } from "./healthProfilePdf";
import { buildPersonalDataPdf } from "./personalDataPdf";

// A4 in PDF points: 210 x 297 mm at 72 per inch.
const A4_SHORT = 595.28;
const A4_LONG = 841.89;

describe("letterheadContact", () => {
  it("uses Settings when they hold real values", () => {
    expect(letterheadContact({ contactEmail: "desk@clinic.in", contactPhone: "+91 98765 43210" })).toEqual({
      email: "desk@clinic.in",
      concierge: "+91 98765 43210",
    });
  });
  it("never prints the shipped placeholder phone or an empty email", () => {
    expect(letterheadContact({ contactEmail: "", contactPhone: "+91 XXXXX XXXXX" })).toEqual({
      email: LETTERHEAD_FALLBACK_EMAIL,
      concierge: LETTERHEAD_FALLBACK_CONCIERGE,
    });
    expect(letterheadContact({})).toEqual({ email: "hello@moverestorephysio.com", concierge: "+91 82772 04388" });
  });
  it("prints the website with www.", () => {
    expect(LETTERHEAD_WEBSITE).toBe("www.moverestorephysio.com");
  });
});

describe("letterheadTagline", () => {
  it("falls back to the brand tagline", () => {
    expect(letterheadTagline("")).toBe("Move better • Live brighter");
    expect(letterheadTagline("Heal well")).toBe("Heal well");
  });
});

describe("watermarkWord", () => {
  it.each([
    ["Money in - from patients", "MONEY IN"],
    ["Clinic share: the sessions behind it", "CLINIC SHARE"],
    ["Admin activity log - archive", "ADMIN ACTIVITY"],
    ["Profit and loss", "PROFIT AND LOSS"],
    ["Ratings and feedback", "RATINGS"],
    ["Sessions", "SESSIONS"],
    ["", "EXPORT"],
  ])("%s -> %s", (title, word) => expect(watermarkWord(title)).toBe(word));
});

describe("layoutFor", () => {
  it("is A4 in both orientations, with a content box inside the page", () => {
    const p = layoutFor("portrait");
    const l = layoutFor("landscape");
    expect([p.width, p.height]).toEqual([A4_SHORT, A4_LONG]);
    expect([l.width, l.height]).toEqual([A4_LONG, A4_SHORT]);
    for (const lay of [p, l]) {
      expect(lay.right).toBeLessThan(lay.width - lay.gutter);
      expect(lay.contentWidth).toBeCloseTo(lay.right - lay.left, 5);
      expect(lay.bottom).toBeGreaterThan(lay.footerHeight);
    }
  });
});

const sizes = async (bytes: Uint8Array) => {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => [Number(p.getWidth().toFixed(2)), Number(p.getHeight().toFixed(2))]);
};

describe("every generator prints A4 on the letterhead", () => {
  it("table exports are A4 landscape on every page, however long", async () => {
    const bytes = await buildTablePdf({
      siteName: "MoveRestore Physiotherapy",
      title: "Sessions",
      subtitle: "Every session passing the filters in view.",
      columns: ["Session ID", "Patient", "Amount (INR)"],
      rows: Array.from({ length: 120 }, (_, i) => [`SS${3000 + i}`, "Ananya Iyer", "1,200.00"]),
      generatedAt: new Date("2026-11-28T13:12:00.000Z"),
      generatedBy: "admin@example.com",
    });
    const dims = await sizes(bytes);
    expect(dims.length).toBeGreaterThan(2);
    for (const d of dims) expect(d).toEqual([A4_LONG, A4_SHORT]);
  });

  it("an empty table still builds", async () => {
    const bytes = await buildTablePdf({
      siteName: "MoveRestore Physiotherapy",
      title: "Receipts",
      columns: ["Date"],
      rows: [],
      generatedAt: new Date("2026-11-28T13:12:00.000Z"),
    });
    expect(await sizes(bytes)).toEqual([[A4_LONG, A4_SHORT]]);
  });

  it("the health profile is A4 portrait, with a date of birth in the header", async () => {
    const bytes = await buildHealthProfilePdf({
      siteName: "MoveRestore Physiotherapy",
      patientName: "Priya Sharma",
      patientCode: "PT0042",
      patientEmail: "priya@example.com",
      patientDob: "1992-03-12",
      patientGender: "female",
      exportedAt: new Date("2026-10-20T06:00:00.000Z"),
      status: "Approved",
      specialtyLabel: "Orthopaedic",
      questions: [],
      answers: {},
      assessments: [],
      painMapOverridesByRegion: {},
      documents: [],
      showExaminations: false,
    });
    for (const d of await sizes(bytes)) expect(d).toEqual([A4_SHORT, A4_LONG]);
  });

  it("'Your data' is A4 portrait on every page", async () => {
    const bytes = await buildPersonalDataPdf({
      siteName: "MoveRestore Physiotherapy",
      personName: "Asha Rao",
      roleLabel: "Patient",
      reference: "EXP-ABC234",
      generatedAtLabel: "16 Nov 2026, 10:00 am",
      figures: [{ label: "Sessions booked", value: "12" }],
      contactEmail: "grievance@example.com",
      sections: [
        {
          heading: "Sessions",
          blocks: [
            {
              kind: "table",
              columns: [
                { label: "When", width: 0.5 },
                { label: "Paid", width: 0.5, align: "right" },
              ],
              rows: Array.from({ length: 90 }, (_, i) => [`Session ${i + 1}`, "Rs. 1,999"]),
              empty: "None.",
            },
          ],
        },
      ],
    });
    const dims = await sizes(bytes);
    expect(dims.length).toBeGreaterThan(1);
    for (const d of dims) expect(d).toEqual([A4_SHORT, A4_LONG]);
  });
});
