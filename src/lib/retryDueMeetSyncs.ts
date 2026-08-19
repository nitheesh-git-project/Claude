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

// Runs each attempt with a wall-clock bound. createMeetEventForConfirmedAppointment
// never throws by contract, so this only guards against it never *settling*.
async function withTimeout(work: Promise<void>, appointmentId: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.error("Meet sync retry timed out for appointment", appointmentId);
      resolve();
    }, ATTEMPT_TIMEOUT_MS);
  });
  try {
    await Promise.race([work, timeout]);
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

    // CAS claim on the attempt counter this iteration actually read, plus
    // meet_link still being null. Two things make this necessary rather than
    // a plain increment:
    //
    // Concurrency -- this sweep runs on every admin dashboard render, so two
    // admins loading at the same moment select the same few rows. Without a
    // claim both would call Google for one appointment and create two
    // Calendar events, leaving an orphaned one on the calendar under a link
    // nothing points at. That is the same hazard the manual retry route
    // guards by refusing to run once a link exists (see its comment) -- this
    // is the concurrent version of it.
    //
    // Counting -- the increment lands *before* the attempt, not after, so a
    // hang past the timeout or a process that dies mid-call still costs an
    // attempt. Otherwise the exact failures the cap exists for would be the
    // ones that slip past it and retry forever.
    //
    // Losing the race is not an error: the winner is doing this row right
    // now, so move on and let the next sweep see the result.
    const { data: claimed } = await admin
      .from("appointments")
      .update({ google_calendar_sync_attempts: (appointment.google_calendar_sync_attempts ?? 0) + 1 })
      .eq("id", appointment.id)
      .eq("google_calendar_sync_attempts", appointment.google_calendar_sync_attempts ?? 0)
      .is("meet_link", null)
      .select("id")
      .maybeSingle();

    if (!claimed) continue;

    const address = visitAddressFromAppointment(appointment);

    await withTimeout(
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
  }
}
