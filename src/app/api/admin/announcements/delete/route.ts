import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";
import { announcementStatus } from "@/lib/announcements";

// Deletes an announcement and its pictures. A live one is refused: "End
// now" is the way to take something off the dashboards, and it leaves a row
// behind that says what was shown and when. Receipts cascade.
//
// Request:  { id: string }
// Response: 200 { success: true }, 400, 403, 409 still live.
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
    .select("id, title, published_at, starts_at, ends_at, banner_image_url, popup_image_url")
    .eq("id", body.id)
    .maybeSingle();
  if (readError) return serverError("admin/announcements/delete:read", readError);
  // Already gone is the outcome that was asked for.
  if (!row) return NextResponse.json({ success: true });

  if (announcementStatus(row, Date.now()) === "live") {
    return NextResponse.json(
      { error: "This announcement is showing right now. End it first, then delete it." },
      { status: 409 }
    );
  }

  const { error } = await admin.from("announcements").delete().eq("id", row.id);
  if (error) return serverError("admin/announcements/delete", error);

  // The pictures, best effort: the row is gone either way, and a file left
  // behind is storage, not something anybody can see.
  const paths = [row.banner_image_url, row.popup_image_url]
    .map((url) => {
      const match = typeof url === "string" ? url.match(/\/catalog-images\/(announcements\/[^?]+)/) : null;
      return match ? decodeURIComponent(match[1]) : null;
    })
    .filter((p): p is string => !!p);
  if (paths.length) {
    await admin.storage.from("catalog-images").remove(paths);
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "setting.update",
    targetId: row.id,
    targetLabel: `Announcement: ${row.title}`,
    details: { what: "deleted" },
  });

  return NextResponse.json({ success: true });
}
