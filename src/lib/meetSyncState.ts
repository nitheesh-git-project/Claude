/**
 * "Has this confirmed session got its calendar sync?" -- one answer, because
 * three places ask and they were disagreeing.
 *
 * The bug this exists to stop: **a home visit never has a Meet link, on
 * purpose.** There is nothing to join; the therapist travels to the address,
 * and `createMeetEventForConfirmedAppointment` passes `withMeet: false` for
 * exactly that reason. But Sync Health, the retry route and the sweep all
 * tested `meet_link is null` as their definition of "not synced", so every
 * confirmed home visit was:
 *
 *   1. listed in Sync Health for ever, as a session whose sync had failed;
 *   2. answered `502 "Retry failed"` by the manual Retry button, whose
 *      success test was also `meet_link`, even on the runs where the event
 *      was created perfectly; and
 *   3. given a **brand new calendar event on every click**, because
 *      `createSessionCalendarEvent` only ever creates -- three duplicate
 *      invites reached one patient and therapist before this was found.
 *
 * The right question for a home visit is whether the *event* exists, which is
 * what `google_event_id` records. Online sessions keep the Meet link as their
 * test, since an online event with no conferencing on it is a real failure.
 */

export type MeetSyncRow = {
  // `undefined` means "this column was not loaded on this row" and `null`
  // means "loaded, and empty". The difference matters: these columns are read
  // in isolated queries for migration-tolerance, so a database that has not
  // reached the migration hands back rows with the field absent, and guessing
  // "absent means empty" would put the false positives straight back.
  visit_mode?: string | null;
  meet_link?: string | null;
  google_event_id?: string | null;
};

/** True when the session has the Google artefact its delivery mode calls for. */
export function isSessionCalendarSynced(row: MeetSyncRow): boolean {
  if (row.visit_mode === "home_visit") {
    // Not loaded -- we cannot tell, so say synced rather than accuse a
    // working session. A false "needs attention" is the failure mode this
    // module was written for, and it is the one that gets clicked.
    if (row.google_event_id === undefined) return true;
    return Boolean(row.google_event_id);
  }
  // Online, or a row whose visit_mode was not loaded: the Meet link is the
  // test, which is the behaviour every caller had before.
  return Boolean(row.meet_link);
}

/** Convenience inverse, for the filters that read better in the negative. */
export function sessionNeedsCalendarSync(row: MeetSyncRow): boolean {
  return !isSessionCalendarSynced(row);
}

/**
 * The same question asked so a person can read the answer.
 *
 * `isSessionCalendarSynced` answers yes or no, which is what a filter needs
 * and not what a screen needs. Four facts decide what is actually happening
 * to a session that has not got its event -- the error string, the attempt
 * count against its cap, the claim column, and whether it needed anything at
 * all -- and they lived in four places, so Settings -> System Health had to
 * recombine them at the point of render and the claim column reached no
 * screen whatsoever. An admin reading "an attempt is in flight right now" and
 * an admin reading "the sweep has given up" need to do opposite things, and
 * the panel said the same sentence to both.
 *
 * **It is a derivation, never a column**, and that is the whole decision on
 * this one. The obvious fix is a stored `calendar_sync_state`, which would be
 * a second source of truth about facts the row already carries: every path
 * that creates an event, every retry, every claim and every release would have
 * to write it, and the first time one forgot, the word on the screen and the
 * state of the session would disagree with nothing to reconcile them. Same
 * reasoning as `therapistReadiness`, and the same as `meetSyncState` itself.
 *
 * `unknown` is a real answer rather than a fallback: these columns are read in
 * isolated migration-tolerant queries, so a row whose `visit_mode` never
 * loaded genuinely cannot be judged, and saying "needs a person" about it is
 * the false positive this module exists to stop.
 */
export type CalendarSyncState =
  /** It has the artefact its delivery mode calls for. Nothing to do. */
  | "synced"
  /** An attempt is in flight right now -- claimed, not yet resolved. */
  | "in_flight"
  /** Failed, and the automatic sweep will try again. */
  | "retrying"
  /** Failed, and the sweep has spent its attempts. Only a person moves it. */
  | "needs_person"
  /** Not synced, never attempted, no error -- the sweep has not reached it. */
  | "waiting"
  /** A column this judgement needs was not loaded on this row. */
  | "unknown";

export type CalendarSyncRow = MeetSyncRow & {
  google_calendar_sync_error?: string | null;
  google_calendar_sync_attempts?: number | null;
  google_calendar_sync_claimed_at?: string | null;
};

export function describeCalendarSync(
  row: CalendarSyncRow,
  options: { maxAttempts: number; claimStaleMs: number; nowMs: number }
): CalendarSyncState {
  if (isSessionCalendarSynced(row)) return "synced";

  // A row whose mode never loaded reads as synced above, so reaching here
  // with no mode means it is genuinely online and genuinely without a link.
  // The one unknowable case is an error column that was not loaded: the row
  // is unsynced, but whether anything has been *tried* is not on it.
  if (row.google_calendar_sync_error === undefined) return "unknown";

  const claimedAt = row.google_calendar_sync_claimed_at;
  if (claimedAt) {
    const claimedMs = Date.parse(claimedAt);
    // A claim older than the staleness window is a render that died holding
    // the row, not an attempt still running -- the sweep's own reasoning,
    // applied to the word on the screen so the two cannot disagree.
    if (Number.isFinite(claimedMs) && options.nowMs - claimedMs < options.claimStaleMs) {
      return "in_flight";
    }
  }

  const attempts = row.google_calendar_sync_attempts ?? 0;
  if (attempts >= options.maxAttempts) return "needs_person";
  if (row.google_calendar_sync_error) return "retrying";
  return "waiting";
}

/** Whether this state is one nothing automatic will move. */
export function calendarSyncNeedsPerson(state: CalendarSyncState): boolean {
  return state === "needs_person";
}

/** One line a person reads, in the admin's register. */
export function describeCalendarSyncLabel(state: CalendarSyncState): string {
  switch (state) {
    case "synced":
      return "Calendar event created";
    case "in_flight":
      return "Trying now";
    case "retrying":
      return "Failed - will try again automatically";
    case "needs_person":
      return "Automatic retries used up - needs you";
    case "waiting":
      return "Waiting for the next automatic attempt";
    case "unknown":
      return "Could not be checked";
  }
}
