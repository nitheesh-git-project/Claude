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

// Pro-rata refunds a package purchase for every session that was never
// actually delivered (session_count - completed sessions), then closes
// out the purchase: any still-scheduled future sessions on it are
// cancelled (their Meet events removed) so nothing is left confirmed on a
// programme the patient is no longer paying for. Claims the purchase
// (status active -> refunded) via CAS *before* calling Razorpay, and
// reverts the claim if the Razorpay call fails -- unlike
// cancelAppointmentAndRefund (which commits the cancellation regardless of
// refund outcome, since a single session's cancellation is a real event
// independent of the refund), a package refund's whole point is "did we
// actually give the money back", so a Razorpay failure here must leave the
// purchase exactly as it was, refundable again on retry. The CAS claim also
// closes a real race: two concurrent refund requests (double-click, two
// open tabs) could otherwise both pass the status==="active" read-check
// below and both issue a real Razorpay refund before either write landed.
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
    .from("patient_package_purchases")
    .select(
      "id, patient_id, session_count, amount_paid_paise, payment_status, status, razorpay_payment_id"
    )
    .eq("id", purchaseId)
    .single();

  if (!purchase) {
    return NextResponse.json({ error: "Package purchase not found" }, { status: 404 });
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
  if (purchase.payment_status !== "paid" || !purchase.razorpay_payment_id) {
    return NextResponse.json({ error: "This package was never paid for." }, { status: 400 });
  }

  // CAS claim BEFORE counting and BEFORE calling Razorpay. Claiming first is
  // what makes the delivered count final: once the purchase reads
  // `refunded`, complete-session refuses its sessions, so no session can be
  // delivered between the count below and the money moving. Only the
  // request that wins this claim goes anywhere near the gateway.
  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await admin
    .from("patient_package_purchases")
    .update({ status: "refunded", refunded_at: claimedAt })
    .eq("id", purchaseId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (claimError) {
    return serverError("admin/refund-package", claimError);
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "This package was already refunded or changed concurrently - please refresh." },
      { status: 409 }
    );
  }
  const releaseClaim = () =>
    admin
      .from("patient_package_purchases")
      .update({ status: "active", refund_amount_paise: null, refunded_at: null })
      .eq("id", purchaseId)
      .eq("status", "refunded");

  // A count that failed is not zero delivered -- that would refund treatment
  // already given.
  const completedCount = await countDeliveredSessions(admin, "package_purchase_id", purchaseId);
  if (completedCount === null) {
    await releaseClaim();
    return NextResponse.json(
      { error: "We couldn't count the sessions already delivered, so nothing was refunded. Please retry." },
      { status: 503 }
    );
  }

  const refundableCount = purchase.session_count - completedCount;
  if (refundableCount <= 0) {
    await releaseClaim();
    return NextResponse.json(
      { error: "Every session on this package has already been completed - nothing to refund." },
      { status: 400 }
    );
  }

  const perSessionAmountPaise = purchase.amount_paid_paise
    ? Math.round(purchase.amount_paid_paise / purchase.session_count)
    : 0;
  const refundAmountPaise = Math.min(
    perSessionAmountPaise * refundableCount,
    purchase.amount_paid_paise ?? 0
  );
  if (refundAmountPaise <= 0) {
    await releaseClaim();
    return NextResponse.json({ error: "Nothing to refund on this package." }, { status: 400 });
  }
  const { error: amountError } = await admin
    .from("patient_package_purchases")
    .update({ refund_amount_paise: refundAmountPaise })
    .eq("id", purchaseId)
    .eq("status", "refunded");
  if (amountError) {
    await releaseClaim();
    return serverError("admin/refund-package", amountError);
  }

  // Recorded before the gateway call, so a refund that went through and
  // could not be written back leaves a row a person can find rather than a
  // console line -- see src/lib/refundAttempt.ts. Unrecordable means not
  // attempted, so the claim goes back and the caller is refused.
  const attemptId = await openRefundAttempt(admin, {
    purpose: "package_purchase",
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
    const razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });
    const refund = await razorpay.payments.refund(purchase.razorpay_payment_id, {
      amount: refundAmountPaise,
    });
    refundId = refund.id;
    await succeedRefundAttempt(admin, attemptId, refund.id);
  } catch (err) {
    console.error("Package refund failed for purchase", purchaseId, err);
    await failRefundAttempt(admin, attemptId, err);
    const { error: revertError } = await releaseClaim();
    if (revertError) {
      console.error("Failed to revert package purchase claim after Razorpay refund failure", purchaseId, revertError);
    }
    return NextResponse.json(
      { error: "The refund could not be processed by Razorpay. Nothing was changed - please retry." },
      { status: 502 }
    );
  }

  // Refund succeeded - now close out the purchase's live sessions, checking
  // every write (see closeRefundedPurchaseSessions).
  const closeout = await closeRefundedPurchaseSessions(admin, {
    column: "package_purchase_id",
    purchaseId,
    adminId: adminUser.id,
  });
  const closeoutWarning = refundCloseoutWarning(closeout);
  if (closeoutWarning) {
    console.error("refund-package: sessions not all closed", purchaseId, closeout);
  }

  // status/refund_amount_paise/refunded_at were already written by the CAS
  // claim above -- this only fills in the refund_id Razorpay just returned.
  const { error: updateError } = await admin
    .from("patient_package_purchases")
    .update({ refund_id: refundId })
    .eq("id", purchaseId);

  if (updateError) {
    // The Razorpay refund already happened and can't be undone here - log
    // loudly for manual reconciliation rather than pretending this failed
    // outright.
    console.error(
      "Refunded via Razorpay but failed to record refund_id on purchase",
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

  const { error: eventError } = await admin.from("package_purchase_events").insert({
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
    console.error("Failed to log refunded event for purchase", purchaseId, eventError);
  }

  // Void whatever is still unspent. This is the first place the ledger
  // says more than the counters can: a refund never touched
  // sessions_used/visits_used at all -- it cancels the remaining
  // appointments in place and leaves the counter inflated -- so there is no
  // counter write here to mirror, only a fact the counters could not record.
  // Consumed credits are untouched: a delivered session stays delivered.
  await mirrorVoid(admin, {
    packagePurchaseId: purchaseId,
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
