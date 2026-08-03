import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_FEE_PAISE } from "@/lib/pricing";

// "online" here means the admin already sent the money themselves (UPI,
// bank transfer) outside the platform and is logging it after the fact --
// same as "cash", just a different method label plus whatever reference
// they typed into the note field. There's no payment-provider integration
// behind this; it's record-keeping, not a real payout trigger.
const IMPLEMENTED_METHODS = ["cash", "online"];

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { therapistId, method, note } = await request.json();
  if (!therapistId || !method) {
    return NextResponse.json(
      { error: "Missing therapistId or method" },
      { status: 400 }
    );
  }
  if (!IMPLEMENTED_METHODS.includes(method)) {
    return NextResponse.json(
      { error: "Online payouts aren't available yet — use cash for now." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: therapist } = await admin
    .from("profiles")
    .select("id, revenue_share_percent")
    .eq("id", therapistId)
    .eq("role", "therapist")
    .single();

  if (!therapist) {
    return NextResponse.json({ error: "Therapist not found" }, { status: 404 });
  }
  if (therapist.revenue_share_percent === null) {
    return NextResponse.json(
      { error: "Set this therapist's revenue share % before paying out." },
      { status: 400 }
    );
  }

  // status: 'completed' matters, not just payment_status: 'paid' — a
  // still-upcoming session that happens to already be paid for hasn't been
  // delivered yet, and settling its payout early would then block the
  // patient from cancelling/refunding it (cancelAppointmentAndRefund
  // refuses once a payout is settled, to avoid an inconsistent ledger).
  const { data: unsettled } = await admin
    .from("appointments")
    .select("id, amount_paid_paise")
    .eq("therapist_id", therapistId)
    .eq("payment_status", "paid")
    .eq("status", "completed")
    .is("therapist_payout_paid_at", null);

  if (!unsettled || unsettled.length === 0) {
    return NextResponse.json(
      { error: "There's nothing currently owed to this therapist." },
      { status: 400 }
    );
  }

  const paidAt = new Date().toISOString();
  // Atomic per-row claim, same pattern as cancelAppointmentAndRefund and
  // complete-session — the plain unconditional update this used to be let
  // two concurrent settle requests (two admins, or one admin with two open
  // tabs) both read the same unsettled set and both write payout data for
  // it. Both would then report "settled ₹X" back to their respective
  // admins, and since this route's whole point is telling an admin how
  // much *cash* to physically hand the therapist, that means real money
  // paid out twice for the same sessions — with no trace afterward, since
  // the second write just silently overwrote the first's record.
  // Guarding the write on therapist_payout_paid_at still being null closes
  // that: a losing claim settles nothing, and the response reflects
  // exactly what this request actually claimed, never a phantom amount.
  const claims = await Promise.all(
    unsettled.map(async (a) => {
      const paidPaise = a.amount_paid_paise ?? SESSION_FEE_PAISE;
      const payoutPaise = Math.round((paidPaise * therapist.revenue_share_percent!) / 100);
      const { data: claimed, error } = await admin
        .from("appointments")
        .update({
          therapist_payout_paid_at: paidAt,
          therapist_payout_amount_paise: payoutPaise,
          therapist_payout_method: method,
          therapist_payout_note: note || null,
        })
        .eq("id", a.id)
        .is("therapist_payout_paid_at", null)
        .select("id")
        .maybeSingle();
      return { error, claimed: !!claimed, payoutPaise };
    })
  );

  const failed = claims.find((c) => c.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  const actuallySettled = claims.filter((c) => c.claimed);
  if (actuallySettled.length === 0) {
    return NextResponse.json(
      { error: "This payout was already settled — please refresh." },
      { status: 409 }
    );
  }

  const totalSettledPaise = actuallySettled.reduce((sum, c) => sum + c.payoutPaise, 0);

  // The client's confirm dialog shows the balance as of page load, which
  // can be stale by the time this actually runs (e.g. a new payment landed,
  // or a concurrent request already claimed some of these sessions) — this
  // route reports back only what THIS request genuinely claimed, not an
  // echo of what the client asked for.
  return NextResponse.json({
    success: true,
    settledCount: actuallySettled.length,
    settledAmountPaise: totalSettledPaise,
  });
}
