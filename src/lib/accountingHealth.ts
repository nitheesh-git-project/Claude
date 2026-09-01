import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

// The three questions an admin needs answered about whether the money and
// the sessions still agree with each other. Read on the admin dashboard and
// shown on Settings → System Health, beside the Meet sync panel.
//
// All three report and none repair. A silent auto-fix on a money record is
// how a discrepancy becomes permanent -- the mismatch itself is the finding,
// and it wants a person, not a sweep.
//
// Every read is isolated and failure-tolerant: these tables are new, and a
// database that has not re-run schema.sql must show "not available" here
// rather than blanking the admin dashboard, which runs ~40 queries in one
// Promise.all where a single unknown-relation error takes the whole page.

export type BalanceMismatch = {
  entitlementId: string;
  patientId: string;
  problem: string;
  cachedAvailable: number;
  ledgerAvailable: number;
  legacyAvailable: number | null;
};

export type UnmatchedPayment = {
  id: string;
  razorpayPaymentId: string | null;
  amountPaise: number;
  capturedAt: string | null;
};

export type SessionWithoutBacking = {
  id: string;
  sessionCode: string | null;
  patientId: string;
  slotTime: string | null;
};

export type AccountingHealth = {
  /** False when the ledger tables aren't present yet -- the panel says so rather than claiming all-clear. */
  available: boolean;
  balanceMismatches: BalanceMismatch[];
  unmatchedPayments: UnmatchedPayment[];
  sessionsWithoutBacking: SessionWithoutBacking[];
  /** How many rows were examined, so "0 problems" can be distinguished from "0 rows". */
  entitlementCount: number;
};

export const EMPTY_ACCOUNTING_HEALTH: AccountingHealth = {
  available: false,
  balanceMismatches: [],
  unmatchedPayments: [],
  sessionsWithoutBacking: [],
  entitlementCount: 0,
};

// Bounded, because this renders inside a page load. A hundred mismatches and
// a thousand are the same message to an admin -- "something is wrong, look
// at it" -- and paying for the full scan on every dashboard render is the
// mistake the Meet-sync sweep already documents.
const ROW_LIMIT = 50;

export async function loadAccountingHealth(admin: AdminClient): Promise<AccountingHealth> {
  const [mismatches, unmatched, unbacked, count] = await Promise.all([
    readBalanceMismatches(admin),
    readUnmatchedPayments(admin),
    readSessionsWithoutBacking(admin),
    readEntitlementCount(admin),
  ]);

  return {
    available: mismatches !== null && count !== null,
    balanceMismatches: mismatches ?? [],
    unmatchedPayments: unmatched ?? [],
    sessionsWithoutBacking: unbacked ?? [],
    entitlementCount: count ?? 0,
  };
}

/** Where the cached counts, the ledger, and the legacy counter disagree. */
async function readBalanceMismatches(admin: AdminClient): Promise<BalanceMismatch[] | null> {
  try {
    const { data, error } = await admin.rpc("verify_entitlement_balances");
    if (error) return null;
    return ((data ?? []) as Record<string, unknown>[]).slice(0, ROW_LIMIT).map((r) => ({
      entitlementId: String(r.entitlement_id),
      patientId: String(r.patient_id),
      problem: String(r.problem),
      cachedAvailable: Number(r.cached_available ?? 0),
      ledgerAvailable: Number(r.ledger_available ?? 0),
      legacyAvailable: r.legacy_available === null ? null : Number(r.legacy_available),
    }));
  } catch {
    return null;
  }
}

/**
 * Money that was captured and could not be attributed to anything.
 *
 * This is the case with no owner: the payment succeeded, and nothing in the
 * app knows what it bought. Before the payments table existed such a capture
 * left no trace at all outside Razorpay's own dashboard, so it could only be
 * found by someone going looking. Now it surfaces here.
 */
async function readUnmatchedPayments(admin: AdminClient): Promise<UnmatchedPayment[] | null> {
  try {
    const { data, error } = await admin
      .from("payments")
      .select("id, razorpay_payment_id, amount_paise, captured_at")
      .eq("status", "captured")
      .is("target_appointment_id", null)
      .is("target_package_purchase_id", null)
      .is("target_home_visit_purchase_id", null)
      .order("captured_at", { ascending: false })
      .limit(ROW_LIMIT);
    if (error) return null;
    return (data ?? []).map((p) => ({
      id: p.id,
      razorpayPaymentId: p.razorpay_payment_id,
      amountPaise: p.amount_paise ?? 0,
      capturedAt: p.captured_at,
    }));
  } catch {
    return null;
  }
}

/**
 * Delivered sessions with nothing behind them: not paid for, not covered by
 * a package, and not collected in cash.
 *
 * This is the check that makes "every billable session is traceable" a fact
 * rather than an aspiration. A row here is either a data problem or a
 * session someone delivered outside the platform's payment flow, and an
 * admin needs to know which.
 */
async function readSessionsWithoutBacking(
  admin: AdminClient
): Promise<SessionWithoutBacking[] | null> {
  try {
    const { data, error } = await admin
      .from("appointments")
      .select("id, session_code, patient_id, slot_time, package_purchase_id, home_visit_purchase_id, cash_collected_at")
      .eq("status", "completed")
      .neq("payment_status", "paid")
      .order("slot_time", { ascending: false })
      .limit(200);
    if (error) return null;
    return (data ?? [])
      .filter(
        (a) =>
          !a.package_purchase_id && !a.home_visit_purchase_id && !a.cash_collected_at
      )
      .slice(0, ROW_LIMIT)
      .map((a) => ({
        id: a.id,
        sessionCode: a.session_code,
        patientId: a.patient_id,
        slotTime: a.slot_time,
      }));
  } catch {
    return null;
  }
}

async function readEntitlementCount(admin: AdminClient): Promise<number | null> {
  try {
    const { count, error } = await admin
      .from("session_entitlements")
      .select("id", { count: "exact", head: true });
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

/** True when nothing needs a person's attention. Drives the inbox badge. */
export function accountingIsClean(health: AccountingHealth): boolean {
  return (
    health.balanceMismatches.length === 0 &&
    health.unmatchedPayments.length === 0 &&
    health.sessionsWithoutBacking.length === 0
  );
}

export function accountingProblemCount(health: AccountingHealth): number {
  return (
    health.balanceMismatches.length +
    health.unmatchedPayments.length +
    health.sessionsWithoutBacking.length
  );
}
