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
