// The therapist rate frozen onto each of one therapist's delivered sessions,
// for every reader that hands sessions to the payout maths
// (`sessionTherapistCutPaise` reads `therapist_share_percent_at_completion`).
//
// Its own isolated read, merged by id, for the reason every newer column on
// `appointments` is: folded into a shared select, a database that has not run
// the migration would fail the whole query. An unknown column (42703) is that
// case and reads as "nothing frozen" -- every session then pays at the live
// rate, exactly as all of them did before the freeze. Any other failure is
// `ok: false`, and a caller that moves money (the request and settle routes)
// refuses rather than paying at a rate it could not check.

import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllRows } from "@/lib/supabase/readAllRows";

export type FrozenTherapistRates =
  | { ok: true; byId: Map<string, number | null> }
  | { ok: false; byId: Map<string, number | null> };

/** One therapist's sessions by default; `by: "patient_id"` for one patient's
 *  (the patient profile's profit chart). */
export async function readFrozenTherapistRates(
  client: SupabaseClient,
  id: string,
  by: "therapist_id" | "patient_id" = "therapist_id"
): Promise<FrozenTherapistRates> {
  const result = await readAllRows<{ id: string; therapist_share_percent_at_completion: number | null }>(() =>
    client
      .from("appointments")
      .select("id, therapist_share_percent_at_completion")
      .eq(by, id)
      .eq("status", "completed")
      .order("id", { ascending: true })
  );
  if (result.error) {
    const unmigrated = (result.error as { code?: string }).code === "42703";
    return { ok: unmigrated, byId: new Map() };
  }
  if (result.truncated) return { ok: false, byId: new Map() };
  return {
    ok: true,
    byId: new Map(result.rows.map((r) => [r.id, r.therapist_share_percent_at_completion])),
  };
}

/** Each session with its frozen rate merged in (null where none was frozen). */
export function withFrozenTherapistRates<T extends { id: string }>(
  rows: T[],
  rates: FrozenTherapistRates
): (T & { therapist_share_percent_at_completion: number | null })[] {
  return rows.map((r) => ({
    ...r,
    therapist_share_percent_at_completion: rates.byId.get(r.id) ?? null,
  }));
}
