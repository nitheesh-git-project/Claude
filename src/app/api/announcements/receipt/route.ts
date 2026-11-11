import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { enforceRateLimit } from "@/lib/rateLimitServer";
import { serverError } from "@/lib/apiError";
import { readDashboardViewer } from "@/lib/dashboardViewer";
import { isAnnouncementAudience, isAnnouncementLive } from "@/lib/announcements";

// A person closes a banner, or their dashboard records that the pop-up has
// opened by itself once. One row per person per announcement.
//
// Everything that says who is re-derived: the person is the session's user
// and the role is read from their profile. The announcement must be live
// and for that role -- a receipt cannot be written against a draft, another
// role's notice, or an id somebody made up -- and "close" is refused for
// one the admin marked as not closable.
//
// An admin signed in as this person changes nothing: the answer is success
// so their view behaves, and no row is written, because their visit must
// not close the person's banner or use up their one pop-up.
//
// Request:  { id: string, action: "dismiss" | "seen" }
// Response: 200 { success: true }, 400, 401, 403, 404, 429, 503.
export async function POST(request: NextRequest) {
  const viewer = await readDashboardViewer();
  if (viewer.status === "anonymous") return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (viewer.status === "unreadable") {
    return NextResponse.json({ error: "We couldn't check your account just now. Please try again." }, { status: 503 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{ id?: unknown; action?: unknown }>(request);
  if (parseError) return parseError;
  if (typeof body.id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.id)) {
    return NextResponse.json({ error: "Unknown announcement." }, { status: 400 });
  }
  if (body.action !== "dismiss" && body.action !== "seen") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  const limited = await enforceRateLimit(request, "announcementReceipt", { identifier: viewer.userId });
  if (limited) return limited;

  if (!viewer.active || !isAnnouncementAudience(viewer.role)) {
    return NextResponse.json({ error: "Announcements are not shown on this account." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: row, error: readError } = await admin
    .from("announcements")
    .select("id, audiences, published_at, starts_at, ends_at, dismissible")
    .eq("id", body.id)
    .maybeSingle();
  if (readError) return serverError("announcements/receipt:read", readError);
  if (!row || !isAnnouncementLive(row, Date.now()) || !(row.audiences as string[]).includes(viewer.role)) {
    return NextResponse.json({ error: "That announcement is no longer showing." }, { status: 404 });
  }
  if (body.action === "dismiss" && !row.dismissible) {
    return NextResponse.json({ error: "This announcement stays until it ends." }, { status: 403 });
  }

  if (viewer.impersonating) return NextResponse.json({ success: true });

  const now = new Date().toISOString();
  // Closing a banner also counts as having seen it: a pop-up must not
  // spring open for something the person already waved away.
  const patch =
    body.action === "dismiss" ? { dismissed_at: now, popup_seen_at: now } : { popup_seen_at: now };
  const { error } = await admin
    .from("announcement_receipts")
    .upsert({ announcement_id: row.id, user_id: viewer.userId, ...patch }, { onConflict: "announcement_id,user_id" });
  if (error) return serverError("announcements/receipt", error);

  return NextResponse.json({ success: true });
}
