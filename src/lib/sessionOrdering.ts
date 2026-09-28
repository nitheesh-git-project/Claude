// How a list of one person's sessions is ordered.
//
// The admin's patient and therapist profiles ordered their session lists by
// `created_at` -- when the booking row was written -- which is also the order
// `session_code` is assigned in, so the list read as being sorted by session
// ID. That is the wrong axis for these two screens: a session rescheduled to
// next month stayed wherever it was first booked, so the list could not be
// read as a timeline of that person's care and the next session was not
// findable by position.
//
// The judgement lives here rather than inside the component for the reason the
// rest of `src/lib` exists: it is a rule with three edge cases, and each of
// them is a wrong order that produces no error.

export type OrderableSession = {
  /** The session's own date and time. Nullable on `appointments`. */
  slot_time?: string | null;
  /** When the booking row was written. The tie-break, never the order. */
  created_at?: string | null;
};

/** Milliseconds, or null for absent *and* for unparseable.
 *
 *  A comparator that returns NaN leaves the array in an arbitrary order with
 *  no error anywhere -- the same silent shape `clampFocal` exists to prevent
 *  -- so a date this cannot read is treated as a date that is not there. */
function timeOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Newest session first: furthest in the future, then today, then the past.
 *
 *  Two rules beyond the obvious one, both real cases on this table:
 *
 *  1. **A session with no `slot_time` sorts last**, never first. The column is
 *     nullable -- a pre-payment row, a referral with no slot agreed yet -- and
 *     "nulls last" is the order `schema.sql` already uses wherever it sorts by
 *     slot. It also keeps the dated run contiguous, which is what makes the
 *     list readable as a timeline at all.
 *  2. **A tie breaks on `created_at` descending, explicitly** rather than by
 *     leaning on `Array.prototype.sort` being stable. Two sessions at one hour
 *     is ordinary (a patient rebooking the same slot across a cancellation),
 *     and an order that depends on what the database happened to return is an
 *     order that moves between two renders of the same screen. */
export function compareSessionsNewestFirst(
  a: OrderableSession,
  b: OrderableSession
): number {
  const aSlot = timeOf(a.slot_time);
  const bSlot = timeOf(b.slot_time);

  if (aSlot !== null && bSlot !== null) {
    if (aSlot !== bSlot) return bSlot - aSlot;
  } else if (aSlot !== bSlot) {
    // Exactly one is undated, whichever side it is on: it goes last.
    return aSlot === null ? 1 : -1;
  }

  const aMade = timeOf(a.created_at);
  const bMade = timeOf(b.created_at);
  if (aMade !== null && bMade !== null) {
    if (aMade !== bMade) return bMade - aMade;
  } else if (aMade !== bMade) {
    return aMade === null ? 1 : -1;
  }

  return 0;
}

/** The comparator over a copy -- a prop is never sorted in place. */
export function sortSessionsNewestFirst<T extends OrderableSession>(
  sessions: readonly T[]
): T[] {
  return [...sessions].sort(compareSessionsNewestFirst);
}
