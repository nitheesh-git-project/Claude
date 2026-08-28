import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("money");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ requestId?: unknown }>(request);
  if (parseError) return parseError;

  if (typeof body.requestId !== "string") {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Atomic conditional update -- only a request currently "reviewing" can
  // become "completed" (the admin must explicitly start review first, via
  // /api/admin/start-review-payout-request, before paying out and
  // completing). Also closes the same double-tap race
  // start-review-payout-request guards against.
  const { data: updated, error } = await admin
    .from("therapist_payout_requests")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: adminUser.id,
    })
    .eq("id", body.requestId)
    .eq("status", "reviewing")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    const { data: existing } = await admin
      .from("therapist_payout_requests")
      .select("status")
      .eq("id", body.requestId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }
    if (existing.status === "completed") {
      return NextResponse.json({ error: "This request is already completed." }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Start review on this request before marking it completed." },
      { status: 400 }
    );
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "payout_request.complete",
    targetId: typeof body.requestId === "string" ? body.requestId : null,
  });

  return NextResponse.json({ success: true });
}
