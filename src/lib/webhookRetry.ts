// What a second delivery of an already-recorded Razorpay webhook should do.
//
// payment_webhook_events rows cannot be deleted (the row is the dedup, and
// a trigger enforces it), so "this attempt failed, let the retry in" has to
// be written on the row and read back by the retry. Dependency-free so the
// three outcomes are tested without a database.

/** processing_error values starting with this are failures worth retrying. */
export const WEBHOOK_RETRYABLE_PREFIX = "retryable: ";

/**
 * How long an attempt with no recorded outcome is presumed still running.
 * Past this it is presumed dead (a crashed worker, a timeout) and a retry
 * may take it over. Razorpay's own first retries are minutes apart, so this
 * never makes a live attempt race a retry in practice.
 */
export const WEBHOOK_IN_FLIGHT_MS = 2 * 60 * 1000;

export type WebhookRetryVerdict = "duplicate" | "retry" | "in_flight";

export function webhookRetryVerdict(
  prior: { processed_at: string | null; processing_error: string | null; received_at: string | null },
  nowMs: number
): WebhookRetryVerdict {
  if (prior.processed_at) {
    return prior.processing_error?.startsWith(WEBHOOK_RETRYABLE_PREFIX) ? "retry" : "duplicate";
  }
  const receivedMs = prior.received_at ? Date.parse(prior.received_at) : NaN;
  if (Number.isFinite(receivedMs) && nowMs - receivedMs < WEBHOOK_IN_FLIGHT_MS) return "in_flight";
  return "retry";
}
