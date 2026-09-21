import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";

// A discretionary refund on one session, for an amount an admin chooses.
//
// The automatic rule is untouched and still lives in cancelAppointment:
// full refund outside the window, none inside it. That rule can only say
// "all" or "nothing", so every real-world "let's give half back" used to
// happen in the Razorpay dashboard instead -- money leaving the business
// with the app never learning about it, so revenue, margin and the payout
// maths all stayed wrong afterwards.
//
// This is the mechanism for that decision, not a policy: how much to return
// is a judgement call the admin makes per case. What the code enforces is
// only what arithmetic requires -- never more than was actually paid, never
// stacking past the original amount, and never a refund against a payment
// Razorpay doesn't have.
//
// It has two lanes, and only one of them calls a gateway. A session a
// **trusted patient settled** carries no `razorpay_payment_id` of its own --
// the money reached the clinic as one payment covering several sessions, and
// an online settlement's id sits on the `pay_later_payments` row -- so those
// are recorded as owed back and handed over by a person, exactly the way a
// cancelled cash visit already is. Same claim, same ceiling, same audit row;
// what differs is who moves the money.

type Body = { appointmentId?: string; amountPaise?: number; reason?: string };

const MAX_REASON_LENGTH = 500;

export async function POST(request: NextRequest) {
  const context = await requireAdminScope("money");
  if (!context) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await parseJsonBody<Body>(request);
  if (parsed.error) return parsed.error;

  const appointmentId = parsed.data.appointmentId?.trim();
  const amountPaise = parsed.data.amountPaise;
  const reason = parsed.data.reason?.trim();

  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }
  if (typeof amountPaise !== "number" || !Number.isInteger(amountPaise) || amountPaise < 1) {
    return NextResponse.json(
      { error: "Enter a refund amount greater than zero." },
      { status: 400 }
    );
  }
  // A discretionary refund without a stated reason is exactly the thing the
  // activity log exists to prevent, so the reason is required rather than
  // optional.
  if (!reason) {
    return NextResponse.json({ error: "Say why this refund is being made." }, { status: 400 });
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return NextResponse.json(
      { error: `Keep the reason to ${MAX_REASON_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: appointment } = await admin
    .from("appointments")
    .select(
      "id, session_code, payment_status, amount_paid_paise, travel_fee_paise, visit_mode, razorpay_payment_id, refund_amount_paise, refund_status"
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  // Is this a session a trusted patient settled? Its own isolated read,
  // because `payment_terms` and `pay_later_outcome` are newer than this
  // table and folding them into the select above would refuse every refund
  // in the app on a database mid-migration. An unreadable answer reads as
  // "not on terms", which is this route's behaviour as it has always been.
  const { data: terms } = await admin
    .from("appointments")
    .select("payment_terms, pay_later_outcome")
    .eq("id", appointmentId)
    .maybeSingle();
  const onTerms = terms?.payment_terms === "pay_later";

  // A session a trusted patient has NOT settled is not a refund at all --
  // the clinic is holding none of their money. What is being asked for is a
  // write-off, and saying so is the difference between a refusal somebody
  // can act on and a dead end.
  if (onTerms && appointment.payment_status !== "paid") {
    return NextResponse.json(
      {
        error:
          "Nothing has been paid for this session yet, so there is nothing to refund. To stop chasing it, write it off on Money → Owed by Patients.",
      },
      { status: 409 }
    );
  }

  // The money arrived into the patient's pool rather than against this
  // session -- one settlement covers several sessions, and an online one
  // carries its gateway id on the payment row, not here. "This session's
  // share of that payment" is not something a gateway refund can express
  // safely, so every settled pay-later session is handed back by hand,
  // whatever it was settled with. Same record either way: the amount, the
  // reason and who decided it, waiting on Money → Owed by Patients until
  // somebody confirms the money went back.
  const byHand = onTerms && !appointment.razorpay_payment_id;

  if (!byHand && (appointment.payment_status !== "paid" || !appointment.razorpay_payment_id)) {
    return NextResponse.json(
      {
        error:
          "There is no Razorpay payment on this session to refund. Cash and offline payments are handed back in person.",
      },
      { status: 409 }
    );
  }

  // Travel is kept out of `amount_paid_paise` on purpose -- it is a
  // pass-through to the therapist rather than revenue -- but the gateway
  // took the service line *and* the travel, so the ceiling on what can be
  // handed back is both. Without this a home visit's travel fee was money
  // Razorpay was holding that no screen in the back office could return.
  // Same arithmetic cancelAppointmentAndRefund uses, so the automatic and
  // the hand-typed refund cannot disagree about what is left.
  const travelChargedPaise =
    appointment.visit_mode === "home_visit" ? Math.max(0, appointment.travel_fee_paise ?? 0) : 0;
  const paid = (appointment.amount_paid_paise ?? 0) + travelChargedPaise;
  const alreadyRefunded = appointment.refund_amount_paise ?? 0;
  const remaining = paid - alreadyRefunded;

  if (remaining <= 0) {
    return NextResponse.json(
      { error: "This session has already been refunded in full." },
      { status: 409 }
    );
  }
  if (amountPaise > remaining) {
    return NextResponse.json(
      {
        error: `That is more than the ₹${(remaining / 100).toLocaleString("en-IN")} still refundable on this session.`,
      },
      { status: 400 }
    );
  }

  const totalRefunded = alreadyRefunded + amountPaise;

  // Claim the amount BEFORE calling Razorpay, guarded on refund_amount_paise
  // still being what was read above. Without this, two concurrent requests
  // (a double-click, two open tabs, an impatient retry on a slow
  // connection) both read the same alreadyRefunded, both pass the
  // `remaining` check, and both issue a real refund -- Razorpay accepts
  // both, because each is individually within the captured amount, so the
  // patient is refunded twice for one decision. Every other refund path in
  // this codebase already claims first; this one did not.
  //
  // `.is("refund_amount_paise", null)` and `.eq(...)` cannot be expressed as
  // one filter, so the null case (nothing refunded yet) is claimed by its
  // own predicate.
  const claim = admin
    .from("appointments")
    .update({
      // `manual_pending` on the by-hand path, never `processed`: nobody has
      // handed anything over yet, and a refund that says it is done when the
      // patient is still out of pocket is the one thing this column must not
      // claim. `mark-cash-refund-returned` is what moves it on.
      refund_status: byHand ? "manual_pending" : "processed",
      refund_amount_paise: totalRefunded,
      refund_is_manual: true,
      refund_reason: reason,
      refunded_at: new Date().toISOString(),
      // Who signed it off. `paid_at` has always had a payment behind it
      // naming the payer; money going out had nothing naming the person who
      // sent it, outside the audit log.
      refunded_by: context.id,
    })
    .eq("id", appointmentId);
  const { data: claimed, error: claimError } = await (
    appointment.refund_amount_paise === null
      ? claim.is("refund_amount_paise", null)
      : claim.eq("refund_amount_paise", alreadyRefunded)
  )
    .select("id")
    .maybeSingle();

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      {
        error:
          "Another refund on this session landed first - nothing was refunded. Refresh and check what is still refundable.",
      },
      { status: 409 }
    );
  }

  if (byHand) {
    // Nothing to call. The claim above is the whole record, and the audit
    // row is written exactly as it is for a gateway refund -- what differs is
    // who moves the money, not whether the clinic recorded the decision.
    await recordAdminActivity(admin, context.id, {
      action: totalRefunded >= paid ? "refund.issue" : "refund.partial",
      targetId: appointmentId,
      targetLabel: appointment.session_code,
      amountPaise,
      details: { reason, byHand: true, totalRefundedPaise: totalRefunded, paidPaise: paid },
    });
    return NextResponse.json({
      success: true,
      byHand: true,
      refundedPaise: amountPaise,
      totalRefundedPaise: totalRefunded,
    });
  }

  let refundId: string | null = null;
  try {
    const razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
    const refund = await razorpay.payments.refund(appointment.razorpay_payment_id, {
      amount: amountPaise,
    });
    refundId = refund.id;
  } catch (err) {
    console.error("Partial refund failed for appointment", appointmentId, err);
    // Put the claim back exactly as it was, so the session is refundable
    // again on retry -- same posture as refund-package, and for the same
    // reason: a refund's whole point is "did the money actually go back",
    // so a Razorpay failure must leave no trace claiming it did. Guarded on
    // our own claim so a concurrent write that landed in between is not
    // clobbered.
    const { error: revertError } = await admin
      .from("appointments")
      .update({
        refund_status: appointment.refund_status,
        refund_amount_paise: appointment.refund_amount_paise,
        refund_is_manual: alreadyRefunded > 0,
        refund_reason: null,
      })
      .eq("id", appointmentId)
      .eq("refund_amount_paise", totalRefunded);
    if (revertError) {
      console.error(
        "Failed to revert the partial-refund claim after Razorpay refused",
        appointmentId,
        revertError
      );
    }
    return NextResponse.json(
      { error: "Razorpay refused the refund. Nothing was refunded - check Razorpay and retry." },
      { status: 502 }
    );
  }

  // The amount, status and reason were already written by the claim above;
  // this only fills in the refund id Razorpay just returned. Same split as
  // refund-package. refund_amount_paise is the running total, which is what
  // every downstream money calculation already subtracts.
  const { error: writeError } = await admin
    .from("appointments")
    .update({ refund_id: refundId })
    .eq("id", appointmentId);

  if (writeError) {
    // The money is gone but the record failed -- the loudest possible
    // outcome, because the two are now out of step and only a human can
    // reconcile it.
    console.error(
      "Partial refund succeeded at Razorpay but the appointment write failed",
      appointmentId,
      refundId,
      writeError
    );
    return NextResponse.json(
      {
        error:
          "The refund went through at Razorpay but this session could not be updated. Record it manually and tell an engineer.",
      },
      { status: 500 }
    );
  }

  await recordAdminActivity(admin, context.id, {
    action: totalRefunded >= paid ? "refund.issue" : "refund.partial",
    targetId: appointmentId,
    targetLabel: appointment.session_code,
    amountPaise,
    details: { reason, refundId, totalRefundedPaise: totalRefunded, paidPaise: paid },
  });

  return NextResponse.json({
    success: true,
    refundedPaise: amountPaise,
    totalRefundedPaise: totalRefunded,
  });
}
