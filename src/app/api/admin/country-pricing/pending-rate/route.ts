import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { countryInfo, HOME_COUNTRY } from "@/lib/countryPricing";
import { rateMovePercent } from "@/lib/exchangeRatePlan";

type Body = { code?: unknown; decision?: unknown };

/**
 * Catalog -> Countries & currency: a new exchange rate that would have moved
 * a switched-on country's price by more than 10% waits here
 * (exchangeRatePlan.ts). "Use the new rate" makes it the rate that country
 * is charged with; "Keep the current rate" drops it, and the next refresh
 * asks again if the move is still that big.
 *
 * `catalog` scope, like the rest of the screen: this decides what a patient
 * is charged. The rate itself is never taken from the body -- only the one
 * the refresh stored.
 *
 * Response: 200 { ok } | 400 | 403 | 404 (nothing pending) | 409 | 500
 */
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data: body, error: parseError } = await parseJsonBody<Body>(request);
  if (parseError) return parseError;

  const code = typeof body.code === "string" ? body.code.toUpperCase() : "";
  const info = countryInfo(code);
  if (!info || code === HOME_COUNTRY) {
    return NextResponse.json({ error: "That is not a country this screen lists." }, { status: 400 });
  }
  if (body.decision !== "apply" && body.decision !== "keep") {
    return NextResponse.json({ error: 'decision must be "apply" or "keep".' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error: readError } = await admin
    .from("country_pricing")
    .select("units_per_inr, pending_units_per_inr, pending_rate_fetched_at")
    .eq("country_code", code)
    .maybeSingle();
  if (readError) return serverError("country-pricing/pending-rate read", readError);
  const pending = row?.pending_units_per_inr === null || row?.pending_units_per_inr === undefined ? null : Number(row.pending_units_per_inr);
  if (!row || pending === null) {
    return NextResponse.json({ error: `${info.name} has no new rate waiting. Refresh the page.` }, { status: 404 });
  }
  const current = row.units_per_inr === null ? null : Number(row.units_per_inr);

  const now = new Date().toISOString();
  const update =
    body.decision === "apply"
      ? {
          units_per_inr: pending,
          rate_fetched_at: row.pending_rate_fetched_at ?? now,
          pending_units_per_inr: null,
          pending_rate_fetched_at: null,
          updated_at: now,
        }
      : { pending_units_per_inr: null, pending_rate_fetched_at: null, updated_at: now };
  // Guarded on the pending rate this read saw, so two admins deciding at
  // once cannot apply a rate the other already dropped.
  const { data: written, error } = await admin
    .from("country_pricing")
    .update(update)
    .eq("country_code", code)
    .eq("pending_units_per_inr", row.pending_units_per_inr)
    .select("country_code");
  if (error) return serverError("country-pricing/pending-rate write", error);
  if (!written || written.length === 0) {
    return NextResponse.json({ error: "Someone else has just decided this one. Refresh the page." }, { status: 409 });
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.update",
    targetLabel: `${info.name}: ${body.decision === "apply" ? "new exchange rate used" : "current exchange rate kept"}`,
    details: {
      country: code,
      decision: body.decision,
      before: { unitsPerInr: current },
      after: { unitsPerInr: body.decision === "apply" ? pending : current },
      ...(current ? { movePercent: rateMovePercent(current, pending) } : {}),
    },
  });

  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
