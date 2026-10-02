import type { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const UNDEFINED_COLUMN = "42703";

/**
 * Closes a therapist's open payout request against the batch that paid it.
 *
 * A request marked `completed` tells the therapist they have been paid, so it
 * must only ever happen with a payout behind it. Best-effort by design: the
 * money has already moved by the time this runs, and a request left open is
 * visible and closable by hand -- unlike a payout recorded nowhere.
 * `payout_batch_id` is migration-dependent; on a database without it the
 * request is still closed, just without the link.
 */
export async function linkOpenPayoutRequest(
  admin: AdminClient,
  {
    therapistId,
    batchId,
    adminId,
    completedAt,
  }: { therapistId: string; batchId: string; adminId: string; completedAt: string }
): Promise<void> {
  const base = { status: "completed", completed_at: completedAt, completed_by: adminId };
  const { error } = await admin
    .from("therapist_payout_requests")
    .update({ ...base, payout_batch_id: batchId })
    .eq("therapist_id", therapistId)
    .in("status", ["pending", "reviewing"]);
  if (!error) return;
  if (error.code === UNDEFINED_COLUMN) {
    const { error: fallbackError } = await admin
      .from("therapist_payout_requests")
      .update(base)
      .eq("therapist_id", therapistId)
      .in("status", ["pending", "reviewing"]);
    if (!fallbackError) return;
    console.error("Could not close payout request after settlement", therapistId, fallbackError.message);
    return;
  }
  console.error("Could not close payout request after settlement", therapistId, error.message);
}
