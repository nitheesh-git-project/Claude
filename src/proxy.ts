import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { IMPERSONATION_COOKIE } from "@/lib/impersonation";
import { isImpersonatedWrite, recordImpersonatedWrite } from "@/lib/impersonationAudit";
import { GEO_COOKIE, geoCountryFromHeaders } from "@/lib/countryGeo";

const DASHBOARD_PREFIXES = ["/patient/dashboard", "/therapist/dashboard", "/admin/dashboard", "/hospital/dashboard"];

/**
 * Hands the browser the country the hosting platform says this request came
 * from, in a cookie its script can read. Public pages are statically cached,
 * so the server cannot price them per visitor; the page's own script reads
 * this and formats prices in the visitor's currency (PricingProvider).
 * Written only when it is missing or has changed, and never decides a
 * charge -- checkout routes read the header again themselves.
 */
function withGeoCookie(request: NextRequest, response: NextResponse): NextResponse {
  const detected = geoCountryFromHeaders(request.headers);
  if (detected && request.cookies.get(GEO_COOKIE)?.value !== detected) {
    response.cookies.set(GEO_COOKIE, detected, {
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  // API routes pass straight through -- they do their own auth -- and the
  // proxy only looks at them for one thing: a change made while an admin is
  // signed in as somebody else, which is recorded under the admin off the
  // response path. With no marker cookie this is a cookie read and nothing
  // else. See src/lib/impersonationAudit.ts.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    if (
      isImpersonatedWrite(
        request.method,
        request.nextUrl.pathname,
        request.cookies.has(IMPERSONATION_COOKIE)
      )
    ) {
      event.waitUntil(recordImpersonatedWrite(request));
    }
    return NextResponse.next();
  }
  const path = request.nextUrl.pathname;
  if (DASHBOARD_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return withGeoCookie(request, await updateSession(request));
  }
  // Every other page: nothing but the country cookie.
  return withGeoCookie(request, NextResponse.next());
}

export const config = {
  matcher: [
    "/patient/dashboard/:path*",
    "/therapist/dashboard/:path*",
    "/admin/dashboard/:path*",
    "/hospital/dashboard/:path*",
    "/api/:path*",
    // Every other page, for the country cookie only -- not Next's own
    // assets, not a file with an extension, not the API (listed above).
    "/((?!_next/|api/|.*\\..*).*)",
  ],
};
