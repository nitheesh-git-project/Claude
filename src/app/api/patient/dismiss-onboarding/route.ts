import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPatientProfile, isProfileActive } from "@/lib/supabase/requireActiveProfile";

// Marks the one-time welcome modal as seen. Called both on "Skip for now"
// and on the CTA button, so either way it never shows again for this
// patient - the persistent health-profile reminder banner is a separate,
// status-driven thing that keeps nudging independently of this flag.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // `approved` / `active` are enforced in two places, and both have to
  // stay: src/proxy.ts for dashboard navigation, and here, because a valid
  // session cookie reaches this route without passing the proxy at all.
  // This route had only the first.
  if (!(await isProfileActive(user.id))) {
    return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
  }

  // One account carries one role: `onboarding_seen_at` is the patient
  // dashboard's welcome modal and nothing else reads it.
  if (!(await isPatientProfile(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ onboarding_seen_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
