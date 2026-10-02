import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Gives one used session (or visit) back to a purchase, exactly once, even
 * when other writers are moving the same counter.
 *
 * The four places that did this -- two cancellation restores and two
 * failed-booking rollbacks -- each made one compare-and-set attempt and
 * stopped. Losing the race (two cancellations on one package at once, or a
 * cancellation landing between a booking's claim and its rollback) meant the
 * credit was simply never returned, and a zero-row rollback was treated as
 * success because only the error was checked. Each caller is itself already
 * exactly-once (an appointment can only be claimed cancelled once, and a
 * failed insert rolls back once), so retrying the compare-and-set until it
 * lands is safe: it cannot double-restore, it can only stop losing.
 */
export const COUNTER_RETRY_ATTEMPTS = 6;

export type CounterTable = "patient_package_purchases" | "home_visit_package_purchases";
export type CounterColumn = "sessions_used" | "visits_used";

export type DecrementOutcome =
  | { ok: true; value: number }
  /** The counter was already zero: nothing to give back. */
  | { ok: true; value: 0; alreadyZero: true }
  | { ok: false; error: string };

export async function decrementUsedCounter(
  admin: SupabaseClient,
  table: CounterTable,
  column: CounterColumn,
  purchaseId: string
): Promise<DecrementOutcome> {
  for (let attempt = 0; attempt < COUNTER_RETRY_ATTEMPTS; attempt++) {
    const { data: current, error: readError } = await admin
      .from(table)
      .select(column)
      .eq("id", purchaseId)
      .maybeSingle();
    if (readError) return { ok: false, error: readError.message };
    if (!current) return { ok: false, error: "purchase not found" };
    const used = (current as Record<string, number>)[column];
    if (typeof used !== "number") return { ok: false, error: `${column} unreadable` };
    if (used <= 0) return { ok: true, value: 0, alreadyZero: true };

    const { data: updated, error: updateError } = await admin
      .from(table)
      .update({ [column]: used - 1 })
      .eq("id", purchaseId)
      .eq(column, used)
      .select("id")
      .maybeSingle();
    if (updateError) return { ok: false, error: updateError.message };
    if (updated) return { ok: true, value: used - 1 };
    // Another writer moved the counter between the read and the write. Read
    // it again and retry -- the decrement this caller owes is still owed.
  }
  return { ok: false, error: `${column} kept changing; gave up after ${COUNTER_RETRY_ATTEMPTS} attempts` };
}
