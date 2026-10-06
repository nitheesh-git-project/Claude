import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { parseDevReachoutNoteRequest } from "@/lib/devReachout";

const GONE = "That note no longer exists. Refresh to see the list.";
// What the screen needs to draw the note at once, without waiting on the
// dashboard's refresh: the same columns the dashboard reads.
const NOTE_COLUMNS = "id, reachout_id, body, created_at, edited_at, author:profiles(full_name)";

// Adds, edits or deletes one note in a developer reachout's thread. Guarded
// by the same `settings` scope as the inbox itself (see update-dev-reachout):
// a note is free text about a stranger who wrote to the developer.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<Record<string, unknown>>(request);
  if (parseError) return parseError;

  const parsed = parseDevReachoutNoteRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const req = parsed.value;

  const admin = createAdminClient();

  if (req.action === "add") {
    // Read first: a failed read is a failure, not "no such message".
    const { data: reachout, error: readError } = await admin
      .from("dev_reachouts")
      .select("id")
      .eq("id", req.reachoutId)
      .maybeSingle();
    if (readError) return serverError("admin/dev-reachout-note (read)", readError);
    if (!reachout) {
      return NextResponse.json(
        { error: "That message no longer exists. Refresh to see the list." },
        { status: 404 }
      );
    }
    const { data: note, error } = await admin
      .from("dev_reachout_notes")
      .insert({ reachout_id: req.reachoutId, body: req.body, author_id: adminUser.id })
      .select(NOTE_COLUMNS)
      .single();
    if (error) return serverError("admin/dev-reachout-note (add)", error);
    // The note's text is never logged -- only that one was written, and how long.
    await recordAdminActivity(admin, adminUser.id, {
      action: "dev_reachout.add_note",
      targetId: req.reachoutId,
      details: { noteId: note.id, noteLength: req.body.length },
    });
    return NextResponse.json({ success: true, note });
  }

  if (req.action === "edit") {
    const { data: updated, error } = await admin
      .from("dev_reachout_notes")
      .update({ body: req.body, edited_at: new Date().toISOString() })
      .eq("id", req.noteId)
      .select(NOTE_COLUMNS)
      .maybeSingle();
    if (error) return serverError("admin/dev-reachout-note (edit)", error);
    if (!updated) return NextResponse.json({ error: GONE }, { status: 404 });
    await recordAdminActivity(admin, adminUser.id, {
      action: "dev_reachout.edit_note",
      targetId: updated.reachout_id,
      details: { noteId: updated.id, noteLength: req.body.length },
    });
    return NextResponse.json({ success: true, note: updated });
  }

  const { data: deleted, error } = await admin
    .from("dev_reachout_notes")
    .delete()
    .eq("id", req.noteId)
    .select("id, reachout_id")
    .maybeSingle();
  if (error) return serverError("admin/dev-reachout-note (delete)", error);
  if (!deleted) return NextResponse.json({ error: GONE }, { status: 404 });
  await recordAdminActivity(admin, adminUser.id, {
    action: "dev_reachout.delete_note",
    targetId: deleted.reachout_id,
    details: { noteId: deleted.id },
  });
  return NextResponse.json({ success: true });
}
