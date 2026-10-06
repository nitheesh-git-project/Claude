import { describe, expect, it } from "vitest";
import { msUntilCancelCloses, patientCancelClosed } from "./patientCancelCutoff";

const slot = "2026-10-06T12:30:00.000Z";
const slotMs = new Date(slot).getTime();
const MIN = 60_000;

describe("patientCancelClosed", () => {
  it("is open before the cut-off", () => {
    expect(patientCancelClosed({ slotTime: slot, nowMs: slotMs - 16 * MIN, cutoffMinutes: 15 })).toBe(false);
  });
  it("closes exactly at the cut-off and stays closed", () => {
    expect(patientCancelClosed({ slotTime: slot, nowMs: slotMs - 15 * MIN, cutoffMinutes: 15 })).toBe(true);
    expect(patientCancelClosed({ slotTime: slot, nowMs: slotMs + 5 * MIN, cutoffMinutes: 15 })).toBe(true);
  });
  it("with a zero cut-off closes at the start", () => {
    expect(patientCancelClosed({ slotTime: slot, nowMs: slotMs - 1, cutoffMinutes: 0 })).toBe(false);
    expect(patientCancelClosed({ slotTime: slot, nowMs: slotMs, cutoffMinutes: 0 })).toBe(true);
  });
  it("never closes a session with no time yet", () => {
    expect(patientCancelClosed({ slotTime: null, nowMs: slotMs, cutoffMinutes: 15 })).toBe(false);
  });
});

describe("msUntilCancelCloses", () => {
  it("counts down to the cut-off", () => {
    expect(msUntilCancelCloses({ slotTime: slot, nowMs: slotMs - 20 * MIN, cutoffMinutes: 15 })).toBe(5 * MIN);
  });
  it("is null once closed", () => {
    expect(msUntilCancelCloses({ slotTime: slot, nowMs: slotMs - 10 * MIN, cutoffMinutes: 15 })).toBeNull();
  });
});
