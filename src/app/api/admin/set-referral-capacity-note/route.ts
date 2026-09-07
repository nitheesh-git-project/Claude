import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { referralId, note } = await request.json();
  if (!referralId) {
    return NextResponse.json({ error: "Missing referralId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const trimmed = typeof note === "string" ? note.trim() : "";

  const { error } = await admin
    .from("patient_referrals")
    .update({ capacity_note: trimmed || null })
    .eq("id", referralId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Who changed this, and to what. Best-effort and after the write,
  // per the audit-log rule in AGENTS.md.
  await recordAdminActivity(admin, adminUser.id, {
    action: "referral.set_capacity_note",
    targetId: referralId,
    details: { length: String(note ?? "").length },
  });

  return NextResponse.json({ success: true });
}
