import { createAdminClient } from "@/lib/supabase/admin";
import {
  IMPERSONATION_SELECT,
  buildImpersonationLog,
  type ImpersonationActionRow,
  type ImpersonationSessionRow,
} from "@/lib/impersonationLog";
import AdminImpersonationLog from "@/components/admin/AdminImpersonationLog";

// Logs -> Signed in as. Self-fetching like the other single-screen readers,
// so the dashboard's big batch does not grow for it; Logs is Master Admin
// only (adminScope.ts) and this screen is rendered only there.
//
// The newest 1,000 windows, the changes made inside them, and the names of
// everybody they mention. An unreadable table says so rather than drawing an
// empty list, which would read as "nobody has ever done this".
const MAX_SESSIONS = 1000;

export default async function ImpersonationLogSettings() {
  const admin = createAdminClient();
  const { data: sessions, error } = await admin
    .from("admin_impersonation_sessions")
    .select(IMPERSONATION_SELECT)
    .order("started_at", { ascending: false })
    .limit(MAX_SESSIONS);

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-semibold">We couldn&apos;t load the sign-in record just now.</p>
        <p className="mt-1">Nothing has been changed. Refresh the page to try again.</p>
      </div>
    );
  }

  const rows = (sessions ?? []) as ImpersonationSessionRow[];
  const oldest = rows.at(-1)?.started_at ?? null;
  const people = [...new Set(rows.flatMap((r) => [r.admin_id, r.target_id]).filter((id): id is string => !!id))];

  const [actionsRead, namesRead] = await Promise.all([
    oldest
      ? admin
          .from("admin_activity_log")
          .select("created_at, details")
          .eq("action", "impersonation.action")
          .gte("created_at", oldest)
          .order("created_at", { ascending: false })
          .limit(5000)
      : Promise.resolve({ data: [] as ImpersonationActionRow[], error: null }),
    people.length
      ? admin.from("profiles").select("id, full_name, email").in("id", people)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[], error: null }),
  ]);

  const names = new Map(
    ((namesRead.data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => [
      p.id,
      p.full_name?.trim() || p.email || "Unnamed account",
    ])
  );
  const entries = buildImpersonationLog(rows, (actionsRead.data ?? []) as ImpersonationActionRow[], names, nowTimestamp());

  return (
    <AdminImpersonationLog
      entries={entries}
      truncated={rows.length >= MAX_SESSIONS}
      actionsUnavailable={!!actionsRead.error}
    />
  );
}

function nowTimestamp() {
  return Date.now();
}
