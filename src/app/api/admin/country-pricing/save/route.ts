import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { countryInfo, HOME_COUNTRY, isValidMarkup, MAX_MARKUP_PERCENT } from "@/lib/countryPricing";

type RowInput = { code?: unknown; markupPercent?: unknown; enabled?: unknown };
type Body = {
  rows?: RowInput[];
  settings?: {
    internationalEnabled?: unknown;
    pickerEnabled?: unknown;
    homeVisitOutsideIndia?: unknown;
  };
};

const SETTING_COLUMNS = {
  internationalEnabled: "international_pricing_enabled",
  pickerEnabled: "country_picker_enabled",
  homeVisitOutsideIndia: "home_visit_outside_india",
} as const;

/**
 * Catalog -> Countries & currency: saves the percentage and the on/off of
 * the countries the admin changed, and any of the three switches.
 *
 * `catalog` scope: this decides what a patient is charged, which is what
 * the rest of the Catalog section does. The rate is not accepted here -- it
 * only ever comes from the refresh route -- so nothing typed on this screen
 * can set the exchange rate a charge is made with.
 */
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("catalog");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { data: body, error: parseError } = await parseJsonBody<Body>(request);
  if (parseError) return parseError;

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length > 300) {
    return NextResponse.json({ error: "Too many countries in one save." }, { status: 400 });
  }

  const cleaned: { code: string; currency: string; markup: number; enabled: boolean }[] = [];
  for (const row of rows) {
    const code = typeof row.code === "string" ? row.code.toUpperCase() : "";
    const info = countryInfo(code);
    if (!info || code === HOME_COUNTRY) {
      return NextResponse.json({ error: `"${String(row.code)}" is not a country this screen lists.` }, { status: 400 });
    }
    if (!isValidMarkup(row.markupPercent)) {
      return NextResponse.json(
        { error: `${info.name}: the increase must be a number from 0 to ${MAX_MARKUP_PERCENT}%.` },
        { status: 400 }
      );
    }
    if (typeof row.enabled !== "boolean") {
      return NextResponse.json({ error: `${info.name}: "enabled" must be true or false.` }, { status: 400 });
    }
    cleaned.push({
      code,
      currency: info.currency,
      markup: Math.round(row.markupPercent * 100) / 100,
      enabled: row.enabled,
    });
  }

  const settingsUpdate: Record<string, boolean> = {};
  for (const [key, column] of Object.entries(SETTING_COLUMNS)) {
    const value = body.settings?.[key as keyof typeof SETTING_COLUMNS];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      return NextResponse.json({ error: `${key} must be true or false.` }, { status: 400 });
    }
    settingsUpdate[column] = value;
  }

  if (cleaned.length === 0 && Object.keys(settingsUpdate).length === 0) {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }

  const admin = createAdminClient();

  if (cleaned.length > 0) {
    // A country cannot be switched on before it has a rate. The table's own
    // check says so too; asking first turns a constraint error into a
    // sentence that names the country.
    const { data: existing, error: readError } = await admin
      .from("country_pricing")
      .select("country_code, units_per_inr")
      .in(
        "country_code",
        cleaned.map((c) => c.code)
      );
    if (readError) return serverError("country-pricing/save read", readError);
    const rated = new Set(
      (existing ?? []).filter((r) => r.units_per_inr !== null).map((r) => r.country_code as string)
    );
    const unrated = cleaned.filter((c) => c.enabled && !rated.has(c.code));
    if (unrated.length > 0) {
      const names = unrated.map((c) => countryInfo(c.code)!.name).join(", ");
      return NextResponse.json(
        { error: `${names} ${unrated.length === 1 ? "has" : "have"} no exchange rate yet. Refresh the rates, then switch ${unrated.length === 1 ? "it" : "them"} on.` },
        { status: 400 }
      );
    }

    // Updated in place, not upserted. Postgres checks a CHECK constraint on
    // the row an INSERT proposes *before* it resolves the conflict, so an
    // upsert that leaves the rate out reads as "switched on with no rate"
    // and is refused even for a country that has one. A country with no row
    // yet is inserted -- and the check above has already made sure it is
    // not being switched on.
    const known = new Set((existing ?? []).map((r) => r.country_code as string));
    const now = new Date().toISOString();
    const fresh = cleaned.filter((c) => !known.has(c.code));
    const results = await Promise.all([
      ...cleaned
        .filter((c) => known.has(c.code))
        .map((c) =>
          admin
            .from("country_pricing")
            .update({ markup_percent: c.markup, enabled: c.enabled, updated_at: now })
            .eq("country_code", c.code)
        ),
      ...(fresh.length > 0
        ? [
            admin.from("country_pricing").insert(
              fresh.map((c) => ({
                country_code: c.code,
                currency_code: c.currency,
                markup_percent: c.markup,
                enabled: c.enabled,
                updated_at: now,
              }))
            ),
          ]
        : []),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) return serverError("country-pricing/save write", failed.error);
  }

  if (Object.keys(settingsUpdate).length > 0) {
    const { error } = await admin.from("site_settings").update(settingsUpdate).eq("id", true);
    if (error) return serverError("country-pricing/save settings", error);
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "catalog.update",
    targetLabel: "Countries & currency",
    details: {
      countries: cleaned.map((c) => ({ code: c.code, markupPercent: c.markup, enabled: c.enabled })),
      settings: settingsUpdate,
    },
  });

  // Public pages are statically cached with the pricing in their layout.
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
