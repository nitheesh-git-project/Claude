import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

// Reverts a mistakenly (or prematurely) completed session back to
// "confirmed" — admin-only, deliberately not self-service for the
// therapist, so undoing a Done can't be used to walk back a bad rating.
// Any ratings/feedback already submitted are cleared, since they were
// given on the premise that the session actually happened; if it's
// reopened, that premise no longer holds and both sides should be asked
// again once it's genuinely done.
export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
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
    .select("id, status, therapist_payout_paid_at")
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
  // while leaving therapist_payout_paid_at set — so if the session later
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
          "This session's payout has already been settled — reopening it won't be tracked for a future payout unless you handle that manually.",
        payoutSettled: true,
      },
      { status: 400 }
    );
  }

  const { error } = await admin
    .from("appointments")
    .update({
      status: "confirmed",
      no_show: false,
      patient_rating: null,
      patient_feedback: null,
      patient_feedback_at: null,
      therapist_rating: null,
      therapist_feedback: null,
      therapist_feedback_at: null,
    })
    .eq("id", appointmentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
