import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";
import { announcementStatus } from "@/lib/announcements";

// "End now": takes a live or scheduled announcement off every dashboard at
// once by moving its end to this moment. The row stays, as Ended, so it can
// be used again -- deleting is a separate, deliberate button.
//
// Request:  { id: string }
// Response: 200 { success: true }, 400, 403, 404, 409 not live or scheduled.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { data: body, error: parseError } = await parseJsonBody<{ id?: unknown }>(request);
  if (parseError) return parseError;
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) {
    return NextResponse.json({ error: "Unknown announcement." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error: readError } = await admin
    .from("announcements")
    .select("id, title, published_at, starts_at, ends_at")
    .eq("id", body.id)
    .maybeSingle();
  if (readError) return serverError("admin/announcements/end:read", readError);
  if (!row) return NextResponse.json({ error: "That announcement no longer exists." }, { status: 404 });

  const now = new Date();
  const status = announcementStatus(row, now.getTime());
  if (status !== "live" && status !== "scheduled") {
    return NextResponse.json({ error: "That announcement is not showing, so there is nothing to end." }, { status: 409 });
  }

  // A scheduled one has not started: pull its start back with its end, so
  // the row still says "ends after it starts" (the table's own check).
  const endsAt = now.toISOString();
  const startsAt =
    status === "scheduled" ? new Date(now.getTime() - 1000).toISOString() : (row.starts_at as string);
  const { error } = await admin
    .from("announcements")
    .update({ starts_at: startsAt, ends_at: endsAt, duration_minutes: null, updated_at: endsAt })
    .eq("id", row.id);
  if (error) return serverError("admin/announcements/end", error);

  await recordAdminActivity(admin, adminUser.id, {
    action: "setting.update",
    targetId: row.id,
    targetLabel: `Announcement: ${row.title}`,
    details: { what: "ended" },
  });

  return NextResponse.json({ success: true });
}
