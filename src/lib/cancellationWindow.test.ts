import { describe, it, expect } from "vitest";
import { describeCancellationWindow } from "./cancellationWindow";

const HOUR = 3_600_000;
const NOW = new Date("2026-09-22T09:00:00+05:30").getTime();

describe("describeCancellationWindow", () => {
  it("names the deadline for a slot comfortably outside the window", () => {
    const slotMs = NOW + 72 * HOUR;
    const w = describeCancellationWindow({ slotMs, refundWindowHours: 24, nowMs: NOW });
    expect(w.kind).toBe("deadline");
    if (w.kind !== "deadline") throw new Error("unreachable");
    expect(w.deadlineMs).toBe(slotMs - 24 * HOUR);
    expect(w.hours).toBe(24);
  });

  it("says the booking is already inside the window when it is", () => {
    // The case the old sentence got wrong on a real screen: the booking lead
    // time is 12 hours and the refund window defaults to 24, so every
    // booking made 12-24 hours out is non-refundable the moment it is made
    // -- and the wizard was telling that patient "free cancellation up to 24
    // hours before your slot".
    const w = describeCancellationWindow({
      slotMs: NOW + 14 * HOUR,
      refundWindowHours: 24,
      nowMs: NOW,
    });
    expect(w.kind).toBe("already_inside");
    expect(w.hours).toBe(24);
  });

  it("is refundable at exactly the boundary, matching what the cancel route does", () => {
    // cancelAppointment.ts refuses when `hoursUntilSlot < refundWindowHours`,
    // so exactly 24 hours out still refunds. The screen must not claim
    // otherwise.
    const w = describeCancellationWindow({
      slotMs: NOW + 24 * HOUR,
      refundWindowHours: 24,
      nowMs: NOW,
    });
    expect(w.kind).toBe("deadline");
  });

  it("is inside the window one millisecond under the boundary", () => {
    const w = describeCancellationWindow({
      slotMs: NOW + 24 * HOUR - 1,
      refundWindowHours: 24,
      nowMs: NOW,
    });
    expect(w.kind).toBe("already_inside");
  });

  it("states the rule alone when no slot has been chosen", () => {
    expect(describeCancellationWindow({ slotMs: null, refundWindowHours: 24, nowMs: NOW }).kind).toBe(
      "rule_only"
    );
    expect(
      describeCancellationWindow({ slotMs: Number.NaN, refundWindowHours: 24, nowMs: NOW }).kind
    ).toBe("rule_only");
    expect(
      describeCancellationWindow({ slotMs: undefined, refundWindowHours: 24, nowMs: NOW }).kind
    ).toBe("rule_only");
  });

  it("follows the clinic's own window rather than a constant", () => {
    const slotMs = NOW + 100 * HOUR;
    const w72 = describeCancellationWindow({ slotMs, refundWindowHours: 72, nowMs: NOW });
    const w24 = describeCancellationWindow({ slotMs, refundWindowHours: 24, nowMs: NOW });
    if (w72.kind !== "deadline" || w24.kind !== "deadline") throw new Error("unreachable");
    expect(w72.deadlineMs).toBe(slotMs - 72 * HOUR);
    expect(w24.deadlineMs).toBe(slotMs - 24 * HOUR);
    // A clinic that lengthens its window shortens the patient's deadline.
    expect(w72.deadlineMs).toBeLessThan(w24.deadlineMs);
  });

  it("treats a window of zero as free until the slot itself", () => {
    // 0 is a real answer -- a clinic that refunds any cancellation. It is not
    // the same as "no window configured", which resolves to the default well
    // before this function sees it.
    const slotMs = NOW + 3 * HOUR;
    const w = describeCancellationWindow({ slotMs, refundWindowHours: 0, nowMs: NOW });
    expect(w.kind).toBe("deadline");
    if (w.kind !== "deadline") throw new Error("unreachable");
    expect(w.deadlineMs).toBe(slotMs);
  });

  it("never produces a negative window out of a nonsense setting", () => {
    const slotMs = NOW + 3 * HOUR;
    const w = describeCancellationWindow({ slotMs, refundWindowHours: -5, nowMs: NOW });
    if (w.kind !== "deadline") throw new Error("unreachable");
    expect(w.deadlineMs).toBe(slotMs);
    expect(w.hours).toBe(0);
  });
});
