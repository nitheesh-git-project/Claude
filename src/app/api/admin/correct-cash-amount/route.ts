import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";

const MIN_REASON_LENGTH = 10;

// Correcting what a therapist is recorded as having collected at the door.
//
// This route is the other half of closing /api/therapist/record-cash-collection
// to a therapist-supplied amount. The system deriving the figure is right
// almost always and wrong occasionally -- a patient short of cash, a
// negotiated adjustment, a note handed over instead of the exact total --
// and a control that has no answer for the honest exception is a control
// that gets argued down. So the exception exists, and it belongs to the
// person who is not holding the money.
//
// Requires a reason for the same reason admin_adjust on the credit ledger
// does: this figure nets directly off what therapistCashLedger says the
// therapist owes the clinic, so a correction with no explanation is
// indistinguishable from a favour.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    appointmentId?: string;
    amountPaise?: number;
    reason?: string;
  }>(request);
  if (parseError) return parseError;

  const appointmentId = body.appointmentId?.trim();
  const reason = (body.reason ?? "").trim();
  const amountPaise = body.amountPaise;

  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }
  if (
    typeof amountPaise !== "number" ||
    !Number.isInteger(amountPaise) ||
    amountPaise < 0
  ) {
    return NextResponse.json(
      { error: "Enter the amount actually collected, in whole rupees." },
      { status: 400 }
    );
  }
  if (reason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      { error: `Say why this is being corrected — at least ${MIN_REASON_LENGTH} characters.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("appointments")
    .select(
      "id, session_code, therapist_id, visit_mode, payment_method, cash_collected_at, cash_collected_amount_paise, cash_remitted_at, travel_fee_paise"
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: "Visit not found" }, { status: 404 });
  }
  if (appointment.visit_mode !== "home_visit" || appointment.payment_method !== "cash") {
    return NextResponse.json(
      { error: "This session isn't a cash-on-visit home visit." },
      { status: 400 }
    );
  }
  if (!appointment.cash_collected_at) {
    return NextResponse.json(
      { error: "No cash has been recorded for this visit yet." },
      { status: 400 }
    );
  }
  // Once the cash has been netted off a payout, the transfer that used this
  // figure has already gone out. Correcting it here would leave the payout
  // and the ledger describing different money with nothing reconciling
  // them; the fix is a fresh adjustment against the next payout, which is
  // its own deliberate act rather than a silent edit of a settled one.
  if (appointment.cash_remitted_at) {
    return NextResponse.json(
      {
        error:
          "This cash has already been settled against a payout. Adjust the next payout instead of changing a settled figure.",
      },
      { status: 409 }
    );
  }

  const previousPaise = appointment.cash_collected_amount_paise ?? 0;
  const travelFeePaise = Math.max(0, appointment.travel_fee_paise ?? 0);

  // CAS on the figure being replaced, so two admins correcting the same
  // visit cannot both believe they wrote the final number. The audit row is
  // written after the claim for the same reason every other money route
  // does it: the log must not record a correction that lost its race.
  const { data: claimed, error } = await admin
    .from("appointments")
    .update({
      cash_collected_amount_paise: amountPaise,
      amount_paid_paise: Math.max(0, amountPaise - travelFeePaise),
    })
    .eq("id", appointmentId)
    .eq("cash_collected_amount_paise", previousPaise)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "Someone else changed this figure. Refresh and try again." },
      { status: 409 }
    );
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "cash.correct_amount",
    targetId: appointmentId,
    targetLabel: appointment.session_code ?? appointmentId,
    amountPaise,
    details: {
      previousPaise,
      correctedPaise: amountPaise,
      therapistId: appointment.therapist_id,
      reason,
    },
  });

  return NextResponse.json({ success: true, amountPaise, previousPaise });
}
