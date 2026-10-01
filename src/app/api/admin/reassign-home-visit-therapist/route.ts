import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { updateMeetEventForAppointment } from "@/lib/googleCalendarSync";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";
import {
  claimTherapistSlot,
  describeClaimFailure,
} from "@/lib/claimTherapistSlot";
import { serverError } from "@/lib/apiError";

// The home-visit twin of /api/admin/reassign-package-therapist. Only touches
// visits still ahead of the patient -- completed visits keep whoever
// actually made the trip, both for history and for correct payout
// attribution. The conflict check is padded by the travel buffer, same as
// every other home-visit scheduling decision, since a therapist finishing
// one visit cannot be at another minutes later.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
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

  const [{ data: therapist }, { data: purchase }, { data: settingsRow }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, active")
      .eq("id", therapistId)
      .eq("role", "therapist")
      .eq("approved", true)
      .single(),
    admin
      .from("home_visit_package_purchases")
      .select("id, patient_id, locked_therapist_id")
      .eq("id", purchaseId)
      .single(),
    admin.from("site_settings").select("home_visit_travel_buffer_minutes").maybeSingle(),
  ]);

  if (!therapist) {
    return NextResponse.json({ error: "That therapist is not an approved therapist" }, { status: 400 });
  }
  if (!therapist.active) {
    return NextResponse.json(
      { error: "That therapist is suspended and can't be assigned new visits." },
      { status: 400 }
    );
  }
  if (!purchase) {
    return NextResponse.json({ error: "Home visit package purchase not found" }, { status: 404 });
  }

  const travelBufferMinutes =
    settingsRow?.home_visit_travel_buffer_minutes ?? DEFAULT_ADMIN_SETTINGS.homeVisitTravelBufferMinutes;

  const { data: futureAppointments } = await admin
    .from("appointments")
    .select("id, therapist_id, slot_time, duration_minutes, timezone, patient_id, google_event_id")
    .eq("home_visit_purchase_id", purchaseId)
    .in("status", ["requested", "confirmed"])
    .gt("slot_time", new Date().toISOString());

  const reassigned: string[] = [];
  const skipped: { appointmentId: string; reason: string }[] = [];

  for (const appointment of futureAppointments ?? []) {
    if (!appointment.slot_time) {
      skipped.push({ appointmentId: appointment.id, reason: "No slot time recorded." });
      continue;
    }
    // The overlap test and the compare-and-set together, under a row lock
    // on the incoming therapist -- see reassign-package-therapist for the
    // same correction. It matters more here: a home visit's clash is
    // judged with travel padding, so moving a run of visits onto one
    // therapist is exactly the case where several checks all run before any
    // write lands, and the result is one person sent to two addresses.
    const claim = await claimTherapistSlot(admin, {
      appointmentId: appointment.id,
      therapistId,
      expectedTherapistId: appointment.therapist_id,
      bufferMinutes: travelBufferMinutes,
    });
    if (!claim.ok) {
      const { error: claimMessage } = describeClaimFailure(claim);
      skipped.push({ appointmentId: appointment.id, reason: claimMessage });
      continue;
    }

    await admin.from("appointment_reassignment_log").insert({
      appointment_id: appointment.id,
      changed_by: adminUser.id,
      old_therapist_id: appointment.therapist_id,
      new_therapist_id: therapistId,
    });

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

  const { data: claimedPurchase, error: purchaseUpdateError } = await admin
    .from("home_visit_package_purchases")
    .update({ locked_therapist_id: therapistId })
    .eq("id", purchaseId)
    .eq("locked_therapist_id", purchase.locked_therapist_id)
    .select("id")
    .maybeSingle();
  if (purchaseUpdateError) {
    return serverError("admin/reassign-home-visit-therapist", purchaseUpdateError);
  }

  if (claimedPurchase) {
    const { error: eventError } = await admin.from("home_visit_purchase_events").insert({
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
      console.error("Failed to log therapist_reassigned event for home visit purchase", purchaseId, eventError);
    }
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "package.reassign_therapist",
    targetId: purchaseId,
    details: {
      oldTherapistId: purchase.locked_therapist_id,
      newTherapistId: therapistId,
      reassignedCount: reassigned.length,
      skippedCount: skipped.length,
    },
  });

  return NextResponse.json({ success: true, reassigned, skipped });
}
