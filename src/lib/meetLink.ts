// google_event_id / meet_link are new and migration-dependent (see
// supabase/schema.sql's Google Calendar section), so every page that needs
// them queries in its own isolated call and merges the result in here --
// never folds them into a bigger shared select. Same convention and same
// reasoning as mergeSessionCodes() in src/lib/sessionCode.ts.
export function mergeMeetLinks<T extends { id: string }>(
  rows: T[],
  meetRows: { id: string; meet_link: string | null }[] | null
): (T & { meet_link: string | null })[] {
  const byId = new Map((meetRows ?? []).map((r) => [r.id, r.meet_link]));
  return rows.map((r) => ({ ...r, meet_link: byId.get(r.id) ?? null }));
}
