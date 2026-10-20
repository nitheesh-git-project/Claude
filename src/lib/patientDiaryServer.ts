import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllRows } from "@/lib/supabase/readAllRows";
import { PATIENT_DIARY_SELECT, parseDiaryEntryRow, type DiaryEntry } from "@/lib/patientDiary";

// Reads of the patient diary (patient_diary_entries), one call each, in the
// outcomeServer.ts shape: a discriminated result where a failed read is
// "unreadable" -- which a screen words as "we couldn't load the diary, it is
// not missing" -- and never an empty diary. Works with either client: the
// patient's own (RLS: their rows), a therapist's (the clinical-access rule)
// or the service role (the routes).
//
// Shaping (weekly totals, falls since a date, the freezing graph, the
// provenance words) is in src/lib/patientDiary.ts, pure and tested.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

/** Generous enough that no patient reaches it; a diary that does is refused
 *  rather than drawn short ("complete or refused"). */
export const DIARY_MAX_ROWS = 5_000;

export type DiaryRead =
  | { status: "ok"; entries: DiaryEntry[] }
  | { status: "unreadable"; reason: "error" | "too_many" };

/**
 * A patient's diary entries, oldest first, paged through readAllRows.
 * `sinceIso` limits the read to entries that happened on or after it (a
 * screen showing the last twelve weeks need not read three years). A row
 * that does not parse is skipped, never fatal.
 */
export async function loadDiaryEntries(
  client: AnyClient,
  patientId: string,
  opts: { sinceIso?: string } = {}
): Promise<DiaryRead> {
  try {
    const { rows, error, truncated } = await readAllRows<Record<string, unknown>>(
      () => {
        let query = client.from("patient_diary_entries").select(PATIENT_DIARY_SELECT).eq("patient_id", patientId);
        if (opts.sinceIso) query = query.gte("occurred_at", opts.sinceIso);
        return query.order("occurred_at", { ascending: true }).order("id", { ascending: true });
      },
      { maxRows: DIARY_MAX_ROWS }
    );
    if (error) return { status: "unreadable", reason: "error" };
    if (truncated) return { status: "unreadable", reason: "too_many" };
    return { status: "ok", entries: rows.map(parseDiaryEntryRow).filter((e): e is DiaryEntry => e !== null) };
  } catch {
    return { status: "unreadable", reason: "error" };
  }
}

export type DiaryEntryRead =
  | { status: "ok"; entry: DiaryEntry }
  | { status: "not_found" }
  | { status: "unreadable" };

/** One entry by id (the confirm route's first read: it learns the patient
 *  from the row, never from the body). */
export async function loadDiaryEntry(client: AnyClient, entryId: string): Promise<DiaryEntryRead> {
  try {
    const { data, error } = await client.from("patient_diary_entries").select(PATIENT_DIARY_SELECT).eq("id", entryId).maybeSingle();
    if (error) return { status: "unreadable" };
    if (!data) return { status: "not_found" };
    const entry = parseDiaryEntryRow(data);
    return entry ? { status: "ok", entry } : { status: "unreadable" };
  } catch {
    return { status: "unreadable" };
  }
}
