import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestId, notes } = await request.json();
  if (!requestId || !notes || !notes.trim()) {
    return NextResponse.json(
      { error: "Missing requestId or a reason for declining" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: changeRequest } = await admin
    .from("profile_change_requests")
    .select("id, status")
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

  const { error } = await admin
    .from("profile_change_requests")
    .update({
      status: "declined",
      admin_notes: notes.trim(),
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
