import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { therapistId, visible } = await request.json();
  if (!therapistId || typeof visible !== "boolean") {
    return NextResponse.json(
      { error: "Missing therapistId or visible" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ rating_visible: visible })
    .eq("id", therapistId)
    .eq("role", "therapist")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Therapist not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, visible });
}
