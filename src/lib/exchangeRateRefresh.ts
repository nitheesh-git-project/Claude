import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { COUNTRIES } from "@/lib/countryPricing";
import { autoRefreshDue, planRateRefresh, type FetchedRate, type HeldRate } from "@/lib/exchangeRatePlan";

// Free, keyless, daily-updated rates with INR as the base. One request per
// refresh -- an admin's tap or the daily sweep -- never per visitor: the
// result is stored, and every price uses the stored figure until the next
// refresh, so a quote and the order minted from it cannot straddle a change.
const RATES_URL = "https://open.er-api.com/v6/latest/INR";
const TIMEOUT_MS = 8000;

export type RefreshOutcome =
  | { ok: true; fetchedAt: string; applied: FetchedRate[]; held: HeldRate[] }
  | { ok: false; status: 502 | 500; error: string; detail?: unknown };

type StoredRow = {
  country_code: string;
  enabled: boolean;
  markup_percent: number | string;
  units_per_inr: number | string | null;
};

async function fetchRates(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(RATES_URL, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
    return json.result === "success" && json.rates ? json.rates : null;
  } catch {
    return null;
  }
}

/**
 * Fetches today's rates and stores one per listed country, leaving each
 * country's percentage and switch exactly as they were. A switched-on
 * country whose rate moved more than 10% keeps its current rate and gets the
 * new one as pending (exchangeRatePlan.ts) for an admin to apply or keep.
 * A failure stores nothing: the rates already in use stay in use.
 */
export async function refreshExchangeRates(admin: SupabaseClient): Promise<RefreshOutcome> {
  const rates = await fetchRates();
  if (!rates) {
    return {
      ok: false,
      status: 502,
      error: "Couldn't reach the exchange-rate service. The rates you had are still in use - try again in a minute.",
    };
  }
  const fetched: FetchedRate[] = COUNTRIES.flatMap((c) => {
    const rate = rates[c.currency];
    return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? [{ code: c.code, currency: c.currency, rate }] : [];
  });
  if (fetched.length === 0) {
    return { ok: false, status: 502, error: "The rate service answered without any rates we use. Nothing was changed." };
  }

  // Read first so a refresh never resets a country's percentage or switch:
  // an upsert writes every column it is given.
  const { data: existing, error: readError } = await admin
    .from("country_pricing")
    .select("country_code, enabled, markup_percent, units_per_inr");
  if (readError) return { ok: false, status: 500, error: "read", detail: readError };
  const stored = (existing ?? []) as StoredRow[];
  const byCode = new Map(stored.map((r) => [r.country_code, r]));

  const plan = planRateRefresh(
    stored.map((r) => ({
      code: r.country_code,
      enabled: r.enabled,
      unitsPerInr: r.units_per_inr === null ? null : Number(r.units_per_inr),
    })),
    fetched
  );
  const fetchedAt = new Date().toISOString();

  // Held rates are written first, as pending. A database without the
  // pending columns cannot hold anything, so those rates are used as they
  // always were -- the behaviour before this existed.
  let held = plan.hold;
  let apply = plan.apply;
  if (held.length > 0) {
    const writes = await Promise.all(
      held.map((h) =>
        admin
          .from("country_pricing")
          .update({ pending_units_per_inr: h.rate, pending_rate_fetched_at: fetchedAt })
          .eq("country_code", h.code)
      )
    );
    if (writes.some((w) => w.error)) {
      apply = [...apply, ...held];
      held = [];
    }
  }

  const { error } = await admin.from("country_pricing").upsert(
    apply.map((u) => ({
      country_code: u.code,
      currency_code: u.currency,
      units_per_inr: u.rate,
      rate_fetched_at: fetchedAt,
      enabled: byCode.get(u.code)?.enabled ?? false,
      markup_percent: byCode.get(u.code)?.markup_percent ?? 0,
      updated_at: fetchedAt,
    })),
    { onConflict: "country_code" }
  );
  if (error) return { ok: false, status: 500, error: "upsert", detail: error };

  // A rate used now supersedes anything that was waiting for it. Best
  // effort: a database without the column has nothing pending to clear.
  if (apply.length > 0) {
    await admin
      .from("country_pricing")
      .update({ pending_units_per_inr: null, pending_rate_fetched_at: null })
      .in(
        "country_code",
        apply.map((a) => a.code)
      )
      .not("pending_units_per_inr", "is", null);
  }

  return { ok: true, fetchedAt, applied: apply, held };
}

/**
 * The daily half: refresh when the newest stored rate is a day old. Never
 * fetched means the admin has not set rates up, so nothing is fetched for
 * them. Returns what it did, for the sweep's own log.
 */
export async function refreshExchangeRatesIfDue(admin: SupabaseClient, nowMs: number): Promise<"skipped" | "refreshed"> {
  const { data, error } = await admin
    .from("country_pricing")
    .select("rate_fetched_at")
    .not("rate_fetched_at", "is", null)
    .order("rate_fetched_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const newest = (data?.[0] as { rate_fetched_at: string } | undefined)?.rate_fetched_at ?? null;
  if (!autoRefreshDue(newest, nowMs)) return "skipped";
  const outcome = await refreshExchangeRates(admin);
  if (!outcome.ok) throw new Error(`exchange-rate refresh failed: ${outcome.error}`);
  return "refreshed";
}
