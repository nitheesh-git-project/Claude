import type { createAdminClient } from "@/lib/supabase/admin";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";
import { formatAddressOneLine, visitAddressFromAppointment } from "@/lib/formatAddress";

type AdminClient = ReturnType<typeof createAdminClient>;

// Confirmed sessions whose Calendar event failed to be created used to wait
// for an admin to spot them in the Sync Health panel and click Retry. This
// re-attempts them automatically, as a lazy idempotent sweep at the top of
// the admin dashboard render -- the same shape as expireDuePackagePurchases,
// for the same reason: there is no cron and no background worker in this
// deployment (see AGENTS.md), so "eventually" means "next time somebody
// opens the page that cares".
//
// Three limits, all of which exist because this sweep is unlike the expiry
// ones: it makes outbound HTTP calls to Google from inside a page render,
// where the expiry sweeps do one local UPDATE.

// Per attempt. A dead or slow Google endpoint must not hold the admin
// dashboard's first byte hostage -- the sweep abandons the wait and lets the
// next render try again. The Calendar call may still land after this fires;
// that is why the row is only ever *read* again from the database rather
// than assumed failed (a late success is visible on the next render).
const ATTEMPT_TIMEOUT_MS = 8000;

// Per sweep. Worst case this page pays 3 x ATTEMPT_TIMEOUT_MS on top of its
// own queries, and only when there is a genuine backlog. A larger backlog
// simply drains a few rows per render.
const MAX_PER_SWEEP = 3;

// Per appointment, across all sweeps. Some failures no amount of retrying
// fixes -- revoked credentials, a deleted calendar, an attendee address
// Google refuses. Without a cap those rows would be retried on every admin
// page render for the rest of time. At the cap the row stops being picked
// up, stays in the Sync Health panel flagged as needing a human, and an
// admin's manual Retry resets the counter.
export const MAX_MEET_SYNC_AUTO_ATTEMPTS = 5;

// How long a claim on an appointment stays valid. Comfortably longer than
// ATTEMPT_TIMEOUT_MS so a claim is never stolen from a call that is merely
// slow, and short enough that a render killed mid-attempt (a serverless
// instance recycled, a deploy) releases the row within a minute instead of
// locking it out of syncing for good.
export const MEET_SYNC_CLAIM_STALE_MS = 60000;

// The "nobody is mid-attempt on this row" filter, shared with the manual
// retry route so both paths agree on when an in-flight attempt counts as
// abandoned.
//
// The timestamp is double-quoted because PostgREST parses an `or` group as
// comma-separated `column.operator.value` triples and an ISO string carries
// dots of its own (the milliseconds). Unquoted, the value is ambiguous to
// that parser; the failure would be silent in the worst way -- a rejected
// filter means no row is ever claimed, which reads as "always busy" rather
// than as an error.
export function meetSyncUnclaimedFilter(now = Date.now()): string {
  const cutoff = new Date(now - MEET_SYNC_CLAIM_STALE_MS).toISOString();
  return `google_calendar_sync_claimed_at.is.null,google_calendar_sync_claimed_at.lt."${cutoff}"`;
}

