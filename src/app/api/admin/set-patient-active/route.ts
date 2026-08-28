import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { patientId, active } = await request.json();
  if (!patientId || typeof active !== "boolean") {
    return NextResponse.json(
      { error: "Missing patientId or active" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ active })
    .eq("id", patientId)
    .eq("role", "patient")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "account.set_active",
    targetId: patientId,
    details: { role: "patient", active },
  });

  return NextResponse.json({ success: true, active });
}
