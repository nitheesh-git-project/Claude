import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Patient's own data export -- their approved Patient Care Intake,
// full submission history, and every Pain Map assessment on record.
// A lightweight first step toward a real data-portability story (no
// deletion path yet -- that's a retention-policy decision, not something
// to build blind). RLS already scopes every one of these tables to the
// caller's own rows, so the regular client is enough; no admin client
// needed here.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [{ data: profile }, { data: conditionProfile }, { data: changeRequests }, { data: assessments }] =
    await Promise.all([
      supabase.from("profiles").select("full_name, email").eq("id", user.id).single(),
      supabase
        .from("patient_condition_profiles")
        .select("data, schema_version, status, updated_at")
        .eq("patient_id", user.id)
        .maybeSingle(),
      supabase
        .from("condition_change_requests")
        .select("submitted_by_role, proposed_data, status, admin_notes, created_at")
        .eq("patient_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("pain_assessments")
        .select("region, side, pain_percent, submitted_by_role, answers, created_at")
        .eq("patient_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

  const payload = {
    exported_at: new Date().toISOString(),
    patient: { name: profile?.full_name ?? null, email: profile?.email ?? null },
    condition_profile: conditionProfile ?? null,
    submission_history: changeRequests ?? [],
    pain_map_assessments: assessments ?? [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="health-profile-export.json"`,
    },
  });
}
