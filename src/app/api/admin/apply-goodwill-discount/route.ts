import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { applyGoodwillDiscount } from "@/lib/discounts";

const MIN_REASON_LENGTH = 10;

// Taking an amount off one booking, for one patient, because a person
// decided to.
//
// This is not a campaign and is deliberately not built like one: a session
// dropped out, a therapist ran late, a patient is in genuine hardship. The
// alternative to having this lane is doing it by hand outside the system,
// where nobody can see it and the books never learn it happened.
//
// `money` scope, not `sessions`. The capability decides the section, not
// where the button sits -- this changes what somebody is charged, which is
// the money question however clinical the reason for it.
//
// Three rules it shares with every other override lane in this app:
//
// 1. **A mandatory reason**, ten characters, enforced by the route and by a
//    CHECK on the column. Discretion nobody can explain a month later is
//    indistinguishable from a mistake.
// 2. **Only before payment.** A discount on something already paid for is a
//    refund, and refunds have their own route, their own Razorpay call and
//    their own audit. Quietly rewriting the price of a settled booking
//    would leave `amount_paid_paise` disagreeing with the money that moved.
// 3. **Never below the floor.** The maths lives in `discounts.ts` with the
//    offer's, so an admin cannot reach zero here by a route the standing
//    offer is guarded against.
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
  const amountPaise = Math.floor(Number(body.amountPaise));

  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    return NextResponse.json(
      { error: "Enter how much to take off, in rupees." },
      { status: 400 }
    );
  }
  if (reason.length < MIN_REASON_LENGTH) {
    return NextResponse.json(
      {
        error: `Say why, in at least ${MIN_REASON_LENGTH} characters. A discount nobody can explain later is indistinguishable from a mistake.`,
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: appointment } = await admin
    .from("appointments")
    .select("id, patient_id, category_id, payment_status, status, session_code")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: "That session no longer exists." }, { status: 404 });
  }
  if (appointment.payment_status === "paid") {
    return NextResponse.json(
      {
        error:
          "This session is already paid for. Refund it instead — a discount after the money has moved would leave the record disagreeing with the payment.",
      },
      { status: 409 }
    );
  }
  if (appointment.status === "cancelled") {
    return NextResponse.json(
      { error: "This session is cancelled — there is nothing to discount." },
      { status: 409 }
    );
  }

  // The list price, re-derived here rather than trusted, so the admin is
  // told what the discount actually leaves to pay before they commit to it.
  // Checkout resolves it again at order time, which is what governs.
  let listPricePaise = 0;
  if (appointment.category_id) {
    const { data: category } = await admin
      .from("treatment_categories")
      .select("price_paise")
      .eq("id", appointment.category_id)
      .maybeSingle();
    listPricePaise = category?.price_paise ?? 0;
  }

  const outcome = applyGoodwillDiscount(listPricePaise, amountPaise);
  if (!outcome.source) {
    return NextResponse.json(
      {
        error:
          listPricePaise <= 0
            ? "This session has no price on it to discount."
            : "That takes off nothing, or more than the session costs.",
      },
      { status: 400 }
    );
  }

  // CAS on the payment status, so a discount cannot land on a booking the
  // patient paid for in the same moment.
  const { data: claimed, error } = await admin
    .from("appointments")
    .update({
      list_price_paise: outcome.listPricePaise,
      discount_paise: outcome.discountPaise,
      discount_source: "goodwill",
      discount_reason: reason,
    })
    .eq("id", appointmentId)
    .neq("payment_status", "paid")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "This session was paid for a moment ago. Refund it instead." },
      { status: 409 }
    );
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "payment.goodwill_discount",
    targetId: appointmentId,
    targetLabel: `Session ${appointment.session_code ?? appointmentId.slice(0, 8)}`,
    details: {
      reason,
      discountPaise: outcome.discountPaise,
      listPricePaise: outcome.listPricePaise,
      payablePaise: outcome.payablePaise,
    },
  });

  return NextResponse.json({
    success: true,
    listPricePaise: outcome.listPricePaise,
    discountPaise: outcome.discountPaise,
    payablePaise: outcome.payablePaise,
  });
}
