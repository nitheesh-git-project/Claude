// A new patient from a booking wizard has an account before they pay (a
// Razorpay order must belong to somebody), but it stays locked -- no
// dashboard -- until a payment is captured or they have tried and failed to
// pay `site_settings.payment_tries_before_access` times. Every try that does
// not end in a payment counts: the sheet closed, the payment failed, or our
// own server could not start it. Dependency-free so it can be tested alone.

export const PAYMENT_TRY_OUTCOMES = ["dismissed", "failed", "server_error"] as const;
export type PaymentTryOutcome = (typeof PAYMENT_TRY_OUTCOMES)[number];

export const PAYMENT_TRY_FLOWS = ["online", "home_visit"] as const;
export type PaymentTryFlow = (typeof PAYMENT_TRY_FLOWS)[number];

export function isPaymentTryOutcome(value: unknown): value is PaymentTryOutcome {
  return typeof value === "string" && (PAYMENT_TRY_OUTCOMES as readonly string[]).includes(value);
}

export function isPaymentTryFlow(value: unknown): value is PaymentTryFlow {
  return typeof value === "string" && (PAYMENT_TRY_FLOWS as readonly string[]).includes(value);
}

/** Whether this many unsuccessful tries unlocks the account. */
export function triesUnlockAccess(tries: number, limit: number): boolean {
  return tries >= Math.max(1, limit);
}

/** What /api/patient/payment-try answers, and what the wizards act on. */
export type PaymentTryAnswer = {
  /** Unsuccessful tries this account has made, this one included. */
  tries: number;
  limit: number;
  /** The account can open its dashboard now (it already could, or this try
   *  was the one that unlocked it). */
  unlocked: boolean;
  /** This very try is the one that unlocked it. */
  justUnlocked: boolean;
};

/**
 * Whether the wizard should offer its own way to the dashboard. Only to an
 * account that can open it -- a locked one would be bounced -- and only once
 * paying here has plainly stopped working: the try that unlocked the
 * account, or `limit` failures in this visit for a patient already in.
 */
export function escapeOffered(input: {
  unlocked: boolean;
  justUnlocked: boolean;
  failuresThisVisit: number;
  limit: number;
}): boolean {
  if (!input.unlocked) return false;
  return input.justUnlocked || input.failuresThisVisit >= Math.max(1, input.limit);
}

/** A response the wizard got from one of our own routes on the way to the
 *  payment sheet: only our failure counts as a try, never a refusal that is
 *  the patient's to fix (a slot taken, a lead time, a bad promo code). */
export function isServerFailureStatus(status: number): boolean {
  return status >= 500;
}
