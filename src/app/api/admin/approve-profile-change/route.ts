import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { GATED_PROFILE_FIELDS } from "@/lib/gatedProfileFields";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestId } = await request.json();
  if (!requestId) {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: changeRequest } = await admin
    .from("profile_change_requests")
    .select("id, user_id, changes, status")
    .eq("id", requestId)
    .single();

  if (!changeRequest) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (changeRequest.status !== "pending") {
    return NextResponse.json(
      { error: "This request has already been reviewed" },
      { status: 400 }
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", changeRequest.user_id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  // Never trust that "changes" only contains fields this role is actually
  // allowed to request — validate against the server-side allowlist before
  // writing anything, in case a request was ever crafted or tampered with.
  const allowedFields = GATED_PROFILE_FIELDS[profile.role] ?? [];
  const changes = changeRequest.changes as Record<string, unknown>;
  const requestedFields = Object.keys(changes);
  const invalidFields = requestedFields.filter((f) => !allowedFields.includes(f));
  if (requestedFields.length === 0 || invalidFields.length > 0) {
    return NextResponse.json(
      { error: "This request contains fields that can't be applied." },
      { status: 400 }
    );
  }

  const { error: applyError } = await admin
    .from("profiles")
    .update(changes)
    .eq("id", changeRequest.user_id);
  if (applyError) {
    return NextResponse.json({ error: applyError.message }, { status: 500 });
  }

  const { error: reviewError } = await admin
    .from("profile_change_requests")
    .update({
      status: "approved",
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (reviewError) {
    return NextResponse.json({ error: reviewError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
