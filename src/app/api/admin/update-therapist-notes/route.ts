import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { therapistId, note } = await request.json();
  if (!therapistId || typeof note !== "string") {
    return NextResponse.json(
      { error: "Missing therapistId or note" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.from("therapist_admin_notes").upsert({
    therapist_id: therapistId,
    note,
    updated_by: adminUser.id,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Who changed this, and to what. Best-effort and after the write,
  // per the audit-log rule in AGENTS.md.
  await recordAdminActivity(admin, adminUser.id, {
    action: "therapist.update_notes",
    targetId: therapistId,
    details: { length: String(note ?? "").length },
  });

  return NextResponse.json({ success: true });
}
