import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { updateMeetEventForAppointment } from "@/lib/googleCalendarSync";
import { isWholeHourSlot, NOT_WHOLE_HOUR_ERROR } from "@/lib/bookingSlots";
import {
  claimTherapistSlot,
  describeClaimFailure,
} from "@/lib/claimTherapistSlot";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("sessions");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    therapistId?: string;
    slotDateTime?: string;
    // undefined = leave category unchanged, null = explicitly clear it,
    // a real id = change to that category.
    categoryId?: string | null;
  }>(request);
  if (parseError) return parseError;
  const { appointmentId, therapistId, slotDateTime, categoryId } = body;
  if (!appointmentId || !therapistId || !slotDateTime) {
    return NextResponse.json(
      { error: "Missing appointmentId, therapistId, or slotDateTime" },
      { status: 400 }
    );
  }

  const slotTimestamp = new Date(slotDateTime).getTime();
  if (Number.isNaN(slotTimestamp)) {
    return NextResponse.json({ error: "Invalid slotDateTime" }, { status: 400 });
  }
  if (slotTimestamp <= Date.now()) {
    return NextResponse.json(
      { error: "The new slot must be in the future" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: appointment } = await admin
    .from("appointments")
    .select(
      "patient_id, status, slot_time, duration_minutes, timezone, category_id, therapist_id, therapist_payout_paid_at, google_event_id"
    )
    .eq("id", appointmentId)
    .single();

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  // Slots start on the hour, everywhere. A reschedule may ignore the lead
  // time -- it is the admin override lane -- but never this: a session moved
  // to 6:52 is one no picker in the app can express. Judged against the
  // appointment's OWN recorded timezone rather than the clinic's, because
  // that is the zone its hour was chosen in -- and it has to be read after
  // the row is loaded, which is why this check sits below the fetch.
  if (!isWholeHourSlot(new Date(slotTimestamp).toISOString(), appointment.timezone)) {
    return NextResponse.json({ error: NOT_WHOLE_HOUR_ERROR }, { status: 400 });
  }
  if (appointment.status === "completed" || appointment.status === "cancelled") {
    return NextResponse.json(
      { error: "This session is already over and can't be modified" },
      { status: 400 }
    );
  }
  // Reassigning to a different therapist after this session's payout has
  // already been settled would silently orphan the payout record - the
  // original therapist's Payout History would lose a session they were
  // genuinely already paid for, and the new therapist's would show one
  // they never received. Time-only reschedules (same therapist) are fine.
  if (appointment.therapist_payout_paid_at && appointment.therapist_id !== therapistId) {
    return NextResponse.json(
      {
        error:
          "This session's payout has already been settled and can't be reassigned to a different therapist.",
      },
      { status: 400 }
    );
  }

  const { data: therapist } = await admin
    .from("profiles")
    .select("id, active")
    .eq("id", therapistId)
    .eq("role", "therapist")
    .eq("approved", true)
    .single();

  if (!therapist) {
    return NextResponse.json(
      { error: "That therapist is not an approved therapist" },
      { status: 400 }
    );
  }
  // Block reassigning TO a suspended therapist, but don't block re-saving
  // an appointment that's already assigned to one - e.g. rescheduling just
  // the time on a session whose therapist was suspended after the fact
  // must still work.
  if (!therapist.active && therapistId !== appointment.therapist_id) {
    return NextResponse.json(
      { error: "That therapist is suspended and can't be assigned to a different session." },
      { status: 400 }
    );
  }

  // Changing category re-labels the session and updates its duration (for
  // accurate conflict-checking / calendar blocking) - the amount already
  // charged is left untouched, since real money already moved via Razorpay
  // and retroactively adjusting it would need refund/upcharge handling
  // this route doesn't do.
  let durationMinutes = appointment.duration_minutes ?? BASE_DURATION_MINUTES;
  let resolvedCategoryId: string | null = appointment.category_id;
  if (categoryId === null) {
    resolvedCategoryId = null;
    durationMinutes = BASE_DURATION_MINUTES;
  } else if (categoryId && categoryId !== appointment.category_id) {
    const { data: category } = await admin
      .from("treatment_categories")
      .select("id, duration_minutes")
      .eq("id", categoryId)
      .single();
    if (!category) {
      return NextResponse.json({ error: "That category doesn't exist" }, { status: 400 });
    }
    resolvedCategoryId = category.id;
    durationMinutes = category.duration_minutes ?? durationMinutes;
  }

  const newSlotIso = new Date(slotDateTime).toISOString();

  // Moving the session and reserving the therapist for the time it is
  // moving TO, in one statement under a row lock on that therapist.
  //
  // This replaces a check, a write, a re-check and a revert. The re-check
  // narrowed the double-booking window without closing it -- two
  // reschedules onto overlapping times both passed the first check before
  // either write committed -- and the revert rewrote four columns with no
  // compare-and-set, so a third admin's change landing in between was
  // silently undone by a request that had already lost.
  //
  // The new slot is passed in rather than written first, because the
  // overlap test has to judge the time being moved to. Writing first and
  // testing afterwards is exactly the sequence this removes.
  const claim = await claimTherapistSlot(admin, {
    appointmentId,
    therapistId,
    // A reschedule is applied only while the therapist this request was
    // read with is still the one on the session. `is not distinct from`
    // inside the function means an unassigned session is matched by a null
    // here, so an edit that assigns and reschedules at once still works.
    expectedTherapistId: appointment.therapist_id,
    newSlotTime: newSlotIso,
    newDurationMinutes: durationMinutes,
    newCategoryId: resolvedCategoryId,
  });

  if (!claim.ok) {
    const { status, error } = describeClaimFailure(claim);
    return NextResponse.json({ error }, { status });
  }

  // Best-effort audit trail - logged only when something actually changed,
  // so a no-op "save" (e.g. picking the same therapist/time again) doesn't
  // clutter the session's history with an empty entry.
  const therapistChanged = appointment.therapist_id !== therapistId;
  const slotChanged = appointment.slot_time !== newSlotIso;
  const categoryChanged = appointment.category_id !== resolvedCategoryId;
  if (therapistChanged || slotChanged || categoryChanged) {
    const { error: logError } = await admin.from("appointment_reassignment_log").insert({
      appointment_id: appointmentId,
      changed_by: adminUser.id,
      old_therapist_id: appointment.therapist_id,
      new_therapist_id: therapistId,
      old_slot_time: appointment.slot_time,
      new_slot_time: newSlotIso,
      old_category_id: appointment.category_id,
      new_category_id: resolvedCategoryId,
    });
    if (logError) {
      console.error("Failed to record appointment_reassignment_log entry:", logError);
    }
  }

  // Past the post-write conflict re-check above -- the change is confirmed
  // to have actually stuck. Only patches the Calendar event (attendees +
  // time) if one already exists (i.e. this session was already confirmed
  // with a Meet event); no-ops otherwise, matching duration/category-only
  // edits too since those affect the event's end time.
  if (therapistChanged || slotChanged || categoryChanged) {
    await updateMeetEventForAppointment(admin, {
      appointmentId,
      googleEventId: appointment.google_event_id,
      patientId: appointment.patient_id,
      therapistId,
      slotTime: newSlotIso,
      durationMinutes,
      timezone: appointment.timezone,
    });
  }

  // appointment_reassignment_log already records the before/after of the
  // session itself; this records that an admin was the one who did it, in
  // the same place every other admin action is read from.
  await recordAdminActivity(admin, adminUser.id, {
    action: "session.update",
    targetId: appointmentId,
    details: { therapistChanged, slotChanged, categoryChanged },
  });

  return NextResponse.json({ success: true });
}
