import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { recordAdminActivity } from "@/lib/adminActivityLog";

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { therapistId, active } = await request.json();
  if (!therapistId || typeof active !== "boolean") {
    return NextResponse.json(
      { error: "Missing therapistId or active" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ active })
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

  // /team is ISR-cached, so a therapist who is no longer public stays on the
  // page until that window happens to lapse. The public view already
  // excludes them (`approved and active and visible_on_team`); this is what
  // makes the site agree with it now rather than in five minutes. Same rule
  // set-therapist-team-visibility has always followed -- an admin write a
  // public page renders must invalidate that page.
  revalidatePath("/team");

  await recordAdminActivity(admin, adminUser.id, {
    action: "account.set_active",
    targetId: therapistId,
    details: { role: "therapist", active },
  });

  return NextResponse.json({ success: true, active });
}
