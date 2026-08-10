import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    let { data: profile } = await supabase
      .from("profiles")
      .select("role, approved, active")
      .eq("id", user.id)
      .single();

    // The signup trigger guarantees a profiles row exists for every
    // authenticated user, so a null result here right after sign-in is a
    // transient read (not a real "no such profile") — worth one retry
    // before treating it as a genuine role mismatch and bouncing an
    // already-valid user out to /get-started.
    if (!profile) {
      ({ data: profile } = await supabase
        .from("profiles")
        .select("role, approved, active")
        .eq("id", user.id)
        .single());
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

    if (path.startsWith("/admin/dashboard") && profile?.role !== "admin") {
      return redirectTo("/admin/login");
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
