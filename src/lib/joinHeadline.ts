// Which session the patient Home puts its big "Join your video call" button
// on.
//
// The Home headline used to describe only the next session that had not
// started, so the moment the session began - exactly when a patient is
// hunting for the link - it vanished from the headline and the patient had to
// find the small Join button on a session card. The session to feature is the
// soonest online one that has not CLOSED yet (start + length + the after-start
// grace), whether or not it has started.
//
// This chooses the session; it does not decide when the link becomes
// available. That is the server's rule, and `JoinSessionButton` reads the
// window from Settings exactly as it does on the session card.
//
// Dependency-free so the choice is testable without rendering.

export type JoinCandidate = {
  status: string;
  slot_time: string | null;
  duration_minutes?: number | null;
  payment_status?: string | null;
  payment_terms?: string | null;
};

const DEFAULT_DURATION_MINUTES = 60;

/** A booking that is genuinely on the books: confirmed, or requested and
 *  either paid for or settled afterwards. An unpaid draft is not a session
 *  anyone is joining. */
export function isBookedSession(row: JoinCandidate): boolean {
  if (row.status === "confirmed") return true;
  if (row.status !== "requested") return false;
  return row.payment_status === "paid" || Boolean(row.payment_terms);
}

export function pickJoinSession<T extends JoinCandidate>(
  rows: readonly T[],
  nowMs: number,
  joinWindowAfterMinutes: number
): T | null {
  let best: T | null = null;
  let bestStart = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    if (!row.slot_time || !isBookedSession(row)) continue;
    const start = Date.parse(row.slot_time);
    if (!Number.isFinite(start)) continue;
    const minutes = row.duration_minutes && row.duration_minutes > 0 ? row.duration_minutes : DEFAULT_DURATION_MINUTES;
    const closes = start + (minutes + Math.max(0, joinWindowAfterMinutes)) * 60_000;
    if (closes < nowMs) continue;
    if (start < bestStart) {
      best = row;
      bestStart = start;
    }
  }
  return best;
}
