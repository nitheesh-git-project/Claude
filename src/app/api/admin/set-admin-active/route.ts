import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";

// Suspends another admin's access to this dashboard, or gives it back.
//
// The enforcement for this already existed and the control did not:
// `getAdminUser` refuses an admin whose `profiles.active` is false, and the
// proxy's admin branch does the same, so the only way to switch it was
// editing the row by hand in Supabase -- the exact gap scopes were added to
// close, left open for the one case that matters most. Somebody leaves the
// clinic on a Friday and the person who needs to close the door is the owner,
// not whoever has database access.
//
// Suspending rather than deleting is deliberate: an admin's id is on every
// audit row they ever wrote, and deleting the account to remove their access
// would take the record of what they did with it.
//
// It mirrors set-admin-scope's two guards for the same reasons. Not yourself
// -- locking yourself out needs somebody else to let you back in, and this is
// the one action with no undo from the outside. Not the last active Master
// Admin -- there would be nobody left who could restore anyone, including
// them.
//
// `getAdminContext` + an explicit `full` check rather than
// requireAdminScope("settings"): the two are the same answer today, and
// spelling it out here keeps this route saying what it means, since who may
// take away access is a rule in its own right rather than a consequence of
// where the button happens to sit.

type Body = { userId?: string; active?: unknown };

export async function POST(request: NextRequest) {
  const context = await getAdminContext();
  if (!context || context.scope !== "full") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await parseJsonBody<Body>(request);
  if (parsed.error) return parsed.error;

  const userId = parsed.data.userId?.trim();
  const active = parsed.data.active;

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }
  if (typeof active !== "boolean") {
    return NextResponse.json({ error: "Missing active" }, { status: 400 });
  }
  if (userId === context.id) {
    return NextResponse.json(
      { error: "You can't suspend your own access. Ask another Master Admin." },
      { status: 409 }
    );
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, full_name, role, active, admin_scope")
    .eq("id", userId)
    .maybeSingle();

  if (!target || target.role !== "admin") {
    return NextResponse.json({ error: "That person isn't an admin." }, { status: 404 });
  }

  if (!active && (target.admin_scope ?? "full") === "full") {
    // Counted over admins who are still active, since a suspended Master
    // Admin cannot restore anybody either -- they cannot get in.
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("admin_scope", "full")
      .neq("active", false);

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "This is the only Master Admin who can still sign in. Make someone else a Master Admin first." },
        { status: 409 }
      );
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({ active })
    .eq("id", userId)
    .eq("role", "admin");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAdminActivity(admin, context.id, {
    action: "account.set_active",
    targetId: userId,
    targetLabel: target.full_name,
    details: { role: "admin", active },
  });

  return NextResponse.json({ success: true, active });
}
