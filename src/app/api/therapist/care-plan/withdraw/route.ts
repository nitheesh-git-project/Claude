import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

// A therapist taking back a recommendation they got wrong.
//
// The accidental-change case: the wrong programme picked, a plan written
// against the wrong patient, advice given before a scan came back. Without
// this the only way out is to recommend again, which leaves the mistake
// standing as version 1 with the correction as version 2 -- readable, but
// it means the patient may already have paid for the wrong thing in
// between.
//
// It can only ever withdraw a plan that is still `active`. Once a patient
// has paid, the thread is closed and withdrawing it would mean unselling
// something -- that is a refund, which is an admin's job and has its own
// route.
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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ carePlanId?: string }>(
    request
  );
  if (parseError) return parseError;

  const carePlanId = body.carePlanId?.trim();
  if (!carePlanId) {
    return NextResponse.json({ error: "Missing carePlanId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, active, approved")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "therapist") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (profile.active === false || profile.approved === false) {
    return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
  }

  // Only the author may withdraw, and only while it is still open -- which
  // now means either waiting on the clinic or waiting on the patient. Both
  // conditions live in the write itself, so a patient paying in the same
  // moment wins and the therapist is told what happened rather than the
  // purchase being pulled out from under them.
  const { data: withdrawn, error } = await admin
    .from("care_plans")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", carePlanId)
    .eq("therapist_id", user.id)
    .in("status", ["active", "pending_review"])
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!withdrawn) {
    const { data: current } = await admin
      .from("care_plans")
      .select("status")
      .eq("id", carePlanId)
      .eq("therapist_id", user.id)
      .maybeSingle();
    if (current?.status === "accepted") {
      return NextResponse.json(
        {
          error:
            "Your patient has already paid for this. Ask the clinic to refund it if it was wrong — you can't withdraw a purchased plan.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ success: true, alreadyClosed: true });
  }

  return NextResponse.json({ success: true });
}
