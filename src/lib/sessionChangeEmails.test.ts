import { describe, expect, it } from "vitest";
import { clinicNoTherapistAlertEmail, sessionMovedEmail, therapistSessionReleasedEmail } from "./sessionChangeEmails";

const brand = { siteName: "MoveRestore", siteUrl: "https://example.test" };

describe("session change emails", () => {
  it("tells the patient the old and new time, and apologises when the clinic missed it", () => {
    const e = sessionMovedEmail(brand, {
      name: "Asha <b>",
      oldWhen: "24 Nov, 6:00 pm IST",
      newWhen: "26 Nov, 11:00 am IST",
      mode: "online",
      reason: "no_therapist",
      dashboardUrl: "https://example.test/patient/dashboard",
    });
    expect(e.text).toContain("has moved to 26 Nov, 11:00 am IST");
    expect(e.text).toContain("couldn't confirm a physiotherapist");
    expect(e.html).not.toContain("<b>");
  });
  it("names no patient in the staff emails", () => {
    const t = therapistSessionReleasedEmail(brand, {
      name: "Dr Rao",
      sessionRef: "SS0042",
      when: "24 Nov, 6:00 pm IST",
      mode: "online",
      change: "cancelled",
      dashboardUrl: "https://example.test/therapist/dashboard",
    });
    expect(t.subject).toBe("Cancelled: session SS0042 on 24 Nov, 6:00 pm IST");
    const c = clinicNoTherapistAlertEmail(brand, {
      sessionRef: "SS0042",
      when: "24 Nov, 6:00 pm IST",
      mode: "home_visit",
      action: "refunded",
      newWhen: null,
      adminUrl: "https://example.test/admin",
    });
    expect(c.text).toContain("refunded in full");
  });
});
