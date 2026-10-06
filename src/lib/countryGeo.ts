// Where a request comes from, as the hosting platform reports it. Read by
// the proxy (to hand the browser its country in a cookie it can read) and by
// the checkout routes (which price from the request, never the browser).
// Edge-safe: no Node APIs, no database.

import { normaliseCountryCode } from "@/lib/countryPricing";

/** The cookie the proxy writes with the detected country. Readable by the
 *  page's script, so a statically cached page can still price per visitor. */
export const GEO_COOKIE = "mr_geo";

/** The debug bar's country override. Honoured only while the debug bar is
 *  visible (isDebugNavVisible), on both the server and the browser. */
export const DEBUG_COUNTRY_COOKIE = "mr_debug_country";

// Vercel, Cloudflare and a generic proxy, in that order. Each is set by the
// platform in front of the app; a visitor can only influence them by being
// somewhere else, which is the point.
const GEO_HEADERS = ["x-vercel-ip-country", "cf-ipcountry", "x-country-code"];

export function geoCountryFromHeaders(headers: Headers): string | null {
  for (const name of GEO_HEADERS) {
    const code = normaliseCountryCode(headers.get(name));
    // Cloudflare reports "XX" for unknown and "T1" for Tor.
    if (code && code !== "XX" && code !== "T1") return code;
  }
  return null;
}
