import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminScope } from "@/lib/supabase/requireAdmin";
import { parseJsonBody } from "@/lib/parseJsonBody";

// Older entries, a page at a time.
//
// The dashboard's own render carries the newest 200 rows and no more: every
// one of them holds a jsonb `details` blob, and that page server-renders all
// seven sections at once for every admin on every refresh, so an unbounded
// log there is a payload the whole back office pays for to serve a screen
// most of them cannot open. This route is what makes the Logs section's
// promise -- every action, not merely the recent ones -- true without moving
// that cost onto everybody.
//
// It is a read, and the only admin read route in this app that is scoped:
// the Logs section is Master Admin's alone, and `requireAdminScope` asking
// for `manage` is exactly the grant only they hold. A limited desk reads its
// own history on Today -> Activity, from rows the page already filtered.
export const PAGE_SIZE = 200;

export async function POST(request: NextRequest) {
  const adminUser = await requireAdminScope("logs");
  if (!adminUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: body, error: parseError } = await parseJsonBody<{
    before?: string;
  }>(request);
  if (parseError) return parseError;

  // The cursor is the oldest `created_at` the browser already has, not an
  // offset. An offset re-reads rows that shifted under it the moment
  // anything was logged mid-scroll, which on this table is every few
  // seconds -- and the row it would skip is the one somebody is looking for.
  const before = typeof body.before === "string" ? body.before : null;
  if (before && Number.isNaN(Date.parse(before))) {
    return NextResponse.json({ error: "Bad cursor" }, { status: 400 });
  }

  const admin = createAdminClient();
  let query = admin
    .from("admin_activity_log")
    .select("id, actor_id, action, target_label, amount_paise, details, created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (before) query = query.lt("created_at", before);

  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Could not read the log." }, { status: 500 });
  }

  // Names resolved here rather than sent from the browser: the screen holds
  // only the admins it was rendered with, and an entry written by somebody
  // since suspended would come back as "Unknown admin" for ever.
  const actorIds = Array.from(new Set((rows ?? []).map((r) => r.actor_id)));
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);
    for (const p of profiles ?? []) names.set(p.id, p.full_name ?? "Unnamed admin");
  }

  return NextResponse.json({
    rows: (rows ?? []).map((r) => ({
      id: r.id,
      actorName: names.get(r.actor_id) ?? "Unknown admin",
      action: r.action,
      targetLabel: r.target_label,
      amountPaise: r.amount_paise,
      details: r.details ?? null,
      createdAt: r.created_at,
      // The Logs section is Master Admin's, who reads everything, so there
      // is nothing for the scope filter to do here. Carried anyway because
      // the row shape is shared with the screen the three desks use.
      actorScope: null,
    })),
    // A short page is the end of the log. A full one may or may not be, so
    // the button stays and the next call answers it -- offering one more
    // press that returns nothing is a better failure than hiding entries
    // behind a button that vanished a row early.
    hasMore: (rows ?? []).length === PAGE_SIZE,
  });
}
