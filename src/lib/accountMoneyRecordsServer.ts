import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { MONEY_KIND_LABEL, summariseMoneyRecords, type MoneyRecord, type MoneyRecordKind, type MoneySummary } from "@/lib/accountDeletionRecords";

type Admin = ReturnType<typeof createAdminClient>;

// Every money row that names this person, for the delete confirmation: what
// they paid, what was refunded, what they were paid out, what they earned.
// The rows are read, never changed -- deleting the person keeps all of them.
//
// Each read is capped (a list of 100 payments is already enough to say
// "this account has money behind it"), and a read that fails is reported as
// such rather than as "no money": `ok: false` makes the confirmation say it
// could not check, which is the rule for a check that could not be run.

const CAP = 100;

export async function readAccountMoneyRecords(
  admin: Admin,
  userId: string
): Promise<{ ok: true; summary: MoneySummary } | { ok: false }> {
  const rec = (kind: MoneyRecordKind, amountPaise: unknown, status: unknown, at: unknown, reference: unknown): MoneyRecord => ({
    kind,
    label: MONEY_KIND_LABEL[kind],
    amountPaise: Number(amountPaise) || 0,
    status: typeof status === "string" ? status : null,
    at: typeof at === "string" ? at : null,
    reference: typeof reference === "string" && reference ? reference : null,
  });

  const [payments, payLater, programmes, homeVisits, refunds, payouts, requests, settlements] = await Promise.all([
    admin
      .from("payments")
      .select("amount_paise, captured_amount_paise, status, razorpay_payment_id, razorpay_order_id, created_at")
      .eq("patient_id", userId)
      .order("created_at", { ascending: false })
      .limit(CAP),
    admin
      .from("pay_later_payments")
      .select("amount_paise, status, reference, razorpay_payment_id, created_at")
      .eq("patient_id", userId)
      .order("created_at", { ascending: false })
      .limit(CAP),
    admin
      .from("patient_package_purchases")
      .select("amount_paid_paise, payment_status, purchase_code, created_at")
      .eq("patient_id", userId)
      .order("created_at", { ascending: false })
      .limit(CAP),
    admin
      .from("home_visit_package_purchases")
      .select("amount_paid_paise, payment_status, purchase_code, created_at")
      .eq("patient_id", userId)
      .order("created_at", { ascending: false })
      .limit(CAP),
    admin
      .from("razorpay_refunds")
      .select("amount_paise, status, razorpay_refund_id, first_seen_at")
      .eq("patient_id", userId)
      .order("first_seen_at", { ascending: false })
      .limit(CAP),
    admin
      .from("therapist_payout_batches")
      .select("amount_paise, method, created_at")
      .eq("therapist_id", userId)
      .order("created_at", { ascending: false })
      .limit(CAP),
    admin
      .from("therapist_payout_requests")
      .select("requested_amount_paise, status, requested_at")
      .eq("therapist_id", userId)
      .order("requested_at", { ascending: false })
      .limit(CAP),
    admin
      .from("session_settlements")
      .select("therapist_id, hospital_id, therapist_share_paise, partner_share_paise, external_reference, recognised_at")
      .or(`therapist_id.eq.${userId},hospital_id.eq.${userId}`)
      .order("recognised_at", { ascending: false })
      .limit(CAP),
  ]);

  // razorpay_refunds is new; a database without it has no refunds to show.
  const missing = (e: { code?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205");
  const reads = [payments, payLater, programmes, homeVisits, payouts, requests, settlements];
  if (reads.some((r) => r.error) || (refunds.error && !missing(refunds.error))) return { ok: false };

  const records: MoneyRecord[] = [];
  for (const p of payments.data ?? []) {
    records.push(rec("payment", p.captured_amount_paise ?? p.amount_paise, p.status, p.created_at, p.razorpay_payment_id ?? p.razorpay_order_id));
  }
  for (const p of payLater.data ?? []) {
    records.push(rec("pay_later", p.amount_paise, p.status, p.created_at, p.razorpay_payment_id ?? p.reference));
  }
  for (const p of programmes.data ?? []) {
    records.push(rec("programme", p.amount_paid_paise, p.payment_status, p.created_at, p.purchase_code));
  }
  for (const p of homeVisits.data ?? []) {
    records.push(rec("home_visit_package", p.amount_paid_paise, p.payment_status, p.created_at, p.purchase_code));
  }
  for (const p of refunds.data ?? []) {
    records.push(rec("refund", p.amount_paise, p.status, p.first_seen_at, p.razorpay_refund_id));
  }
  for (const p of payouts.data ?? []) {
    records.push(rec("payout", p.amount_paise, p.method, p.created_at, null));
  }
  for (const p of requests.data ?? []) {
    records.push(rec("payout_request", p.requested_amount_paise, p.status, p.requested_at, null));
  }
  for (const p of settlements.data ?? []) {
    const amount = p.therapist_id === userId ? p.therapist_share_paise : p.partner_share_paise;
    records.push(rec("settlement", amount, null, p.recognised_at, p.external_reference));
  }

  return { ok: true, summary: summariseMoneyRecords(records) };
}
