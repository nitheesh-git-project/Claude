// Settling what a trusted patient owes.
//
// The arithmetic of what is owed lives in `patientBalances.ts` and is
// unchanged. This is the judgement layer around a *payment*: whether a
// patient may declare one, how a method reads, and how long one has been
// waiting for somebody to check it.
//
// **Allocation is deliberately not here.** Which delivered sessions a payment
// closes is decided by `allocate_pay_later_payment()` in `schema.sql`, under
// a real row lock on the patient -- two admins confirming two payments at
// once is exactly what races, and supabase-js cannot express the transaction
// that settles it. A TypeScript twin of that loop would be a second
// implementation to drift from the authority, the same reason
// `claim_promo_code` has none. Its properties are asserted in
// `scripts/pay-later-sql-checks.sql` instead.

/** How the money reached the clinic. `online` is the gateway; the rest are
 *  ways only a person can confirm. */
export const SETTLEMENT_METHODS = ["online", "cash", "upi", "bank_transfer", "other"] as const;
export type SettlementMethod = (typeof SETTLEMENT_METHODS)[number];

/** What the patient picked, in their words. Never a column name. */
export const SETTLEMENT_METHOD_LABELS: Record<SettlementMethod, string> = {
  online: "Card or UPI, online now",
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  other: "Something else",
};

/** The methods a patient declares afterwards, rather than paying through the
 *  app. `online` is absent because it is not a declaration at all -- the
 *  gateway confirms it, so there is nothing for anybody to check. */
export const DECLARABLE_METHODS = SETTLEMENT_METHODS.filter(
  (m) => m !== "online"
) as readonly Exclude<SettlementMethod, "online">[];

export function isSettlementMethod(value: unknown): value is SettlementMethod {
  return typeof value === "string" && (SETTLEMENT_METHODS as readonly string[]).includes(value);
}

/** The floor a rejection's reason has to clear -- the same one an admin
 *  credit adjustment, a goodwill discount and a pay-later grant all use. */
export const SETTLEMENT_REJECTION_MIN_CHARS = 10;

/** How long a declared payment may sit before somebody should have checked
 *  it. Not a setting: unlike the ageing threshold, this is about the clinic's
 *  own response time rather than a patient's paying rhythm, and three days is
 *  three days in a clinic that settles weekly or quarterly alike. */
export const SETTLEMENT_STALE_AFTER_DAYS = 3;

export type PayLaterDeclarationRefusal =
  /** The clinic-wide switch is off, or could not be read. */
  | "feature_off"
  /** They owe nothing, so there is nothing to settle. */
  | "nothing_owed"
  /** More than they owe. A patient must not be able to hand over money the
   *  clinic would then have to give back. */
  | "too_much"
  /** Not a positive whole number of paise. */
  | "bad_amount"
  /** One is already waiting to be checked. A second would be the same money
   *  counted twice by whoever opens the queue. */
  | "already_pending";

export type PayLaterDeclarationDecision =
  | { allowed: true }
  | { allowed: false; reason: PayLaterDeclarationRefusal };

export type PayLaterDeclarationInput = {
  /** `site_settings.pay_later_enabled`, read in its own call failing closed. */
  featureEnabled: boolean;
  /** What this patient owes right now, net of money already received. */
  owedPaise: number;
  /** What they say they have paid. */
  amountPaise: number;
  /** Whether one of theirs is already waiting to be checked. */
  hasPending: boolean;
};

/**
 * May this patient declare this payment?
 *
 * The order is the order the answers are useful in: the switch, then whether
 * anything is owed at all, then the amount, then the queue.
 *
 * Note what this does **not** refuse: a patient whose terms have since been
 * **stopped**. Stopping terms stops new bookings; anything already owed stays
 * owed, listed and settleable, and refusing the payment here would strand
 * money owed to the clinic on a screen the patient can see and cannot act on.
 */
