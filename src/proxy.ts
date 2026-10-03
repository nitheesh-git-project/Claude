import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { IMPERSONATION_COOKIE } from "@/lib/impersonation";
import { isImpersonatedWrite, recordImpersonatedWrite } from "@/lib/impersonationAudit";

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
  return updateSession(request);
}

export const config = {
  matcher: [
    "/patient/dashboard/:path*",
    "/therapist/dashboard/:path*",
    "/admin/dashboard/:path*",
    "/hospital/dashboard/:path*",
    "/api/:path*",
  ],
};
