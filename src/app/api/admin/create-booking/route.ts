import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { findTherapistConflict } from "@/lib/checkTherapistConflict";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";
import { leadTimeMsFromHours } from "@/lib/bookingSlots";

// Books a session on a patient's behalf.
//
// Until now there was no admin path that *created* an appointment at all --
// every booking originated in the patient's own wizard, a package booking
// route, or a home-visit booking route. Admin could assign, edit, cancel and
// reopen, never create. So a patient who phoned the clinic could not be
// booked, and a therapist cancellation could not be re-slotted for them.
//
// Deliberately not a second booking implementation: it writes the same
// appointments row shape the wizard does, runs the same conflict check, and
// hands off to the same Meet/Calendar sync. What it adds is the two things
// only a human on the phone can supply -- a lead-time override, and an
// explicit statement of how this session is being paid for.

type Body = {
  patientId?: string;
  therapistId?: string | null;
  categoryId?: string;
  slotTime?: string;
  timezone?: string | null;
  notes?: string | null;
  paymentMode?: "unpaid" | "paid_offline";
  overrideLeadTime?: boolean;
};

export async function POST(request: NextRequest) {
  const admin_ctx = await requireAdminScope("sessions");
  if (!admin_ctx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await parseJsonBody<Body>(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  const patientId = body.patientId?.trim();
  const categoryId = body.categoryId?.trim();
  const slotTime = body.slotTime?.trim();
  const therapistId = body.therapistId?.trim() || null;
  const paymentMode = body.paymentMode === "paid_offline" ? "paid_offline" : "unpaid";

  if (!patientId) return NextResponse.json({ error: "Choose a patient." }, { status: 400 });
  if (!categoryId) return NextResponse.json({ error: "Choose a treatment category." }, { status: 400 });
  if (!slotTime) return NextResponse.json({ error: "Choose a date and time." }, { status: 400 });

  const slotMs = new Date(slotTime).getTime();
  if (Number.isNaN(slotMs)) {
    return NextResponse.json({ error: "That date and time isn't valid." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Never trust the role, the price or the duration the browser sent -- all
  // three are re-derived here, same rule as every other admin route.
  const { data: patient } = await admin
    .from("profiles")
    .select("id, full_name, role, active")
    .eq("id", patientId)
    .maybeSingle();

  if (!patient || patient.role !== "patient") {
    return NextResponse.json({ error: "That patient doesn't exist." }, { status: 404 });
  }
  if (patient.active === false) {
    return NextResponse.json(
      { error: "That patient is suspended. Reactivate the account before booking for them." },
      { status: 409 }
    );
  }

  const { data: category } = await admin
    .from("treatment_categories")
    .select("id, title, price_paise, duration_minutes, active")
    .eq("id", categoryId)
    .maybeSingle();

  if (!category) {
    return NextResponse.json({ error: "That treatment category doesn't exist." }, { status: 404 });
  }

  const durationMinutes = category.duration_minutes ?? BASE_DURATION_MINUTES;

  const { data: settingsRow } = await admin
    .from("site_settings")
    .select(SITE_SETTINGS_SELECT)
    .maybeSingle();
  const settings = parseAdminSettings(settingsRow);

  // The same lead time the patient-facing picker enforces, read from the
  // same setting so the two can't drift. An admin can override it -- someone
  // on the phone can arrange a session in two hours in a way the website
  // deliberately won't -- but only by saying so, and the override is logged.
  const earliest = Date.now() + leadTimeMsFromHours(settings.onlineBookingLeadTimeHours);
  if (slotMs < earliest && !body.overrideLeadTime) {
    return NextResponse.json(
      {
        error: `That slot is inside the ${settings.onlineBookingLeadTimeHours}-hour booking window.`,
        needsLeadTimeOverride: true,
      },
      { status: 409 }
    );
  }

  if (therapistId) {
    const { data: therapist } = await admin
      .from("profiles")
      .select("id, full_name, role, active, approved")
      .eq("id", therapistId)
      .maybeSingle();

    if (!therapist || therapist.role !== "therapist" || !therapist.approved) {
      return NextResponse.json({ error: "That therapist isn't available." }, { status: 404 });
    }
    if (therapist.active === false) {
      return NextResponse.json({ error: "That therapist is suspended." }, { status: 409 });
    }

    // Online sessions pass no travel buffer, matching every other online
    // booking path -- see findTherapistConflict's own comment for why the
    // buffer is a home-visit-only concern.
    const conflict = await findTherapistConflict(admin, therapistId, slotTime, durationMinutes);
    if (conflict) {
      return NextResponse.json(
        { error: "That therapist already has something in that slot." },
        { status: 409 }
      );
    }
  }

  // A booking an admin makes is confirmed the moment a therapist is on it --
  // there is nobody left to approve it, the admin *is* the approver. Without
  // a therapist it lands in the same 'requested' queue a patient's own
  // booking does.
  const status = therapistId ? "confirmed" : "requested";

  const { data: created, error } = await admin
    .from("appointments")
    .insert({
      patient_id: patientId,
      therapist_id: therapistId,
      category_id: categoryId,
      concern: category.title,
      slot_time: slotTime,
      timezone: body.timezone || "Asia/Kolkata",
      duration_minutes: durationMinutes,
      status,
      visit_mode: "online",
      // Money is never invented here. 'unpaid' is the honest default: the
      // patient still owes for this session. 'paid_offline' records that it
      // was settled outside Razorpay, with the amount taken from the
      // category's own price rather than anything the browser sent.
      payment_status: paymentMode === "paid_offline" ? "paid" : "unpaid",
      amount_paid_paise: paymentMode === "paid_offline" ? category.price_paise : null,
      paid_at: paymentMode === "paid_offline" ? new Date().toISOString() : null,
      notes: body.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !created) {
    // 23505 is the appointments_one_therapist_per_slot unique index (see
    // schema.sql). The conflict check above is not atomic -- two requests
    // can both pass it before either row lands, which a double-clicked form
    // reliably produces -- so the database is what actually guarantees one
    // therapist per slot, and this turns its error into the same message the
    // pre-check gives.
    if (error?.code === "23505") {
      return NextResponse.json(
        { error: "That therapist already has something in that slot." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error?.message ?? "Could not create the booking." },
      { status: 500 }
    );
  }

  // Sync never blocks a booking -- a Calendar/Meet failure is recorded on the
  // appointment and retried from Settings → System health. Same rule as
  // every other booking path (see AGENTS.md).
  if (therapistId) {
    await createMeetEventForConfirmedAppointment(admin, {
      appointmentId: created.id,
      patientId,
      therapistId,
      slotTime,
      durationMinutes,
      timezone: body.timezone || "Asia/Kolkata",
    });
  }

  await recordAdminActivity(admin, admin_ctx.userId, {
    action: "session.create",
    targetId: created.id,
    targetLabel: `${patient.full_name ?? "Patient"} · ${category.title}`,
    amountPaise: paymentMode === "paid_offline" ? category.price_paise : null,
    details: {
      slotTime,
      status,
      paymentMode,
      leadTimeOverridden: !!body.overrideLeadTime && slotMs < earliest,
      assignedAtCreation: !!therapistId,
    },
  });

  return NextResponse.json({ success: true, appointmentId: created.id, status });
}
