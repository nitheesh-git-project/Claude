import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { patientId, note } = await request.json();
  if (!patientId || typeof note !== "string") {
    return NextResponse.json(
      { error: "Missing patientId or note" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.from("patient_admin_notes").upsert({
    patient_id: patientId,
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
    action: "patient.update_notes",
    targetId: patientId,
    details: { length: String(note ?? "").length },
  });

  return NextResponse.json({ success: true });
}
