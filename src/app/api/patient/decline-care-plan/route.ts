import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";

const MAX_REASON_LENGTH = 500;

// A patient saying no to a recommendation.
//
// Declining is a real answer, not an absence of one, and it needs to exist
// for two reasons. The therapist gets to know rather than wondering whether
// the patient saw it. And the thread closes, so the therapist can recommend
// something else -- at most one plan is live at a time, so a declined plan
// left open would block every future recommendation for that patient.
//
// The reason is optional, deliberately. Making someone justify saying no to
// a purchase is a dark pattern, and an empty answer is still an answer.
export async function POST(request: NextRequest) {
  // Who is asking, before anything the caller sent is looked at. An
  // anonymous request is refused here rather than after body validation,
  // so an unauthenticated caller never drives this route's parsing and is
  // never told what shape the request should have been.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    carePlanId?: string;
    reason?: string;
  }>(request);
  if (parseError) return parseError;

  const carePlanId = body.carePlanId?.trim();
  const reason = body.reason?.trim() ?? "";
  if (!carePlanId) {
    return NextResponse.json({ error: "Missing carePlanId" }, { status: 400 });
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return NextResponse.json(
      { error: `Please keep it to ${MAX_REASON_LENGTH} characters or fewer.` },
      { status: 400 }
    );
  }

  if (!(await isProfileActiveAndApproved(user.id))) {
    return NextResponse.json(
      { error: "Your account is not active — it is either awaiting admin approval or has been suspended." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  // Claimed on `status = 'active'` and on ownership in one write, so a
  // double-tap declines once and a plan the patient has already paid for
  // cannot be declined out from under the purchase.
  const { data: declined, error } = await admin
    .from("care_plans")
    .update({
      status: "declined",
      declined_at: new Date().toISOString(),
      decline_reason: reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", carePlanId)
    .eq("patient_id", user.id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!declined) {
    // Success-shaped: the patient asked for this and it is already true,
    // or the plan moved on. Either way there is nothing for them to fix.
    return NextResponse.json({ success: true, alreadyAnswered: true });
  }

  return NextResponse.json({ success: true });
}
