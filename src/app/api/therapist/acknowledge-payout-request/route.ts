import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

export async function POST(request: NextRequest) {
  const { data: body, error: parseError } = await parseJsonBody<{ requestId?: unknown }>(request);
  if (parseError) return parseError;

  if (typeof body.requestId !== "string") {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
