import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllRowsAsData } from "@/lib/supabase/readAllRows";

/**
 * Paise forgiven when a delivered pay-later session closed less than a rupee
 * short of its price (`appointments.pay_later_forgiven_paise`, written by
 * `allocate_pay_later_payment`), keyed by appointment id -- only sessions
 * that have one.
 *
 * Its own read, never folded into a page's main appointment select: the
 * column is newer than the table, and a database without it must lose this
 * one line, not the list. A failed read is an empty map.
 */
export async function readForgivenPaise(
  admin: SupabaseClient,
  who?: { column: "patient_id" | "therapist_id"; id: string }
): Promise<Map<string, number>> {
  try {
    const { data } = await readAllRowsAsData(() => {
      let query = admin.from("appointments").select("id, pay_later_forgiven_paise").gt("pay_later_forgiven_paise", 0);
      if (who) query = query.eq(who.column, who.id);
      return query.order("id", { ascending: true });
    });
    return new Map(
      ((data ?? []) as { id: string; pay_later_forgiven_paise: number | null }[]).map((r) => [
        r.id,
        r.pay_later_forgiven_paise ?? 0,
      ])
    );
  } catch {
    return new Map();
  }
}
