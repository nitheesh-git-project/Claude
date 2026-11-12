import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { ACCOUNT_DELETION_SELECT, type AccountDeletionInfo } from "@/lib/accountDeletionRecords";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Who was deleted with their records kept, keyed by their id, with the name
 * of the admin who did it. Read once per screen and handed to the lists and
 * profiles that show "Deleted user".
 *
 * A database without the table yet (schema not applied) simply has nobody
 * deleted this way, so that case is an empty map; any other failure is
 * logged and also reads as empty, because the tag is a label on a row that
 * still renders correctly without it.
 */
export async function readAccountDeletions(admin: Admin, ids?: string[]): Promise<Map<string, AccountDeletionInfo>> {
  const out = new Map<string, AccountDeletionInfo>();
  let query = admin.from("account_deletions").select(ACCOUNT_DELETION_SELECT).order("deleted_at", { ascending: false }).limit(2000);
  if (ids) {
    if (ids.length === 0) return out;
    query = query.in("user_id", ids);
  }
  const { data, error } = await query;
  if (error) {
    if (error.code !== "42P01" && error.code !== "PGRST205") console.error("account_deletions read failed", error);
    return out;
  }
  const rows = (data ?? []) as AccountDeletionInfo[];
  const actorIds = [...new Set(rows.map((r) => r.deleted_by).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: actors } = await admin.from("profiles").select("id, full_name").in("id", actorIds);
    for (const a of actors ?? []) names.set(a.id as string, (a.full_name as string) ?? "an admin");
  }
  for (const r of rows) out.set(r.user_id, { ...r, deleted_by_name: r.deleted_by ? names.get(r.deleted_by) ?? null : null });
  return out;
}
