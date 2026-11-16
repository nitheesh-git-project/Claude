import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/supabase/requireAdmin";
import { scopeCanOpen } from "@/lib/adminScope";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverError } from "@/lib/apiError";

// People -> Data requests: account deletion requests and grievances, newest
// first, closed ones included (the last 200 of each).
//
// GET -> 200 { deletions: [...], grievances: [...], exports: [...] }
// A read: any desk that can open People sees the cases (the screen hides the
// buttons from one that cannot manage them; the update route checks again).
export async function GET() {
  const adminUser = await getAdminContext();
  if (!adminUser || !scopeCanOpen(adminUser.scope, "people")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const [deletions, grievances, exports] = await Promise.all([
    admin
      .from("data_requests")
      .select("id, reference, user_id, role, status, reason, resolution_note, created_at, resolved_at")
      .eq("kind", "deletion")
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("grievances")
      .select("id, reference, user_id, name, email, phone, category, booking_reference, message, status, resolution_note, created_at, acknowledged_at, resolved_at")
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("data_requests")
      .select("reference, user_id, role, created_at")
      .eq("kind", "export")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (deletions.error) return serverError("admin/data-requests:deletions", deletions.error);
  if (grievances.error) return serverError("admin/data-requests:grievances", grievances.error);
  if (exports.error) return serverError("admin/data-requests:exports", exports.error);

  const ids = [
    ...new Set(
      [...(deletions.data ?? []), ...(exports.data ?? [])]
        .map((r) => r.user_id as string | null)
        .filter((x): x is string => !!x)
    ),
  ];
  const people = new Map<string, { name: string | null; email: string | null; deleted: boolean }>();
  if (ids.length) {
    const { data, error } = await admin.from("profiles").select("id, full_name, email, deleted_at").in("id", ids);
    if (error) return serverError("admin/data-requests:profiles", error);
    for (const p of data ?? []) people.set(p.id, { name: p.full_name, email: p.email, deleted: !!p.deleted_at });
  }
  const who = (id: string | null) => (id ? people.get(id) ?? null : null);

  return NextResponse.json({
    deletions: (deletions.data ?? []).map((r) => ({ ...r, person: who(r.user_id) })),
    grievances: grievances.data ?? [],
    exports: (exports.data ?? []).map((r) => ({ ...r, person: who(r.user_id) })),
  });
}
