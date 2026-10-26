import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCareStatus, loadEnabledLicensedMeasures, loadGoalAndMilestones, loadMeasurements } from "@/lib/outcomeServer";
import { loadDiaryEntries } from "@/lib/patientDiaryServer";
import { loadSummaryAuthorName } from "@/lib/careStatusAuthor";
import { loadIntakeHistory, loadPersonFacts } from "@/lib/profileReadsServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { clinicDateKey } from "@/lib/clinicWeek";
import type { GeriatricReads } from "@/lib/geriatricProfile";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = SupabaseClient<any, any, any>;

/**
 * The reads behind the Strength and balance care Health Profile (phase 6a),
 * each its own call (a failed one degrades its own card -- unreadable is
 * never "none yet") and run together: the recorded measurements (the four
 * STEADI tests, Katz, the standing blood pressure), the goal and steps, the
 * phase and status history, the diary (falls and near-misses), the intake
 * history (when the falls answer was first given), the licence switch, and
 * the date of birth and gender for the chair-stand norms. `client` is
 * whoever is looking -- the patient's own session, the assigned therapist's,
 * or the admin client -- and RLS (or the admin's own gate) is the
 * authorisation; the licence switch, the person facts and the summary
 * author's name are read with the admin client.
 *
 * Geriatric pages only: another condition type makes none of these calls
 * (the two-phase rule).
 */
export async function loadGeriatricReads(client: AnyClient, patientId: string): Promise<GeriatricReads> {
  const admin = createAdminClient();
  const [measurements, goals, careStatus, diary, intakeHistory, licence, person] = await Promise.all([
    loadMeasurements(client, patientId),
    loadGoalAndMilestones(client, patientId),
    loadCareStatus(client, patientId, { profileKind: "geriatric" }),
    loadDiaryEntries(client, patientId),
    loadIntakeHistory(client, patientId),
    loadEnabledLicensedMeasures(admin),
    loadPersonFacts(admin, patientId),
  ]);
  const summaryAuthorName =
    careStatus.status === "ok" ? await loadSummaryAuthorName(admin, careStatus.events, "geriatric") : null;
  const nowMs = Date.now();
  return {
    measurements,
    goals,
    careStatus: careStatus.status === "ok" ? { status: "ok", events: careStatus.events } : { status: "unreadable" },
    diary: diary.status === "ok" ? { status: "ok", entries: diary.entries } : { status: "unreadable" },
    intakeHistory,
    licence: licence.status === "ok" ? { status: "ok", keys: licence.keys } : { status: "unreadable" },
    person,
    summaryAuthorName,
    nowMs,
    todayIso: clinicDateKey(nowMs),
  };
}
