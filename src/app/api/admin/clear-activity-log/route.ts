import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { MIN_RETENTION_DAYS, refuseRetention, retentionCutoff } from "@/lib/activityLog";

// Clearing entries older than a cutoff. The only way a row ever leaves
// admin_activity_log.
//
// Three things keep this from being a way to erase one's own tracks, and
// none of them is optional:
//
//  1. **A floor no setting can get under.** The cutoff must be at least
//     MIN_RETENTION_DAYS old, checked here and again inside
//     `purge_admin_activity_log()` -- so the newest month of the trail,
//     which is where anything worth hiding would be, is out of reach. The
//     database half matters because this function is reachable by the
//     service-role key and by hand in the SQL editor, where no route check
//     runs.
//  2. **The clearing is itself logged**, and outside its own reach by
//     construction: the entry is written now, and now is inside the
//     protected window, so a clear can never remove the record of a clear.
//  3. **Master Admin alone.** `requireAdminScope("logs")` is a grant only
//     `full` holds.
//
// The screen makes the admin download the entries first. That is the honest
// half of "clear": a record that is gone and was never kept is a record
// destroyed, and one that is downloaded first has only been moved.
export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("logs");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    mode?: "preview" | "clear";
    olderThanDays?: number;
    confirm?: string;
  }>(request);
  if (parseError) return parseError;

  const admin = createAdminClient();

  // How many entries a cutoff would take, before anything is taken. The
  // screen only ever holds the newest page or two, so counting in the
  // browser would understate it -- and "clear old entries" with no figure
  // beside it asks somebody to approve an amount they were never told.
  if (body.mode === "preview") {
    const days = body.olderThanDays;
    if (typeof days !== "number" || !Number.isInteger(days) || days < MIN_RETENTION_DAYS) {
      return NextResponse.json({ error: "Choose how far back to clear." }, { status: 400 });
    }
    const cutoff = retentionCutoff(days, Date.now());
    const { count, error: countError } = await admin
      .from("admin_activity_log")
      .select("id", { count: "exact", head: true })
      .lt("created_at", cutoff.toISOString());
    if (countError) {
      return NextResponse.json({ error: "Could not read the log." }, { status: 500 });
    }
    return NextResponse.json({ count: count ?? 0, cutoff: cutoff.toISOString() });
  }

  const refusal = refuseRetention(body.olderThanDays, body.confirm);
  if (refusal) {
    return NextResponse.json({ error: refusal.reason }, { status: 400 });
  }
  const days = body.olderThanDays as number;

  const { data: removed, error } = await admin.rpc("purge_admin_activity_log", {
    p_days: days,
  });
  if (error) {
    return NextResponse.json(
      { error: "Could not clear the log. Nothing was removed." },
      { status: 500 }
    );
  }

  const count = typeof removed === "number" ? removed : 0;

  // After the purge, and deliberately so -- the function's own floor means
  // this row is far newer than anything it could have taken, so the entry
  // survives. The figures are the point of it: "cleared the log" without the
  // cutoff and the count says nothing a reader could check.
  await recordAdminActivity(admin, adminUser.id, {
    action: "log.clear",
    targetLabel: `Entries older than ${days} days`,
    details: {
      olderThanDays: days,
      cutoff: retentionCutoff(days, Date.now()).toISOString(),
      entriesRemoved: count,
      protectedDays: MIN_RETENTION_DAYS,
    },
  });

  return NextResponse.json({ success: true, removed: count });
}
