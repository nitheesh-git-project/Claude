// May this booking be made on pay-later terms?
//
// The judgement with the database taken out, so it is unit-tested rather than
// only clicked -- the same shape `decideAutoAssignment` has beside
// `pickAutoAssignTherapist`, and for the same reason: this decides whether a
// session is delivered without money, and a rule that lives only inside a
// route handler is a rule nobody can test the edges of.
//
// It returns a NAMED reason rather than a boolean, because the route and the
// booking wizard both consume it and they must not grow two different answers
// to "why not". A boolean would make the wizard invent its own sentence.

export type PayLaterRefusal =
  /** The clinic-wide switch is off, or could not be read (it fails closed). */
  | "feature_off"
  /** This patient has not been granted terms. The commonest answer by far. */
  | "not_on_terms"
  /** Online only. A home visit carries travel, which is a pass-through paid
   *  to the therapist in full -- deferring it would have them funding their
   *  own transport until the patient settled. */
  | "home_visit"
  /** A session against a programme the patient already bought. Those sessions
   *  are drawn from the credit ledger, which is a different accounting fact
   *  entirely, and pay later deliberately does not touch it. */
  | "programme";

export type PayLaterDecision =
  | { allowed: true }
  | { allowed: false; reason: PayLaterRefusal };

export type PayLaterBookingInput = {
  /** `site_settings.pay_later_enabled`, read in its own call failing closed. */
  featureEnabled: boolean;
  /** `profiles.pay_later_enabled` for the patient this booking is for. */
  patientOnTerms: boolean;
  /** `appointments.visit_mode`. Absent reads as online, which is what every
   *  row was before that column existed. */
  visitMode?: string | null;
  /** True when the booking is drawn from a purchased programme. */
  hasProgramme?: boolean;
};

/**
 * The order of the checks is the order the answers are useful in.
 *
 * The switch first, because when it is off nothing else matters and saying
 * "this patient isn't on terms" would send an admin to a profile screen that
 * was never the problem. Then the patient, then the two shape rules.
 */
export function decidePayLaterBooking(input: PayLaterBookingInput): PayLaterDecision {
  if (!input.featureEnabled) return { allowed: false, reason: "feature_off" };
  if (!input.patientOnTerms) return { allowed: false, reason: "not_on_terms" };
  // A column that was not loaded reads as online -- the same rule
  // `meetSyncState` follows, and what every appointment was before home
  // visits existed.
  if (input.visitMode === "home_visit") return { allowed: false, reason: "home_visit" };
  if (input.hasProgramme) return { allowed: false, reason: "programme" };
  return { allowed: true };
}

/**
 * What the patient is told, which is deliberately never the whole truth.
 *
 * `not_on_terms` and `feature_off` say the same thing on purpose: a patient
 * who was never granted terms should not learn that such an arrangement
 * exists and they are not in it, and neither should somebody probing the
 * route. The two shape rules DO say what they are, because those are about
 * the booking in front of them and knowing the reason is how they get it
 * right on the next try.
 */
export function payLaterRefusalMessage(reason: PayLaterRefusal): string {
  switch (reason) {
    case "home_visit":
      return "Home visits are paid for when they're booked. You can book an online session to pay later.";
    case "programme":
      return "This session comes out of a programme you've already paid for, so there's nothing to settle.";
    case "feature_off":
    case "not_on_terms":
      return "This booking needs to be paid for now.";
  }
}
