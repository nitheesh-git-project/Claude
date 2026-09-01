import type { SupabaseClient } from "@supabase/supabase-js";
import type { TemplateSlot } from "@/lib/availabilityRequest";

// One implementation behind both weekly-schedule doors -- the therapist's
// own and the admin writing on their behalf. Same rule as
// carePlanAuthoring.ts: two routes calling one function is what stops the
// second door growing weaker rules than the first.
//
// The write itself is a database function, for the reason record_payment_
// capture is: supabase-js cannot express a transaction, and replacing a
// schedule means a delete and an insert that must either both happen or
// neither. It also holds the row lock that makes the version check a real
// compare-and-swap rather than a read-then-hope.

function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /save_therapist_weekly_schedule/.test(error.message ?? "")
  );
}

export type SaveWeeklyScheduleResult =
  | { status: "ok" | "noop"; version: number }
  | { status: "conflict"; version: number }
  | { status: "error"; message: string };

export async function saveWeeklySchedule(
  admin: SupabaseClient,
  input: {
    therapistId: string;
    slots: TemplateSlot[];
    expectedVersion: number | null;
    actorId: string;
  }
): Promise<SaveWeeklyScheduleResult> {
  const { data, error } = await admin.rpc("save_therapist_weekly_schedule", {
    p_therapist_id: input.therapistId,
    p_slots: input.slots,
    p_expected_version: input.expectedVersion,
    p_actor: input.actorId,
  });

  if (error) {
    // A database that has not had supabase/schema.sql re-applied has no
    // such function, and PostgREST answers with an opaque "not found". Say
    // which thing is missing rather than showing the raw string to whoever
    // pressed Save -- the alternative was falling back to the old unlocked
    // delete-then-insert, which is exactly the write this replaced.
    if (isMissingFunction(error)) {
      return {
        status: "error",
        message:
          "The roster database update hasn't been applied yet. Ask an admin to re-run supabase/schema.sql.",
      };
    }
    return { status: "error", message: error.message };
  }

  const result = (data ?? {}) as { status?: string; version?: number };
  const version = typeof result.version === "number" ? result.version : 0;
  if (result.status === "conflict") return { status: "conflict", version };
  // "noop" means the caller's version was stale but the schedule it asked
  // for is already exactly what is stored -- a double-clicked Save. It is a
  // success, not a conflict: there is nothing left to do and nothing was
  // overwritten.
  if (result.status === "noop") return { status: "noop", version };
  if (result.status === "ok") return { status: "ok", version };
  return { status: "error", message: "Could not save the schedule." };
}

/** The current version for one therapist, for an editor that is about to
 *  offer a Save. Absent state (nobody has saved since the table existed)
 *  reads as 0, which the save function treats as "no version read". */
export async function readScheduleVersion(
  client: SupabaseClient,
  therapistId: string
): Promise<number> {
  const { data } = await client
    .from("therapist_schedule_state")
    .select("version")
    .eq("therapist_id", therapistId)
    .maybeSingle();
  return typeof data?.version === "number" ? data.version : 0;
}
