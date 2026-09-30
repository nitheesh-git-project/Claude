import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A refund's record, written before the money moves.
 *
 * Every gateway refund in this app claims its local row first and calls
 * Razorpay second, deliberately: a refusal must leave no trace claiming money
 * went back. What that ordering cannot cover is the opposite failure --
 * Razorpay accepts the refund and the write recording what came back fails.
 * The money is gone, `refund_id` is null, and on every screen that is
 * indistinguishable from a refund which was claimed and never sent. All four
 * refund writers had that window (`refund-session-partial`, `refund-package`,
 * `refund-home-visit-package`, `cancelAppointmentAndRefund`) and in all four
 * the only thing that noticed was a `console.error`.
 *
 * So the *intent* is recorded before the call and resolved after it. Three
 * rules:
 *
 * 1. **A refund that cannot be recorded is not attempted.** `openRefundAttempt`
 *    failing is a refusal, not a warning -- the same posture
 *    `/api/therapist/reveal-contact` takes on its reveal log and the care-plan
 *    review takes on its decision row. An unrecordable refund is exactly the
 *    outcome this exists to prevent, so proceeding anyway would defeat it.
 * 2. **Resolving never throws.** By then the money has already moved; a
 *    failure to write the outcome must not turn a completed refund into a
 *    500 that reads as "nothing happened". It leaves the row at `processing`,
 *    which is precisely the state Settings -> System Health -> Refunds
 *    reports.
 * 3. **It is not a second refund ledger.** What a session or purchase was
 *    refunded stays on its own row, which is what every money figure reads.
 *    This answers "did what we asked for actually happen".
 */

export type RefundAttemptPurpose = "appointment" | "package_purchase" | "home_visit_purchase";

export type OpenRefundAttempt = {
  purpose: RefundAttemptPurpose;
  /** The id of the subject, whichever kind `purpose` names. */
  subjectId: string;
  razorpayPaymentId: string;
  amountPaise: number;
  reason?: string | null;
  /** The admin who asked. Null for a patient's own cancellation. */
  requestedBy?: string | null;
};

const SUBJECT_COLUMN: Record<RefundAttemptPurpose, string> = {
  appointment: "appointment_id",
  package_purchase: "package_purchase_id",
  home_visit_purchase: "home_visit_purchase_id",
};

/**
 * Records a refund about to be sent to the gateway. Returns the attempt id, or
 * null when the row could not be written -- in which case the caller must
 * refuse rather than call the gateway.
 *
 * A database missing this table (`42P01`) is treated the same way as any other
 * failure rather than being waved through: the guarantee is the record, so
 * "the record is unavailable" and "the record failed" are the same fact. The
 * table ships in the same change as these call sites, so the only way to meet
 * it is an unapplied schema.
 */
export async function openRefundAttempt(
  admin: SupabaseClient,
  attempt: OpenRefundAttempt
): Promise<string | null> {
  const { data, error } = await admin
    .from("refund_attempts")
    .insert({
      purpose: attempt.purpose,
      [SUBJECT_COLUMN[attempt.purpose]]: attempt.subjectId,
      razorpay_payment_id: attempt.razorpayPaymentId,
      amount_paise: attempt.amountPaise,
      reason: attempt.reason?.trim() || null,
      requested_by: attempt.requestedBy ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    console.error("Could not record a refund attempt; the refund was not sent", attempt, error);
    return null;
  }
  return data.id as string;
}

/** Marks an attempt as having gone through, naming the gateway's own refund. */
export async function succeedRefundAttempt(
  admin: SupabaseClient,
  attemptId: string | null,
  razorpayRefundId: string
): Promise<void> {
  if (!attemptId) return;
  const { error } = await admin
    .from("refund_attempts")
    .update({
      status: "succeeded",
      razorpay_refund_id: razorpayRefundId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", attemptId)
    .eq("status", "processing");
  if (error) {
    // Never thrown: the money has moved, and the row staying at `processing`
    // is what the health check is for.
    console.error("Refund succeeded but its attempt row could not be resolved", attemptId, error);
  }
}

/** Marks an attempt as refused by the gateway, with what it said. */
export async function failRefundAttempt(
  admin: SupabaseClient,
  attemptId: string | null,
  detail: unknown
): Promise<void> {
  if (!attemptId) return;
  const { error } = await admin
    .from("refund_attempts")
    .update({
      status: "failed",
      resolved_at: new Date().toISOString(),
      // The gateway's own words, trimmed to something a person can read in a
      // table. Never the whole object: it can carry the request back with it.
      failure_detail: describeFailure(detail),
    })
    .eq("id", attemptId)
    .eq("status", "processing");
  if (error) {
    console.error("Refund failed and its attempt row could not be resolved", attemptId, error);
  }
}

/** One readable line out of whatever the gateway threw. */
export function describeFailure(detail: unknown): string | null {
  if (!detail) return null;
  if (typeof detail === "string") return detail.trim().slice(0, 500) || null;
  const record = detail as { error?: { description?: unknown }; message?: unknown };
  const described = record?.error?.description ?? record?.message;
  if (typeof described === "string" && described.trim()) return described.trim().slice(0, 500);
  return null;
}
