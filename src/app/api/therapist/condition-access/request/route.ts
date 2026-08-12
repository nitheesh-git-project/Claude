import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";
import { isTherapistAssignedToPatient } from "@/lib/conditionAccess";

// A therapist requests admin approval to edit (not just view) a patient's
// condition data — Pain Map and Patient Care Intake alike share this one
// grant. Read access needs no request at all; only write does. See the
// schema.sql section comment for the full reasoning.
export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{ patientId?: string }>(request);
  if (parseError) return parseError;
  const { patientId } = body;
  if (!patientId) {
    return NextResponse.json({ error: "Missing patientId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await isProfileActiveAndApproved(user.id))) {
    return NextResponse.json(
      { error: "Your account is not active — it is either awaiting admin approval or has been suspended." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "therapist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!(await isTherapistAssignedToPatient(admin, user.id, patientId))) {
    return NextResponse.json(
      { error: "You're not assigned to this patient." },
      { status: 403 }
    );
  }

  const { count: existingCount } = await admin
    .from("condition_access_grants")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", patientId)
    .eq("therapist_id", user.id)
    .in("status", ["requested", "approved"]);
  if (existingCount && existingCount > 0) {
    return NextResponse.json(
      { error: "You already have a pending or approved request for this patient." },
      { status: 409 }
    );
  }

  const { error: insertError } = await admin.from("condition_access_grants").insert({
    patient_id: patientId,
    therapist_id: user.id,
    status: "requested",
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
