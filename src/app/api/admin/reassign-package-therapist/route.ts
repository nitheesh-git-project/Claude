import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { findTherapistConflict } from "@/lib/checkTherapistConflict";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { updateMeetEventForAppointment } from "@/lib/googleCalendarSync";

// Moves an entire package purchase's remaining programme to a new
// therapist in one action -- the answer to "the locked therapist went on
// leave/left the practice", which nothing before this route could do
// short of reassigning every future session by hand. Only touches
// sessions that are still ahead of the patient: completed sessions keep
// the therapist who actually ran them, which is both historically
// accurate and the correct payout attribution.
export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    purchaseId?: string;
    therapistId?: string;
  }>(request);
  if (parseError) return parseError;
  const { purchaseId, therapistId } = body;
  if (!purchaseId || !therapistId) {
    return NextResponse.json({ error: "Missing purchaseId or therapistId" }, { status: 400 });
  }

  const admin = createAdminClient();

  const [{ data: therapist }, { data: purchase }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, active")
      .eq("id", therapistId)
      .eq("role", "therapist")
      .eq("approved", true)
      .single(),
    admin
      .from("patient_package_purchases")
      .select("id, patient_id, locked_therapist_id")
      .eq("id", purchaseId)
      .single(),
  ]);

  if (!therapist) {
    return NextResponse.json({ error: "That therapist is not an approved therapist" }, { status: 400 });
  }
  if (!therapist.active) {
    return NextResponse.json(
      { error: "That therapist is suspended and can't be assigned new sessions." },
      { status: 400 }
    );
  }
  if (!purchase) {
    return NextResponse.json({ error: "Package purchase not found" }, { status: 404 });
  }

  // Only future, not-yet-run sessions move -- see the file header comment.
  const { data: futureAppointments } = await admin
    .from("appointments")
    .select("id, therapist_id, slot_time, duration_minutes, timezone, patient_id, google_event_id")
    .eq("package_purchase_id", purchaseId)
    .in("status", ["requested", "confirmed"])
    .gt("slot_time", new Date().toISOString());

  const reassigned: string[] = [];
  const skipped: { appointmentId: string; reason: string }[] = [];

  for (const appointment of futureAppointments ?? []) {
    if (!appointment.slot_time) {
      skipped.push({ appointmentId: appointment.id, reason: "No slot time recorded." });
      continue;
    }
    const conflict = await findTherapistConflict(
      admin,
      therapistId,
      appointment.slot_time,
      appointment.duration_minutes ?? BASE_DURATION_MINUTES,
      { excludeAppointmentId: appointment.id }
    );
    if (conflict) {
      skipped.push({
        appointmentId: appointment.id,
        reason: "The new therapist already has another session at that time.",
      });
      continue;
    }

    // CAS on the therapist_id this request actually read -- without this,
    // two concurrent reassigns of the same purchase to different
    // therapists could both pass the conflict check above and then both
    // write, leaving whichever wrote last as the silent winner with no
    // trace of the race. A lost claim here means someone else already
    // moved this session; it's correctly reported as skipped, not retried.
    const { data: claimedAppointment, error: updateError } = await admin
      .from("appointments")
      .update({ therapist_id: therapistId })
      .eq("id", appointment.id)
      .eq("therapist_id", appointment.therapist_id)
      .select("id")
      .maybeSingle();
    if (updateError) {
      skipped.push({ appointmentId: appointment.id, reason: updateError.message });
      continue;
    }
    if (!claimedAppointment) {
      skipped.push({
        appointmentId: appointment.id,
        reason: "This session's therapist was changed concurrently by another request.",
      });
      continue;
    }

    await admin.from("appointment_reassignment_log").insert({
      appointment_id: appointment.id,
      changed_by: adminUser.id,
      old_therapist_id: appointment.therapist_id,
      new_therapist_id: therapistId,
    });

    // Keeps the same Meet link, just repoints the attendee and re-sends
    // the calendar update -- same call update-appointment makes for a
    // single reassignment.
    await updateMeetEventForAppointment(admin, {
      appointmentId: appointment.id,
      googleEventId: appointment.google_event_id,
      patientId: appointment.patient_id,
      therapistId,
      slotTime: appointment.slot_time,
      durationMinutes: appointment.duration_minutes,
      timezone: appointment.timezone,
    });

    reassigned.push(appointment.id);
  }

  // CAS on the value this request actually read above -- two concurrent
  // clicks both read the same old locked_therapist_id and would otherwise
  // both "win" (the appointment-level updates are individually idempotent,
  // so the final assignment state is fine either way, but without this
  // guard both requests would each log their own therapist_reassigned
  // event, leaving a false "reassigned twice" entry in the timeline). Only
  // the request whose read is still current gets to log the event; a
  // second, truly simultaneous request finds the row already moved and
  // treats it as a no-op success rather than writing a duplicate.
  const { data: claimedPurchase, error: purchaseUpdateError } = await admin
    .from("patient_package_purchases")
    .update({ locked_therapist_id: therapistId })
    .eq("id", purchaseId)
    .eq("locked_therapist_id", purchase.locked_therapist_id)
    .select("id")
    .maybeSingle();
  if (purchaseUpdateError) {
    return NextResponse.json({ error: purchaseUpdateError.message }, { status: 500 });
  }

  if (claimedPurchase) {
    const { error: eventError } = await admin.from("package_purchase_events").insert({
      purchase_id: purchaseId,
      event_type: "therapist_reassigned",
      actor_id: adminUser.id,
      detail: {
        oldTherapistId: purchase.locked_therapist_id,
        newTherapistId: therapistId,
        reassignedAppointmentIds: reassigned,
        skipped,
      },
    });
    if (eventError) {
      console.error("Failed to log therapist_reassigned event for purchase", purchaseId, eventError);
    }
  }

  return NextResponse.json({ success: true, reassigned, skipped });
}
