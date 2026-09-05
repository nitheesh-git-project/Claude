import type { createAdminClient } from "@/lib/supabase/admin";
import {
  createSessionCalendarEvent,
  updateSessionMeetEvent,
  deleteSessionMeetEvent,
  openMeetAccessForLink,
} from "@/lib/googleCalendar";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Shared by every write site that can newly confirm an appointment
 * (razorpay/verify, razorpay/create-order's recovery path,
 * admin/assign-appointment) -- looks up both parties' emails and creates
 * the Calendar event, recording the outcome back onto the appointment.
 * Never throws; a Calendar failure must never block the caller's response.
 * Callers must only invoke this after their own write has been confirmed to
 * have actually stuck (post any conflict re-check), not on a pre-write
 * intent boolean.
 */
export async function createMeetEventForConfirmedAppointment(
  admin: AdminClient,
  {
    appointmentId,
    patientId,
    therapistId,
    slotTime,
    durationMinutes,
    timezone,
    bypassMasterToggle = false,
    visitMode = "online",
    location = null,
    description = null,
  }: {
    appointmentId: string;
    patientId: string;
    therapistId: string;
    slotTime: string;
    durationMinutes: number | null;
    timezone: string | null;
    // Set only by the admin-triggered manual retry route -- an admin
    // explicitly clicking Retry on one session is an explicit override of
    // the site-wide default, not a new automatic creation the toggle is
    // meant to gate.
    bypassMasterToggle?: boolean;
    // A home visit gets a calendar event with a street address and no Meet
    // conference. Defaults to 'online' so every existing call site keeps its
    // current behaviour without passing anything.
    visitMode?: "online" | "home_visit";
    location?: string | null;
    description?: string | null;
  }
) {
  const isHomeVisit = visitMode === "home_visit";
  // Never let anything here throw -- this runs after a payment/booking/
  // assignment write has already succeeded, and an unexpected error (e.g. a
  // transient network blip on the follow-up DB write) must not turn into a
  // 500 for a request whose actual work already completed.
  try {
    // Refuse to create a second event for a session that already has one.
    //
    // createSessionCalendarEvent only ever *creates*, so calling this for a
    // row whose google_event_id is already set leaves the previous event
    // orphaned on the clinic's calendar under a link the row no longer points
    // at -- and Calendar has already emailed the patient and the therapist
    // about it. That is not hypothetical: a home visit sat permanently in
    // Sync Health (a home visit has no Meet link by design, and the panel
    // read that as a failure), and each Retry click minted another duplicate.
    // Three reached one patient before it was noticed.
    //
    // The claim columns could not catch this. They stop two callers racing
    // over the *same* attempt; they say nothing about an attempt that should
    // never have been made. Checked here rather than in each caller so every
    // door -- the sweep, the manual Retry, and the three booking paths --
    // gets it. Cancellation clears google_event_id, so a legitimate
    // re-creation after deletion still goes through.
    const { data: existing } = await admin
      .from("appointments")
      .select("google_event_id")
      .eq("id", appointmentId)
      .maybeSingle();
    if (existing?.google_event_id) return;

    // Admin master kill switch (Feature Control tab). Selecting a single
    // column, not the whole row, so a still-null result before this
    // migration is applied defaults to enabled -- same
    // isolated-query-degrades-gracefully convention as everywhere else.
    // Doesn't block updateMeetEventForAppointment/deleteMeetEventForAppointment
    // below -- turning this off should only stop *new* events, never strand
    // an existing one out of sync or block cleanup on cancellation.
    //
    // Deliberately does not gate home visits: that switch turns off Meet
    // *conferencing*, and a home visit has no Meet link to turn off. Its
    // event carries the address instead, and since Calendar's invite email
    // is the only outbound message this platform sends, suppressing it
    // would leave the patient with no confirmation that a therapist is
    // coming to their home.
    if (!bypassMasterToggle && !isHomeVisit) {
      const { data: settingsRow } = await admin
        .from("site_settings")
        .select("google_meet_enabled")
        .maybeSingle();
      if (settingsRow?.google_meet_enabled === false) {
        return;
      }
    }

    // Read in its own isolated call for the usual migration-tolerance
    // reason, and defaulting to ON: the waiting room is the failure this
    // setting exists to remove, so a database that has not got the column
    // yet should behave like one that has it switched on. Only a deliberate
    // `false` turns it off -- which an owner does when their Google account
    // cannot grant the Meet scope and the failed attempt is only noise.
    let openAccess = true;
    if (!isHomeVisit) {
      const { data: accessRow } = await admin
        .from("site_settings")
        .select("meet_open_access_enabled")
        .maybeSingle();
      openAccess = accessRow?.meet_open_access_enabled !== false;
    }

    const { data: people } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", [patientId, therapistId]);

    const patientEmail = people?.find((p) => p.id === patientId)?.email;
    const therapistEmail = people?.find((p) => p.id === therapistId)?.email;

    if (!patientEmail || !therapistEmail) {
      console.error("Missing patient/therapist email, skipping Meet event for appointment", appointmentId);
      return;
    }

    const result = await createSessionCalendarEvent({
      appointmentId,
      patientEmail,
      therapistEmail,
      slotTime,
      durationMinutes,
      timezone,
      withMeet: !isHomeVisit,
      openAccess,
      summary: isHomeVisit ? "Home Physiotherapy Visit" : "Physiotherapy Session",
      location: isHomeVisit ? location : null,
      description: isHomeVisit ? description : null,
    });

    if ("error" in result) {
      await admin
        .from("appointments")
        .update({ google_calendar_sync_error: result.error })
        .eq("id", appointmentId);
      return;
    }

    await admin
      .from("appointments")
      .update({
        google_event_id: result.eventId,
        meet_link: result.meetLink,
        google_calendar_sync_error: null,
      })
      .eq("id", appointmentId);

    // A second, isolated update rather than two more fields on the one
    // above, and for two distinct reasons. Migration-tolerance is the usual
    // one -- these columns are the newest in the file, and folding them in
    // would make an unknown-column error lose the event id and Meet link
    // this call just earned. The other is that these must never reach
    // google_calendar_sync_error: that column is what the sync sweep
    // retries on, and it retries by *creating an event*, which for a
    // session that already has one would orphan a second calendar entry to
    // fix a waiting room.
    await admin
      .from("appointments")
      .update({
        meet_access_open: result.meetAccessOpen,
        meet_access_error: result.meetAccessError,
      })
      .eq("id", appointmentId);
  } catch (err) {
    console.error("Unexpected error creating Meet event for appointment", appointmentId, err);
  }
}