export function decidePayLaterDeclaration(
  input: PayLaterDeclarationInput
): PayLaterDeclarationDecision {
  if (!input.featureEnabled) return { allowed: false, reason: "feature_off" };
  if (input.owedPaise <= 0) return { allowed: false, reason: "nothing_owed" };
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
    return { allowed: false, reason: "bad_amount" };
  }
  if (input.amountPaise > input.owedPaise) return { allowed: false, reason: "too_much" };
  if (input.hasPending) return { allowed: false, reason: "already_pending" };
  return { allowed: true };
}

/**
 * What the patient is told.
 *
 * In their own words, and never in the admin's: this screen belongs to
 * somebody the clinic trusts, so nothing here reads as a refusal of credit.
 * "debt", "outstanding", "invoice" and "balance" stay off it -- the last one
 * is already the patient's word for unspent session credits.
 */
export function declarationRefusalMessage(reason: PayLaterDeclarationRefusal): string {
  switch (reason) {
    case "nothing_owed":
      return "There's nothing to settle right now.";
    case "too_much":
      return "That's more than you owe at the moment. Enter the amount owed or less.";
    case "bad_amount":
      return "Enter the amount you've paid.";
    case "already_pending":
      return "We're already checking a payment from you. We'll confirm it shortly.";
    case "feature_off":
      return "We can't take this right now. Please contact the clinic.";
  }
}

/** How long a declared payment has been waiting, in whole days. */
export function settlementWaitDays(declaredAt: string | null, nowMs: number): number | null {
  if (!declaredAt) return null;
  const ms = new Date(declaredAt).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor((nowMs - ms) / 86_400_000));
}

/**
 * Worth somebody's attention.
 *
 * A patient who has handed over money and heard nothing has no way to tell
 * "being checked" from "forgotten", and the clinic's own figures overstate
 * what is owed for as long as it sits. Exactly at the threshold counts, the
 * same boundary `isAgedBalance` uses.
 */
export function isStaleSettlement(declaredAt: string | null, nowMs: number): boolean {
  const days = settlementWaitDays(declaredAt, nowMs);
  if (days === null) return false;
  return days >= SETTLEMENT_STALE_AFTER_DAYS;
}

export type SettlementRow = {
  id: string;
  patient_id: string;
  amount_paise: number;
  method: string;
  status: string;
  declared_at: string | null;
  unallocated_paise?: number | null;
  /** What the patient said about it, and any reference they could quote.
   *  Both are what whoever checks the bank actually reads, so the queue
   *  carries them rather than making somebody open a second screen. */
  note?: string | null;
  reference?: string | null;
};

/**
 * The queue, oldest first.
 *
 * Oldest first for the same reason the recommendation queue is: this is work
 * with a person waiting behind it, and a newest-first queue leaves the one
 * who has waited longest at the bottom.
 */
export function pendingSettlements(rows: SettlementRow[]): SettlementRow[] {
  return rows
    .filter((r) => r.status === "pending")
    .sort((a, b) => {
      const at = a.declared_at ? Date.parse(a.declared_at) : 0;
      const bt = b.declared_at ? Date.parse(b.declared_at) : 0;
      return at - bt;
    });
}

/**
 * Does the money in agree with the money accounted for?
 *
 * `sum(confirmed payments) = sum(settled session amounts) + unallocated`.
 * The one invariant the pool design stands on, and the one state on the
 * System Health check that is genuinely red: a disagreement means either a
 * session was closed by money that never arrived or money arrived and closed
 * nothing. It is **reported, never repaired** -- a silent auto-fix on a money
 * record is how a discrepancy becomes permanent.
 */
export function reconcileSettlements(input: {
  confirmedPaise: number;
  settledPaise: number;
  unallocatedPaise: number;
}): { agrees: boolean; differencePaise: number } {
  const difference = input.confirmedPaise - (input.settledPaise + input.unallocatedPaise);
  return { agrees: difference === 0, differencePaise: difference };
}
