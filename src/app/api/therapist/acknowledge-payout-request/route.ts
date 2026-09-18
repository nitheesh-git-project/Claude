import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { isProfileActiveAndApproved } from "@/lib/supabase/requireActiveProfile";

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

  // `approved` / `active` are enforced in two places, and both have to
  // stay: src/proxy.ts for dashboard navigation, and here, because a valid
  // session cookie reaches this route without passing the proxy at all.
  // This route had only the first.
  if (!(await isProfileActiveAndApproved(user.id))) {
    return NextResponse.json({ error: "Your account is not active." }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ requestId?: unknown }>(request);
  if (parseError) return parseError;

  if (typeof body.requestId !== "string") {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  const admin = createAdminClient();
  // Scoped to this therapist's own id, not just the request's id -- a
  // therapist can only ever dismiss their own notification, never anyone
  // else's by guessing an id.
  const { data: updated, error } = await admin
    .from("therapist_payout_requests")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", body.requestId)
    .eq("therapist_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
