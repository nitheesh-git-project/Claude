import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { validateDevReachoutDelete } from "@/lib/devReachout";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Deletes one Developer Message (and its notes, which cascade), with a
 * reason. Settings scope, like the rest of that screen.
 *
 * The message is gone afterwards, so the activity log row is the record:
 * who deleted it, why, and who had sent it (name and email, never the
 * message body). Written *after* the delete succeeds -- unlike an account
 * delete, the actor here is never the thing removed, and a failed delete
 * has removed nothing worth recording.
 */
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("settings");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    id?: unknown;
    reason?: unknown;
    note?: unknown;
  }>(request);
  if (parseError) return parseError;

  const { id } = body;
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
  }
  const why = validateDevReachoutDelete(body.reason, body.note);
  if (!why.ok) return NextResponse.json({ error: why.error }, { status: 400 });

  const admin = createAdminClient();
  const { data: deleted, error } = await admin
    .from("dev_reachouts")
    .delete()
    .eq("id", id)
    .select("id, name, email, created_at")
    .maybeSingle();
  if (error) return serverError("admin/delete-dev-reachout", error);
  if (!deleted) {
    return NextResponse.json(
      { error: "That message no longer exists. Refresh to see the list." },
      { status: 404 }
    );
  }

  await recordAdminActivity(admin, adminUser.id, {
    action: "dev_reachout.delete",
    targetId: id,
    targetLabel: `Message from ${deleted.name}`,
    details: {
      reason: why.reason,
      note: why.note,
      senderName: deleted.name,
      senderEmail: deleted.email,
      sentAt: deleted.created_at,
    },
  });

  return NextResponse.json({ success: true });
}
