import type { createAdminClient } from "@/lib/supabase/admin";
import { createSessionMeetEvent, updateSessionMeetEvent, deleteSessionMeetEvent } from "@/lib/googleCalendar";

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
  }: {
    appointmentId: string;
    patientId: string;
    therapistId: string;
    slotTime: string;
    durationMinutes: number | null;
    timezone: string | null;
  }
) {
  // Never let anything here throw -- this runs after a payment/booking/
  // assignment write has already succeeded, and an unexpected error (e.g. a
  // transient network blip on the follow-up DB write) must not turn into a
  // 500 for a request whose actual work already completed.
  try {
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

    const result = await createSessionMeetEvent({
      appointmentId,
      patientEmail,
      therapistEmail,
      slotTime,
      durationMinutes,
      timezone,
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
  } catch (err) {
    console.error("Unexpected error creating Meet event for appointment", appointmentId, err);
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
  }: {
    appointmentId: string;
    googleEventId: string | null;
    patientId: string;
    therapistId: string;
    slotTime: string;
    durationMinutes: number | null;
    timezone: string | null;
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
  } catch (err) {
    console.error("Unexpected error deleting Meet event for appointment", appointmentId, err);
  }
}
