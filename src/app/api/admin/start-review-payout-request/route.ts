import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ requestId?: unknown }>(request);
  if (parseError) return parseError;

  if (typeof body.requestId !== "string") {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Atomic conditional update, not a check-then-write -- guards against two
  // admin tabs (or two admins) both tapping "Start Review" on the same
  // request at once, same pattern settle-therapist-payout already uses for
  // its per-row claims. A losing request gets a clean 409, not a silent
  // double-transition.
  const { data: updated, error } = await admin
    .from("therapist_payout_requests")
    .update({
      status: "reviewing",
      reviewing_at: new Date().toISOString(),
      reviewing_by: adminUser.id,
    })
    .eq("id", body.requestId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json(
      { error: "This request is no longer pending — please refresh." },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true });
}