// Runs each attempt with a wall-clock bound. createMeetEventForConfirmedAppointment
// never throws by contract, so this only guards against it never *settling*.
//
// Returns whether the work actually finished. That distinction matters to the
// caller: timing out does not cancel the Calendar call, it only stops waiting
// for it, so the attempt may still be in flight -- and an in-flight attempt
// must keep its claim.
async function withTimeout(work: Promise<void>, appointmentId: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      console.error("Meet sync retry timed out for appointment", appointmentId);
      resolve(false);
    }, ATTEMPT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work.then(() => true), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function retryDueMeetSyncs(admin: AdminClient): Promise<void> {
  // google_calendar_sync_attempts is migration-dependent, and this whole
  // query filters on it, so a database without the column yet fails this
  // select outright. That is the intended outcome: no column means no way to
  // cap the retries, and retrying uncapped is worse than not retrying at
  // all. The manual Retry button keeps working either way.
  const { data: due, error } = await admin
    .from("appointments")
    // One string literal rather than a concatenation: the Supabase client
    // parses the select list at the type level, and anything it can't read
    // statically degrades every field to an error type.
    .select(
      "id, patient_id, therapist_id, slot_time, duration_minutes, timezone, visit_mode, google_calendar_sync_attempts, visit_address_line1, visit_address_line2, visit_landmark, visit_city, visit_state, visit_pincode, visit_access_notes"
    )
    .eq("status", "confirmed")
    .not("therapist_id", "is", null)
    .is("meet_link", null)
    .not("google_calendar_sync_error", "is", null)
    .lt("google_calendar_sync_attempts", MAX_MEET_SYNC_AUTO_ATTEMPTS)
    .order("slot_time", { ascending: true })
    .limit(MAX_PER_SWEEP);

  if (error || !due || due.length === 0) return;

  // The master toggle is read once for the batch rather than per row inside
  // the helper. An online session must not be auto-retried while Meet is
  // switched off site-wide -- the helper would return without doing anything
  // and this sweep would have burned an attempt for nothing. Home visits are
  // deliberately unaffected, exactly as in the helper: that switch gates Meet
  // conferencing, and a home visit's event carries an address instead, with
  // Calendar's invite email being the only notification the patient gets that
  // a therapist is coming.
  const { data: settingsRow } = await admin
    .from("site_settings")
    .select("google_meet_enabled")
    .maybeSingle();
  const meetEnabled = settingsRow?.google_meet_enabled !== false;

  for (const appointment of due) {
    const isHomeVisit = appointment.visit_mode === "home_visit";
    if (!meetEnabled && !isHomeVisit) continue;
    if (!appointment.therapist_id) continue;

    // Claim the appointment before calling Google, and hold the claim for
    // the duration of the call. Three conditions, each closing a different
    // way two callers end up creating two Calendar events for one session
    // (createSessionCalendarEvent only ever creates, so the loser's event is
    // orphaned on the calendar):
    //
    //   - the attempt counter still equals what this iteration read, so two
    //     concurrent sweeps (this runs on every admin dashboard render, and
    //     two admins can load at once) cannot both take the same row;
    //   - meet_link is still null, so a row somebody already finished is not
    //     picked up again;
    //   - nothing else is currently mid-attempt on it -- unclaimed, or
    //     claimed longer ago than the staleness window, which is how a render
    //     that died mid-call releases its row instead of locking it forever.
    //
    // The third is what the counter alone could not do: it detects a
    // conflicting write after the fact, where an outbound API call needs
    // exclusion for as long as it runs. The manual retry route claims through
    // the same column, so a Retry click and a sweep exclude each other too.
    //
    // Incrementing here rather than after the attempt is deliberate: a hang
    // past the timeout, or a process that dies mid-call, still has to cost an
    // attempt, or the exact failures the cap exists for would be the ones
    // that slip past it and retry forever.
    //
    // Losing the race is not an error -- the winner is on it, and the next
    // sweep sees the result. A claim that errors outright (the column missing
    // on a database this migration hasn't reached) is skipped for the same
    // reason the attempts column gates the query above: without the guard,
    // not retrying beats retrying unsafely.
    const claimedAt = new Date().toISOString();
    const { data: claimed } = await admin
      .from("appointments")
      .update({
        google_calendar_sync_attempts: (appointment.google_calendar_sync_attempts ?? 0) + 1,
        google_calendar_sync_claimed_at: claimedAt,
      })
      .eq("id", appointment.id)
      .eq("google_calendar_sync_attempts", appointment.google_calendar_sync_attempts ?? 0)
      .is("meet_link", null)
      .or(meetSyncUnclaimedFilter())
      .select("id")
      .maybeSingle();

    if (!claimed) continue;

    const address = visitAddressFromAppointment(appointment);

    const settled = await withTimeout(
      createMeetEventForConfirmedAppointment(admin, {
        appointmentId: appointment.id,
        patientId: appointment.patient_id,
        therapistId: appointment.therapist_id,
        slotTime: appointment.slot_time,
        durationMinutes: appointment.duration_minutes,
        timezone: appointment.timezone,
        visitMode: isHomeVisit ? "home_visit" : "online",
        location: isHomeVisit ? formatAddressOneLine(address) : null,
        description:
          isHomeVisit && appointment.visit_access_notes
            ? `Access notes: ${appointment.visit_access_notes}`
            : null,
      }),
      appointment.id
    );

    // Release the claim only if the attempt actually finished. A timeout does
    // not cancel the Calendar call -- it only stops this render waiting for
    // it -- so releasing there would hand the row to the next sweep while the
    // first call is still in flight, and two creates is precisely the
    // orphaned-event outcome the claim exists to prevent. An abandoned claim
    // is not stuck either way: the staleness window frees it, and that window
    // is the right amount of time to wait for a call that has already blown
    // its own timeout.
    //
    // Conditional on the claim still being ours, so a release can never clear
    // a claim some later sweep took over after the staleness window.
    if (settled) {
      await admin
        .from("appointments")
        .update({ google_calendar_sync_claimed_at: null })
        .eq("id", appointment.id)
        .eq("google_calendar_sync_claimed_at", claimedAt);
    }
  }
}
