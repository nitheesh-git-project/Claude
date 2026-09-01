// The rule the whole consultation-first change exists to enforce, in one
// place so the routes, the wizards and the catalog surfaces cannot drift
// apart about it.
//
// **Treatment volume is never sold before an assessment.** A patient used
// to be able to walk onto /book?package=<id> and buy a six-session
// programme before any clinician had seen them: the clinical order was
// backwards, because the amount of treatment was decided by a price list
// rather than by an examination. Now a programme comes from a care plan a
// therapist wrote after a session they ran, and the patient's first
// purchase is one session.
//
// The rule is deliberately expressed as a property of the thing being sold
// rather than as a feature flag. A single session IS the consultation --
// there is nothing to assess before selling someone one appointment, and a
// clinic with no way to sell a first appointment has no funnel at all. Two
// or more is a programme, and a programme is a clinical recommendation.
//
// That distinction matters most for home visits, and is easy to miss:
// every home visit in this app is a `home_visit_packages` purchase (there
// is no separate single-visit path), and /api/appointments/create books
// `visit_mode: 'online'` only. So if "no direct package purchase" were
// applied literally to both catalogs, a patient who needs to be seen at
// home would have no way in at all. A one-visit home package is that
// patient's consultation, and it stays purchasable for exactly the same
// reason a video consultation does.

/** Session/visit count at or below which a purchase is a consultation. */
export const CONSULTATION_SESSION_COUNT = 1;

/**
 * Whether a catalog row may be bought without a therapist recommending it.
 *
 * Takes the count rather than the row so both package tables
 * (`treatment_category_packages.session_count`,
 * `home_visit_packages.visit_count`) go through the same check.
 */
export function isDirectlyPurchasable(sessionCount: number | null | undefined): boolean {
  return typeof sessionCount === "number" && sessionCount <= CONSULTATION_SESSION_COUNT;
}

/** The refusal, worded for a patient rather than for a developer. */
export const PROGRAMME_NEEDS_RECOMMENDATION =
  "A course of treatment is arranged by your therapist after they've seen you, so it can be matched to what you actually need. Book a first session and they'll recommend the right programme.";

/**
 * What a public catalog card says instead of a Buy button.
 *
 * Kept here beside the rule because the two go stale together: a card that
 * still says "Buy now" for something the server refuses is worse than no
 * card, and the copy is the only part a visitor ever sees.
 */
export const PROGRAMME_CARD_NOTE =
  "Arranged by your therapist after your first session.";
