import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { MAX_DEV_REACHOUT_NOTE_LENGTH, isDevReachoutStatus } from "@/lib/devReachout";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Marks a developer reachout contacted (or back to new) and keeps a note on
// it. Settings is Master Admin only, so this is guarded by that scope rather
// than the People one the other lead pipelines use: the table is the
// developer's own inbox, not the clinic's.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    id?: unknown;
    status?: unknown;
    note?: unknown;
  }>(request);
  if (parseError) return parseError;

  const { id, status, note } = body;
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
  }
  const changingStatus = status !== undefined;
  const changingNote = note !== undefined;
  if (!changingStatus && !changingNote) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }
  if (changingStatus && !isDevReachoutStatus(status)) {
    return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  }
  if (changingNote) {
    if (typeof note !== "string") {
      return NextResponse.json({ error: "note must be text" }, { status: 400 });
    }
    if (note.trim().length > MAX_DEV_REACHOUT_NOTE_LENGTH) {
      return NextResponse.json(
        { error: `Please keep a note to ${MAX_DEV_REACHOUT_NOTE_LENGTH} characters or fewer.` },
        { status: 400 }
      );
    }
  }

  const admin = createAdminClient();

  // Read first so the log can say what the status was, not only what it
  // became. A failed read is a failure, not "no such row".
  const { data: before, error: readError } = await admin
    .from("dev_reachouts")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (readError) return serverError("admin/update-dev-reachout (read)", readError);
  if (!before) {
    return NextResponse.json(
      { error: "That message no longer exists. Refresh to see the list." },
      { status: 404 }
    );
  }

  const patch: Record<string, unknown> = {};
  if (changingStatus) {
    const now = new Date().toISOString();
    patch.status = status;
    patch.contacted_at = status === "contacted" ? now : null;
    patch.contacted_by = status === "contacted" ? adminUser.id : null;
  }
  const trimmedNote = typeof note === "string" ? note.trim() : "";
  if (changingNote) {
    // An empty note clears it rather than storing a blank string.
    patch.admin_note = trimmedNote === "" ? null : trimmedNote;
    patch.note_updated_at = new Date().toISOString();
  }

  const { data: updated, error } = await admin
    .from("dev_reachouts")
    .update(patch)
    .eq("id", id)
    .select("id, status")
    .maybeSingle();
  if (error) return serverError("admin/update-dev-reachout", error);
  if (!updated) {
    return NextResponse.json(
      { error: "That message no longer exists. Refresh to see the list." },
      { status: 404 }
    );
  }

  // Best-effort, after the write. The note's text is never logged -- it is
  // free text about a person -- only that one was saved, and how long.
  if (changingStatus) {
    await recordAdminActivity(admin, adminUser.id, {
      action: "dev_reachout.update_status",
      targetId: id,
      details: { from: before.status, to: status },
    });
  }
  if (changingNote) {
    await recordAdminActivity(admin, adminUser.id, {
      action: "dev_reachout.update_note",
      targetId: id,
      details: { noteLength: trimmedNote.length },
    });
  }

  return NextResponse.json({ success: true });
}
