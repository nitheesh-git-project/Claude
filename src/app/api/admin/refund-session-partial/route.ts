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
      "id, session_code, payment_status, amount_paid_paise, razorpay_payment_id, refund_amount_paise, refund_status"
    )
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (appointment.payment_status !== "paid" || !appointment.razorpay_payment_id) {
    return NextResponse.json(
      {
        error:
          "There is no Razorpay payment on this session to refund. Cash and offline payments are handed back in person.",
      },
      { status: 409 }
    );
  }

  const paid = appointment.amount_paid_paise ?? 0;
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
    return NextResponse.json(
      { error: "Razorpay refused the refund. Nothing was refunded — check Razorpay and retry." },
      { status: 502 }
    );
  }

  const totalRefunded = alreadyRefunded + amountPaise;

  // Written only after Razorpay confirms, so a failure above can never leave
  // the app claiming money went back when it didn't. refund_status becomes
  // 'processed' either way -- partial or full -- and refund_amount_paise is
  // the running total, which is what every downstream money calculation
  // already subtracts.
  const { error: writeError } = await admin
    .from("appointments")
    .update({
      refund_id: refundId,
      refund_status: "processed",
      refund_amount_paise: totalRefunded,
      refund_is_manual: true,
      refund_reason: reason,
    })
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
