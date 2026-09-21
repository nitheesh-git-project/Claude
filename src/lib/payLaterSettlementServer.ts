import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import {
  computePatientBalance,
  isOpenPayLaterSession,
  type PayLaterAppointment,
  type PayLaterPaymentRow,
} from "@/lib/patientBalances";
import type { ReceiptSettlement } from "@/lib/receipts";
import { type SettlementRow } from "@/lib/payLaterSettlement";

type AdminClient = ReturnType<typeof createAdminClient>;

// The fetches and the one RPC behind settling what a trusted patient owes.
//
// The judgements live next door in `payLaterSettlement.ts`, dependency-free,
// and the allocation itself lives in `allocate_pay_later_payment()` in
// `schema.sql` -- this module is the wiring between them and nothing more.

/**
 * What this patient owes right now, worked out server-side.
 *
 * Re-derived here rather than trusted from the request for the same reason
 * `confirm-pay-later` re-derives eligibility: the browser sends an amount, and
 * an amount that can be posted is an amount that can be posted wrong. Reads
 * the same `computePatientBalance` the admin's own screen reads, so the figure
 * the patient is shown and the figure the clinic chases cannot differ.
 *
 * Both reads are **isolated and migration-tolerant**: `payment_terms`,
 * `amount_due_paise` and `pay_later_outcome` are recent columns and
 * `pay_later_payments` is newer still, so on a database missing either the
 * answer is zero owed -- which is exactly right, since a database with no such
 * column has no such debt.
 */
export async function readPatientOwed(
  admin: AdminClient,
  patientId: string
): Promise<{ owedPaise: number; owedCount: number; unallocatedPaise: number } | null> {
  try {
    const [sessions, payments] = await Promise.all([
      admin
        .from("appointments")
        .select(
          "id, patient_id, status, slot_time, payment_status, payment_terms, amount_due_paise, pay_later_outcome"
        )
        .eq("patient_id", patientId)
        .eq("status", "completed"),
      admin
        .from("pay_later_payments")
        .select("id, patient_id, status, unallocated_paise")
        .eq("patient_id", patientId)
        .eq("status", "confirmed"),
    ]);
    if (sessions.error) return null;
    const balance = computePatientBalance(
      patientId,
      (sessions.data ?? []) as PayLaterAppointment[],
      (payments.data ?? []) as PayLaterPaymentRow[]
    );
    return {
      owedPaise: balance.owedPaise,
      owedCount: balance.owedCount,
      unallocatedPaise: balance.unallocatedPaise,
    };
  } catch {
    return null;
  }
}

/** Whether one of this patient's payments is already waiting to be checked. */
export async function hasPendingSettlement(
  admin: AdminClient,
  patientId: string
): Promise<boolean | null> {
  try {
    const { count, error } = await admin
      .from("pay_later_payments")
      .select("id", { count: "exact", head: true })
      .eq("patient_id", patientId)
      .eq("status", "pending");
    if (error) return null;
    return (count ?? 0) > 0;
  } catch {
    return null;
  }
}

/**
 * Close whichever delivered sessions this patient's pool now covers.
 *
 * The authority is the database function, which takes a real row lock on the
 * patient before it reads anything -- two admins confirming two payments at
 * once is exactly what races here, and supabase-js cannot express the
 * transaction that settles it.
 *
 * Called at **two** moments: a payment being confirmed, and a session being
 * completed. That is what picks up a remainder left by an earlier payment
 * without anything having to remember it, and it is why the function reads the
 * whole pool rather than one payment -- called twice, the second call finds
 * nothing left to cover and changes nothing.
 *
 * It never throws. Completing a session must not fail because allocation did:
 * the debt, the revenue and the therapist's pay all appear at completion and
 * matter more than which payment is recorded against the session, and the next
 * call picks up whatever this one missed.
 */
export async function allocatePayLaterPayments(
  admin: AdminClient,
  patientId: string
): Promise<{ settledCount: number; settledPaise: number } | null> {
  try {
    const { data, error } = await admin.rpc("allocate_pay_later_payment", {
      p_patient_id: patientId,
    });
    if (error) {
      console.error("Pay-later allocation failed", patientId, error);
      return null;
    }
    const row = data as { settled_count?: number; settled_paise?: number } | null;
    return {
      settledCount: row?.settled_count ?? 0,
      settledPaise: row?.settled_paise ?? 0,
    };
  } catch (e) {
    console.error("Pay-later allocation threw", patientId, e);
    return null;
  }
}

/**
 * Every payment waiting for somebody to check it.
 *
 * Its own isolated read, so a database without the table costs this panel and
 * nothing else on the screen it sits on.
 */
export async function readPendingSettlementRows(
  admin: AdminClient,
  limit = 200
): Promise<SettlementRow[] | null> {
  try {
    const { data, error } = await admin
      .from("pay_later_payments")
      .select("id, patient_id, amount_paise, method, status, note, reference, declared_at, unallocated_paise")
      .eq("status", "pending")
      .order("declared_at", { ascending: true })
      .limit(limit);
    if (error) return null;
    return (data ?? []) as SettlementRow[];
  } catch {
    return null;
  }
}

