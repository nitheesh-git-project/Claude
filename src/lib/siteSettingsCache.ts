import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

/**
 * The one row of `site_settings`, read once instead of once per caller.
 *
 * `site_settings` is a single-row table that almost every surface in the app
 * needs something from: the root layout wants the brand strings, the splash
 * timings and the farewell banner; the booking pages want lead times; the
 * public pages want the home-visit flag. Before this module each of those
 * issued its own PostgREST round-trip, and the root layout alone issued
 * four of them one after another -- so every page in the app, including the
 * marketing homepage, paid four serial network hops before it could render
 * a single byte.
 *
 * Two layers of caching sit here, and they do different jobs:
 *
 * 1. `cache()` from React dedupes within **one** request. Two components in
 *    the same render that both want the brand strings make one query, not
 *    two. This is free and has no staleness of any kind -- the memo dies
 *    with the request.
 * 2. `unstable_cache` reuses the result **across** requests, keyed by the
 *    `SITE_SETTINGS_TAG` below. This is the layer that takes the cost to
 *    zero for the overwhelming majority of page loads.
 *
 * `unstable_cache` rather than Next 16's `"use cache"` directive
 * deliberately: `"use cache"` requires `cacheComponents: true` in
 * next.config.ts, which changes caching semantics for every route in the
 * app at once. That is a migration, not a performance fix, and it is not
 * something to flip underneath a payment flow. `unstable_cache` is
 * superseded but fully supported in 16, and it is scoped to exactly the
 * reads we want cached.
 *
 * **Admin edits are not delayed by this.** `revalidateTag(SITE_SETTINGS_TAG)`
 * in the update-setting route drops the entry the moment a setting changes,
 * so the next read is fresh. The `revalidate` window below is only a
 * backstop for a write that somehow misses the tag -- a setting changed
 * directly in the Supabase dashboard, say.
 */
export const SITE_SETTINGS_TAG = "site-settings";

/**
 * Backstop only. The tag above is the real invalidation path; this bounds
 * how long a change made outside the app (straight into the database) can
 * go unnoticed.
 */
const SITE_SETTINGS_TTL_SECONDS = 300;

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
 * costs the slowest of the four rather than the sum, and the isolation is
 * untouched: each still fails on its own.
 */
const BRAND_COLUMNS =
  "site_name, site_tagline, site_description, contact_email, whatsapp_number, contact_phone, footer_copyright_text";
const SPLASH_COLUMNS =
  "splash_enabled, splash_brand_line, splash_phrase, splash_hold_seconds, splash_revisit_minutes";

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
};

async function readLayoutSettings(): Promise<LayoutSettingsRow> {
  const supabase = createPublicClient();

  const [brand, homeVisit, farewell, splash] = await Promise.all([
    supabase.from("site_settings").select(BRAND_COLUMNS).maybeSingle(),
    supabase.from("site_settings").select("home_visit_enabled").maybeSingle(),
    supabase.from("site_settings").select("farewell_banner_seconds").maybeSingle(),
    supabase.from("site_settings").select(SPLASH_COLUMNS).maybeSingle(),
  ]);

  return {
    brand: (brand.data as LayoutSettingsRow["brand"]) ?? null,
    homeVisit: (homeVisit.data as LayoutSettingsRow["homeVisit"]) ?? null,
    farewell: (farewell.data as LayoutSettingsRow["farewell"]) ?? null,
    splash: (splash.data as LayoutSettingsRow["splash"]) ?? null,
  };
}

const readLayoutSettingsCached = unstable_cache(
  readLayoutSettings,
  ["site-settings:layout"],
  { tags: [SITE_SETTINGS_TAG], revalidate: SITE_SETTINGS_TTL_SECONDS }
);

/**
 * The four groups the root layout needs, in one call, cached across
 * requests and deduped within one. Returns nulls rather than throwing when
 * a group's columns do not exist yet -- the callers already fall back to
 * the defaults in adminSettings.ts and splashScreen.ts.
 */
export const getLayoutSettings = cache(
  async (): Promise<LayoutSettingsRow> => readLayoutSettingsCached()
);
