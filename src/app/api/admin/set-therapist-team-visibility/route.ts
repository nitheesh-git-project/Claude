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

  const { therapistId, visibleOnTeam } = await request.json();
  if (!therapistId || typeof visibleOnTeam !== "boolean") {
    return NextResponse.json(
      { error: "Missing therapistId or visibleOnTeam" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ visible_on_team: visibleOnTeam })
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

  // /team is time-based ISR (revalidate = 300s) -- without this, an admin
  // toggling this off/on would see no change on the public page for up to
  // 5 minutes, which reads as the toggle being broken.
  revalidatePath("/team");

  // Who changed this, and to what. Best-effort and after the write,
  // per the audit-log rule in AGENTS.md.
  await recordAdminActivity(admin, adminUser.id, {
    action: "therapist.set_team_visibility",
    targetId: therapistId,
    details: { visibleOnTeam },
  });

  return NextResponse.json({ success: true, visibleOnTeam });
}
