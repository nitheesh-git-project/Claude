import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { devContactFromRow, type DevContact } from "@/lib/devReachout";

/**
 * The one row of `site_settings`, read once per request instead of once per
 * caller, and read concurrently rather than one query after another.
 *
 * `site_settings` is a single-row table that almost every surface needs
 * something from: the root layout wants the brand strings, the splash
 * timings and the farewell banner; the booking pages want lead times; the
 * public pages want the home-visit flag. The root layout alone issued four
 * of those reads **sequentially**, so every page in the app -- the marketing
 * homepage included -- paid four serial network hops before it could render
 * a byte. They now run together: the cost of the slowest, not the sum.
 *
 * `cache()` from React dedupes within one request. Two components in the
 * same render that both want the brand strings cause one read, not two. It
 * has no staleness of any kind -- the memo dies with the request.
 *
 * ## Why there is no cross-request cache here
 *
 * There was one, briefly: `unstable_cache` with a `site-settings` tag, which
 * took the cost to zero on a warm cache, with the admin's save dropping the
 * tag so an edit still landed immediately.
 *
 * It was wrong, and the e2e suite said so. Three splash-screen specs change
 * a setting and immediately load the page, and they write **straight to the
 * database** with the service-role client rather than going through
 * `update-setting`. Nothing in Next can know that happened, so no tag is
 * dropped and the page keeps rendering the old greeting until the backstop
 * window expires.
 *
 * That is not a test being awkward. `e2e/README.md` records
 * `home-visit-disabled` as covering "the master switch off, flipped in the
 * **database** rather than through the route -- the case the cache could not
 * survive", so this project has already been bitten by precisely this and
 * left the alarm wired up. Rewriting those specs to suit a new cache would
 * be switching the alarm off.
 *
 * What the cross-request layer actually bought was one parallel round-trip
 * on the 215 dynamic routes -- the 19 public pages are ISR-cached at
 * `revalidate = 300` already, so their HTML, layout included, is reused
 * without re-reading anything. One round-trip is not worth a settings change
 * that silently fails to appear.
 *
 * If it is ever worth revisiting, the honest version invalidates on the
 * *database* changing (`site_settings` is already in the realtime
 * publication) rather than on the app's own route being the one to change
 * it.
 */
/**
 * Each select stays its own query, and that is not an oversight.
 *
 * These columns were added to `site_settings` at different times, and a live
 * database may not have run the newest part of schema.sql yet. PostgREST
 * fails a select naming an unknown column **outright**, so folding all of
 * these into one query would mean a database missing `splash_phrase` -- the
 * newest column here -- returns nothing for the site name either, and every
 * page in the app renders with the fallback brand. Keeping them apart means
 * one missing column costs exactly the group it belongs to.
 *
 * What changed is that they no longer run one after another. `Promise.all`
 * costs the slowest of the five rather than the sum, and the isolation is
 * untouched: each still fails on its own.
 */
const BRAND_COLUMNS =
  "site_name, site_tagline, site_description, contact_email, whatsapp_number, contact_phone, footer_copyright_text";
const SPLASH_COLUMNS =
  "splash_enabled, splash_brand_line, splash_phrase, splash_hold_seconds, splash_revisit_minutes";
const DEV_CONTACT_COLUMNS = "dev_contact_enabled, dev_contact_email";

export type LayoutBrandRow = {
  site_name?: string | null;
  site_tagline?: string | null;
  site_description?: string | null;
  contact_email?: string | null;
  whatsapp_number?: string | null;
  contact_phone?: string | null;
  footer_copyright_text?: string | null;
};

export type LayoutSettingsRow = {
  brand: LayoutBrandRow | null;
  homeVisit: { home_visit_enabled?: boolean | null } | null;
  farewell: { farewell_banner_seconds?: number | null } | null;
  splash: {
    splash_enabled?: boolean | null;
    splash_brand_line?: string | null;
    splash_phrase?: string | null;
    splash_hold_seconds?: number | null;
    splash_revisit_minutes?: number | null;
  } | null;
  /** The developer credit's two switches. Its own group: these are the
   *  newest columns here, so a database that has not applied them yet loses
   *  the credit line and nothing else. */
  devContact: DevContactRow | null;
};

export type DevContactRow = {
  dev_contact_enabled?: boolean | null;
  dev_contact_email?: string | null;
};

async function readLayoutSettings(): Promise<LayoutSettingsRow> {
  const supabase = createPublicClient();

  const [brand, homeVisit, farewell, splash, devContact] = await Promise.all([
    supabase.from("site_settings").select(BRAND_COLUMNS).maybeSingle(),
    supabase.from("site_settings").select("home_visit_enabled").maybeSingle(),
    supabase.from("site_settings").select("farewell_banner_seconds").maybeSingle(),
    supabase.from("site_settings").select(SPLASH_COLUMNS).maybeSingle(),
    supabase.from("site_settings").select(DEV_CONTACT_COLUMNS).maybeSingle(),
  ]);

  return {
    brand: (brand.data as LayoutSettingsRow["brand"]) ?? null,
    homeVisit: (homeVisit.data as LayoutSettingsRow["homeVisit"]) ?? null,
    farewell: (farewell.data as LayoutSettingsRow["farewell"]) ?? null,
    splash: (splash.data as LayoutSettingsRow["splash"]) ?? null,
    devContact: (devContact.data as LayoutSettingsRow["devContact"]) ?? null,
  };
}

/**
 * The five groups the root layout needs, in one call, deduped within the
 * request. Returns nulls rather than throwing when a group's columns do not
 * exist yet -- the callers already fall back to the defaults in
 * adminSettings.ts and splashScreen.ts.
 */
export const getLayoutSettings = cache(readLayoutSettings);

/**
 * The developer credit's switch and published address, with the defaults
 * applied. Used by the footer's layout and by both /developer pages and the
 * reachout route, so all of them answer the same question the same way.
 */
export async function getDevContact(): Promise<DevContact> {
  const { devContact } = await getLayoutSettings();
  return devContactFromRow(devContact);
}
