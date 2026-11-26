import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { serverNowMs } from "@/lib/debugClock";
import { patientRescheduleBlock } from "@/lib/patientReschedule";
import { isWholeHourSlot, leadTimeMsFromHours, NOT_WHOLE_HOUR_ERROR } from "@/lib/bookingSlots";
import { readOpenSlotStarts } from "@/lib/openHoursServer";
import { clinicDateKey } from "@/lib/clinicWeek";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";
import { deleteMeetEventForAppointment } from "@/lib/googleCalendarSync";
import { recordUserActivity } from "@/lib/userActivityLog";
import { enforceRateLimit } from "@/lib/rateLimitServer";

/**
 * A patient moves their own online session (owner's decisions): up to the
 * clinic's cut-off (`patient_reschedule_cutoff_hours`, default 24) before it,
 * once per booking, to any hour some therapist can take. The session goes
 * back to `requested` with nobody on it and its calendar event removed, so it
 * lands in the admin's "Sessions with no therapist" to be confirmed again --
 * the patient chose a time, the clinic still decides who runs it.
 *
 * Every rule the picker shows is re-checked here: the cut-off and the
 * one-move limit (patientRescheduleBlock), the booking lead time, the
 * whole-hour rule in the booking's zone, and that a therapist can take the
 * new hour (readOpenSlotStarts). The write is a compare-and-set on the row as
 * it was read, so a move racing a cancel or an admin edit loses cleanly.
 *
 * Body: { appointmentId: string, slotTime: string (ISO), timezone?: string }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const limited = await enforceRateLimit(request, "checkout", { identifier: user.id });
  if (limited) return limited;

  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: unknown;
    slotTime?: unknown;
    timezone?: unknown;
  }>(request);
  if (parseError) return parseError;
  const appointmentId = typeof body.appointmentId === "string" ? body.appointmentId.trim() : "";
  const slotMs = typeof body.slotTime === "string" ? Date.parse(body.slotTime) : NaN;
  if (!appointmentId || !Number.isFinite(slotMs)) {
    return NextResponse.json({ error: "Pick a new date and time." }, { status: 400 });
  }

  const standing = await isProfileActiveAndApproved(user.id);
  if (standing === null) return profileCheckUnavailable();
  if (!standing) {
    return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: appointment, error: readError } = await admin
    .from("appointments")
    .select("id, patient_id, status, slot_time, timezone, visit_mode, therapist_id, google_event_id, duration_minutes, no_show")
    .eq("id", appointmentId)
    .maybeSingle();
  if (readError) {
    return NextResponse.json({ error: "We couldn't load this session just now. Please try again." }, { status: 503 });
  }
  if (!appointment || appointment.patient_id !== user.id) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  // The move count in its own read: the column is newer than this table's
  // other readers. Unreadable is "could not check", never "not moved yet".
  const { data: countRow, error: countError } = await admin
    .from("appointments")
    .select("patient_reschedule_count")
    .eq("id", appointmentId)
    .maybeSingle();
  const { data: settingsRow, error: settingsError } = await admin
    .from("site_settings")
    .select(SITE_SETTINGS_SELECT)
    .maybeSingle();
  if (countError || settingsError) {
    return NextResponse.json(
      { error: "We couldn't check whether this session can be moved just now. Please try again." },
      { status: 503 }
    );
  }
  const settings = parseAdminSettings(settingsRow);
  const rescheduleCount = (countRow?.patient_reschedule_count as number | null) ?? 0;
  const nowMs = serverNowMs(request);

  const blocked = patientRescheduleBlock({
    status: appointment.status,
    visitMode: appointment.visit_mode,
    slotTime: appointment.slot_time,
    nowMs,
    cutoffHours: settings.patientRescheduleCutoffHours,
    rescheduleCount,
    noShow: appointment.no_show,
  });
  if (blocked) return NextResponse.json({ error: blocked, code: "reschedule_not_allowed" }, { status: 409 });

  const timezone =
    typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : appointment.timezone;
  const newSlotIso = new Date(slotMs).toISOString();
  if (appointment.slot_time && Date.parse(appointment.slot_time) === slotMs) {
    return NextResponse.json({ error: "That's the time this session already has." }, { status: 400 });
  }
  if (slotMs < nowMs + leadTimeMsFromHours(settings.onlineBookingLeadTimeHours)) {
    return NextResponse.json(
      { error: `Please pick a time at least ${settings.onlineBookingLeadTimeHours} hours from now.` },
      { status: 409 }
    );
  }
  if (!isWholeHourSlot(newSlotIso, timezone)) {
    return NextResponse.json({ error: NOT_WHOLE_HOUR_ERROR }, { status: 400 });
  }

  // Somebody has to be able to take it -- the same rule as a new booking.
  // A roster that could not be read lets the move through; the clinic
  // confirms it either way.
  const durationMinutes = appointment.duration_minutes ?? BASE_DURATION_MINUTES;
  const open = await readOpenSlotStarts(admin, {
    fromDateKey: clinicDateKey(slotMs),
    days: 1,
    durationMinutes,
    nowMs: Date.now(),
    // Its own place on the roster is the one being given up.
    excludeAppointmentId: appointment.id,
  });
  if (open !== null && !open.includes(slotMs)) {
    return NextResponse.json(
      { error: "No physiotherapist is free at that time. Please pick another time.", code: "slot_not_open" },
      { status: 409 }
    );
  }

  const { data: moved, error: moveError } = await admin
    .from("appointments")
    .update({
      slot_time: newSlotIso,
      timezone,
      status: "requested",
      therapist_id: null,
      patient_reschedule_count: rescheduleCount + 1,
    })
    .eq("id", appointmentId)
    .eq("status", appointment.status)
    .eq("slot_time", appointment.slot_time)
    .eq("patient_reschedule_count", rescheduleCount)
    .select("id")
    .maybeSingle();
  if (moveError) {
    if ((moveError as { code?: string }).code === "23P01") {
      return NextResponse.json(
        { error: "You already have a session around that time. Pick a different time." },
        { status: 409 }
      );
    }
    console.error("appointments/reschedule: move failed", appointmentId, moveError.message);
    return NextResponse.json({ error: "Could not move the session. Please try again." }, { status: 500 });
  }
  if (!moved) {
    return NextResponse.json(
      { error: "This session changed a moment ago. Refresh to see its latest time." },
      { status: 409 }
    );
  }

  // The old time's calendar event goes (Google tells the therapist it is
  // cancelled); a new one is made when the clinic confirms the new time.
  await deleteMeetEventForAppointment(admin, { appointmentId, googleEventId: appointment.google_event_id });

  const { error: logError } = await admin.from("appointment_reassignment_log").insert({
    appointment_id: appointmentId,
    changed_by: user.id,
    old_therapist_id: appointment.therapist_id,
    new_therapist_id: null,
    old_slot_time: appointment.slot_time,
    new_slot_time: newSlotIso,
  });
  if (logError) console.error("appointments/reschedule: log failed", appointmentId, logError.message);

  await recordUserActivity(admin, {
    action: "appointment.rescheduled",
    actor: { id: user.id, role: "patient" },
    appointmentId,
    patientId: user.id,
  });

  return NextResponse.json({ success: true, slotTime: newSlotIso });
}
