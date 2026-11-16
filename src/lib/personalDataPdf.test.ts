import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildPersonalDataPdf, type PersonalDataDoc } from "./personalDataPdf";

const base: PersonalDataDoc = {
  siteName: "MoveRestore Physiotherapy",
  personName: "Asha Rao",
  roleLabel: "Patient",
  reference: "EXP-ABC234",
  generatedAtLabel: "16 Nov 2026, 10:00 am",
  figures: [
    { label: "Sessions booked", value: "12" },
    { label: "Paid to date", value: "Rs. 23,988" },
  ],
  contactEmail: "grievance@example.com",
  sections: [
    { heading: "Your account", blocks: [{ kind: "fields", rows: [["Name", "Asha Rao"], ["Email", "asha@example.com"]] }] },
    {
      heading: "Sessions",
      blocks: [
        {
          kind: "table",
          columns: [
            { label: "When", width: 0.5 },
            { label: "Paid", width: 0.5, align: "right" },
          ],
          rows: Array.from({ length: 120 }, (_, i) => [`Session ${i + 1}`, "Rs. 1,999"]),
          empty: "No sessions.",
        },
      ],
    },
    { heading: "Empty", blocks: [{ kind: "table", columns: [{ label: "A", width: 1 }], rows: [], empty: "Nothing here." }] },
    { heading: "Unread", blocks: [{ kind: "note", text: "This part could not be read just now." }] },
  ],
};

describe("buildPersonalDataPdf", () => {
  it("builds a valid PDF that runs onto further pages for a long list", async () => {
    const bytes = await buildPersonalDataPdf(base);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(2);
    expect(doc.getTitle()).toContain("Your data");
  });

  it("does not throw on text the standard fonts cannot encode", async () => {
    const bytes = await buildPersonalDataPdf({
      ...base,
      personName: "आशा राव",
      sections: [{ heading: "Notes ₹ “quoted” — dash", blocks: [{ kind: "text", text: "मराठी ✓ emoji 🙂 and ₹500" }] }],
    });
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
