import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";

// The global kill-switch: off means no rating numbers show on /team or the
// homepage for ANY therapist, regardless of that therapist's own
// rating_visible flag -- both existing public rating views already null
// their numbers out when this is false. Writes the one guaranteed-singleton
// row in site_settings.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { visible } = await request.json();
  if (typeof visible !== "boolean") {
    return NextResponse.json({ error: "Missing visible" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("site_settings")
    .update({ ratings_visible_publicly: visible })
    .eq("id", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The rating summary renders on three ISR-cached public pages
  // (revalidate = 300). Switching ratings off is the one direction where
  // waiting out the cache is not merely confusing -- it keeps publishing
  // figures the clinic has just decided not to show.
  revalidatePath("/");
  revalidatePath("/mission");
  revalidatePath("/team");

  // Who changed this, and to what. Best-effort and after the write,
  // per the audit-log rule in AGENTS.md.
  await recordAdminActivity(admin, adminUser.id, {
    action: "setting.update",
    details: { setting: "ratings_visible_publicly", visible },
  });

  return NextResponse.json({ success: true, visible });
}
