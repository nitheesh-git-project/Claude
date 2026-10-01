import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";

// Reverts a mistakenly (or prematurely) completed session back to
// "confirmed" - admin-only, deliberately not self-service for the
// therapist, so undoing a Done can't be used to walk back a bad rating.
// Any ratings/feedback already submitted are cleared, since they were
// given on the premise that the session actually happened; if it's
// reopened, that premise no longer holds and both sides should be asked
// again once it's genuinely done.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("sessions");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    overridePayoutSettled?: boolean;
  }>(request);
  if (parseError) return parseError;
  const { appointmentId, overridePayoutSettled } = body;
  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("appointments")
    .select("id, status, session_code, therapist_payout_paid_at")
    .eq("id", appointmentId)
    .single();

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (appointment.status !== "completed") {
    return NextResponse.json(
      { error: "Only completed sessions can be reopened." },
      { status: 400 }
    );
  }
  // Same reasoning as cancelAppointmentAndRefund's guard: this session's
  // cash payout to the therapist has already been settled. Reopening it
  // (without this check) would silently flip status back to "confirmed"
  // while leaving therapist_payout_paid_at set - so if the session later
  // gets marked completed again, settle-therapist-payout's "unsettled"
  // query (status = 'completed' and payout_paid_at is null) would never
  // pick it back up, and the therapist would have genuinely delivered a
  // session with no record it was ever owed for. Blocked by default; an
  // admin can override after an explicit confirmation, on the same
  // understanding as the cancel flow that reconciling the already-paid-out
  // cash (if warranted) is a manual, out-of-band step from here.
  if (appointment.therapist_payout_paid_at && !overridePayoutSettled) {
    return NextResponse.json(
      {
        error:
          "This session's payout has already been settled - reopening it won't be tracked for a future payout unless you handle that manually.",
        payoutSettled: true,
      },
      { status: 400 }
    );
  }

  // What reopening reverses, stated once so nobody has to infer it.
  //
  // Three of the four downstream effects reverse **automatically**, because
  // this codebase keys them on state rather than on an event:
  //
  //   Revenue      `moneyLineFor` counts a therapist's cut only on a
  //                `completed` session, so the status change un-counts it.
  //   Pay-later    `amount_due_paise` is stamped at booking and *counted*
  //                only while `status = 'completed'` -- the split that makes
  //                "a reopened session owes nothing" true with no special
  //                case anywhere.
  //   Credits      `sessions_used` counts a session *claimed*, not
  //                completed, and reopening does not unbook it. The balance
  //                is already right, and the ledger's reserved and consumed
  //                states both reduce `available` identically, so the two
  //                cannot disagree either.
  //
  // Two reverse only because this route does it by hand: the ratings (a
  // completion is what invites them) and the frozen split rates below.
  //
  // One deliberately does NOT reverse: a settled payout. Money has left the
  // clinic, so it is refused above rather than silently unwound -- the honest
  // lane for that is an adjustment against the next payout.
  const { data: reopened, error } = await admin
    .from("appointments")
    .update({
      status: "confirmed",
      no_show: false,
      // Stamped by complete-session and cleared nowhere, so a reopened
      // session went on carrying the time of the completion that was just
      // undone -- a row reading 'confirmed' with a completion time on it.
      // `early_completion` reads this column, so leaving it set means a
      // premature Done that an admin reopened keeps the evidence of the
      // mistake and none of the correction.
      completed_at: null,
      // The revenue-split rates frozen at completion go with it. They record
      // "the rates in force on the day this was delivered", and it was not
      // delivered -- leaving them would have the money maths reading a
      // snapshot for a completion that has been undone, and the next real
      // completion would then find them already set and not overwrite the
      // ones that were actually in force.
      therapist_share_percent_at_completion: null,
      hospital_share_percent_at_completion: null,
      hospital_id_at_completion: null,
      patient_rating: null,
      patient_feedback: null,
      patient_feedback_at: null,
      patient_rating_excluded: false,
      therapist_rating: null,
      therapist_feedback: null,
      therapist_feedback_at: null,
      therapist_rating_excluded: false,
    })
    .eq("id", appointmentId)
    // Atomic claim, the same shape complete-session and
    // cancelAppointmentAndRefund use. The status check above and this write
    // are not one operation, so an unconditional update lets two admins both
    // pass it and the second wipe ratings that were resubmitted between them.
    .eq("status", "completed")
    .select("id")
    .maybeSingle();

  if (error) {
    return serverError("admin/reopen-session", error);
  }
  if (!reopened) {
    return NextResponse.json(
      { error: "This session was already updated - please refresh and try again." },
      { status: 409 }
    );
  }

  // Reopening undoes a completion, which is what makes a session
  // payout-eligible -- and it destroys whatever ratings had been submitted.
  // Both are worth attributing to a person.
  await recordAdminActivity(admin, adminUser.id, {
    action: "session.reopen",
    targetId: appointmentId,
    targetLabel: appointment.session_code ?? null,
    details: { previousStatus: appointment.status },
  });

  return NextResponse.json({ success: true });
}
