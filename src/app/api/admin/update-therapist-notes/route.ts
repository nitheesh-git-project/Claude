import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

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

  return NextResponse.json({ success: true });
}
