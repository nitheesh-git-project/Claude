import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";
import {
  claimTherapistSlot,
  describeClaimFailure,
} from "@/lib/claimTherapistSlot";
import {
  leadTimeMsFromHours,
  isWholeHourSlot,
  NOT_WHOLE_HOUR_ERROR,
} from "@/lib/bookingSlots";

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
  // Slots start on the hour, everywhere -- including the override lane. The
  // override is about the lead time, never about landing between hours.
  // Checked in the booking's own timezone, since 6 PM IST is 12:30 UTC.
  if (!isWholeHourSlot(new Date(slotMs).toISOString(), body.timezone)) {
    return NextResponse.json({ error: NOT_WHOLE_HOUR_ERROR }, { status: 400 });
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

  // `active` was selected here and never read, so an admin could book
  // against a condition the clinic had switched off -- the row is gone from
  // the public pages and the patient's own booking screen, so the only way
  // to reach it is this form's own list, which is exactly where a stale
  // browser tab keeps offering it. The session that results is priced and
  // staffed from a row nobody intends to sell any more.
  //
  // Stated rather than silently dropped: an admin picking it from a list
  // that still showed it needs to know why it was refused, and switching
  // the condition back on is a real answer.
  if (category.active === false) {
    return NextResponse.json(
      {
        error: `"${category.title}" is switched off, so it can't be booked. Turn it back on under Catalog to use it.`,
      },
      { status: 409 }
    );
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

    // The overlap test that used to sit here has moved into the atomic
    // claim below -- checking before the insert and then inserting with the
    // therapist already on the row is the read-then-write this codebase has
    // removed everywhere else. It is kept out of this block entirely rather
    // than duplicated, so there is exactly one place that decides whether a
    // therapist is free.
  }

  // Inserted UNASSIGNED, then the therapist reserved through the one
  // atomic claim -- the insert needs to have happened for there to be an
  // appointment id to lock against. A booking an admin makes is confirmed
  // the moment a therapist is on it (the admin *is* the approver), so the
  // claim below carries the confirmation in the same statement. Without a
  // therapist it lands in the same 'requested' queue a patient's own
  // booking does, which is also where it lands if the slot turns out to be
  // taken.
  const { data: created, error } = await admin
    .from("appointments")
    .insert({
      patient_id: patientId,
      therapist_id: null,
      category_id: categoryId,
      concern: category.title,
      slot_time: slotTime,
      timezone: body.timezone || "Asia/Kolkata",
      duration_minutes: durationMinutes,
      status: "requested",
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
    return NextResponse.json(
      { error: error?.message ?? "Could not create the booking." },
      { status: 500 }
    );
  }

  // Reserve the therapist, atomically, now there is an appointment id to
  // lock against. The overlap test, the compare-and-set and the write all
  // happen together, so the read-then-insert that used to sit above -- and
  // which a double-clicked form reliably beat -- is gone.
  //
  // `appointments_one_therapist_per_slot` still backs this up at the
  // database: it binds (therapist_id, slot_time) for assigned, live rows,
  // so the claim's own UPDATE trips it for an exact duplicate. The lock
  // should mean nothing ever reaches it, which is the right relationship
  // between the two -- the index catches identical start times, and the
  // claim catches the overlapping ones a unique index cannot express.
  if (therapistId) {
    const claim = await claimTherapistSlot(admin, {
      appointmentId: created.id,
      therapistId,
      expectUnassigned: true,
      // A booking an admin makes is confirmed the moment a therapist is on
      // it -- there is nobody left to approve it, the admin is the approver.
      confirm: true,
    });
    if (!claim.ok) {
      // The session exists and is paid for (or owed for); only the
      // assignment failed. Cancelling it would be worse than leaving it in
      // the queue an unassigned booking already belongs in -- so it is
      // reported, with the session kept, and the admin assigns from the
      // Sessions screen where they can see who is free.
      const { error: claimErrorMessage } = describeClaimFailure(claim);
      return NextResponse.json(
        {
          error: `${claimErrorMessage} The session has been created without a therapist - assign one from Sessions.`,
          appointmentId: created.id,
          assigned: false,
        },
        { status: 409 }
      );
    }
  }

  // What this booking actually ended up as. The row is inserted `requested`
  // and `claimTherapistSlot(..., confirm: true)` moves it to `confirmed`, so
  // reaching here with a therapist means confirmed and without one means
  // requested -- a claim that failed has already returned 409 above.
  //
  // This was **missing**, and it broke the screen's happy path: the audit
  // call and the response below both read a bare `status`, which no longer
  // existed once the atomic claim replaced the old read-then-insert, so every
  // successful admin booking threw `ReferenceError: status is not defined`
  // and answered 500 -- *after* the appointment had been created. The admin
  // was told it failed, and booked again.
  const status = therapistId ? "confirmed" : "requested";

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

  await recordAdminActivity(admin, admin_ctx.id, {
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
