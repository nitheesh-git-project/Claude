import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";
import { mirrorConsume } from "@/lib/sessionCreditMirror";
import { DEFAULT_ADMIN_SETTINGS } from "@/lib/adminSettings";

// Marks a confirmed session as completed. Callable by the therapist who ran
// the session, or an admin correcting the record — nobody else.
//
// Two gates apply to the therapist's own path and to neither of the
// admin's, because `status = 'completed' && payment_status = 'paid'` is the
// exact and only condition that makes a therapist's revenue share payable
// (therapistEarnings, therapistPayouts, moneyByBucketFor and
// settle-therapist-payout all read that one pair). Completion is therefore
// a financial write with a clinical name, and it was previously
// unrestricted in both directions:
//
//   1. **Nothing may be completed unpaid.** A session with no payment, no
//      programme behind it and no cash collected is a session the clinic
//      has no record of being sold. A cash home visit must have its
//      collection recorded first, which is the correct order anyway.
//   2. **Nothing may be completed before it could have started.** The floor
//      is the same join window a therapist could have opened the call in,
//      so "I marked it done before it began" is not expressible.
//
// An admin keeps the unrestricted path for backfills and corrections —
// which is what the `early_completion` and `completion_without_entitlement`
// signals watch, rather than a rule that would block a legitimate fix.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    noShow?: boolean;
  }>(request);
  if (parseError) return parseError;
  const { appointmentId, noShow } = body;
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("appointments")
    .select(
      "id, status, therapist_id, package_purchase_id, home_visit_purchase_id, payment_status, cash_collected_at, slot_time"
    )
    .eq("id", appointmentId)
    .single();
  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const adminUser = await getAdminUser();
  const isOwningTherapist = appointment.therapist_id === user.id;
  if (!adminUser && !isOwningTherapist) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Only gate the therapist's own path -- an admin correcting the record is
  // never subject to the patient/therapist suspension flag.
  if (!adminUser && !(await isProfileActiveAndApproved(user.id))) {
    return NextResponse.json({ error: "Your account is not active — it is either awaiting admin approval or has been suspended." }, { status: 403 });
  }

  if (appointment.status !== "confirmed") {
    return NextResponse.json(
      { error: "Only confirmed sessions can be marked completed." },
      { status: 400 }
    );
  }

  if (!adminUser) {
    const coveredByProgramme =
      !!appointment.package_purchase_id || !!appointment.home_visit_purchase_id;
    const paid = appointment.payment_status === "paid";
    const cashInHand = !!appointment.cash_collected_at;
    if (!paid && !coveredByProgramme && !cashInHand) {
      return NextResponse.json(
        {
          error:
            "This session hasn't been paid for. If you collected cash at the door, record that first; otherwise ask an admin to sort the payment before closing it.",
        },
        { status: 409 }
      );
    }

    // Read in its own call, per the migration-dependent-column rule, and
    // defaulting to the same value adminSettings does so a database without
    // the column behaves as the settings page says it should.
    const { data: windowRow } = await admin
      .from("site_settings")
      .select("join_window_minutes")
      .maybeSingle();
    const joinWindowMinutes =
      typeof windowRow?.join_window_minutes === "number"
        ? windowRow.join_window_minutes
        : DEFAULT_ADMIN_SETTINGS.joinWindowMinutes;

    const opensAt =
      new Date(appointment.slot_time).getTime() - joinWindowMinutes * 60_000;
    if (Date.now() < opensAt) {
      return NextResponse.json(
        {
          error:
            "This session hasn't started yet. You can mark it done once it's under way.",
        },
        { status: 409 }
      );
    }
  }

  // Atomic claim, same pattern as cancelAppointmentAndRefund's — the plain
  // read-then-write this used to be let two concurrent requests (e.g. a
  // therapist clicking Done while an admin clicks No-Show, or a patient
  // cancelling — and getting refunded — at the same moment) both pass the
  // status check above and then unconditionally overwrite each other. Worse,
  // an unconditional write here could resurrect a just-cancelled-and-refunded
  // appointment back to "completed", making it look payout-eligible again.
  // Requiring status still be 'confirmed' at write time closes both cases.
  const { data: updated, error } = await admin
    .from("appointments")
    .update({ status: "completed", no_show: !!noShow })
    .eq("id", appointmentId)
    .eq("status", "confirmed")
    .select("id")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "This session was already updated — please refresh and try again." },
      { status: 409 }
    );
  }

  // Spend the credit this session was booked against. A no-show consumes it
  // too: forfeiting is the same rule a late cancellation already follows,
  // and the therapist's time was reserved either way. A session paid for
  // directly rather than out of a package has no credit, which the mirror
  // treats as the ordinary case rather than an error.
  //
  // Placed after the CAS claim, so a request that lost the race to another
  // completion cannot also spend the credit.
  await mirrorConsume(admin, {
    appointmentId,
    actorId: user.id,
    actorRole: adminUser ? "admin" : "therapist",
  });

  // The other half of what completion never recorded. `session_completed`
  // and `visit_completed` have been declared event types since packages
  // were built and nothing has ever emitted them, so a programme's timeline
  // showed sessions being scheduled and then simply stopping. Best-effort,
  // like every other purchase event.
  const purchaseEvent = appointment.package_purchase_id
    ? {
        table: "package_purchase_events" as const,
        purchaseId: appointment.package_purchase_id,
        eventType: "session_completed" as const,
      }
    : appointment.home_visit_purchase_id
      ? {
          table: "home_visit_purchase_events" as const,
          purchaseId: appointment.home_visit_purchase_id,
          eventType: "visit_completed" as const,
        }
      : null;

  if (purchaseEvent) {
    const { error: eventError } = await admin.from(purchaseEvent.table).insert({
      purchase_id: purchaseEvent.purchaseId,
      event_type: purchaseEvent.eventType,
      actor_id: user.id,
      appointment_id: appointmentId,
      detail: { noShow: !!noShow },
    });
    if (eventError) {
      console.error(
        "Failed to log a completion event for appointment",
        appointmentId,
        eventError.message
      );
    }
  }

  return NextResponse.json({ success: true });
}
