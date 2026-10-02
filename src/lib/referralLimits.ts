// How long each referral field may be -- shared by the form (so a partner
// cannot type past it) and the route (which refuses rather than trims).
//
// The route used to slice every field silently at these lengths while the
// form had no limits at all, so the end of a long medical history or a
// home-visit address simply disappeared after submission with nothing to
// say so. Clinically relevant text is never cut: it is either accepted in
// full or refused with a sentence.
export const REFERRAL_LIMITS = {
  patientName: 120,
  address: 500,
  medicalIssue: 2000,
  treatmentNeeded: 1000,
} as const;

/** Minimum for a home-visit address to be somewhere a therapist can go. */
export const MIN_HOME_VISIT_ADDRESS_LENGTH = 10;

/** Referral statuses still in motion -- a second referral alongside one of
 *  these is a duplicate, not a new patient. */
export const OPEN_REFERRAL_STATUSES = ["pending_review", "therapist_assigned", "invite_sent"] as const;
