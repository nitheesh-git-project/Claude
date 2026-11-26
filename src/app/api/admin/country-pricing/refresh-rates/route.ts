import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { refreshExchangeRates } from "@/lib/exchangeRateRefresh";
import { countryInfo } from "@/lib/countryPricing";

/**
 * Catalog -> Countries & currency -> Refresh rates.
 *
 * Fetches today's rates and stores one per listed country, leaving each
 * country's percentage and on/off exactly as they were. A switched-on
 * country whose rate moved more than 10% keeps charging its current rate;
 * the new one waits for an admin (exchangeRatePlan.ts), and the answer
 * names those countries. A failure stores nothing.
 *
 * Response: 200 { ok, fetchedAt, rates, held: [{ code, name, movePercent }] } | 403 | 500 | 502
 */
export async function POST() {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const outcome = await refreshExchangeRates(admin);
  if (!outcome.ok) {
    if (outcome.status === 502) return NextResponse.json({ error: outcome.error }, { status: 502 });
    return serverError(`country-pricing/refresh ${outcome.error}`, outcome.detail);
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.update",
    targetLabel: "Exchange rates refreshed",
    details: {
      countries: outcome.applied.length,
      source: "open.er-api.com",
      ...(outcome.held.length > 0
        ? { held: outcome.held.map((h) => ({ code: h.code, from: h.current, to: h.rate, movePercent: h.movePercent })) }
        : {}),
    },
  });

  revalidatePath("/", "layout");
  return NextResponse.json({
    ok: true,
    fetchedAt: outcome.fetchedAt,
    rates: Object.fromEntries(outcome.applied.map((u) => [u.code, u.rate])),
    held: outcome.held.map((h) => ({ code: h.code, name: countryInfo(h.code)?.name ?? h.code, movePercent: h.movePercent })),
  });
}
