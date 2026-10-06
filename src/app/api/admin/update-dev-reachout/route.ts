import { NextRequest, NextResponse } from "next/server";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { serverError } from "@/lib/apiError";
import { isDevReachoutStatus } from "@/lib/devReachout";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Marks a developer reachout contacted (or back to new). Its notes are a
// thread of their own, written by /api/admin/dev-reachout-note. Settings is Master Admin only, so this is guarded by that scope rather
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
  }>(request);
  if (parseError) return parseError;

  const { id, status } = body;
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
  }
  if (status === undefined) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }
  if (!isDevReachoutStatus(status)) {
    return NextResponse.json({ error: "Unknown status" }, { status: 400 });
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

  const contacted = status === "contacted";
  const patch = {
    status,
    contacted_at: contacted ? new Date().toISOString() : null,
    contacted_by: contacted ? adminUser.id : null,
  };

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

  // Best-effort, after the write.
  await recordAdminActivity(admin, adminUser.id, {
    action: "dev_reachout.update_status",
    targetId: id,
    details: { from: before.status, to: status },
  });

  return NextResponse.json({ success: true });
}
