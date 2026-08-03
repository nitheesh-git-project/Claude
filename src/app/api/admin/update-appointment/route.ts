import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { findTherapistConflict } from "@/lib/checkTherapistConflict";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { appointmentId, therapistId, slotDateTime, categoryId } = await request.json();
  if (!appointmentId || !therapistId || !slotDateTime) {
    return NextResponse.json(
      { error: "Missing appointmentId, therapistId, or slotDateTime" },
      { status: 400 }
    );
  }

  if (new Date(slotDateTime).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "The new slot must be in the future" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: appointment } = await admin
    .from("appointments")
    .select("status, duration_minutes, category_id, therapist_id, therapist_payout_paid_at")
    .eq("id", appointmentId)
    .single();

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.status === "completed" || appointment.status === "cancelled") {
    return NextResponse.json(
      { error: "This session is already over and can't be modified" },
      { status: 400 }
    );
  }
  // Reassigning to a different therapist after this session's payout has
  // already been settled would silently orphan the payout record — the
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
    .select("id")
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

  // Changing category re-labels the session and updates its duration (for
  // accurate conflict-checking / calendar blocking) — the amount already
  // charged is left untouched, since real money already moved via Razorpay
  // and retroactively adjusting it would need refund/upcharge handling
  // this route doesn't do.
  let durationMinutes = appointment.duration_minutes ?? BASE_DURATION_MINUTES;
  let resolvedCategoryId = appointment.category_id;
  if (categoryId && categoryId !== appointment.category_id) {
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

  const conflict = await findTherapistConflict(
    admin,
    therapistId,
    new Date(slotDateTime).toISOString(),
    durationMinutes,
    { excludeAppointmentId: appointmentId }
  );
  if (conflict) {
    return NextResponse.json(
      { error: "This therapist already has another session that overlaps this time slot." },
      { status: 400 }
    );
  }

  const { error } = await admin
    .from("appointments")
    .update({
      therapist_id: therapistId,
      slot_time: new Date(slotDateTime).toISOString(),
      category_id: resolvedCategoryId,
      duration_minutes: durationMinutes,
    })
    .eq("id", appointmentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
