// What a refusal from the measurement, goal and milestone routes says to a
// person. One table, so the record-a-test dialog, the planner and the reopen
// dialog agree, and so "we could not check" is never worded as "you are not
// allowed" (docs/rules: a check that could not be run is not a check that
// came back negative; a 429 is not a "no").

export type ProgressApiFailure = {
  status: number;
  /** The route's own sentence, when it sent one. */
  error?: unknown;
  code?: unknown;
};

export type ProgressAction = "measurement" | "goal" | "milestone" | "reached" | "reopen" | "status";

const BY_CODE: Record<string, string> = {
  stale: "Someone changed this a moment ago. Reload the page to see the latest, then make your change again.",
  active_goal_exists:
    "This patient already has an active goal. Mark it achieved or closed before setting a new one, or edit the existing goal.",
  session_not_started:
    "This is recorded from a session you have started with this patient. Open it once the session begins.",
  no_condition_profile:
    "This patient's condition type has not been recorded yet. Record it on their Health Profile first.",
  proof_required: "Pick the measurement that shows this milestone was reached.",
  milestone_reached:
    "This milestone is marked reached, so it stays as it was. If that was a mistake, ask the clinic to reopen it.",
  goal_not_active: "Milestones are planned under the patient's active goal. Set or reopen a goal first.",
  not_reached: "This milestone is not marked reached, so there is nothing to reopen. Reload the page to see where it is now.",
  reason_required: "Say why this is being reopened (at least 10 characters).",
};

const VERB: Record<ProgressAction, string> = {
  measurement: "record this measurement",
  goal: "save this goal",
  milestone: "save this milestone",
  reached: "mark this milestone reached",
  reopen: "reopen this milestone",
  status: "save this phase or status",
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The sentence for a failed request. Order matters:
 *   - a coded refusal has one fixed sentence (the same on every screen);
 *   - 503 is "could not check / nothing saved", never a refusal;
 *   - 429 is "wait", 401 is "sign in again";
 *   - other 400/403/404 carry the route's own sentence, which is written
 *     for a person, with a safe fallback;
 *   - anything else is ours, not theirs.
 */
export function progressErrorMessage(failure: ProgressApiFailure, action: ProgressAction): string {
  const code = text(failure.code);
  if (code && BY_CODE[code]) return BY_CODE[code];
  const own = text(failure.error);

  switch (failure.status) {
    case 503:
      return own ?? `We couldn't check that just now, so nothing was saved. Please try again.`;
    case 429:
      return "That was a lot of attempts in a short time. Wait a moment, then try again.";
    case 401:
      return "Your session has ended. Sign in again to continue.";
    case 400:
      return own ?? `That could not be saved. Check what you entered and try again.`;
    case 403:
      return own ?? `Your account is not allowed to ${VERB[action]} for this patient.`;
    case 404:
      return own ?? "That no longer exists. Reload the page to see the latest.";
    case 409:
      return own ?? "That conflicts with what is already on record. Reload the page and try again.";
    default:
      return `Something went wrong on our side, and nothing was saved. Please try again.`;
  }
}

export const NETWORK_ERROR_MESSAGE = "Could not reach the server. Check your connection and try again - nothing was saved.";

/** Reads a failed response into the shape above; never throws on a body
 *  that is not JSON. */
export async function readProgressFailure(res: Response): Promise<ProgressApiFailure> {
  const body: unknown = await res.json().catch(() => null);
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  return { status: res.status, error: record.error, code: record.code };
}
