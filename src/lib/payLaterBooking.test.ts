import { describe, it, expect } from "vitest";
import {
  decidePayLaterBooking,
  payLaterRefusalMessage,
  resolveMaxOwedPaise,
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
    for (const reason of [
      "feature_off",
      "not_on_terms",
      "home_visit",
      "programme",
      "over_limit",
    ] as const) {
      expect(payLaterRefusalMessage(reason).length).toBeGreaterThan(20);
    }
  });
});

// The ceiling on what one patient may owe. The default is **none**, and that
// is the original design rather than an oversight: the population is tiny and
// hand-picked, and refusing a long-standing patient at the counter is a
// product decision. This exists so a clinic that wants one is not made to
// choose between having a limit and having the feature.
describe("the pay-later ceiling", () => {
  it("changes nothing at all when no ceiling is set", () => {
    expect(
      decidePayLaterBooking(allowed({ currentlyOwedPaise: 9_999_999, bookingAmountPaise: 120_000 }))
    ).toEqual({ allowed: true });
  });

  it("refuses a booking that would take the patient past it", () => {
    expect(
      decidePayLaterBooking(
        allowed({ maxOwedPaise: 500_000, currentlyOwedPaise: 450_000, bookingAmountPaise: 120_000 })
      )
    ).toEqual({ allowed: false, reason: "over_limit" });
  });

  // Strictly greater. A limit that refused at its own number would mean the
  // figure an admin typed is one the clinic never actually allows.
  it("allows a booking that lands exactly on the ceiling", () => {
    expect(
      decidePayLaterBooking(
        allowed({ maxOwedPaise: 500_000, currentlyOwedPaise: 380_000, bookingAmountPaise: 120_000 })
      )
    ).toEqual({ allowed: true });
  });

  // The ceiling is about this patient's history, so every answer that is more
  // useful comes first -- an admin sent to a profile screen by "not on terms"
  // is better served than one told about a limit that was never the problem.
  it("reports the more useful reason when several apply", () => {
    expect(
      decidePayLaterBooking(
        allowed({
          patientOnTerms: false,
          maxOwedPaise: 1,
          currentlyOwedPaise: 500_000,
          bookingAmountPaise: 120_000,
        })
      )
    ).toEqual({ allowed: false, reason: "not_on_terms" });
    expect(
      decidePayLaterBooking(
        allowed({
          visitMode: "home_visit",
          maxOwedPaise: 1,
          currentlyOwedPaise: 500_000,
        })
      )
    ).toEqual({ allowed: false, reason: "home_visit" });
  });

  // It names the arrangement and what clears it, because this patient already
  // knows they have it -- unlike the two refusals that deliberately say the
  // same thing to avoid telling somebody an arrangement exists.
  it("tells the patient what would clear it, and quotes no figure", () => {
    const message = payLaterRefusalMessage("over_limit");
    expect(message).toContain("Settling");
    expect(message).not.toMatch(/[0-9]/);
  });
});

describe("resolveMaxOwedPaise", () => {
  it("reads absence as no ceiling", () => {
    expect(resolveMaxOwedPaise(null)).toBeNull();
    expect(resolveMaxOwedPaise(undefined)).toBeNull();
  });

  // Zero is not a ceiling of nothing. Somebody who types 0 has almost
  // certainly cleared the box, and reading it as "refuse every booking" would
  // switch the feature off by accident through a field that says nothing
  // about switching it off.
  it("reads zero and anything unusable as no ceiling, never as refuse-everything", () => {
    expect(resolveMaxOwedPaise(0)).toBeNull();
    expect(resolveMaxOwedPaise(-5)).toBeNull();
    expect(resolveMaxOwedPaise(Number.NaN)).toBeNull();
  });

  it("takes a real figure whole", () => {
    expect(resolveMaxOwedPaise(500_000)).toBe(500_000);
    expect(resolveMaxOwedPaise(500_000.9)).toBe(500_000);
  });
});
