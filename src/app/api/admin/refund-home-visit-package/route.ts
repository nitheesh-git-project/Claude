import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { mirrorVoid } from "@/lib/sessionCreditMirror";
import { parseJsonBody } from "@/lib/parseJsonBody";
import {
  closeRefundedPurchaseSessions,
  countDeliveredSessions,
  refundCloseoutWarning,
} from "@/lib/packageRefundServer";
import { serverError } from "@/lib/apiError";
import {
  openRefundAttempt,
  succeedRefundAttempt,
  failRefundAttempt,
} from "@/lib/refundAttempt";

const MAX_REASON_LENGTH = 500;

// The home-visit twin of /api/admin/refund-package: pro-rata refunds a
// prepaid programme for every visit never actually delivered, then closes
// it out and cancels any still-scheduled future visits. Claims the purchase
// (status active -> refunded) via CAS *before* calling Razorpay, and
// reverts the claim if the Razorpay call fails -- so a failure still leaves
// the purchase exactly as it was, refundable again on retry, and two
// concurrent requests can never both reach Razorpay's refund endpoint.
//
// Cash-on-visit purchases are out of scope here: there is no single
// Razorpay payment behind the whole programme to reverse (money was
// collected, or not, one visit at a time). Cancel those visit by visit --
// cancelAppointmentAndRefund already flags any cash actually collected as
// refund_status 'manual_pending' on the Cash Ledger.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    purchaseId?: string;
    reason?: string;
  }>(request);
  if (parseError) return parseError;
  const { purchaseId, reason } = body;
  if (!purchaseId) {
    return NextResponse.json({ error: "Missing purchaseId" }, { status: 400 });
  }
  if (reason && reason.length > MAX_REASON_LENGTH) {
    return NextResponse.json(
      { error: `Reason must be ${MAX_REASON_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: purchase } = await admin
    .from("home_visit_package_purchases")
    .select(
      "id, patient_id, visit_count, payment_mode, payment_status, status, razorpay_payment_id, razorpay_order_id"
    )
    .eq("id", purchaseId)
    .single();

  if (!purchase) {
    return NextResponse.json({ error: "Home visit package purchase not found" }, { status: 404 });
  }
  if (purchase.status !== "active") {
    return NextResponse.json(
      {
        error:
          purchase.status === "refunded"
            ? "This package has already been refunded."
            : "Only an active package can be refunded.",
      },
      { status: 400 }
    );
  }
  if (purchase.payment_mode !== "prepaid") {
    return NextResponse.json(
      { error: "Cash-on-visit packages have no single payment to refund - cancel visits individually instead." },
      { status: 400 }
    );
  }
  if (purchase.payment_status !== "paid" || !purchase.razorpay_payment_id || !purchase.razorpay_order_id) {
    return NextResponse.json({ error: "This package was never paid for." }, { status: 400 });
  }

  const razorpay = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });

  let totalPaidPaise: number;
  try {
    // The true amount ever captured for this programme -- package price
    // plus travel, unless the package absorbed it -- rather than
    // reconstructing it from the purchase's own amount_paid_paise (which
    // deliberately excludes travel, see homeVisitPricing.ts) and a
    // travel_fee_included flag that was never snapshotted onto the purchase
    // and could since have changed on the package itself.
    const order = await razorpay.orders.fetch(purchase.razorpay_order_id);
    totalPaidPaise = Number(order.amount);
  } catch (err) {
    console.error("Could not fetch Razorpay order for home visit purchase", purchaseId, err);
    return NextResponse.json(
      { error: "Could not verify the original payment with Razorpay. Please retry." },
      { status: 502 }
    );
  }

  // CAS claim BEFORE counting and BEFORE calling Razorpay. Claiming first is
  // what makes the delivered count final: once the purchase reads
  // `refunded`, complete-session refuses its visits, so none can be
  // delivered between the count and the money moving. Two concurrent
  // refunds cannot both pass, and the loser exits having moved no money.
  const { data: claimed, error: claimError } = await admin
    .from("home_visit_package_purchases")
    .update({ status: "refunded", refunded_at: new Date().toISOString() })
    .eq("id", purchaseId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (claimError) {
    return serverError("admin/refund-home-visit-package", claimError);
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "This package was already refunded or changed concurrently - please refresh." },
      { status: 409 }
    );
  }
  const releaseClaim = () =>
    admin
      .from("home_visit_package_purchases")
      .update({ status: "active", refund_amount_paise: null, refunded_at: null })
      .eq("id", purchaseId)
      .eq("status", "refunded");

  // A count that failed is not zero delivered -- that would refund visits
  // already made.
  const completedCount = await countDeliveredSessions(admin, "home_visit_purchase_id", purchaseId);
  if (completedCount === null) {
    await releaseClaim();
    return NextResponse.json(
      { error: "We couldn't count the visits already delivered, so nothing was refunded. Please retry." },
      { status: 503 }
    );
  }
  const refundableCount = purchase.visit_count - completedCount;
  if (refundableCount <= 0) {
    await releaseClaim();
    return NextResponse.json(
      { error: "Every visit on this package has already been completed - nothing to refund." },
      { status: 400 }
    );
  }

  const perVisitPaise = Math.round(totalPaidPaise / purchase.visit_count);
  const refundAmountPaise = Math.min(perVisitPaise * refundableCount, totalPaidPaise);
  if (refundAmountPaise <= 0) {
    await releaseClaim();
    return NextResponse.json({ error: "Nothing to refund on this package." }, { status: 400 });
  }
  const { error: amountError } = await admin
    .from("home_visit_package_purchases")
    .update({ refund_amount_paise: refundAmountPaise })
    .eq("id", purchaseId)
    .eq("status", "refunded");
  if (amountError) {
    await releaseClaim();
    return serverError("admin/refund-home-visit-package", amountError);
  }

  // Recorded before the gateway call, so a refund that went through and
  // could not be written back leaves a row a person can find rather than a
  // console line -- see src/lib/refundAttempt.ts. Unrecordable means not
  // attempted, so the claim goes back and the caller is refused.
  const attemptId = await openRefundAttempt(admin, {
    purpose: "home_visit_purchase",
    subjectId: purchaseId,
    razorpayPaymentId: purchase.razorpay_payment_id,
    amountPaise: refundAmountPaise,
    reason,
    requestedBy: adminUser.id,
  });
  if (!attemptId) {
    await releaseClaim();
    return NextResponse.json(
      {
        error:
          "We could not record this refund, so nothing was sent. Nothing has changed - please retry.",
      },
      { status: 503 }
    );
  }

  let refundId: string;
  try {
    const refund = await razorpay.payments.refund(purchase.razorpay_payment_id, {
      amount: refundAmountPaise,
    });
    refundId = refund.id;
    await succeedRefundAttempt(admin, attemptId, refund.id);
  } catch (err) {
    console.error("Home visit package refund failed for purchase", purchaseId, err);
    await failRefundAttempt(admin, attemptId, err);
    const { error: revertError } = await releaseClaim();
    if (revertError) {
      console.error(
        "Failed to revert home visit purchase claim after Razorpay refund failure",
        purchaseId,
        revertError
      );
    }
    return NextResponse.json(
      { error: "The refund could not be processed by Razorpay. Nothing was changed - please retry." },
      { status: 502 }
    );
  }

  // Refund succeeded - close out the purchase's live visits, checking every
  // write (see closeRefundedPurchaseSessions).
  const closeout = await closeRefundedPurchaseSessions(admin, {
    column: "home_visit_purchase_id",
    purchaseId,
    adminId: adminUser.id,
  });
  const closeoutWarning = refundCloseoutWarning(closeout);
  if (closeoutWarning) {
    console.error("refund-home-visit-package: visits not all closed", purchaseId, closeout);
  }

  // status/refund_amount_paise/refunded_at were already written by the CAS
  // claim above -- this only fills in the refund_id Razorpay just returned.
  const { error: updateError } = await admin
    .from("home_visit_package_purchases")
    .update({ refund_id: refundId })
    .eq("id", purchaseId);

  if (updateError) {
    console.error(
      "Refunded via Razorpay but failed to record refund_id on home visit purchase",
      purchaseId,
      updateError
    );
    return NextResponse.json(
      {
        error:
          "The refund was processed, but we couldn't update our records. Please contact engineering with this purchase ID.",
      },
      { status: 500 }
    );
  }

  const { error: eventError } = await admin.from("home_visit_purchase_events").insert({
    purchase_id: purchaseId,
    event_type: "refunded",
    actor_id: adminUser.id,
    detail: {
      refundId,
      refundAmountPaise,
      refundableCount,
      reason: reason?.trim() || null,
      cancelledAppointmentIds: closeout.cancelledIds,
      appointmentsNotCancelled: closeout.failedIds,
    },
  });
  if (eventError) {
    console.error("Failed to log refunded event for home visit purchase", purchaseId, eventError);
  }

  // Void whatever is still unspent. This is the first place the ledger
  // says more than the counters can: a refund never touched
  // sessions_used/visits_used at all -- it cancels the remaining
  // appointments in place and leaves the counter inflated -- so there is no
  // counter write here to mirror, only a fact the counters could not record.
  // Consumed credits are untouched: a delivered session stays delivered.
  await mirrorVoid(admin, {
    homeVisitPurchaseId: purchaseId,
    kind: "refund",
    actorId: adminUser.id,
    reason: reason?.trim() || "Refunded by admin",
  });

  await recordAdminActivity(admin, adminUser.id, {
    action: "refund.issue",
    targetId: purchaseId, amountPaise: refundAmountPaise,
  });

  return NextResponse.json({
    success: true,
    refundAmountPaise,
    ...(closeoutWarning ? { warning: closeoutWarning } : {}),
  });
}
