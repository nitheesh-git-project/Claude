import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { deleteMeetEventForAppointment } from "@/lib/googleCalendarSync";

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
      { error: "Cash-on-visit packages have no single payment to refund — cancel visits individually instead." },
      { status: 400 }
    );
  }
  if (purchase.payment_status !== "paid" || !purchase.razorpay_payment_id || !purchase.razorpay_order_id) {
    return NextResponse.json({ error: "This package was never paid for." }, { status: 400 });
  }

  const { count: completedCount } = await admin
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("home_visit_purchase_id", purchaseId)
    .eq("status", "completed");

  const refundableCount = purchase.visit_count - (completedCount ?? 0);
  if (refundableCount <= 0) {
    return NextResponse.json(
      { error: "Every visit on this package has already been completed — nothing to refund." },
      { status: 400 }
    );
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

  const perVisitPaise = Math.round(totalPaidPaise / purchase.visit_count);
  const refundAmountPaise = Math.min(perVisitPaise * refundableCount, totalPaidPaise);
  if (refundAmountPaise <= 0) {
    return NextResponse.json({ error: "Nothing to refund on this package." }, { status: 400 });
  }

  // CAS claim BEFORE calling Razorpay, not after -- two concurrent refund
  // requests (double-click, two open tabs) would otherwise both pass the
  // status === "active" read-check above and both issue a real Razorpay
  // refund before either write landed. Only the request that wins this
  // claim is allowed anywhere near razorpay.payments.refund; the loser
  // exits here having moved no money. Tentatively marks the purchase
  // refunded (refund_id filled in once Razorpay actually confirms it) and
  // reverted back to "active" below if the Razorpay call fails, so a
  // failure still leaves the purchase refundable again on retry.
  const { data: claimed, error: claimError } = await admin
    .from("home_visit_package_purchases")
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
    const refund = await razorpay.payments.refund(purchase.razorpay_payment_id, {
      amount: refundAmountPaise,
    });
    refundId = refund.id;
  } catch (err) {
    console.error("Home visit package refund failed for purchase", purchaseId, err);
    const { error: revertError } = await admin
      .from("home_visit_package_purchases")
      .update({ status: "active", refund_amount_paise: null, refunded_at: null })
      .eq("id", purchaseId)
      .eq("status", "refunded");
    if (revertError) {
      console.error(
        "Failed to revert home visit purchase claim after Razorpay refund failure",
        purchaseId,
        revertError
      );
    }
    return NextResponse.json(
      { error: "The refund could not be processed by Razorpay. Nothing was changed — please retry." },
      { status: 502 }
    );
  }

  const { data: futureAppointments } = await admin
    .from("appointments")
    .select("id, google_event_id")
    .eq("home_visit_purchase_id", purchaseId)
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
        cancellation_reason: "Home visit package refunded by admin",
      })
      .eq("id", appointment.id)
      .in("status", ["requested", "confirmed"]);
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
      cancelledAppointmentIds: (futureAppointments ?? []).map((a) => a.id),
    },
  });
  if (eventError) {
    console.error("Failed to log refunded event for home visit purchase", purchaseId, eventError);
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "refund.issue",
    targetId: purchaseId, amountPaise: refundAmountPaise,
  });

  return NextResponse.json({ success: true, refundAmountPaise });
}
