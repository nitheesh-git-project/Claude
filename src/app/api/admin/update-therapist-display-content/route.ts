import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { serverError } from "@/lib/apiError";
import { parseRichTextInput, richTextToPlain, parseRichText } from "@/lib/richText";

// Writes profiles.public_display_note -- the admin-curated blurb shown in
// the /team popup (Feature 38), distinct from therapist_admin_notes
// (private) and from `bio` (self-edited by the therapist).
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("people");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // `content` is the Docs-style editor's JSON (src/lib/richText.ts). It is
  // sanitised here rather than trusted: what is stored is rebuilt from the
  // allow-list, never the request as sent.
  const { data: body, error: parseError } = await parseJsonBody<{
    therapistId?: string;
    content?: unknown;
  }>(request);
  if (parseError) return parseError;
  const { therapistId } = body;
  if (!therapistId || !("content" in body)) {
    return NextResponse.json({ error: "Missing therapistId or content" }, { status: 400 });
  }
  const parsed = parseRichTextInput(body.content);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("profiles")
    .update({ public_display_note: parsed.value })
    .eq("id", therapistId)
    .eq("role", "therapist")
    .select("full_name")
    .maybeSingle();

  if (error) {
    return serverError("admin/update-therapist-display-content", error);
  }
  if (!updated) {
    return NextResponse.json({ error: "Therapist not found" }, { status: 404 });
  }

  revalidatePath("/team");

  // Who changed this, and to what. Best-effort and after the write,
  // per the audit-log rule in AGENTS.md.
  await recordAdminActivity(admin, adminUser.id, {
    action: "therapist.update_display_content",
    targetId: therapistId,
    targetLabel: updated.full_name ?? null,
    // The length, deliberately, not the text: this log is readable by
    // every admin, and a note written about one patient should not be
    // reproduced on a screen the whole back office reads. The entry says
    // who rewrote it and when, which is the part with audit value.
    details: { noteLength: richTextToPlain(parseRichText(parsed.value)).length },
  });

  return NextResponse.json({ success: true });
}
