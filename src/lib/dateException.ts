import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDateKey, parseExceptionRangesBody } from "@/lib/availabilityRequest";
import { exceptionRowsForRanges, formatRanges } from "@/lib/availabilityRanges";

// One date's exception to a therapist's weekly hours, behind both doors: the
// admin writing on a therapist's behalf, and the therapist writing their
// own. Same reason saveWeeklySchedule.ts is one function for two routes --
// the second door must not grow weaker rules than the first.
//
// `mode`:
//   "unavailable"  -- the whole date is closed
//   "custom_hours" -- exactly `ranges` are open, everything else closed
//   "clear"        -- the date goes back to following the weekly schedule

export type DateExceptionMode = "unavailable" | "custom_hours" | "clear";

export type ParsedDateException = {
  dateKey: string;
  mode: DateExceptionMode;
  rows: { hour: number; available: boolean }[];
  note: string | null;
  /** In words, for the activity log and the response. */
  description: string;
};

export function parseDateExceptionBody(body: {
  date?: unknown;
  mode?: unknown;
  ranges?: unknown;
  note?: unknown;
}): ParsedDateException | { error: string } {
  const date = parseDateKey(body.date);
  if ("error" in date) return { error: date.error };

  const mode = body.mode;
  if (mode !== "unavailable" && mode !== "custom_hours" && mode !== "clear") {
    return { error: "Invalid mode" };
  }

  const note = typeof body.note === "string" ? body.note.slice(0, 200) : null;

  if (mode === "unavailable") {
    return {
      dateKey: date.dateKey,
      mode,
      rows: exceptionRowsForRanges([]),
      note,
      description: "Unavailable all day",
    };
  }
  if (mode === "custom_hours") {
    const parsed = parseExceptionRangesBody(body.ranges);
    if ("error" in parsed) return { error: parsed.error };
    if (parsed.ranges.length === 0) {
      return { error: "Add at least one set of hours, or mark the day unavailable." };
    }
    return {
      dateKey: date.dateKey,
      mode,
      rows: exceptionRowsForRanges(parsed.ranges),
      note,
      description: `Available ${formatRanges(parsed.ranges)}`,
    };
  }
  return { dateKey: date.dateKey, mode, rows: [], note, description: "Back to the weekly schedule" };
}

/**
 * Whether a date is already behind the therapist. ISO date keys compare as
 * strings, and `todayKey` is the therapist's own local today -- the same
 * key the screen lists exceptions from.
 */
export function isPastDateKey(dateKey: string, todayKey: string): boolean {
  return dateKey < todayKey;
}

export async function writeDateException(
  admin: SupabaseClient,
  input: { therapistId: string; exception: ParsedDateException; actorId: string }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await admin.rpc("set_therapist_date_exception", {
    p_therapist_id: input.therapistId,
    p_date: input.exception.dateKey,
    p_rows: input.exception.rows,
    p_note: input.exception.note,
    p_actor: input.actorId,
  });
  if (!error) return { ok: true };
  const missing =
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /set_therapist_date_exception/.test(error.message ?? "");
  return {
    ok: false,
    message: missing
      ? "The roster database update hasn't been applied yet. Ask an admin to re-run supabase/schema.sql."
      : error.message,
  };
}
