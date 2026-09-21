import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { SETTLEMENT_REJECTION_MIN_CHARS } from "@/lib/payLaterSettlement";

// The money a patient said they sent has not arrived.
//
// The mirror of `confirm-pay-later-payment`, and the differences are the
// point. **A reason is required here and not there**: this is the outcome that
// takes something away from somebody -- a patient who believes they have paid
// is told they have not -- and the reason is the only actionable half of it.
// "Not confirmed" says the claim is gone; only the reason says what to do
// next, and it is what reaches them as a `needsYou` item on their dashboard.
//
// Ten characters, the floor an admin credit adjustment, a goodwill discount
// and a pay-later grant all use, enforced here **and** by
// `pay_later_payments_rejection_needs_reason` -- the route check is true only
// for as long as every caller remembers it, and this table is reachable by the
// service-role key and by hand in the SQL editor.
//
// It settles nothing and un-settles nothing: a rejected declaration never
// allocated, so there is no state to unwind. That is the whole reason a
// declaration lands `pending` rather than provisionally reducing what is owed.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    paymentId?: string;
    reason?: string;
  }>(request);
  if (parseError) return parseError;

  const paymentId = body.paymentId?.trim();
  if (!paymentId) {
    return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < SETTLEMENT_REJECTION_MIN_CHARS) {
    return NextResponse.json(
      {
        error: `Say why, in at least ${SETTLEMENT_REJECTION_MIN_CHARS} characters. The patient reads this, and it is the only thing that tells them what to do next.`,
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: row, error: readError } = await admin
    .from("pay_later_payments")
    .select("id, patient_id, amount_paise, method, status")
    .eq("id", paymentId)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if (row.status !== "pending") {
    return NextResponse.json(
      {
        error:
          row.status === "confirmed"
            ? "This payment has already been confirmed. Reversing that is a refund, which has its own screen."
            : "This payment has already been turned down.",
      },
      { status: 409 }
    );
  }

  const { data: claimed, error } = await admin
    .from("pay_later_payments")
    .update({
      status: "rejected",
      confirmed_by: adminUser.id,
      confirmed_at: new Date().toISOString(),
      rejection_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!claimed) {
    return NextResponse.json(
      { error: "Somebody else answered this payment a moment ago." },
      { status: 409 }
    );
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "pay_later.reject_payment",
    targetId: row.patient_id,
    details: {
      paymentId: row.id,
      amountPaise: row.amount_paise,
      method: row.method,
      reason,
    },
  });

  return NextResponse.json({ success: true });
}
