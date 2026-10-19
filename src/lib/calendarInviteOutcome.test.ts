import { describe, it, expect } from "vitest";
import {
  adminBookingInviteNeedsAttention,
  adminBookingSuccessMessage,
  calendarInviteSentence,
  inviteDeliveryFor,
  isCalendarInviteOutcome,
  NO_INVITE_DELIVERY,
  normalizeInviteDelivery,
  patientInviteLine,
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

describe("what a patient is promised about invites", () => {
  const all = inviteDeliveryFor({ googleConfigured: true, meetEnabled: true });
  const none = inviteDeliveryFor({ googleConfigured: false, meetEnabled: true });
  const meetOff = inviteDeliveryFor({ googleConfigured: true, meetEnabled: false });

  it("sends nothing without Google, and Meet off stops only video sessions", () => {
    expect(all).toEqual({ online: true, homeVisit: true });
    expect(none).toEqual(NO_INVITE_DELIVERY);
    expect(meetOff).toEqual({ online: false, homeVisit: true });
    // Absent column reads as on, the way the sync itself reads it.
    expect(inviteDeliveryFor({ googleConfigured: true, meetEnabled: null }).online).toBe(true);
    // Unreadable settings: couldn't check, so promise nothing for video.
    expect(
      inviteDeliveryFor({ googleConfigured: true, meetEnabled: null, settingsReadFailed: true }).online
    ).toBe(false);
  });

  it("promises an invite only when one will be sent, and the dashboard otherwise", () => {
    const contexts = ["online_booked", "online_registered", "suggestion_accepted"] as const;
    for (const context of contexts) {
      expect(patientInviteLine(context, all)).toMatch(/calendar invite/);
      for (const d of [none, meetOff]) {
        const line = patientInviteLine(context, d);
        expect(line).not.toMatch(/invite/i);
        expect(line).toMatch(/Sessions on your dashboard/);
      }
    }
    expect(patientInviteLine("home_visit_booked", meetOff)).toMatch(/calendar invite/);
    expect(patientInviteLine("home_visit_booked", none)).toMatch(/Sessions on your dashboard/);
    expect(patientInviteLine("home_visit_booked", none)).not.toMatch(/invite/i);
  });

  it("the public example chip claims an invite only when every session gets one", () => {
    expect(patientInviteLine("example_chip", all)).toBe("Calendar invite on its way.");
    expect(patientInviteLine("example_chip", meetOff)).not.toMatch(/invite/i);
    expect(patientInviteLine("example_chip", none)).not.toMatch(/invite/i);
  });

  it("anything a client was handed that is not a clear yes is a no", () => {
    expect(normalizeInviteDelivery(undefined)).toEqual(NO_INVITE_DELIVERY);
    expect(normalizeInviteDelivery({ online: "yes", homeVisit: 1 })).toEqual(NO_INVITE_DELIVERY);
    expect(normalizeInviteDelivery({ online: true, homeVisit: false })).toEqual({ online: true, homeVisit: false });
  });
});
