// Whether a therapist's suggested session is still something the patient can
// act on. Dependency-free and time-passed-as-an-argument, per AGENTS.md's
// "business math lives in src/lib/" convention, so both dashboards and the
// respond route decide this the same way.
//
// The central rule: a suggestion is never *expired* in the database. Nothing
// writes a status when time passes -- this deployment has no scheduled
// worker, and a state that only a sweep can reach is a state that is wrong
// between sweeps. `status` records explicit human actions only; whether a
// pending suggestion is still live is computed from its slot every time it
// is read.

export type SuggestionStatus = "pending" | "accepted" | "declined" | "withdrawn";

export type SuggestionForState = {
  status: SuggestionStatus;
  slot_time: string;
};

// What the reader should actually be shown. "lapsed" exists only here --
// there is no such stored status.
export type SuggestionState =
  | "actionable"
  | "lapsed"
  | "accepted"
  | "declined"
  | "withdrawn";

/**
 * A pending suggestion stops being actionable once its slot is inside the
 * booking lead time, because accepting it would create a session that the
 * lead time forbids. Uses the same window the booking wizard advertises, so
 * a patient is never offered an accept that the booking code would refuse.
 */
export function suggestionState(
  suggestion: SuggestionForState,
  nowMs: number,
  leadTimeMs: number
): SuggestionState {
  if (suggestion.status !== "pending") return suggestion.status;
  const slotMs = new Date(suggestion.slot_time).getTime();
  if (Number.isNaN(slotMs)) return "lapsed";
  return slotMs - leadTimeMs > nowMs ? "actionable" : "lapsed";
}

export function isActionable(
  suggestion: SuggestionForState,
  nowMs: number,
  leadTimeMs: number
): boolean {
  return suggestionState(suggestion, nowMs, leadTimeMs) === "actionable";
}

export const SUGGESTION_STATE_LABELS: Record<SuggestionState, string> = {
  actionable: "Waiting for your answer",
  lapsed: "This time has passed",
  accepted: "Booked",
  declined: "Declined",
  withdrawn: "Withdrawn by your therapist",
};

/**
 * How many sessions of a purchase are still unclaimed.
 *
 * Pending suggestions are deliberately *not* subtracted: a suggestion claims
 * nothing until it is accepted, which is the whole reason it is not stored as
 * an appointment. The one-pending-per-purchase index means a therapist can
 * never stack suggestions past the remaining count anyway.
 */
export function sessionsRemaining(purchase: {
  session_count: number;
  sessions_used: number;
}): number {
  return Math.max(0, purchase.session_count - purchase.sessions_used);
}
