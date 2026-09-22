import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActive, isPatientProfile } from "@/lib/supabase/requireActiveProfile";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { readPayLaterEnabled } from "@/lib/payLaterSettingsServer";
import { readPatientOwed } from "@/lib/payLaterSettlementServer";
import {
  decidePayLaterDeclaration,
  declarationRefusalMessage,
} from "@/lib/payLaterSettlement";

// A trusted patient paying online what they already owe.
//
// Deliberately **not** a checkout. `resolveCheckoutQuote` is the one place a
// booking's price and its discounts are worked out, and none of it applies
// here: this is a payment against a debt the clinic already recorded, so there
// is nothing to quote, nothing to claim and nothing to discount. Money off was
// decided when each session was booked, and the frozen price on each already
// has it taken off -- resolving a discount again here would take it twice.
//
// Four rules:
//
// 1. **The amount comes from the server.** The browser may ask for a figure
//    and it is capped at what `readPatientOwed` says is owed, re-derived
//    through the same `computePatientBalance` the admin's own screen reads --
//    so the patient cannot pay themselves into a credit the clinic would then
//    have to give back, and the two screens cannot disagree about the total.
// 2. **The row is written before the order.** A capture whose
//    `pay_later_payments` row does not exist is money
//    `record_payment_capture` cannot attribute, which is the unmatched-payment
//    state this whole branch exists to avoid.
// 3. **It carries no allocated money until the capture.** The row is created
//    with `unallocated_paise = 0`; the capture sets it to the full amount and
//    calls the allocator. Nothing is settled before the money has arrived.
// 4. **Nothing is settled here.** `record_payment_capture` confirms the row
//    and allocates inside its own transaction under a row lock, so a payment
//    either confirms and closes the sessions it covers or does neither.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // The same scope the rest of checkout counts against, keyed on the account:
  // an IP can be rotated and a user id cannot.
  const limited = await enforceRateLimit(request, "checkout", { identifier: user.id });
  if (limited) return limited;

  if (!(await isProfileActive(user.id))) {
    return NextResponse.json({ error: "Your account has been suspended." }, { status: 403 });
  }
  if (!(await isPatientProfile(user.id))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    amountPaise?: number | string;
  }>(request);
  if (parseError) return parseError;

  const admin = createAdminClient();
  const [featureEnabled, owed] = await Promise.all([
    readPayLaterEnabled(admin),
    readPatientOwed(admin, user.id),
  ]);

  if (!owed) {
    // A read that failed is not a read that came back empty. Taking money
    // against a figure nobody could read is the one outcome this must not
    // produce, so it says exactly that rather than charging a guess.
    return NextResponse.json(
      { error: "We couldn't check what you owe just now. Please try again." },
      { status: 503 }
    );
  }

  const asked = Number(body.amountPaise);
  // An absent or unreadable figure means all of it, which is what the Pay
  // button offers and what a patient means by tapping it.
  const amountPaise = Number.isFinite(asked) && asked > 0 ? Math.floor(asked) : owed.owedPaise;

  const decision = decidePayLaterDeclaration({
    featureEnabled,
    owedPaise: owed.owedPaise,
    amountPaise,
    // A declaration waiting to be checked does not stop somebody paying
    // through the app: the gateway confirms this one itself, so it never
    // joins the queue the other rule is about.
    hasPending: false,
  });
  if (!decision.allowed) {
    return NextResponse.json(
      { error: declarationRefusalMessage(decision.reason) },
      { status: 409 }
    );
  }

  const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
  if (!keyId || !process.env.RAZORPAY_KEY_SECRET) {
    return NextResponse.json(
      { error: "Payments are temporarily unavailable. Please contact the clinic." },
      { status: 503 }
    );
  }

  // Written first, and deliberately with no order id yet: a row carrying an
  // order id that was never minted would wait for a capture that can never
  // arrive.
  const { data: row, error: insertError } = await admin
    .from("pay_later_payments")
    .insert({
      patient_id: user.id,
      amount_paise: amountPaise,
      method: "online",
      // An online row is never `pending` -- the CHECK on the table refuses
      // one, because the gateway is the confirmation and a pending online row
      // would be a queue entry nobody could ever action. It arrives confirmed
      // with nothing allocated; the capture is what puts money on it.
      status: "confirmed",
      declared_by: user.id,
      unallocated_paise: 0,
    })
    .select("id")
    .single();

  if (insertError || !row) {
    console.error("Could not record a pay-later settlement", user.id, insertError);
    return NextResponse.json(
      { error: "We couldn't start that payment just now. Please try again." },
      { status: 500 }
    );
  }

  try {
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt: `settle_${row.id.slice(0, 33)}`,
    });

    const { error: linkError } = await admin
      .from("pay_later_payments")
      .update({ razorpay_order_id: order.id, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (linkError) throw linkError;

    return NextResponse.json({
      orderId: order.id,
      amountPaise,
      keyId,
      payLaterPaymentId: row.id,
    });
  } catch (e) {
    console.error("Could not create a settlement order", row.id, e);
    return NextResponse.json(
      { error: "We couldn't start that payment just now. Please try again." },
      { status: 502 }
    );
  }
}
