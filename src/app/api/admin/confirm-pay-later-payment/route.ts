import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { allocatePayLaterPayments } from "@/lib/payLaterSettlementServer";

// The money a patient said they sent has arrived.
//
// `money` scope, like every other route in this feature: confirming a payment
// decides which delivered sessions are closed and therefore what the clinic is
// still owed. Finance holds Money at `manage`, which is right -- this is
// exactly the reconciliation their desk exists for.
//
// **No reason is required**, deliberately. This is the outcome the queue
// exists to reach and it is one tap; taxing it with a sentence meaning "the
// money is there" is how a reason column fills with "ok" and stops being worth
// reading, and it would slow the one action that stops a patient's figure
// overstating what they owe. Its evidence is who and when, both on the row.
// Rejecting is the outcome that takes something away, and that one does need a
// sentence -- see the sibling route.
//
// Three rules:
//
// 1. **Compare-and-swap on `status = 'pending'`.** Two admins opening the
//    queue and confirming the same declaration together must produce one
//    settlement, not two, and the loser has to know it lost -- `409`, not a
//    quiet success over a row somebody else moved.
// 2. **The audit row goes after the claim**, so the log cannot record a
//    confirmation that lost its race.
// 3. **Allocation is a separate call, and it never fails this route.** The
//    money has arrived and the row says so; which sessions it closes is
//    decided by `allocate_pay_later_payment` under its own row lock, and it
//    runs again on the next completion and the next confirmation. A
//    confirmation refused because allocation hiccupped would leave the patient
//    told they still owe money they have paid.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    paymentId?: string;
  }>(request);
  if (parseError) return parseError;

  const paymentId = body.paymentId?.trim();
  if (!paymentId) {
    return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });
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
            ? "Somebody has already confirmed this payment."
            : "This payment was turned down and cannot be confirmed.",
      },
      { status: 409 }
    );
  }

  // The claim. `unallocated_paise` becomes the whole amount here and the
  // allocator spends it down -- written in the same statement that confirms,
  // so a row can never be confirmed with no money on it for the allocator to
  // find.
  const { data: claimed, error } = await admin
    .from("pay_later_payments")
    .update({
      status: "confirmed",
      confirmed_by: adminUser.id,
      confirmed_at: new Date().toISOString(),
      unallocated_paise: row.amount_paise,
      updated_at: new Date().toISOString(),
    })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!claimed) {
    return NextResponse.json(
      { error: "Somebody else confirmed this payment a moment ago." },
      { status: 409 }
    );
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "pay_later.confirm_payment",
    targetId: row.patient_id,
    details: {
      paymentId: row.id,
      amountPaise: row.amount_paise,
      method: row.method,
    },
  });

  const allocation = await allocatePayLaterPayments(admin, row.patient_id);

  return NextResponse.json({
    success: true,
    settledCount: allocation?.settledCount ?? 0,
    settledPaise: allocation?.settledPaise ?? 0,
    // Stated rather than hidden: money received and not yet covering a whole
    // session is a real state, and an admin who confirmed 2,000 against a
    // 1,200 session should see the 800 rather than wonder where it went.
    allocationChecked: allocation !== null,
  });
}
