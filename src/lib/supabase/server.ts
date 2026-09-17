import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { IMPERSONATION_COOKIE, isExpired, parseMarker } from "@/lib/impersonation";

/**
 * The signed-in user's own client, for server components and route
 * handlers.
 *
 * It withholds the Supabase auth cookies when an impersonation window has
 * lapsed, and that is load-bearing. The window was enforced in one place --
 * `updateSession` in proxy.ts -- and `src/proxy.ts`'s matcher covers the
 * four `/dashboard/:path*` trees and nothing else. So the expiry only ever
 * fired on a dashboard *page* navigation: past thirty minutes the swapped
 * Supabase session was still perfectly valid, and every one of the ~170 API
 * routes went on accepting it. An admin who opened a patient's account and
 * left the tab could still act as that patient indefinitely, as long as
 * they never navigated.
 *
 * Doing it here rather than at each route is deliberate. This is the one
 * function every authenticated server-side read goes through, so the check
 * cannot be forgotten by a route written next week -- the same reasoning
 * that put the "only ever creates" refusal inside
 * `createMeetEventForConfirmedAppointment` rather than in each of its
 * callers.
 *
 * Withholding the cookies rather than throwing means `auth.getUser()`
 * simply returns no user, which every caller already handles as "not
 * signed in". A lapsed window degrades to signed-out, which is the safe
 * direction, and the proxy still performs the real sign-out and the cookie
 * cleanup on the next dashboard request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  const marker = parseMarker(cookieStore.get(IMPERSONATION_COOKIE)?.value);
  const impersonationLapsed = !!marker && isExpired(marker, Date.now());

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const all = cookieStore.getAll();
          if (!impersonationLapsed) return all;
          // Supabase's own cookies are the `sb-*` ones. Dropping them is
          // what turns a lapsed window into "nobody is signed in" without
          // touching the marker, which the proxy still needs to find so it
          // can sign out and clear properly.
          return all.filter((cookie) => !cookie.name.startsWith("sb-"));
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component; safe to ignore
            // because the proxy refreshes the session on every request.
          }
        },
      },
    }
  );
}
