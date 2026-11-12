import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";
import {
  ANNOUNCEMENT_SELECT,
  parseAnnouncementInput,
  type AnnouncementInput,
  type AnnouncementRow,
} from "@/lib/announcements";

// Settings -> Announcements: the list, and the one save.
//
// Announcements are a Settings screen, so both verbs are
// requireAdminScope("settings") -- Master Admin, like every other screen in
// that section. The dashboards never call this: they are handed their own
// live announcements by AnnouncementsGate, on the server.
//
// GET  -> 200 { announcements: AnnouncementRow[], now: string }
//         `now` is the server's clock, so the screen's "live / scheduled /
//         ended" is worked out against the same time the dashboards use.
// POST -> body: AnnouncementInput & { id?: string }
//         200 { success: true, id }, 400 validation, 403, 404 unknown id.
export async function GET() {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("announcements")
    .select(ANNOUNCEMENT_SELECT)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return serverError("admin/announcements:list", error);
  return NextResponse.json({
    announcements: (data ?? []) as AnnouncementRow[],
    now: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<AnnouncementInput & { id?: unknown }>(request);
  if (parseError) return parseError;

  const admin = createAdminClient();
  const id = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  if (body.id !== undefined && body.id !== null && !id) {
    return NextResponse.json({ error: "Unknown announcement." }, { status: 400 });
  }

  let alreadyPublishedAt: string | null = null;
  if (id) {
    const { data: existing, error: readError } = await admin
      .from("announcements")
      .select("id, published_at")
      .eq("id", id)
      .maybeSingle();
    if (readError) return serverError("admin/announcements:read", readError);
    if (!existing) {
      return NextResponse.json({ error: "That announcement no longer exists." }, { status: 404 });
    }
    alreadyPublishedAt = existing.published_at;
  }

  const parsed = parseAnnouncementInput(body, Date.now(), alreadyPublishedAt);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const row = { ...parsed.value, updated_at: new Date().toISOString() };

  let savedId = id;
  if (id) {
    const { error } = await admin.from("announcements").update(row).eq("id", id);
    if (error) return serverError("admin/announcements:update", error);
  } else {
    // New ones go to the front: the newest notice is the one people should
    // meet first, and the admin can drag it elsewhere.
    const { data: first } = await admin
      .from("announcements")
      .select("sort_order")
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    const { data, error } = await admin
      .from("announcements")
      .insert({ ...row, created_by: adminUser.id, sort_order: (first?.sort_order ?? 0) - 1 })
      .select("id")
      .single();
    if (error) return serverError("admin/announcements:create", error);
    savedId = data.id;
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "setting.update",
    targetId: savedId,
    targetLabel: `Announcement: ${parsed.value.title}`,
    details: {
      what: id ? "edited" : "created",
      published: parsed.value.published_at !== null,
      audiences: parsed.value.audiences,
      starts_at: parsed.value.starts_at,
      ends_at: parsed.value.ends_at,
    },
  });

  return NextResponse.json({ success: true, id: savedId });
}
