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

  if (path.startsWith("/patient/dashboard") && !user) {
    return NextResponse.redirect(new URL("/patient/login", request.url));
  }

  if (path.startsWith("/therapist/dashboard") && !user) {
    return NextResponse.redirect(new URL("/therapist/login", request.url));
  }

  if (path.startsWith("/admin/dashboard") && !user) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  if (path.startsWith("/hospital/dashboard") && !user) {
    return NextResponse.redirect(new URL("/hospital/login", request.url));
  }

  if (
    user &&
    (path.startsWith("/patient/dashboard") ||
      path.startsWith("/therapist/dashboard") ||
      path.startsWith("/admin/dashboard") ||
      path.startsWith("/hospital/dashboard"))
  ) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, approved, active")
      .eq("id", user.id)
      .single();

    if (path.startsWith("/therapist/dashboard")) {
      if (profile?.role !== "therapist") {
        return NextResponse.redirect(new URL("/get-started", request.url));
      }
      if (!profile.approved) {
        return NextResponse.redirect(new URL("/pending-approval", request.url));
      }
      if (!profile.active) {
        return NextResponse.redirect(new URL("/account-suspended", request.url));
      }
    }

    if (path.startsWith("/patient/dashboard")) {
      if (profile?.role !== "patient") {
        return NextResponse.redirect(new URL("/get-started", request.url));
      }
      if (!profile.active) {
        return NextResponse.redirect(new URL("/account-suspended", request.url));
      }
    }

    if (path.startsWith("/admin/dashboard") && profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    if (path.startsWith("/hospital/dashboard") && profile?.role !== "hospital") {
      return NextResponse.redirect(new URL("/hospital/login", request.url));
    }
  }

  return response;
}