/**
 * The reconciliation figures behind the System Health check.
 *
 * `sum(confirmed) = sum(settled session amounts) + unallocated`. Returns null
 * rather than zeroes when it cannot be asked, so "nothing is wrong" and "we
 * could not check" stay distinguishable -- the check reads the second as
 * *Not set up* rather than as healthy.
 */
export async function readSettlementReconciliation(
  admin: AdminClient
): Promise<{ confirmedPaise: number; settledPaise: number; unallocatedPaise: number } | null> {
  try {
    const [payments, settled] = await Promise.all([
      admin.from("pay_later_payments").select("amount_paise, unallocated_paise").eq("status", "confirmed"),
      admin
        .from("appointments")
        .select("amount_paid_paise")
        .not("pay_later_payment_id", "is", null),
    ]);
    if (payments.error || settled.error) return null;
    let confirmedPaise = 0;
    let unallocatedPaise = 0;
    for (const p of payments.data ?? []) {
      confirmedPaise += Math.max(0, p.amount_paise ?? 0);
      unallocatedPaise += Math.max(0, p.unallocated_paise ?? 0);
    }
    let settledPaise = 0;
    for (const a of settled.data ?? []) settledPaise += Math.max(0, a.amount_paid_paise ?? 0);
    return { confirmedPaise, settledPaise, unallocatedPaise };
  } catch {
    return null;
  }
}

/**
 * Everything the patient's own screens need about what they owe.
 *
 * One call, its own reads, and it **never throws**: absent, the widget is
 * simply not there. The two states it keeps distinct are the whole point --
 * a payment the clinic is checking and a payment the clinic turned down read
 * identically as "still owed" unless the screen says which.
 */
export async function loadPatientPayLater(
  admin: AdminClient,
  patientId: string
): Promise<{
  owedPaise: number;
  owedCount: number;
  unallocatedPaise: number;
  sessions: PayLaterOwedSession[];
  pendingDeclaration: { id: string; amount_paise: number; method: string; declared_at: string | null } | null;
  lastRejection: { amount_paise: number; rejection_reason: string | null; confirmed_at: string | null } | null;
  settlements: ReceiptSettlement[];
} | null> {
  try {
    const [sessionsRes, paymentsRes] = await Promise.all([
      admin
        .from("appointments")
        .select(
          "id, patient_id, concern, status, slot_time, timezone, payment_status, payment_terms, amount_due_paise, pay_later_outcome"
        )
        .eq("patient_id", patientId)
        .eq("payment_terms", "pay_later")
        .order("slot_time", { ascending: true }),
      admin
        .from("pay_later_payments")
        .select(
          "id, patient_id, amount_paise, method, status, reference, unallocated_paise, declared_at, confirmed_at, rejection_reason"
        )
        .eq("patient_id", patientId)
        .order("declared_at", { ascending: false }),
    ]);
    if (sessionsRes.error) return null;

    const rows = (sessionsRes.data ?? []) as (PayLaterAppointment & PayLaterOwedSession)[];
    const payments = (paymentsRes.data ?? []) as {
      id: string;
      patient_id: string;
      amount_paise: number;
      method: string;
      status: string;
      reference: string | null;
      unallocated_paise: number | null;
      declared_at: string | null;
      confirmed_at: string | null;
      rejection_reason: string | null;
    }[];

    const balance = computePatientBalance(patientId, rows, payments as PayLaterPaymentRow[]);
    const pending = payments.find((p) => p.status === "pending") ?? null;
    const rejected = payments.find((p) => p.status === "rejected") ?? null;

    return {
      owedPaise: balance.owedPaise,
      owedCount: balance.owedCount,
      unallocatedPaise: balance.unallocatedPaise,
      sessions: rows.filter((a) => isOpenPayLaterSession(a)),
      pendingDeclaration: pending
        ? {
            id: pending.id,
            amount_paise: pending.amount_paise,
            method: pending.method,
            declared_at: pending.declared_at,
          }
        : null,
      // The most recent one only, and only while nothing is waiting: a
      // rejection the patient has already answered by declaring again is
      // history, not something asking for them.
      lastRejection:
        rejected && !pending
          ? {
              amount_paise: rejected.amount_paise,
              rejection_reason: rejected.rejection_reason,
              confirmed_at: rejected.confirmed_at,
            }
          : null,
      settlements: payments
        .filter((p) => p.status === "confirmed")
        .map((p) => ({
          id: p.id,
          amount_paise: p.amount_paise,
          method: p.method,
          reference: p.reference,
          confirmed_at: p.confirmed_at,
          declared_at: p.declared_at,
        })),
    };
  } catch {
    return null;
  }
}

export type PayLaterOwedSession = {
  id: string;
  concern: string | null;
  slot_time: string | null;
  timezone: string | null;
  amount_due_paise: number | null;
};
