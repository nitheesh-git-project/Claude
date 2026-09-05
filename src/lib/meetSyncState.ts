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
