import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllRowsAsData } from "@/lib/supabase/readAllRows";

export type SessionDiscountColumns = { list_price_paise: number | null; discount_paise: number | null };

/**
 * The discount columns (goodwill, the first-session offer) of one person's
 * sessions, keyed by appointment id -- only sessions that have one.
 *
 * Its own read, never folded into a page's main appointment select: the
 * columns are newer than the table, and a database without them must lose
 * the discounted price on a list, not the list. A failed read is an empty
 * map -- the list then shows the service's price, as it did before.
 */
export async function readSessionDiscounts(
  admin: SupabaseClient,
  who: { column: "patient_id" | "therapist_id"; id: string }
): Promise<Map<string, SessionDiscountColumns>> {
  try {
    const { data } = await readAllRowsAsData(() =>
      admin
        .from("appointments")
        .select("id, list_price_paise, discount_paise")
        .eq(who.column, who.id)
        .gt("discount_paise", 0)
        .order("id", { ascending: true })
    );
    return new Map(
      ((data ?? []) as { id: string; list_price_paise: number | null; discount_paise: number | null }[]).map((r) => [
        r.id,
        { list_price_paise: r.list_price_paise, discount_paise: r.discount_paise },
      ])
    );
  } catch {
    return new Map();
  }
}
