import { describe, it, expect } from "vitest";
import {
  decidePayLaterBooking,
  payLaterRefusalMessage,
  type PayLaterBookingInput,
} from "./payLaterBooking";

const allowed = (over: Partial<PayLaterBookingInput> = {}): PayLaterBookingInput => ({
  featureEnabled: true,
  patientOnTerms: true,
  visitMode: "online",
  hasProgramme: false,
  ...over,
});

describe("decidePayLaterBooking", () => {
  it("allows an online session for a patient on terms while the switch is on", () => {
    expect(decidePayLaterBooking(allowed())).toEqual({ allowed: true });
  });

  // Every one of these is the default state on the day this ships: the
  // switch is off and nobody is granted terms, so the answer is no.
  it("refuses while the clinic-wide switch is off", () => {
    expect(decidePayLaterBooking(allowed({ featureEnabled: false }))).toEqual({
      allowed: false,
      reason: "feature_off",
    });
  });

  it("refuses a patient who has not been granted terms", () => {
    expect(decidePayLaterBooking(allowed({ patientOnTerms: false }))).toEqual({
      allowed: false,
      reason: "not_on_terms",
    });
  });

  // The switch is asked first on purpose: with it off, naming the patient
  // would send an admin to a profile screen that was never the problem.
  it("names the switch before the patient when both are against it", () => {
    const d = decidePayLaterBooking({ featureEnabled: false, patientOnTerms: false });
    expect(d).toEqual({ allowed: false, reason: "feature_off" });
  });

  // Travel is a pass-through paid to the therapist in full. Deferring it
  // would have them funding their own transport until the patient settled.
  it("refuses a home visit", () => {
    expect(decidePayLaterBooking(allowed({ visitMode: "home_visit" }))).toEqual({
      allowed: false,
      reason: "home_visit",
    });
  });

  // Those sessions are drawn from the credit ledger, which pay later
  // deliberately never touches.
  it("refuses a session drawn from a programme", () => {
    expect(decidePayLaterBooking(allowed({ hasProgramme: true }))).toEqual({
      allowed: false,
      reason: "programme",
    });
  });

  // A select that did not ask for `visit_mode` must read as online, which is
  // what every appointment was before that column existed.
  it("treats an unloaded visit mode as online", () => {
    expect(decidePayLaterBooking({ featureEnabled: true, patientOnTerms: true })).toEqual({
      allowed: true,
    });
    expect(decidePayLaterBooking(allowed({ visitMode: null }))).toEqual({ allowed: true });
  });
});

describe("payLaterRefusalMessage", () => {
  // A patient who was never granted terms must not learn the arrangement
  // exists and they are not in it -- and neither should somebody probing the
  // route. The two states say exactly the same words.
  it("says the same thing for both states that are about the patient", () => {
    expect(payLaterRefusalMessage("not_on_terms")).toBe(payLaterRefusalMessage("feature_off"));
  });

  it("never names the arrangement in those two", () => {
    for (const reason of ["not_on_terms", "feature_off"] as const) {
      expect(payLaterRefusalMessage(reason).toLowerCase()).not.toContain("pay later");
      expect(payLaterRefusalMessage(reason).toLowerCase()).not.toContain("terms");
    }
  });

  // These two ARE about the booking in front of them, and knowing the reason
  // is how somebody gets it right on the next try.
  it("says what a home visit and a programme are", () => {
    expect(payLaterRefusalMessage("home_visit").toLowerCase()).toContain("home visit");
    expect(payLaterRefusalMessage("programme").toLowerCase()).toContain("programme");
  });

  it("gives every reason a sentence", () => {
    for (const reason of ["feature_off", "not_on_terms", "home_visit", "programme"] as const) {
      expect(payLaterRefusalMessage(reason).length).toBeGreaterThan(20);
    }
  });
});
