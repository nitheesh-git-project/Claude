import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { COUNTRIES } from "@/lib/countryPricing";

// Free, keyless, daily-updated rates with INR as the base. One request per
// tap, never per visitor: the result is stored, and every price uses the
// stored figure until the next refresh.
const RATES_URL = "https://open.er-api.com/v6/latest/INR";
const TIMEOUT_MS = 8000;

/**
 * Catalog -> Countries & currency -> Refresh rates.
 *
 * Fetches today's rates and stores one per listed country, leaving each
 * country's percentage and on/off exactly as they were. A failure stores
 * nothing: the rates already in use stay in use, and the screen says so.
 */
export async function POST() {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let rates: Record<string, number>;
  try {
    const res = await fetch(RATES_URL, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (json.result !== "success" || !json.rates) throw new Error("unexpected response");
    rates = json.rates;
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach the exchange-rate service. The rates you had are still in use - try again in a minute." },
      { status: 502 }
    );
  }

  const fetchedAt = new Date().toISOString();
  const updates = COUNTRIES.flatMap((c) => {
    const rate = rates[c.currency];
    return typeof rate === "number" && Number.isFinite(rate) && rate > 0
      ? [{ code: c.code, currency: c.currency, rate }]
      : [];
  });
  if (updates.length === 0) {
    return NextResponse.json({ error: "The rate service answered without any rates we use. Nothing was changed." }, { status: 502 });
  }

  const admin = createAdminClient();
  // Read first so a refresh never resets a country's percentage or switch:
  // an upsert writes every column it is given.
  const { data: existing, error: readError } = await admin
    .from("country_pricing")
    .select("country_code, enabled, markup_percent");
  if (readError) return serverError("country-pricing/refresh read", readError);
  const byCode = new Map((existing ?? []).map((r) => [r.country_code as string, r]));

  const { error } = await admin.from("country_pricing").upsert(
    updates.map((u) => ({
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
  if (error) return serverError("country-pricing/refresh upsert", error);

  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.update",
    targetLabel: "Exchange rates refreshed",
    details: { countries: updates.length, source: "open.er-api.com" },
  });

  revalidatePath("/", "layout");
  return NextResponse.json({
    ok: true,
    fetchedAt,
    rates: Object.fromEntries(updates.map((u) => [u.code, u.rate])),
  });
}
