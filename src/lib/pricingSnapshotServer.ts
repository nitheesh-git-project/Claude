import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CountryPricing } from "@/lib/countryPricing";

/**
 * Records how a booking was priced: the Indian list price before country
 * pricing raised it, and the country, currency and markup it was raised by.
 * The therapist's share is worked out on that Indian price (shareBase.ts).
 *
 * Its own write, after the one that saved the price, and best-effort: the
 * columns are newer than every route that prices, and folding them into the
 * order's own update would let a database that has not run the migration
 * refuse a payment over a bookkeeping column. A row without them pays the
 * share on the whole amount, exactly as before -- logged, never fatal.
 */
export async function recordPricingSnapshot(
  admin: SupabaseClient,
  appointmentId: string,
  quote: { homeListPricePaise: number; listPricePaise: number; pricing: CountryPricing | null }
): Promise<void> {
  const priced = quote.pricing && quote.listPricePaise !== quote.homeListPricePaise;
  try {
    const { error } = await admin
      .from("appointments")
      .update({
        home_list_price_paise: priced ? quote.homeListPricePaise : null,
        pricing_country: priced ? quote.pricing!.code : null,
        pricing_currency: priced ? quote.pricing!.currency : null,
        pricing_markup_percent: priced ? quote.pricing!.markupPercent : null,
      })
      .eq("id", appointmentId);
    if (error) console.error("recordPricingSnapshot failed", appointmentId, error.message);
  } catch (err) {
    console.error("recordPricingSnapshot threw", appointmentId, err);
  }
}

/**
 * The same facts on an online programme purchase (care-plan create-order).
 * Best-effort, for the same reason: a missing column must not stop a
 * checkout. `homeListPricePaise` is the programme's Indian price.
 */
export async function recordPurchasePricingSnapshot(
  admin: SupabaseClient,
  purchaseId: string,
  facts: { homeListPricePaise: number; listPricePaise: number; pricing: CountryPricing | null }
): Promise<void> {
  const priced = facts.pricing && facts.listPricePaise !== facts.homeListPricePaise;
  try {
    const { error } = await admin
      .from("patient_package_purchases")
      .update({
        home_list_price_paise: priced ? facts.homeListPricePaise : null,
        pricing_country: priced ? facts.pricing!.code : null,
        pricing_currency: priced ? facts.pricing!.currency : null,
        pricing_markup_percent: priced ? facts.pricing!.markupPercent : null,
      })
      .eq("id", purchaseId);
    if (error) console.error("recordPurchasePricingSnapshot failed", purchaseId, error.message);
  } catch (err) {
    console.error("recordPurchasePricingSnapshot threw", purchaseId, err);
  }
}

/**
 * A programme session's share of how its purchase was priced: the list and
 * Indian prices divided by the session count, and the country and markup.
 * Copied onto the session after it is inserted (bookPackageSession), so the
 * therapist's share and System Health read it like any single session.
 * Best-effort and silent on a purchase priced in rupees or a database
 * without the columns.
 */
export async function copyPurchasePricingToSession(
  admin: SupabaseClient,
  appointmentId: string,
  purchase: { id: string; session_count: number }
): Promise<void> {
  try {
    const { data, error } = await admin
      .from("patient_package_purchases")
      .select("list_price_paise, home_list_price_paise, pricing_country, pricing_currency, pricing_markup_percent")
      .eq("id", purchase.id)
      .maybeSingle();
    if (error || !data || data.home_list_price_paise === null || !data.list_price_paise) return;
    const count = Math.max(1, purchase.session_count);
    const { error: writeError } = await admin
      .from("appointments")
      .update({
        list_price_paise: Math.round(data.list_price_paise / count),
        home_list_price_paise: Math.round(data.home_list_price_paise / count),
        pricing_country: data.pricing_country,
        pricing_currency: data.pricing_currency,
        pricing_markup_percent: data.pricing_markup_percent,
      })
      .eq("id", appointmentId);
    if (writeError) console.error("copyPurchasePricingToSession failed", appointmentId, writeError.message);
  } catch (err) {
    console.error("copyPurchasePricingToSession threw", appointmentId, err);
  }
}
