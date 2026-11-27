import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { createMeetEventForConfirmedAppointment } from "@/lib/googleCalendarSync";
import type { CalendarInviteOutcome } from "@/lib/calendarInviteOutcome";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseAdminSettings, SITE_SETTINGS_SELECT } from "@/lib/adminSettings";
import { BASE_DURATION_MINUTES } from "@/lib/pricing";
import {
  claimTherapistSlot,
  describeClaimFailure,
} from "@/lib/claimTherapistSlot";
import { checkTherapistAssignable, unassignableBody } from "@/lib/therapistAssignability";
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
  // Every read this route needs before it writes, sent together. They used to
  // run one after another, and each is a round trip to the database -- from
  // a server in another continent that was most of the wait on Create
  // booking. The answers are still judged in the order they always were.
  const [{ data: patient }, { data: category }, { data: settingsRow }, therapistRead] = await Promise.all([
    admin.from("profiles").select("id, full_name, role, active, approved").eq("id", patientId).maybeSingle(),
    admin
      .from("treatment_categories")
      .select("id, title, price_paise, duration_minutes, active")
      .eq("id", categoryId)
      .maybeSingle(),
    admin.from("site_settings").select(SITE_SETTINGS_SELECT).maybeSingle(),
    therapistId
      ? admin.from("profiles").select("id, full_name, role, active, approved").eq("id", therapistId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!patient || patient.role !== "patient") {
    return NextResponse.json({ error: "That patient doesn't exist." }, { status: 404 });
  }
  if (patient.active === false) {
    return NextResponse.json(
      { error: "That patient is suspended. Reactivate the account before booking for them." },
      { status: 409 }
    );
  }
  if (patient.approved === false) {
    return NextResponse.json(
      {
        error:
          "This patient's account is still waiting for approval. Approve it under Today -> Approvals, then book for them.",
      },
      { status: 409 }
    );
  }

  if (!category) {
    return NextResponse.json({ error: "That treatment category doesn't exist." }, { status: 404 });
  }
  if (category.active === false) {
    return NextResponse.json(
      {
        error: `"${category.title}" is switched off, so it can't be booked. Turn it back on under Catalog to use it.`,
      },
      { status: 409 }
    );
  }

  const durationMinutes = category.duration_minutes ?? BASE_DURATION_MINUTES;
  const settings = parseAdminSettings(settingsRow);

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
    const therapist = (therapistRead as { data: { role: string; approved: boolean | null; active: boolean | null } | null }).data;
    if (!therapist || therapist.role !== "therapist" || !therapist.approved) {
      return NextResponse.json({ error: "That therapist isn't available." }, { status: 404 });
    }
    if (therapist.active === false) {
      return NextResponse.json({ error: "That therapist is suspended." }, { status: 409 });
    }

    // Free at that hour? Asked BEFORE anything is created. The claim below is
    // still the binding check (it is atomic), but when this says no there is
    // simply nothing to undo -- a clash used to be found only after a paid,
    // unassigned session had been written.
    const assignable = await checkTherapistAssignable(admin, therapistId, new Date(slotMs).toISOString(), durationMinutes);
    if (assignable.ok === false) {
      return NextResponse.json(unassignableBody(assignable.reasons), { status: 409 });
    }
  }

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

  if (error?.code === "23P01") {
    // trg_appointments_patient_no_overlap.
    return NextResponse.json(
      { error: "This patient already has a session around that time. Pick a different slot." },
      { status: 409 }
    );
  }
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
      // Somebody took the hour between the check above and this claim. The
      // booking was for that therapist and cannot be made, so it is undone
      // rather than left behind as a paid, unassigned session -- which
      // counted in the patient's Total Paid and sat on Admin Home as "no
      // therapist" for a booking the admin had just been told failed. Only
      // our own untouched row is removed (still requested, still nobody on
      // it); if that somehow fails the row is reported, not hidden.
      const { error: undoError } = await admin
        .from("appointments")
        .delete()
        .eq("id", created.id)
        .eq("status", "requested")
        .is("therapist_id", null);
      if (undoError) console.error("admin/create-booking: could not undo a failed booking", created.id, undoError.message);
      const { error: claimErrorMessage } = describeClaimFailure(claim);
      return NextResponse.json(
        {
          error: undoError
            ? `${claimErrorMessage} The session was created without a therapist - assign one from Sessions.`
            : `${claimErrorMessage} Nothing was booked - pick another time or therapist.`,
          ...(undoError ? { appointmentId: created.id, assigned: false } : {}),
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
  //
  // What happened to the invite is reported back, separately from the
  // booking: the screen used to promise "the calendar invite is on its way"
  // for every confirmed booking, including on a deployment with no Google
  // connection, where none is ever sent (QA F-13). Null for an unassigned
  // booking, which has no invite to send yet.
  // The invite and the audit row are independent, so they go together: the
  // audit write used to wait for Google's answer before it started.
  const invite: Promise<CalendarInviteOutcome | null> = therapistId
    ? createMeetEventForConfirmedAppointment(admin, {
        appointmentId: created.id,
        patientId,
        therapistId,
        slotTime,
        durationMinutes,
        timezone: body.timezone || "Asia/Kolkata",
      })
    : Promise.resolve(null);

  const audit = recordAdminActivity(admin, admin_ctx.id, {
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

  const [calendarInvite] = await Promise.all([invite, audit]);

  return NextResponse.json({ success: true, appointmentId: created.id, status, calendarInvite });
}
