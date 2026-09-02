import { describe, expect, it } from "vitest";

import { decideAutoAssignment } from "@/lib/autoAssignTherapist";

/**
 * The rule that decides whether a paid session gets a therapist without an
 * admin, or waits in the queue as it always did.
 *
 * The whole safety of this feature is in "only when the answer is
 * unambiguous", so that is what is pinned here: silence is the fallback,
 * and the patient's own stated preference is the one thing that overrides
 * the count.
 */
describe("decideAutoAssignment", () => {
  it("assigns the only free therapist", () => {
    expect(
      decideAutoAssignment({ rostered: ["a"], busy: [] })
    ).toEqual({ therapistId: "a", reason: "only_candidate" });
  });

  it("assigns the only free one when a colleague is busy", () => {
    expect(
      decideAutoAssignment({ rostered: ["a", "b"], busy: ["b"] })
    ).toEqual({ therapistId: "a", reason: "only_candidate" });
  });

  it("declines to choose when two are free", () => {
    // The queue is where a choice between clinicians already gets made.
    expect(decideAutoAssignment({ rostered: ["a", "b"], busy: [] })).toBeNull();
  });

  it("declines when nobody is rostered for the hour", () => {
    expect(decideAutoAssignment({ rostered: [], busy: [] })).toBeNull();
  });

  it("declines when everyone rostered is already booked", () => {
    expect(
      decideAutoAssignment({ rostered: ["a", "b"], busy: ["a", "b"] })
    ).toBeNull();
  });

  it("honours a patient's requested therapist even when others are free", () => {
    expect(
      decideAutoAssignment({
        rostered: ["a", "b", "c"],
        busy: [],
        preferredTherapistId: "b",
      })
    ).toEqual({ therapistId: "b", reason: "preferred" });
  });

  it("falls back to the count when the requested therapist is busy", () => {
    expect(
      decideAutoAssignment({
        rostered: ["a", "b"],
        busy: ["b"],
        preferredTherapistId: "b",
      })
    ).toEqual({ therapistId: "a", reason: "only_candidate" });
  });

  it("ignores a requested therapist who is not rostered for that hour", () => {
    // A stale ?therapist= link, or someone whose schedule has since
    // changed: the request is dropped rather than overriding the roster.
    expect(
      decideAutoAssignment({
        rostered: ["a", "b"],
        busy: [],
        preferredTherapistId: "z",
      })
    ).toBeNull();
  });

  it("ignores a blank or whitespace preference", () => {
    expect(
      decideAutoAssignment({ rostered: ["a"], busy: [], preferredTherapistId: "   " })
    ).toEqual({ therapistId: "a", reason: "only_candidate" });
    expect(
      decideAutoAssignment({ rostered: ["a"], busy: [], preferredTherapistId: null })
    ).toEqual({ therapistId: "a", reason: "only_candidate" });
  });

  it("still declines when the requested therapist is the only one and is busy", () => {
    expect(
      decideAutoAssignment({
        rostered: ["b"],
        busy: ["b"],
        preferredTherapistId: "b",
      })
    ).toBeNull();
  });
});
