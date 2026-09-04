import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";

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

  // /team is ISR-cached (revalidate = 300), so a therapist's rating stayed
  // on the public page after it was hidden until the window expired.
  revalidatePath("/team");

  // Who changed this, and to what. Best-effort and after the write,
  // per the audit-log rule in AGENTS.md.
  await recordAdminActivity(admin, adminUser.id, {
    action: "therapist.set_rating_visibility",
    targetId: therapistId,
    details: { visible },
  });

  return NextResponse.json({ success: true, visible });
}
