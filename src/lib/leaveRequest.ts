import type { SupabaseClient } from "@supabase/supabase-js";
import { DATE_KEY_RE } from "@/lib/availabilityRequest";

// Leave dates, validated the same way for the admin's route and the
// therapist's own. Both are optional: the flag alone has always been enough
// to make somebody unavailable, and requiring an end date would mean
// refusing "I'm out, I don't know for how long", which is the case people
// actually have.

export type ParsedLeave = { from: string | null; to: string | null; reason: string | null };

function parseOptionalDate(raw: unknown): string | null | { error: string } {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || !DATE_KEY_RE.test(raw)) return { error: "Invalid leave date." };
  const at = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== raw) {
    return { error: "Invalid leave date." };
  }
  return raw;
}

export function parseLeaveDates(input: {
  onLeave: boolean;
  from?: unknown;
  to?: unknown;
  reason?: unknown;
}): ParsedLeave | { error: string } {
  // Coming back clears the whole annotation -- an absence that has ended
  // should not leave dates behind describing it.
  if (!input.onLeave) return { from: null, to: null, reason: null };

  const from = parseOptionalDate(input.from);
  if (from && typeof from === "object") return from;
  const to = parseOptionalDate(input.to);
  if (to && typeof to === "object") return to;
  if (from && to && from > to) {
    return { error: "Leave can't end before it starts." };
  }
  const reason =
    typeof input.reason === "string" && input.reason.trim()
      ? input.reason.trim().slice(0, 200)
      : null;
  return { from, to, reason };
}

/**
 * Writes the leave flag, and the dates beside it when the database has the
 * columns.
 *
 * The three date/reason columns are newer than `on_leave`, so a database
 * that has not had the migration applied yet would fail the whole update
 * and leave a therapist unable to mark themselves unavailable at all. The
 * flag is the part that matters; the annotation degrades. Same
 * migration-tolerance rule the dashboards' isolated selects follow, applied
 * to a write.
 */
export async function updateTherapistLeave(
  admin: SupabaseClient,
  input: {
    therapistId: string;
    onLeave: boolean;
    /** null means the caller said nothing about dates -- the compact toggle
     *  on the therapist's admin page, which flips the flag and knows
     *  nothing about the reason somebody typed on the roster. Leave those
     *  columns exactly as they are rather than blanking them. */
    dates: ParsedLeave | null;
  }
): Promise<{ id: string; full_name: string | null } | null | { error: string }> {
  if (!input.dates) {
    const flagOnly = await admin
      .from("profiles")
      .update({ on_leave: input.onLeave })
      .eq("id", input.therapistId)
      .eq("role", "therapist")
      .select("id, full_name")
      .maybeSingle();
    if (flagOnly.error) return { error: flagOnly.error.message };
    return flagOnly.data ?? null;
  }

  const withDates = await admin
    .from("profiles")
    .update({
      on_leave: input.onLeave,
      on_leave_from: input.dates.from,
      on_leave_to: input.dates.to,
      on_leave_reason: input.dates.reason,
    })
    .eq("id", input.therapistId)
    .eq("role", "therapist")
    .select("id, full_name")
    .maybeSingle();

  if (!withDates.error) return withDates.data ?? null;

  const flagOnly = await admin
    .from("profiles")
    .update({ on_leave: input.onLeave })
    .eq("id", input.therapistId)
    .eq("role", "therapist")
    .select("id, full_name")
    .maybeSingle();
  if (flagOnly.error) return { error: flagOnly.error.message };
  return flagOnly.data ?? null;
}
