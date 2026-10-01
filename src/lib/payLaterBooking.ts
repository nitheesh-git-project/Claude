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
  | "programme"
  /** This booking would take the patient past the clinic's own ceiling on
   *  what one person may owe. Unset by default -- see `maxOwedPaise`. */
  | "over_limit";

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
  /**
   * What this patient already owes, in paise: delivered sessions on terms
   * that are neither settled nor written off.
   */
  currentlyOwedPaise?: number;
  /** What this booking would add, frozen at the price it is booked at. */
  bookingAmountPaise?: number;
  /**
   * `site_settings.pay_later_max_owed_paise`, the clinic's own ceiling on
   * what one patient may owe at once.
   *
   * **Null means no ceiling, which is the default and the original design.**
   * The feature shipped with none on purpose: the population is tiny and
   * hand-picked, and refusing a long-standing patient at the counter is a
   * real product decision rather than a safety rail. The two figures on
   * Money -> Owed by Patients are the intended early warning.
   *
   * It exists because a clinic that wants a limit should not have to choose
   * between having one and having the feature -- and because the honest way
   * to hold an opinion the clinic may not share is a setting rather than a
   * constant. A stored value that cannot be used resolves back to null (no
   * ceiling) rather than to a bound: there is no safe direction to guess in
   * when the thing being decided is whether somebody is refused.
   */
  maxOwedPaise?: number | null;
};

/**
 * The ceiling as a usable number, or null for "no ceiling".
 *
 * Zero is deliberately **not** a ceiling of nothing: a clinic that types 0
 * has almost certainly cleared the box, and reading it as "refuse every
 * booking" would switch the feature off by accident through a field that
 * says nothing about switching it off. Off is `pay_later_enabled`.
 */
export function resolveMaxOwedPaise(stored: number | null | undefined): number | null {
  if (stored === null || stored === undefined) return null;
  if (!Number.isFinite(stored) || stored <= 0) return null;
  return Math.floor(stored);
}

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

  // The ceiling is last, and deliberately so: it is the only refusal here
  // that is about *this patient's history* rather than about the shape of
  // the booking, so every answer that would be more useful comes first.
  const ceiling = resolveMaxOwedPaise(input.maxOwedPaise);
  if (ceiling !== null) {
    const owed = Math.max(0, input.currentlyOwedPaise ?? 0);
    const adding = Math.max(0, input.bookingAmountPaise ?? 0);
    // Strictly greater: a booking that lands exactly on the ceiling is
    // within it. A limit that refused at its own number would mean the
    // figure an admin typed is one the clinic never actually allows.
    if (owed + adding > ceiling) return { allowed: false, reason: "over_limit" };
  }

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
    case "over_limit":
      // Names the arrangement, because this patient already knows they have
      // it -- and says what clears it, since the one thing they can do about
      // it is settle. It quotes no figure: what they owe is on their own
      // dashboard, and a number in a refusal is a number that can be wrong
      // by the time they read it.
      return "There's a bit outstanding on your account, so this session needs paying for now. Settling what's owed opens it back up.";
    case "feature_off":
    case "not_on_terms":
      return "This booking needs to be paid for now.";
  }
}
