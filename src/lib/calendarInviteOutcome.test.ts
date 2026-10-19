import { describe, it, expect } from "vitest";
import {
  adminBookingInviteNeedsAttention,
  adminBookingSuccessMessage,
  calendarInviteSentence,
  isCalendarInviteOutcome,
} from "@/lib/calendarInviteOutcome";

describe("adminBookingSuccessMessage", () => {
  it("promises an invite only when Google actually sent one", () => {
    // QA F-13: "The calendar invite is on its way" was printed for every
    // confirmed booking, including with Google not connected at all.
    expect(adminBookingSuccessMessage("confirmed", "sent")).toBe(
      "Booked and confirmed. Google has emailed the calendar invite to the patient and the therapist."
    );
    for (const outcome of ["failed", "switched_off", "no_email", "unknown", "already_sent"]) {
      expect(adminBookingSuccessMessage("confirmed", outcome)).not.toMatch(/on its way|has emailed/);
    }
  });

  it("says the invite was not sent when Google refused or is not configured", () => {
    const text = adminBookingSuccessMessage("confirmed", "failed");
    expect(text).toMatch(/^Booked and confirmed\./);
    expect(text).toMatch(/No calendar invite was sent/);
    expect(text).toMatch(/Session Links/);
  });

  it("names the switch when Meet links are turned off", () => {
    expect(adminBookingSuccessMessage("confirmed", "switched_off")).toMatch(/Auto-Create Meet Links is off/);
  });

  it("treats a missing or unreadable outcome as couldn't-check, never as sent", () => {
    for (const outcome of [undefined, null, "", "nonsense", 42]) {
      expect(isCalendarInviteOutcome(outcome)).toBe(false);
      expect(calendarInviteSentence(outcome)).toMatch(/couldn't confirm whether/);
    }
  });

  it("an unassigned booking says nothing about an invite", () => {
    expect(adminBookingSuccessMessage("requested", null)).toBe(
      "Booked. It's in the queue waiting for a therapist."
    );
  });
});

describe("adminBookingInviteNeedsAttention", () => {
  it("warns only for a confirmed booking whose patient has no invite", () => {
    expect(adminBookingInviteNeedsAttention("confirmed", "sent")).toBe(false);
    expect(adminBookingInviteNeedsAttention("confirmed", "already_sent")).toBe(false);
    expect(adminBookingInviteNeedsAttention("confirmed", "failed")).toBe(true);
    expect(adminBookingInviteNeedsAttention("confirmed", "switched_off")).toBe(true);
    expect(adminBookingInviteNeedsAttention("confirmed", undefined)).toBe(true);
    expect(adminBookingInviteNeedsAttention("requested", null)).toBe(false);
  });
});
