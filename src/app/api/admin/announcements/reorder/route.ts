import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";

// The order announcements slide in: first in the list is the first banner
// a person meets. The screen sends every id it is showing, in order.
//
// Request:  { ids: string[] }
// Response: 200 { success: true }, 400, 403.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { data: body, error: parseError } = await parseJsonBody<{ ids?: unknown }>(request);
  if (parseError) return parseError;
  const ids = Array.isArray(body.ids) ? body.ids : null;
  if (
    !ids ||
    ids.length === 0 ||
    ids.length > 500 ||
    !ids.every((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)) ||
    new Set(ids).size !== ids.length
  ) {
    return NextResponse.json({ error: "That order could not be read. Please try again." }, { status: 400 });
  }

  const admin = createAdminClient();
  const stamp = new Date().toISOString();
  for (let i = 0; i < ids.length; i++) {
    const { error } = await admin
      .from("announcements")
      .update({ sort_order: i, updated_at: stamp })
      .eq("id", ids[i]);
    if (error) return serverError("admin/announcements/reorder", error);
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "setting.update",
    targetId: null,
    targetLabel: "Announcements order",
    details: { what: "reordered", count: ids.length },
  });

  return NextResponse.json({ success: true });
}
