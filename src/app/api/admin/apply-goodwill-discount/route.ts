import { NextRequest, NextResponse } from "next/server";
import { payLaterDuePaise } from "@/lib/payLaterDue";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { applyGoodwillDiscount } from "@/lib/discounts";
import { serverError } from "@/lib/apiError";

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
    .select("id, patient_id, category_id, payment_status, status, session_code, payment_terms, list_price_paise, amount_due_paise")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: "That session no longer exists." }, { status: 404 });
  }
  if (appointment.payment_status === "paid") {
    return NextResponse.json(
      {
        error:
          "This session is already paid for. Refund it instead - a discount after the money has moved would leave the record disagreeing with the payment.",
      },
      { status: 409 }
    );
  }
  if (appointment.status === "cancelled") {
    return NextResponse.json(
      { error: "This session is cancelled - there is nothing to discount." },
      { status: 409 }
    );
  }
  // On pay-later terms what the patient owes is `amount_due_paise`, so the
  // discount has to reach it -- it used to change the discount columns only,
  // and the patient still owed the full price. A delivered pay-later
  // session's amount is fixed (its settlement row is append-only), so there
  // the answer is a write-off, said in words.
  const onPayLater = appointment.payment_terms === "pay_later";
  if (onPayLater && appointment.status === "completed") {
    return NextResponse.json(
      {
        error:
          "This session was delivered on pay-later terms, so what it costs is already fixed. Write it off if the patient shouldn't pay for it.",
      },
      { status: 409 }
    );
  }

  // The list price, re-derived here rather than trusted, so the admin is
  // told what the discount actually leaves to pay before they commit to it.
  // Checkout resolves it again at order time, which is what governs.
  // The booking's own list price first: a session priced for another country
  // carries its converted price, and re-pricing it from the rupee category
  // price here overwrote that.
  let listPricePaise = (appointment.list_price_paise as number | null) ?? 0;
  if (listPricePaise <= 0 && appointment.category_id) {
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
      // Never up: a due already lower (an earlier code) stays where it is.
      ...(onPayLater
        ? {
            amount_due_paise: Math.min(
              payLaterDuePaise(outcome.payablePaise),
              (appointment.amount_due_paise as number | null) ?? Number.MAX_SAFE_INTEGER
            ),
          }
        : {}),
    })
    .eq("id", appointmentId)
    .neq("payment_status", "paid")
    // A pay-later session delivered in the meantime keeps its fixed amount.
    .in("status", onPayLater ? ["requested", "confirmed"] : ["requested", "confirmed", "completed"])
    .select("id")
    .maybeSingle();

  if (error) {
    return serverError("admin/apply-goodwill-discount", error);
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
    amountPaise: outcome.discountPaise,
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
