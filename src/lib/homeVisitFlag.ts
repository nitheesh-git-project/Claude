import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { homeVisitRatesFor } from "@/lib/homeVisitRates";
import { loadHomeVisitPriceRows } from "@/lib/homeVisitRatesServer";
import {
  NO_HOME_VISIT_OFFER,
  resolveHomeVisitOffer,
  type HomeVisitAreaRow,
  type HomeVisitOffer,
} from "@/lib/homeVisitOffer";
import {
  DEFAULT_ADMIN_SETTINGS,
  parseBookingLanguages,
  parseEnabledIntakeSpecialties,
} from "@/lib/adminSettings";
import type { ConditionSpecialty } from "@/lib/conditionSpecialty";

/**
 * Whether the clinic currently sells home visits.
 *
 * Every public page needs this now, because every public page ends in the
 * connector strip and that strip must not link to /home-visit while the page
 * behind it 404s. Kept in one function rather than copied into seven pages so
 * the isolated-read reasoning below lives in one place.
 *
 * Read on its own and never merged into a page's other selects: the column is
 * migration-dependent, and a database that has not re-run schema.sql should
 * lose one card from one strip rather than blank whichever query it was
 * bundled into. Fails closed - an unreadable flag hides the mode instead of
 * advertising one the clinic cannot deliver.
 */
export async function readHomeVisitEnabled(): Promise<boolean> {
  const { data } = await createPublicClient()
    .from("site_settings")
    .select("home_visit_enabled")
    .maybeSingle();
  return data?.home_visit_enabled === true;
}

/**
 * The specialties whose health profile the clinic offers, for the public
 * showcase on /how-it-works and the home page. Its own query like the flag
 * above; a read that fails falls back to the default list rather than
 * hiding the showcase (it describes the product, it grants nothing).
 */
export async function readEnabledIntakeSpecialties(): Promise<ConditionSpecialty[]> {
  const { data } = await createPublicClient()
    .from("site_settings")
    .select("enabled_intake_specialties")
    .maybeSingle();
  return parseEnabledIntakeSpecialties(data?.enabled_intake_specialties);
}

/** The languages a patient may ask for at booking, for the public pages that
 *  name them (Why choose us). Same fallback rule as the booking form. */
export async function readBookingLanguages(): Promise<string[]> {
  const { data } = await createPublicClient()
    .from("site_settings")
    .select("booking_languages")
    .maybeSingle();
  return parseBookingLanguages(data?.booking_languages);
}

/**
 * The two online-booking rules the public pages quote: how much notice a
 * booking needs, and how far ahead a cancellation still refunds in full.
 * Both are admin settings (Feature Control), so a sentence that names them
 * reads the setting -- "12 hours' notice" typed into a page goes stale the
 * day somebody changes the setting. Its own query for the usual
 * migration-tolerance reason; a failed read falls back to the defaults the
 * booking wizard itself falls back to.
 */
export async function readOnlineBookingRules(): Promise<{
  leadTimeHours: number;
  refundHours: number;
}> {
  const { data } = await createPublicClient()
    .from("site_settings")
    .select("online_booking_lead_time_hours, online_cancellation_refund_hours")
    .maybeSingle();
  return {
    leadTimeHours:
      typeof data?.online_booking_lead_time_hours === "number"
        ? data.online_booking_lead_time_hours
        : DEFAULT_ADMIN_SETTINGS.onlineBookingLeadTimeHours,
    refundHours:
      typeof data?.online_cancellation_refund_hours === "number"
        ? data.online_cancellation_refund_hours
        : DEFAULT_ADMIN_SETTINGS.onlineCancellationRefundHours,
  };
}

/**
 * The two facts besides the switch that decide whether a home visit can be
 * sold: whether any area is served, and whether any condition has a price.
 * `null` for either means that read failed ("could not check"), which
 * `resolveHomeVisitOffer` does not count against the service.
 *
 * Public reads only: `home_visit_areas` shows active rows to anyone, and
 * `home_visit_packages` the same (the `select_active` policies), which is why
 * this can sit in the root layout. Each read is its own query for the usual
 * migration-tolerance reason.
 */
export async function loadHomeVisitSupply(): Promise<{
  areas: HomeVisitAreaRow[] | null;
  hasPrice: boolean | null;
}> {
  const client = createPublicClient();
  try {
    const [areasRead, priceRows, categoriesRead] = await Promise.all([
      client.from("home_visit_areas").select("city, area_name").eq("active", true),
      loadHomeVisitPriceRows(client),
      client.from("treatment_categories").select("id").eq("active", true),
    ]);
    return {
      areas: areasRead.error ? null : ((areasRead.data ?? []) as HomeVisitAreaRow[]),
      hasPrice:
        !priceRows || categoriesRead.error
          ? null
          : homeVisitRatesFor((categoriesRead.data ?? []) as { id: string }[], priceRows).length > 0,
    };
  } catch {
    return { areas: null, hasPrice: null };
  }
}

/**
 * Whether the public site may sell home visits, and what it may say when it
 * may not -- see homeVisitOffer.ts. One call for the pages; the root layout
 * resolves the same thing from the switch it has already read.
 *
 * Distinct from `readHomeVisitEnabled`, which stays the bare switch: the
 * referral route gates on that one, and a gate must not quietly become
 * stricter because a marketing page learned to be honest.
 */
export const readHomeVisitOffer = cache(async (): Promise<HomeVisitOffer> => {
  const enabled = await readHomeVisitEnabled();
  if (!enabled) return NO_HOME_VISIT_OFFER;
  const supply = await loadHomeVisitSupply();
  return resolveHomeVisitOffer({ enabled, ...supply });
});

/** True when the public site may link to and sell home visits. */
export async function readHomeVisitBookable(): Promise<boolean> {
  return (await readHomeVisitOffer()).state === "live";
}
