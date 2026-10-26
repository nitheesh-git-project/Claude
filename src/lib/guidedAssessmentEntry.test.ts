import { describe, expect, it } from "vitest";
import { cockpitHref, offersGuidedAssessment } from "@/lib/guidedAssessmentEntry";

const SLOT = Date.parse("2026-10-26T12:30:00.000Z");
const base = { status: "confirmed", noShow: false, isHomeVisit: false, slotTimeMs: SLOT, joinWindowMinutes: 15 };

describe("offersGuidedAssessment", () => {
  it("opens with the join window, like the session itself", () => {
    expect(offersGuidedAssessment({ ...base, nowMs: SLOT - 16 * 60_000 })).toBe(false);
    expect(offersGuidedAssessment({ ...base, nowMs: SLOT - 15 * 60_000 })).toBe(true);
    expect(offersGuidedAssessment({ ...base, nowMs: SLOT + 40 * 60_000 })).toBe(true);
  });
  it("is for a video session only", () => {
    expect(offersGuidedAssessment({ ...base, isHomeVisit: true, nowMs: SLOT })).toBe(false);
  });
  it("is not offered for a no-show, a cancelled or a pending session", () => {
    expect(offersGuidedAssessment({ ...base, noShow: true, nowMs: SLOT })).toBe(false);
    expect(offersGuidedAssessment({ ...base, status: "cancelled", nowMs: SLOT })).toBe(false);
    expect(offersGuidedAssessment({ ...base, status: "pending", nowMs: SLOT })).toBe(false);
  });
  it("stays on a just-finished session for two hours", () => {
    expect(offersGuidedAssessment({ ...base, status: "completed", nowMs: SLOT + 60 * 60_000 })).toBe(true);
    expect(offersGuidedAssessment({ ...base, status: "completed", nowMs: SLOT + 3 * 60 * 60_000 })).toBe(false);
  });
  it("needs a time", () => {
    expect(offersGuidedAssessment({ ...base, slotTimeMs: null, nowMs: SLOT })).toBe(false);
  });
});

describe("cockpitHref", () => {
  it("names the patient and optionally the session", () => {
    expect(cockpitHref("p 1")).toBe("/therapist/dashboard/assessment/p%201");
    expect(cockpitHref("p1", "a1")).toBe("/therapist/dashboard/assessment/p1?appointment=a1");
  });
});
