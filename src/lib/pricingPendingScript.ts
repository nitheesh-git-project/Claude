import { COUNTRY_COOKIE } from "@/lib/countryPricing";
import { DEBUG_COUNTRY_COOKIE, GEO_COOKIE } from "@/lib/countryGeo";

/**
 * Runs in <head> before the first paint: when local prices are on and the
 * visitor's cookies name a country other than India, it marks the page so
 * prices stay hidden until PricingProvider has formatted them. An Indian
 * visitor (and everyone while the feature is off) is never hidden from.
 *
 * A plain module rather than part of PricingProvider: the root layout calls
 * it on the server, and a function exported from a "use client" file cannot
 * be called there.
 */
export function pricingPendingScript(internationalEnabled: boolean): string {
  if (!internationalEnabled) return "";
  return `(function(){try{var c=document.cookie;var m=c.match(/(?:^|; )(?:${DEBUG_COUNTRY_COOKIE}|${COUNTRY_COOKIE}|${GEO_COOKIE})=([A-Z]{2})/);if(m&&m[1]!=="IN"){document.documentElement.dataset.pricingPending="1";setTimeout(function(){delete document.documentElement.dataset.pricingPending},3000)}}catch(e){}})();`;
}
