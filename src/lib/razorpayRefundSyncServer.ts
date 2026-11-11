import type { createAdminClient } from "@/lib/supabase/admin";
import {
  decideRefund,
  nextRefundStatus,
  type ParsedRefundEvent,
  type RefundStatus,
  type RefundSubject,
} from "@/lib/razorpayRefundSync";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * The database half of a Razorpay refund event (rules: razorpayRefundSync.ts).
 *
 * Mirrors the refund, works out who started it and what it was against,
 * then records it on a single session's booking when that is the rule, and
 * notes on the mirror what was done. Throws on a read or write that failed,
 * so the webhook marks the event retryable rather than half-applied.
 */
export async function applyRazorpayRefundEvent(admin: Admin, ev: ParsedRefundEvent) {
  const [existingRead, attemptRead, byRefundIdRead, apptRead, pkgRead, hvRead, ledgerRead] = await Promise.all([
    admin.from("razorpay_refunds").select("status, source").eq("razorpay_refund_id", ev.refundId).maybeSingle(),
    admin
      .from("refund_attempts")
      .select("appointment_id, package_purchase_id, home_visit_purchase_id")
      .eq("razorpay_refund_id", ev.refundId)
      .limit(1)
      .maybeSingle(),
    admin.from("appointments").select("id").eq("refund_id", ev.refundId).limit(1).maybeSingle(),
    admin
      .from("appointments")
      .select("id, patient_id, amount_paid_paise, refund_status, refund_id, refund_amount_paise")
      .eq("razorpay_payment_id", ev.paymentId)
      .limit(2),
    admin.from("patient_package_purchases").select("id, patient_id").eq("razorpay_payment_id", ev.paymentId).limit(1).maybeSingle(),
    admin.from("home_visit_package_purchases").select("id, patient_id").eq("razorpay_payment_id", ev.paymentId).limit(1).maybeSingle(),
    admin
      .from("payments")
      .select("patient_id, target_appointment_id, target_package_purchase_id, target_home_visit_purchase_id")
      .eq("razorpay_payment_id", ev.paymentId)
      .limit(1)
      .maybeSingle(),
  ]);
  for (const r of [existingRead, attemptRead, byRefundIdRead, apptRead, pkgRead, hvRead, ledgerRead]) {
    if (r.error) throw new Error(`refund sync read failed: ${r.error.message}`);
  }

  // Who started it is decided once, on the first event, and kept: recording
  // a website refund on the session writes its id there, and a later event
  // reading that id back must not take it for one the app started.
  const storedSource = existingRead.data?.source as "app" | "razorpay" | undefined;
  const source: "app" | "razorpay" = storedSource ?? (attemptRead.data || byRefundIdRead.data ? "app" : "razorpay");

  // What it was against: the app's own record first, then the payment.
  let subject: RefundSubject = { kind: "none" };
  const ledger = ledgerRead.data;
  const appts = apptRead.data ?? [];
  const sessionId =
    attemptRead.data?.appointment_id ?? byRefundIdRead.data?.id ?? ledger?.target_appointment_id ?? (appts.length === 1 ? appts[0].id : null);
  if (sessionId) {
    const row =
      appts.find((a) => a.id === sessionId) ??
      (
        await admin
          .from("appointments")
          .select("id, patient_id, amount_paid_paise, refund_status, refund_id, refund_amount_paise")
          .eq("id", sessionId)
          .maybeSingle()
      ).data;
    if (row) {
      subject = {
        kind: "appointment",
        id: row.id,
        patientId: row.patient_id,
        amountPaidPaise: row.amount_paid_paise,
        refundStatus: row.refund_status,
        refundId: row.refund_id,
        refundAmountPaise: row.refund_amount_paise,
      };
    }
  }
  if (subject.kind === "none") {
    const pkgId = attemptRead.data?.package_purchase_id ?? ledger?.target_package_purchase_id ?? pkgRead.data?.id ?? null;
    const hvId = attemptRead.data?.home_visit_purchase_id ?? ledger?.target_home_visit_purchase_id ?? hvRead.data?.id ?? null;
    if (pkgId) subject = { kind: "package_purchase", id: pkgId, patientId: pkgRead.data?.patient_id ?? ledger?.patient_id ?? null };
    else if (hvId) subject = { kind: "home_visit_purchase", id: hvId, patientId: hvRead.data?.patient_id ?? ledger?.patient_id ?? null };
  }

  const status = nextRefundStatus((existingRead.data?.status as RefundStatus | undefined) ?? null, ev.status);
  const now = new Date().toISOString();
  const { error: upsertError } = await admin.from("razorpay_refunds").upsert(
    {
      razorpay_refund_id: ev.refundId,
      razorpay_payment_id: ev.paymentId,
      amount_paise: ev.amountPaise,
      status,
      source,
      appointment_id: subject.kind === "appointment" ? subject.id : null,
      package_purchase_id: subject.kind === "package_purchase" ? subject.id : null,
      home_visit_purchase_id: subject.kind === "home_visit_purchase" ? subject.id : null,
      patient_id: subject.kind === "none" ? ledger?.patient_id ?? null : subject.patientId,
      gateway_created_at: ev.createdAt,
      speed: ev.speed,
      ...(status === "processed" ? { processed_at: now } : {}),
      ...(status === "failed" ? { failed_at: now } : {}),
      updated_at: now,
    },
    { onConflict: "razorpay_refund_id" }
  );
  if (upsertError) throw new Error(`refund mirror write failed: ${upsertError.message}`);

  // Every processed refund against this payment, this one included.
  const { data: processedRows, error: sumError } = await admin
    .from("razorpay_refunds")
    .select("amount_paise")
    .eq("razorpay_payment_id", ev.paymentId)
    .eq("status", "processed");
  if (sumError) throw new Error(`refund total read failed: ${sumError.message}`);
  const processedTotalPaise = (processedRows ?? []).reduce((n, r) => n + (r.amount_paise ?? 0), 0);

  const decision = decideRefund({ source, status, refundId: ev.refundId, subject, processedTotalPaise });
  let applied: "pending" | "applied" | "already" | "needs_review" | "not_needed" = "pending";
  let note: string | null = null;

  if (decision.action === "record_on_session" && subject.kind === "appointment") {
    const { error } = await admin
      .from("appointments")
      .update({
        refund_status: "processed",
        refund_amount_paise: decision.refundAmountPaise,
        refund_is_manual: true,
        refund_reason: decision.reason,
        refunded_at: now,
        refund_id: subject.refundId ?? ev.refundId,
      })
      .eq("id", subject.id);
    if (error) throw new Error(`recording the refund on the session failed: ${error.message}`);
    applied = "applied";
    note = "Recorded on the session as refunded.";
  } else if (decision.action === "mark_session_failed" && subject.kind === "appointment") {
    const { error } = await admin
      .from("appointments")
      .update({ refund_status: "failed", refund_reason: decision.reason })
      .eq("id", subject.id)
      .eq("refund_status", "processed");
    if (error) throw new Error(`marking the refund failed on the session failed: ${error.message}`);
    applied = "applied";
    note = decision.reason;
  } else if (decision.action === "review") {
    applied = "needs_review";
    note = decision.note;
  } else if (decision.action === "nothing") {
    applied = decision.applied;
  }

  const { error: noteError } = await admin
    .from("razorpay_refunds")
    .update({ applied, applied_note: note })
    .eq("razorpay_refund_id", ev.refundId);
  if (noteError) throw new Error(`refund mirror note failed: ${noteError.message}`);

  return { source, status, subject: subject.kind, applied };
}
