import { NextRequest, NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonBody } from "@/lib/parseJsonBody";
import { recordAdminActivity } from "@/lib/adminActivityLog";
import { ADMIN_SCOPES, type AdminScope } from "@/lib/adminScope";

// Changes what another admin can reach, or removes their admin rights
// entirely by demoting them.
//
// Only a 'full' admin may call this: any other scope being able to widen
// its own access makes the whole scope system decoration. The two guards
// below (can't change your own scope, can't remove the last full admin) are
// the ones that actually matter -- without them a single mis-click locks
// everyone out of the dashboard permanently, with no way back in short of
// editing the database by hand, which is the exact problem scopes exist to
// end.

type Body = { userId?: string; scope?: string };

export async function POST(request: NextRequest) {
  const context = await getAdminContext();
  if (!context || context.scope !== "full") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await parseJsonBody<Body>(request);
  if (parsed.error) return parsed.error;

  const userId = parsed.data.userId?.trim();
  const scope = parsed.data.scope?.trim();

  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }
  if (!scope || !ADMIN_SCOPES.includes(scope as AdminScope)) {
    return NextResponse.json({ error: "Unknown access level." }, { status: 400 });
  }
  if (userId === context.id) {
    return NextResponse.json(
      { error: "You can't change your own access. Ask another Master Admin." },
      { status: 409 }
    );
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, full_name, role, admin_scope")
    .eq("id", userId)
    .maybeSingle();

  if (!target || target.role !== "admin") {
    return NextResponse.json({ error: "That person isn't an admin." }, { status: 404 });
  }

  // Narrowing the last full-access admin leaves nobody who can ever widen
  // anyone again -- including themselves, per the self-change guard above.
  if (target.admin_scope === "full" && scope !== "full") {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("admin_scope", "full");

    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "This is the only Master Admin. Make someone else a Master Admin first." },
        { status: 409 }
      );
    }
  }

  const { error } = await admin
    .from("profiles")
    .update({ admin_scope: scope })
    .eq("id", userId)
    .eq("role", "admin");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await recordAdminActivity(admin, context.id, {
    action: "admin.set_scope",
    targetId: userId,
    targetLabel: target.full_name,
    details: { from: target.admin_scope ?? "full", to: scope },
  });

  return NextResponse.json({ success: true });
}
