import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";
import { SITE_SETTINGS_TAG } from "@/lib/siteSettingsCache";

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

  const { data: body, error: parseError } = await parseJsonBody<{
    visible?: boolean;
  }>(request);
  if (parseError) return parseError;
  const { visible } = body;
  if (typeof visible !== "boolean") {
    return NextResponse.json({ error: "Missing visible" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("site_settings")
    .update({ ratings_visible_publicly: visible })
    .eq("id", true);

  if (error) {
    return serverError("admin/set-ratings-visible-publicly", error);
  }

  // The rating summary renders on three ISR-cached public pages
  // (revalidate = 300). Switching ratings off is the one direction where
  // waiting out the cache is not merely confusing -- it keeps publishing
  // figures the clinic has just decided not to show.
  revalidatePath("/");
  revalidatePath("/mission");
  revalidatePath("/team");

  // This route is the other writer of the site_settings singleton, so it
  // owes the same cache drop update-setting does: the three paths above
  // rebuild the pages, this drops the cached read they rebuild from. See
  // siteSettingsCache.ts.
  // `{ expire: 0 }`, not the recommended "max": "max" is
  // stale-while-revalidate, which would serve the admin who just saved the
  // setting the old value one more time -- the exact "did my save work?"
  // confusion the revalidatePath calls above exist to prevent. Next 16's
  // immediate-expiry path for a Route Handler is this object form;
  // updateTag(), the other immediate option, is Server-Actions-only.
  revalidateTag(SITE_SETTINGS_TAG, { expire: 0 });

  // Who changed this, and to what. Best-effort and after the write,
  // per the audit-log rule in AGENTS.md.
  await recordAdminActivity(admin, adminUser.id, {
    action: "setting.update",
    details: { setting: "ratings_visible_publicly", visible },
  });

  return NextResponse.json({ success: true, visible });
}
