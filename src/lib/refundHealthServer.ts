import type { SupabaseClient } from "@supabase/supabase-js";
import type { RefundHealth } from "@/lib/systemHealth";

/** How long a refund may legitimately sit unresolved before it is a finding. */
export const REFUND_STUCK_AFTER_MINUTES = 10;

/**
 * Whether every refund sent to Razorpay has a recorded outcome.
 *
 * The arithmetic is in `refund_attempt_health()` rather than here for the
 * reason every other reconciliation in this app is: it is two aggregate
 * queries over tables this page does not otherwise load, and doing it in
 * TypeScript would mean fetching every refund attempt into a page render to
 * count two of them.
 *
 * Returns null when it could not be asked -- a database without
 * `refund_attempts` has nothing to compare against, and reading that as
 * agreement is the exact mistake this check exists to catch.
 */
export async function readRefundHealth(admin: SupabaseClient): Promise<RefundHealth | null> {
  try {
    const { data, error } = await admin.rpc("refund_attempt_health", {
      p_stuck_after_minutes: REFUND_STUCK_AFTER_MINUTES,
    });
    if (error || !data) return null;

    const row = data as {
      stuck_count?: number;
      oldest_stuck_at?: string | null;
      unrecorded_count?: number;
    };

    const stuckCount = Number(row.stuck_count ?? 0);
    const unrecordedCount = Number(row.unrecorded_count ?? 0);
    if (!Number.isFinite(stuckCount) || !Number.isFinite(unrecordedCount)) return null;

    // Turned into an age here rather than in `systemHealth.ts`, which stays
    // dependency-free, and into whole hours because that is the figure a
    // person acts on -- how long money has been unaccounted for.
    let oldestStuckHours: number | null = null;
    if (row.oldest_stuck_at) {
      const sentMs = Date.parse(row.oldest_stuck_at);
      if (Number.isFinite(sentMs)) {
        oldestStuckHours = Math.max(0, Math.floor((Date.now() - sentMs) / 3_600_000));
      }
    }

    return { stuckCount, unrecordedCount, oldestStuckHours };
  } catch {
    return null;
  }
}
