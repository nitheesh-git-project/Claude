import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPatientProfile, isProfileActive } from "@/lib/supabase/requireActiveProfile";

// Lets the booking wizard offer "continue with the same therapist" to a
// returning patient. Only therapists who are still approved and active are
// returned - no point suggesting someone no longer available to assign.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // `active` is enforced in two places and both have to stay -- src/proxy.ts
  // for dashboard navigation, and here, because a valid session cookie
  // reaches this route without passing the proxy. This one had only the
  // first, which is the same gap the eight-route audit closed elsewhere.
  if (!(await isProfileActive(user.id))) {
    return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
  }

  // One account carries one role. A therapist has no rows as a patient, so
  // this answered them with an empty list rather than a refusal -- which
  // reads as "you have never been treated here" instead of "not yours".
  if (!(await isPatientProfile(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: appointments } = await admin
    .from("appointments")
    .select("therapist_id")
    .eq("patient_id", user.id)
    .not("therapist_id", "is", null)
    .neq("status", "cancelled");

  const therapistIds = [
    ...new Set((appointments ?? []).map((a) => a.therapist_id as string)),
  ];
  if (therapistIds.length === 0) {
    return NextResponse.json({ therapists: [] });
  }

  const { data: therapists } = await admin
    .from("profiles")
    .select("id, full_name")
    .in("id", therapistIds)
    .eq("role", "therapist")
    .eq("approved", true)
    .eq("active", true)
    .order("full_name");

  return NextResponse.json({ therapists: therapists ?? [] });
}
