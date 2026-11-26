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

/** How a session was priced, for the share base (shareBase.ts). */
export type ShareBaseRow = { list_price_paise: number | null; home_list_price_paise: number | null };

export type FrozenTherapistRates =
  | { ok: true; byId: Map<string, number | null>; basesById: Map<string, ShareBaseRow> }
  | { ok: false; byId: Map<string, number | null>; basesById: Map<string, ShareBaseRow> };

/** One therapist's sessions by default; `by: "patient_id"` for one patient's
 *  (the patient profile's profit chart). */
export async function readFrozenTherapistRates(
  client: SupabaseClient,
  id: string,
  by: "therapist_id" | "patient_id" = "therapist_id"
): Promise<FrozenTherapistRates> {
  const [result, bases] = await Promise.all([
    readAllRows<{ id: string; therapist_share_percent_at_completion: number | null }>(() =>
      client
        .from("appointments")
        .select("id, therapist_share_percent_at_completion")
        .eq(by, id)
        .eq("status", "completed")
        .order("id", { ascending: true })
    ),
    readShareBases(client, id, by),
  ]);
  if (result.error) {
    const unmigrated = (result.error as { code?: string }).code === "42703";
    return { ok: unmigrated && bases.ok, byId: new Map(), basesById: bases.byId };
  }
  if (result.truncated || !bases.ok) return { ok: false, byId: new Map(), basesById: bases.byId };
  return {
    ok: true,
    byId: new Map(result.rows.map((r) => [r.id, r.therapist_share_percent_at_completion])),
    basesById: bases.byId,
  };
}

/**
 * The list price and the Indian price it was raised from, for each of the
 * same sessions: the therapist's share is taken on the Indian price
 * (shareBase.ts). Its own read, for the same reason as the rates: an
 * unmigrated database (42703) has no such prices, and every session then
 * pays on its whole amount, as all of them did before. Only rows priced
 * abroad are returned -- a rupee booking needs nothing merged.
 */
async function readShareBases(
  client: SupabaseClient,
  id: string,
  by: "therapist_id" | "patient_id"
): Promise<{ ok: boolean; byId: Map<string, ShareBaseRow> }> {
  const result = await readAllRows<{ id: string } & ShareBaseRow>(() =>
    client
      .from("appointments")
      .select("id, list_price_paise, home_list_price_paise")
      .eq(by, id)
      .eq("status", "completed")
      .not("home_list_price_paise", "is", null)
      .order("id", { ascending: true })
  );
  if (result.error) {
    return { ok: (result.error as { code?: string }).code === "42703", byId: new Map() };
  }
  if (result.truncated) return { ok: false, byId: new Map() };
  return {
    ok: true,
    byId: new Map(
      result.rows.map((r) => [r.id, { list_price_paise: r.list_price_paise, home_list_price_paise: r.home_list_price_paise }])
    ),
  };
}

/** Everything the share maths reads off one session from these reads: the
 *  frozen rate and, for a session priced abroad, its two prices. Spread onto
 *  the row handed to `sessionTherapistCutPaise`. */
export function frozenShareFacts(
  rates: FrozenTherapistRates,
  appointmentId: string
): { therapist_share_percent_at_completion: number | null } & Partial<ShareBaseRow> {
  return {
    therapist_share_percent_at_completion: rates.byId.get(appointmentId) ?? null,
    ...(rates.basesById.get(appointmentId) ?? {}),
  };
}

/** Each session with its frozen rate merged in (null where none was frozen). */
export function withFrozenTherapistRates<T extends { id: string }>(
  rows: T[],
  rates: FrozenTherapistRates
): (T & { therapist_share_percent_at_completion: number | null })[] {
  return rows.map((r) => ({
    ...r,
    ...frozenShareFacts(rates, r.id),
  }));
}

/**
 * Every completed session priced abroad, clinic-wide, for the admin's Money
 * screens -- the same facts `readFrozenTherapistRates` merges per therapist.
 * An empty map on any failure: those sessions then show the share on their
 * whole amount, which is what every screen showed before this existed.
 */
export async function readAllShareBases(client: SupabaseClient): Promise<Map<string, ShareBaseRow>> {
  try {
    const result = await readAllRows<{ id: string } & ShareBaseRow>(() =>
      client
        .from("appointments")
        .select("id, list_price_paise, home_list_price_paise")
        .eq("status", "completed")
        .not("home_list_price_paise", "is", null)
        .order("id", { ascending: true })
    );
    if (result.error || result.truncated) return new Map();
    return new Map(
      result.rows.map((r) => [r.id, { list_price_paise: r.list_price_paise, home_list_price_paise: r.home_list_price_paise }])
    );
  } catch {
    return new Map();
  }
}
