// Quick picks on the session rating card, and reading them back out of the
// saved feedback.
//
// A pick is a phrase the patient or therapist taps instead of typing it. It
// is saved as part of the ordinary feedback text -- picks first, joined by
// " · ", then whatever they typed -- so there is no new column and nothing
// to migrate: an old free-text note is simply a note with no picks. The
// admin screens split it again to show the picks as chips and the rest as
// a quote. Kept free of React so the round trip can be tested.

export type FeedbackRole = "patient" | "therapist";

export const PICK_SEPARATOR = " · ";

const PICKS: Record<FeedbackRole, { good: string[]; poor: string[] }> = {
  patient: {
    good: ["Clear explanations", "Felt better after", "Exercises made sense", "Started on time", "Good video quality"],
    poor: ["Started late", "Hard to follow", "Felt rushed", "Video problems", "No plan given"],
  },
  therapist: {
    good: ["Engaged and motivated", "Did the home exercises", "Pain is easing", "Joined on time"],
    poor: ["Joined late", "Skipped the home exercises", "Connection issues", "Needs a follow-up call"],
  },
};

/** Every phrase any card offers -- what `splitFeedback` recognises. */
const ALL_PICKS = new Set(
  Object.values(PICKS).flatMap((p) => [...p.good, ...p.poor])
);

/** The picks offered for a rating: what went well from 3 stars up, what
 *  could be better at 1 or 2. Nothing before a star is chosen. */
export function picksFor(role: FeedbackRole, rating: number): string[] {
  if (rating < 1) return [];
  return rating <= 2 ? PICKS[role].poor : PICKS[role].good;
}

/** The text that is saved: picks in the order tapped, then the typed note. */
export function composeFeedback(picks: string[], typed: string): string {
  const note = typed.trim();
  return [...picks, ...(note ? [note] : [])].join(PICK_SEPARATOR);
}

/**
 * Saved feedback back into picks and the rest. Only leading recognised
 * phrases count as picks, so a typed note that happens to contain one in
 * the middle of a sentence is left as the person wrote it.
 */
export function splitFeedback(text: string | null | undefined): { picks: string[]; note: string } {
  if (!text) return { picks: [], note: "" };
  const parts = text.split(PICK_SEPARATOR);
  const picks: string[] = [];
  let i = 0;
  while (i < parts.length && ALL_PICKS.has(parts[i].trim())) {
    picks.push(parts[i].trim());
    i += 1;
  }
  return { picks, note: parts.slice(i).join(PICK_SEPARATOR).trim() };
}

const WORDS = ["", "Poor", "Fair", "Good", "Great", "Excellent"];

/** The word under the stars. Empty for anything outside 1-5. */
export function ratingWord(rating: number | null | undefined): string {
  return rating && rating >= 1 && rating <= 5 ? WORDS[Math.round(rating)] : "";
}
