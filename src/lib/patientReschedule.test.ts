import { describe, it, expect } from "vitest";
import { patientRescheduleBlock, type PatientRescheduleInput } from "./patientReschedule";

const NOW = Date.parse("2026-11-26T06:00:00Z");
const inHours = (h: number) => new Date(NOW + h * 3_600_000).toISOString();
const base: PatientRescheduleInput = {
  status: "confirmed",
  visitMode: "online",
  slotTime: inHours(48),
  nowMs: NOW,
  cutoffHours: 24,
  rescheduleCount: 0,
};

describe("patient reschedule", () => {
  it("allows an upcoming video session outside the cut-off, once", () => {
    expect(patientRescheduleBlock(base)).toBeNull();
    expect(patientRescheduleBlock({ ...base, status: "requested" })).toBeNull();
  });

  it("refuses inside the cut-off, naming the clinic's hours", () => {
    expect(patientRescheduleBlock({ ...base, slotTime: inHours(23) })).toContain("up to 24 hours before");
    expect(patientRescheduleBlock({ ...base, slotTime: inHours(30), cutoffHours: 48 })).toContain("48 hours");
  });

  it("refuses a second move", () => {
    expect(patientRescheduleBlock({ ...base, rescheduleCount: 1 })).toContain("already moved");
  });

  it("leaves home visits, past and cancelled sessions to the clinic", () => {
    expect(patientRescheduleBlock({ ...base, visitMode: "home_visit" })).toContain("home visit");
    expect(patientRescheduleBlock({ ...base, status: "completed" })).toContain("upcoming");
    expect(patientRescheduleBlock({ ...base, status: "cancelled" })).toContain("upcoming");
    expect(patientRescheduleBlock({ ...base, noShow: true })).toContain("upcoming");
    expect(patientRescheduleBlock({ ...base, slotTime: null })).toContain("no time");
  });
});
