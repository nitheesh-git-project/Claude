import { describe, it, expect } from "vitest";
import {
  therapistReadiness,
  missingReadiness,
  isTherapistReady,
  canAutoAssignTo,
  describeReadiness,
  type TherapistReadinessInput,
} from "./therapistReadiness";

function therapist(overrides: Partial<TherapistReadinessInput> = {}): TherapistReadinessInput {
  return {
    approved: true,
    active: true,
    onLeave: false,
    weeklyHourCount: 20,
    revenueSharePercent: 60,
    specialization: "Orthopaedic",
    ...overrides,
  };
}

describe("therapistReadiness", () => {
  it("reports a fully set-up therapist as ready, with nothing to say", () => {
    expect(isTherapistReady(therapist())).toBe(true);
    expect(missingReadiness(therapist())).toHaveLength(0);
    expect(describeReadiness(therapist())).toBeNull();
  });

  // The whole point of the module: approved is not ready.
  it("separates approved from ready", () => {
    const approvedOnly = therapist({ weeklyHourCount: 0, revenueSharePercent: null });
    expect(approvedOnly.approved).toBe(true);
    expect(isTherapistReady(approvedOnly)).toBe(false);
    expect(missingReadiness(approvedOnly).map((i) => i.key)).toEqual([
      "roster",
      "revenue_share",
    ]);
  });

  // Zero is a real revenue share somebody may have chosen, and null is not.
  // Treating them alike is how a deliberate setting reads as an omission.
  it("counts a zero revenue share as set and a null one as missing", () => {
    expect(isTherapistReady(therapist({ revenueSharePercent: 0 }))).toBe(true);
    expect(isTherapistReady(therapist({ revenueSharePercent: null }))).toBe(false);
  });

  it("refuses a nonsensical revenue share rather than accepting it", () => {
    expect(isTherapistReady(therapist({ revenueSharePercent: 140 }))).toBe(false);
    expect(isTherapistReady(therapist({ revenueSharePercent: -1 }))).toBe(false);
    expect(isTherapistReady(therapist({ revenueSharePercent: Number.NaN }))).toBe(false);
  });

  it("treats whitespace as no specialisation at all", () => {
    expect(isTherapistReady(therapist({ specialization: "   " }))).toBe(false);
    expect(isTherapistReady(therapist({ specialization: null }))).toBe(false);
  });

  // Free text written before the canonical list existed is still an answer.
  it("accepts a specialisation nobody standardised", () => {
    expect(isTherapistReady(therapist({ specialization: "sports injury clinic" }))).toBe(true);
  });
});

describe("canAutoAssignTo", () => {
  // Narrower than "ready", deliberately. A missing specialisation costs a
  // patient a sentence on a profile page; refusing to assign over it would
  // leave paid sessions in the queue for a field nobody was told about.
  it("assigns to a therapist whose only gap is a specialisation", () => {
    const input = therapist({ specialization: null });
    expect(isTherapistReady(input)).toBe(false);
    expect(canAutoAssignTo(input)).toBe(true);
  });

  // The two that fail silently: no roster means the clinic never meant to
  // offer that hour, and no revenue share means the session is delivered and
  // the therapist is owed nothing with no screen saying why.
  it("refuses a therapist with no roster or no rate", () => {
    expect(canAutoAssignTo(therapist({ weeklyHourCount: 0 }))).toBe(false);
    expect(canAutoAssignTo(therapist({ revenueSharePercent: null }))).toBe(false);
  });

  it("refuses an unapproved or suspended account", () => {
    expect(canAutoAssignTo(therapist({ approved: false }))).toBe(false);
    expect(canAutoAssignTo(therapist({ active: false }))).toBe(false);
  });

  // Leave is a temporary state somebody set on purpose, not something
  // missing from the account, and the roster already reads it. A therapist
  // on leave is not *unfinished*.
  it("does not treat leave as an unfinished account", () => {
    expect(isTherapistReady(therapist({ onLeave: true }))).toBe(true);
    expect(therapistReadiness(therapist({ onLeave: true })).map((i) => i.key)).not.toContain(
      "on_leave"
    );
  });
});

describe("describeReadiness", () => {
  it("names the one thing when there is one, and counts them when there are more", () => {
    expect(describeReadiness(therapist({ revenueSharePercent: null }))).toBe(
      "Revenue share set is missing"
    );
    expect(describeReadiness(therapist({ revenueSharePercent: null, weeklyHourCount: 0 }))).toBe(
      "2 things still to set up"
    );
  });

  // Every item says why it matters rather than that a field is required --
  // a checklist an admin cannot act on is one they tick to make it go away.
  it("gives every item a reason rather than a rule", () => {
    for (const item of therapistReadiness(therapist())) {
      expect(item.why.length).toBeGreaterThan(20);
      expect(item.why.toLowerCase()).not.toContain("is required");
    }
  });
});
