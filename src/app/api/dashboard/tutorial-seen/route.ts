import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isProfileActive, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import { IMPERSONATION_COOKIE, isExpired, parseMarker } from "@/lib/impersonation";
import { serverError } from "@/lib/apiError";

// Records that the dashboard tutorial has been seen, so it stops opening by
// itself. Called when a first-run tour is finished or skipped, for any of
// the three roles that have one (patient, therapist, hospital); it replaces
// the patient-only /api/patient/dismiss-onboarding. `onboarding_seen_at` is
// one column because one account carries one role.
//
// An admin viewing the dashboard as this person must not use up the
// person's own first visit, so the write is skipped while the impersonation
// marker is live -- the provider already does not call this then, and this
// is the server half of the same rule.
const TUTORIAL_ROLES = new Set(["patient", "therapist", "hospital"]);

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jar = await cookies();
  const marker = parseMarker(jar.get(IMPERSONATION_COOKIE)?.value);
  if (marker && !isExpired(marker, Date.now())) {
    return NextResponse.json({ success: true, skipped: "impersonating" });
  }

  // Enforced here as well as in src/proxy.ts: a session cookie reaches a
  // route without passing the proxy.
  const activeStanding = await isProfileActive(user.id);
  if (activeStanding === null) return profileCheckUnavailable();
  if (!activeStanding) {
    return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: profile, error: readError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (readError) return profileCheckUnavailable();
  if (!profile || !TUTORIAL_ROLES.has(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await admin
    .from("profiles")
    .update({ onboarding_seen_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("onboarding_seen_at", null);
  if (error) {
    return serverError("dashboard/tutorial-seen", error);
  }

  return NextResponse.json({ success: true });
}
