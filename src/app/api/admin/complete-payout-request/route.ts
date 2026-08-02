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
  const { data: existing } = await admin
    .from("therapist_payout_requests")
    .select("id, status")
    .eq("id", body.requestId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (existing.status === "completed") {
    return NextResponse.json({ error: "This request is already completed." }, { status: 400 });
  }

  const { error } = await admin
    .from("therapist_payout_requests")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: adminUser.id,
    })
    .eq("id", body.requestId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
