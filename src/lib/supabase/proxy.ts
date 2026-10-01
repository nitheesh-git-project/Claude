import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_RESTORE_COOKIE,
  IMPERSONATION_COOKIE,
  isExpired,
  parseMarker,
} from "@/lib/impersonation";
import { resilientSupabaseFetch } from "./resilientFetch";
import {
  PROFILE_CACHE_COOKIE,
  PROFILE_CACHE_TTL_SECONDS,
  issueProfileCookie,
  readProfileCookie,
  type CachedProfile,
} from "@/lib/proxyProfileCache";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: resilientSupabaseFetch },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // An impersonation window ends here, not in the browser.
  //
  // The marker cookie and the Supabase session cookies are separate things:
  // if the marker were left to expire on its own max-age, the banner would
  // vanish while the swap ran on underneath it -- an admin still signed in as
  // a patient with nothing on screen saying so. So the window is checked on
  // every dashboard request, and passing it signs the session out rather than
  // quietly forgetting it. A forgotten tab is an open window into somebody's
  // health record, and the safe direction for one is closed.
  const marker = parseMarker(request.cookies.get(IMPERSONATION_COOKIE)?.value);
  if (marker && isExpired(marker, Date.now())) {
    await supabase.auth.signOut();
    const expired = redirectTo("/admin/login?expired=impersonation");
    expired.cookies.delete(IMPERSONATION_COOKIE);
    expired.cookies.delete(ADMIN_RESTORE_COOKIE);
    // The cached profile belongs to whoever was signed in a moment ago --
    // during an impersonation window, the patient being impersonated. It
    // must not outlive the session it describes, and the admin coming back
    // must not inherit it.
    expired.cookies.delete(PROFILE_CACHE_COOKIE);
    return expired;
  }

  // Every redirect below has to be built through this rather than a bare
  // NextResponse.redirect. getUser() above refreshes an expired access
  // token, and @supabase/ssr hands the new tokens back through the setAll
  // callback, which writes them onto `response` -- a brand-new redirect
  // response carries none of them, so those cookies are lost while the
  // refresh token that produced them has already been consumed. The user
  // ends up bounced to the login page with a session the browser can no
  // longer refresh: they sign in, get redirected straight back to signing
  // in, and repeat. It bites hardest right after an idle timeout, when the
  // access token is guaranteed to be stale on the very next request.
  function redirectTo(destination: string) {
    const redirect = NextResponse.redirect(new URL(destination, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  if (path.startsWith("/patient/dashboard") && !user) {
    return redirectTo("/patient/login");
  }

  if (path.startsWith("/therapist/dashboard") && !user) {
    return redirectTo("/therapist/login");
  }

  if (path.startsWith("/admin/dashboard") && !user) {
    return redirectTo("/admin/login");
  }

  if (path.startsWith("/hospital/dashboard") && !user) {
    return redirectTo("/hospital/login");
  }

  if (
    user &&
    (path.startsWith("/patient/dashboard") ||
      path.startsWith("/therapist/dashboard") ||
      path.startsWith("/admin/dashboard") ||
      path.startsWith("/hospital/dashboard"))
  ) {
    // Signed, 60-second cache of exactly the three fields gated on below.
    // This read used to run on every request under these four trees --
    // every client-side navigation included -- asking the same question and
    // getting the same answer while somebody clicked around. The signature
    // is what makes trusting a cookie here safe, and the user id inside it
    // is what stops one account's cached answer being replayed for another.
    // See src/lib/proxyProfileCache.ts for the full reasoning and the
    // freshness trade-off this accepts.
    let profile: CachedProfile | null = await readProfileCookie(
      request.cookies.get(PROFILE_CACHE_COOKIE)?.value,
      user.id
    );

    if (!profile) {
      let { data: row } = await supabase
        .from("profiles")
        .select("role, approved, active")
        .eq("id", user.id)
        .single();

      // The signup trigger guarantees a profiles row exists for every
      // authenticated user, so a null result here right after sign-in is a
      // transient read (not a real "no such profile") - worth one retry
      // before treating it as a genuine role mismatch and bouncing an
      // already-valid user out to /get-started.
      if (!row) {
        ({ data: row } = await supabase
          .from("profiles")
          .select("role, approved, active")
          .eq("id", user.id)
          .single());
      }

      if (row) {
        profile = {
          role: String(row.role),
          approved: row.approved === true,
          active: row.active === true,
        };
        // Only a real read is cached. A failed one is "we could not check",
        // and caching that would turn one transient error into a minute of
        // them -- the check-that-could-not-be-run rule in CLAUDE.md.
        const cookie = await issueProfileCookie(user.id, profile);
        if (cookie) {
          response.cookies.set(PROFILE_CACHE_COOKIE, cookie, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: PROFILE_CACHE_TTL_SECONDS,
          });
        }
      }
    }

    if (path.startsWith("/therapist/dashboard")) {
      if (profile?.role !== "therapist") {
        return redirectTo("/get-started");
      }
      if (!profile.approved) {
        return redirectTo("/pending-approval");
      }
      if (!profile.active) {
        return redirectTo("/account-suspended");
      }
    }

    if (path.startsWith("/patient/dashboard")) {
      if (profile?.role !== "patient") {
        return redirectTo("/get-started");
      }
      // Same gate as the therapist branch above: a patient account is not
      // usable until an admin approves it from the dashboard's Pending
      // Approvals list.
      if (!profile.approved) {
        return redirectTo("/pending-approval");
      }
      if (!profile.active) {
        return redirectTo("/account-suspended");
      }
    }

    // /get-started, not /admin/login: bouncing a signed-in patient or
    // therapist to the admin login page confirms there is one and names it.
    // They are already authenticated, so the login page is no use to them
    // anyway -- the only thing it does is advertise the back office. An
    // unauthenticated visitor still goes to /admin/login above, since that
    // is the real admin's way in.
    if (path.startsWith("/admin/dashboard")) {
      if (profile?.role !== "admin") {
        return redirectTo("/get-started");
      }
      // Same suspension gate the other three roles have had all along. The
      // admin branch used to check role alone, so flipping profiles.active
      // on an admin took nothing away -- see getAdminUser for why `approved`
      // is deliberately not checked for this one role.
      if (!profile.active) {
        return redirectTo("/account-suspended");
      }
    }

    if (path.startsWith("/hospital/dashboard")) {
      if (profile?.role !== "hospital") {
        return redirectTo("/hospital/login");
      }
      // Consistent with the patient/therapist gates above -- there's no
      // admin control to suspend a hospital account today, but if `active`
      // is ever flipped by hand (or a future feature adds one), this should
      // already lock the dashboard out the same way it does for the other
      // two roles rather than silently doing nothing.
      if (!profile.active) {
        return redirectTo("/account-suspended");
      }
    }
  }

  return response;
}
