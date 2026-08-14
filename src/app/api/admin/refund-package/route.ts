import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { deleteMeetEventForAppointment } from "@/lib/googleCalendarSync";

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
  const adminUser = await getAdminUser();
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

  const { count: completedCount } = await admin
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("package_purchase_id", purchaseId)
    .eq("status", "completed");

  const refundableCount = purchase.session_count - (completedCount ?? 0);
  if (refundableCount <= 0) {
    return NextResponse.json(
      { error: "Every session on this package has already been completed — nothing to refund." },
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
    return NextResponse.json({ error: "Nothing to refund on this package." }, { status: 400 });
  }

  // CAS claim BEFORE calling Razorpay -- see the file header comment. Only
  // the request that wins this claim is allowed anywhere near
  // razorpay.payments.refund; the loser exits here having moved no money.
  const { data: claimed, error: claimError } = await admin
    .from("patient_package_purchases")
    .update({ status: "refunded", refund_amount_paise: refundAmountPaise, refunded_at: new Date().toISOString() })
    .eq("id", purchaseId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  if (!claimed) {
    return NextResponse.json(
      { error: "This package was already refunded or changed concurrently — please refresh." },
      { status: 409 }
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
  } catch (err) {
    console.error("Package refund failed for purchase", purchaseId, err);
    const { error: revertError } = await admin
      .from("patient_package_purchases")
      .update({ status: "active", refund_amount_paise: null, refunded_at: null })
      .eq("id", purchaseId)
      .eq("status", "refunded");
    if (revertError) {
      console.error("Failed to revert package purchase claim after Razorpay refund failure", purchaseId, revertError);
    }
    return NextResponse.json(
      { error: "The refund could not be processed by Razorpay. Nothing was changed — please retry." },
      { status: 502 }
    );
  }

  // Refund succeeded — now close out the purchase and free any sessions
  // it still had scheduled.
  const { data: futureAppointments } = await admin
    .from("appointments")
    .select("id, google_event_id")
    .eq("package_purchase_id", purchaseId)
    .in("status", ["requested", "confirmed"]);

  for (const appointment of futureAppointments ?? []) {
    await deleteMeetEventForAppointment(admin, {
      appointmentId: appointment.id,
      googleEventId: appointment.google_event_id,
    });
    await admin
      .from("appointments")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: adminUser.id,
        cancellation_reason: "Package refunded by admin",
      })
      .eq("id", appointment.id)
      .in("status", ["requested", "confirmed"]);
  }

  // status/refund_amount_paise/refunded_at were already written by the CAS
  // claim above -- this only fills in the refund_id Razorpay just returned.
  const { error: updateError } = await admin
    .from("patient_package_purchases")
    .update({ refund_id: refundId })
    .eq("id", purchaseId);

  if (updateError) {
    // The Razorpay refund already happened and can't be undone here — log
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
      cancelledAppointmentIds: (futureAppointments ?? []).map((a) => a.id),
    },
  });
  if (eventError) {
    console.error("Failed to log refunded event for purchase", purchaseId, eventError);
  }

  return NextResponse.json({ success: true, refundAmountPaise });
}
