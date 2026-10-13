// A condition's programme code (treatment_categories.short_code), written
// by the two Catalog condition routes.
//
// The database makes one from the name when there is none (a trigger in
// schema.sql) and refuses a duplicate (a unique index); this checks what an
// admin typed first so the answer is a sentence, not a constraint name. It
// is its own write after the row's, like the other migration-dependent
// columns, so a database without the column loses the code and keeps the
// edit.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { conditionCodeProblem, normaliseConditionCode } from "@/lib/programmeId";

const UNDEFINED_COLUMN = "42703";
const UNIQUE_VIOLATION = "23505";

export type ConditionCodeCheck =
  | { ok: true; code: string | null | undefined }
  | { ok: false; status: number; error: string };

/**
 * What to write. `undefined` = leave it alone (the field was not sent, or
 * the column does not exist yet); `null` = let the database make one from
 * the name; a string = that code, already checked.
 */
export async function checkConditionCode(
  admin: SupabaseClient,
  raw: unknown,
  selfId: string | null
): Promise<ConditionCodeCheck> {
  if (raw === undefined) return { ok: true, code: undefined };
  if (raw !== null && typeof raw !== "string") {
    return { ok: false, status: 400, error: "The programme code has to be 2 to 4 letters." };
  }
  const code = normaliseConditionCode(raw ?? "");
  if (!code) return { ok: true, code: null };
  const problem = conditionCodeProblem(code);
  if (problem) return { ok: false, status: 400, error: problem };

  let query = admin.from("treatment_categories").select("id, title").eq("short_code", code).limit(1);
  if (selfId) query = query.neq("id", selfId);
  const { data, error } = await query;
  if (error) {
    if ((error as { code?: string }).code === UNDEFINED_COLUMN) return { ok: true, code: undefined };
    // A check that could not be run is not one that came back clear.
    return { ok: false, status: 503, error: "Couldn't check that programme code just now. Please try again." };
  }
  const taken = (data ?? [])[0] as { title?: string } | undefined;
  if (taken) {
    return {
      ok: false,
      status: 409,
      error: `${code} is already the code for ${taken.title ?? "another condition"}. Pick another.`,
    };
  }
  return { ok: true, code };
}

/** Writes the checked code. A warning sentence when it could not be saved. */
export async function writeConditionCode(
  admin: SupabaseClient,
  id: string,
  code: string | null | undefined
): Promise<string | null> {
  if (code === undefined) return null;
  try {
    const { error } = await admin.from("treatment_categories").update({ short_code: code }).eq("id", id);
    if (!error) return null;
    const errCode = (error as { code?: string }).code;
    if (errCode === UNDEFINED_COLUMN) return null;
    if (errCode === UNIQUE_VIOLATION) {
      return `Saved, but ${code} was taken by another condition a moment ago, so the programme code was not changed.`;
    }
    console.error("Could not save a condition's programme code", id, error);
    return "Saved, but the programme code could not be written. Please try it again.";
  } catch (e) {
    console.error("Could not save a condition's programme code", id, e);
    return "Saved, but the programme code could not be written. Please try it again.";
  }
}
