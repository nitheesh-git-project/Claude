import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";
import { mirrorConsume } from "@/lib/sessionCreditMirror";

// Marks a confirmed session as completed. Callable by the therapist who ran
// the session, or an admin correcting the record — nobody else. There's no
// time gate: the therapist typically does this right after the call ends,
// which is naturally after slot_time, but an admin may also need to
// backfill an older session, so this doesn't try to guess "is it over yet".
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
    .select("id, status, therapist_id, package_purchase_id, home_visit_purchase_id")
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
