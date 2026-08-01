// session_code is new and migration-dependent (see supabase/schema.sql's
// "Unique display IDs" section), so every page that needs it queries it in
// its own isolated call and merges it in here -- never folds it into a
// bigger shared select, matching this codebase's established convention
// (see admin/dashboard/page.tsx's therapist_payout_batch_id handling) for
// why: an unknown-column error on a shared query blanks everything that
// query feeds, not just the session IDs.
export function mergeSessionCodes<T extends { id: string }>(
  rows: T[],
  codeRows: { id: string; session_code: string | null }[] | null
): (T & { session_code: string | null })[] {
  const byId = new Map((codeRows ?? []).map((r) => [r.id, r.session_code]));
  return rows.map((r) => ({ ...r, session_code: byId.get(r.id) ?? null }));
}