/**
 * Turns off the waiting room on a session whose event already exists --
 * shared by the automatic sweep (retryDueMeetSyncs) and the admin's manual
 * Fix button, so both record the outcome the same way. Never throws.
 *
 * Returns whether the space is now open, which the sweep uses only to decide
 * what to log; the durable answer is the row it writes.
 */
export async function openMeetAccessForAppointment(
  admin: AdminClient,
  { appointmentId, meetLink }: { appointmentId: string; meetLink: string }
): Promise<boolean> {
  try {
    const result = await openMeetAccessForLink(appointmentId, meetLink);
    await admin
      .from("appointments")
      .update(
        result === true
          ? { meet_access_open: true, meet_access_error: null }
          : { meet_access_open: false, meet_access_error: result.error }
      )
      .eq("id", appointmentId);
    return result === true;
  } catch (err) {
    console.error("Unexpected error opening Meet access for appointment", appointmentId, err);
    return false;
  }
}

/**
 * Shared by admin/update-appointment (reassignment/reschedule of an
 * already-confirmed session) -- PATCHes the existing event's time and
 * attendees in place, keeping the same Meet link. No-ops (and returns
 * without error) if there's no google_event_id yet, since nothing was ever
 * confirmed with an event to update.
 */
export async function updateMeetEventForAppointment(
  admin: AdminClient,
  {
    appointmentId,
    googleEventId,
    patientId,
    therapistId,
    slotTime,
    durationMinutes,
    timezone,
    location = null,
    description = null,
  }: {
    appointmentId: string;
    googleEventId: string | null;
    patientId: string;
    therapistId: string;
    slotTime: string;
    durationMinutes: number | null;
    timezone: string | null;
    // Home visits only. An admin correcting a wrong flat number has to
    // reach the invite the therapist is actually navigating by -- without
    // this the event keeps the old address and they drive to the old house.
    location?: string | null;
    description?: string | null;
  }
) {
  if (!googleEventId) return;

  // Never let anything here throw -- the reassignment/reschedule write this
  // runs after has already succeeded; a Calendar-side error must only be
  // recorded, never turned into a failed response for an already-completed
  // reassignment.
  try {
    const { data: people } = await admin
      .from("profiles")
      .select("id, email")
      .in("id", [patientId, therapistId]);

    const patientEmail = people?.find((p) => p.id === patientId)?.email;
    const therapistEmail = people?.find((p) => p.id === therapistId)?.email;

    if (!patientEmail || !therapistEmail) {
      console.error("Missing patient/therapist email, skipping Meet event update for appointment", appointmentId);
      return;
    }

    const result = await updateSessionMeetEvent({
      appointmentId,
      eventId: googleEventId,
      patientEmail,
      therapistEmail,
      slotTime,
      durationMinutes,
      timezone,
      location,
      description,
    });

    await admin
      .from("appointments")
      .update({ google_calendar_sync_error: result === true ? null : result.error })
      .eq("id", appointmentId);
  } catch (err) {
    console.error("Unexpected error updating Meet event for appointment", appointmentId, err);
  }
}

/**
 * Shared by cancelAppointmentAndRefund -- deletes the Calendar event (Google
 * auto-emails all attendees the cancellation) and clears google_event_id /
 * meet_link so the Join button naturally stops rendering. No-ops if there
 * was never an event (session was cancelled while still only "requested").
 */
export async function deleteMeetEventForAppointment(
  admin: AdminClient,
  { appointmentId, googleEventId }: { appointmentId: string; googleEventId: string | null }
) {
  if (!googleEventId) return;

  // Never let anything here throw -- the cancellation (and any refund) this
  // runs after has already been committed; a Calendar-side error must only
  // be recorded, never turned into a failed response for an already-
  // cancelled session.
  try {
    const deleted = await deleteSessionMeetEvent(appointmentId, googleEventId);

    await admin
      .from("appointments")
      .update(
        deleted
          ? { google_event_id: null, meet_link: null, google_calendar_sync_error: null }
          : { google_calendar_sync_error: "Failed to delete Calendar event on cancellation" }
      )
      .eq("id", appointmentId);

    // Isolated for the same migration-tolerance reason as the create path,
    // and only on a real deletion: the space is gone with the event, so
    // leaving a stale "waiting room still on" behind would keep a cancelled
    // session sitting in the admin's Waiting Room panel forever.
    if (deleted) {
      await admin
        .from("appointments")
        .update({ meet_access_open: null, meet_access_error: null })
        .eq("id", appointmentId);
    }
  } catch (err) {
    console.error("Unexpected error deleting Meet event for appointment", appointmentId, err);
  }
}
