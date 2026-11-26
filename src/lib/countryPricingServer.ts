import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDebugNavVisible } from "@/lib/debugNavVisible";
import {
  COUNTRY_COOKIE,
  HOME_COUNTRY,
  homeVisitsOfferedIn,
  isPricedLocally,
  resolveCountry,
  type CountryPricing,
} from "@/lib/countryPricing";
import { DEBUG_COUNTRY_COOKIE, GEO_COOKIE, geoCountryFromHeaders } from "@/lib/countryGeo";
import { countryFromStoredPhone } from "@/lib/accountCountry";

// The server's half of pricing outside India. The browser formats prices for
// display (PricingProvider), but nothing it says decides a charge: every
// route that mints an order resolves the country again here, from the
// request itself, and prices from the database's own rows.

export type PricingSettings = {
  /** Master switch: off means every visitor sees and pays rupees. */
  internationalEnabled: boolean;
  /** Whether a visitor may choose their own country. */
  pickerEnabled: boolean;
  /** Whether home visits are offered to visitors outside India. */
  homeVisitOutsideIndia: boolean;
};

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  internationalEnabled: false,
  pickerEnabled: true,
  homeVisitOutsideIndia: false,
};

type PricingRow = {
  country_code: string;
  currency_code: string;
  enabled: boolean;
  markup_percent: number | string;
  units_per_inr: number | string | null;
  rate_fetched_at?: string | null;
};

export function rowToPricing(row: PricingRow): CountryPricing {
  return {
    code: row.country_code,
    currency: row.currency_code,
    enabled: row.enabled,
    markupPercent: Number(row.markup_percent) || 0,
    unitsPerInr: row.units_per_inr === null ? null : Number(row.units_per_inr),
  };
}

/**
 * The switches and every configured row. A database that has not applied
 * this section yet -- or a read that fails -- answers "rupees for
 * everyone", which is exactly how the app behaved before it existed.
 */
export async function readPricingConfig(
  db: SupabaseClient
): Promise<{ settings: PricingSettings; rows: CountryPricing[] }> {
  const [settingsRes, rowsRes] = await Promise.all([
    db
      .from("site_settings")
      .select("international_pricing_enabled, country_picker_enabled, home_visit_outside_india")
      .maybeSingle(),
    db.from("country_pricing").select("country_code, currency_code, enabled, markup_percent, units_per_inr"),
  ]);
  const s = settingsRes.error ? null : (settingsRes.data as Record<string, unknown> | null);
  const settings: PricingSettings = {
    internationalEnabled: s?.international_pricing_enabled === true,
    pickerEnabled: s ? s.country_picker_enabled !== false : DEFAULT_PRICING_SETTINGS.pickerEnabled,
    homeVisitOutsideIndia: s?.home_visit_outside_india === true,
  };
  const rows = rowsRes.error ? [] : ((rowsRes.data ?? []) as PricingRow[]).map(rowToPricing);
  return { settings, rows };
}

type RequestLike = {
  headers: Headers;
  cookies: { get(name: string): { value: string } | undefined };
};

/** The country a request is priced for, by the same rule the browser uses,
 *  with a signed-in patient's own country first (accountCountry.ts). */
export function countryForRequest(
  request: RequestLike,
  settings: PricingSettings,
  accountCountry: string | null = null
): string {
  // The debug bar's country wins while the bar exists -- it is how the owner
  // tests this without a VPN -- and is ignored once the bar is switched off.
  if (isDebugNavVisible()) {
    const forced = request.cookies.get(DEBUG_COUNTRY_COOKIE)?.value;
    if (forced) return resolveCountry({ chosen: forced, detected: null, pickerAllowed: true });
  }
  return resolveCountry({
    account: accountCountry,
    chosen: request.cookies.get(COUNTRY_COOKIE)?.value,
    detected: geoCountryFromHeaders(request.headers) ?? request.cookies.get(GEO_COOKIE)?.value,
    pickerAllowed: settings.pickerEnabled,
  });
}

export type RequestPricing = {
  country: string;
  /** The row prices are made with, or null for rupees. */
  pricing: CountryPricing | null;
  homeVisitsOffered: boolean;
};

/** The country on a patient's account, or null when there is none or it
 *  could not be read -- which falls back to the request's own rule. */
export async function readAccountCountry(db: SupabaseClient, patientId: string | null | undefined): Promise<string | null> {
  if (!patientId) return null;
  try {
    const { data, error } = await db.from("profiles").select("phone").eq("id", patientId).maybeSingle();
    if (error || !data) return null;
    return countryFromStoredPhone((data as { phone: string | null }).phone);
  } catch {
    return null;
  }
}

/**
 * Everything a checkout route needs to price this request. Pass the
 * patient's id whenever the route has one: their account's country then
 * decides, rather than wherever the request happens to come from.
 */
export async function pricingForRequest(
  db: SupabaseClient,
  request: RequestLike,
  opts: { patientId?: string | null } = {}
): Promise<RequestPricing> {
  const [{ settings, rows }, accountCountry] = await Promise.all([
    readPricingConfig(db),
    readAccountCountry(db, opts.patientId),
  ]);
  const country = countryForRequest(request, settings, accountCountry);
  const row = rows.find((r) => r.code === country) ?? null;
  const pricing = settings.internationalEnabled && isPricedLocally(row) ? row : null;
  return {
    country,
    pricing,
    homeVisitsOffered: homeVisitsOfferedIn(country, settings.homeVisitOutsideIndia),
  };
}

export { HOME_COUNTRY };

/**
 * What Catalog -> Countries & currency needs: the switches, each row, and
 * the newest rate's time. Null on a failed read, so the screen can say it
 * could not load rather than show every country as switched off.
 */
export async function readCountryPricingAdmin(db: SupabaseClient): Promise<{
  settings: PricingSettings;
  rows: CountryPricing[];
  ratesFetchedAt: string | null;
} | null> {
  const [settingsRes, rowsRes] = await Promise.all([
    db
      .from("site_settings")
      .select("international_pricing_enabled, country_picker_enabled, home_visit_outside_india")
      .maybeSingle(),
    db
      .from("country_pricing")
      .select("country_code, currency_code, enabled, markup_percent, units_per_inr, rate_fetched_at"),
  ]);
  if (settingsRes.error || rowsRes.error) return null;
  const s = (settingsRes.data ?? {}) as Record<string, unknown>;
  const raw = (rowsRes.data ?? []) as PricingRow[];
  const ratesFetchedAt =
    raw
      .map((r) => r.rate_fetched_at ?? null)
      .filter((t): t is string => !!t)
      .sort()
      .pop() ?? null;
  return {
    settings: {
      internationalEnabled: s.international_pricing_enabled === true,
      pickerEnabled: s.country_picker_enabled !== false,
      homeVisitOutsideIndia: s.home_visit_outside_india === true,
    },
    rows: raw.map(rowToPricing),
    ratesFetchedAt,
  };
}
