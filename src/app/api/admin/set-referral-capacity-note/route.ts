import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const adminUser = await getAdminUser();
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

  return NextResponse.json({ success: true });
}
