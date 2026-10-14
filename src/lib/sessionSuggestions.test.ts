import { describe, expect, it } from "vitest";
import { SUGGESTION_STATE_LABELS, suggestRefusal, suggestionState } from "./sessionSuggestions";
import { assignabilityReasons } from "./therapistAssignability";

describe("SUGGESTION_STATE_LABELS", () => {
  it("says an accepted suggestion is waiting on the clinic, not booked and confirmed", () => {
    expect(SUGGESTION_STATE_LABELS.accepted).toBe("Accepted - clinic confirming");
  });
});

describe("suggestionState", () => {
  it("stops being actionable inside the lead time", () => {
    const slot = "2026-11-12T10:00:00Z";
    const slotMs = Date.parse(slot);
    expect(suggestionState({ status: "pending", slot_time: slot }, slotMs - 48 * 3_600_000, 12 * 3_600_000)).toBe(
      "actionable"
    );
    expect(suggestionState({ status: "pending", slot_time: slot }, slotMs - 3_600_000, 12 * 3_600_000)).toBe(
      "lapsed"
    );
  });
});

describe("suggestRefusal", () => {
  it("speaks to the therapist about their own hours", () => {
    const reasons = assignabilityReasons({
      onLeave: false,
      weeklyHourCount: 10,
      slotState: "unavailable",
      hourLabel: "6 PM - 7 PM",
      dateLabel: "12 Nov 2026",
      alreadyBooked: false,
    });
    expect(suggestRefusal(reasons)).toBe(
      "You can only suggest a time inside your own working hours. You're not working 6 PM - 7 PM on 12 Nov 2026."
    );
  });

  it("names every reason at once", () => {
    const reasons = assignabilityReasons({
      onLeave: true,
      weeklyHourCount: 0,
      slotState: null,
      hourLabel: "6 PM - 7 PM",
      dateLabel: "12 Nov 2026",
      alreadyBooked: true,
    });
    const text = suggestRefusal(reasons);
    expect(text).toContain("You're on leave");
    expect(text).toContain("You haven't filled in your working hours yet");
    expect(text).toContain("You already have a session at 6 PM - 7 PM on 12 Nov 2026.");
    expect(text).not.toMatch(/Not working|Already has|Has not/);
  });
});
