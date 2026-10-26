import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCareStatus, loadEnabledLicensedMeasures, loadGoalAndMilestones, loadMeasurements } from "@/lib/outcomeServer";
import { loadDiaryEntries } from "@/lib/patientDiaryServer";
import { loadSummaryAuthorName } from "@/lib/careStatusAuthor";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NeuroReads } from "@/lib/neuroProfileView";
import { loadIntakeHistory } from "@/lib/profileReadsServer";
import type { NeuroKind } from "@/lib/neuroProfile";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = SupabaseClient<any, any, any>;

/**
 * The reads behind the neurological and Parkinson's Health Profile, each its
 * own call (a failed one degrades its own card - unreadable is never "none
 * yet") and run together: the recorded measurements, the goal and steps, the
 * phase and status history, the patient diary, the intake history (for the
 * independence answer over time) and the licence switch. `client` is whoever
 * is looking - the patient's own session, the assigned therapist's, or the
 * admin client - RLS (or the admin's own gate) is the authorisation, as for
 * the Pain Map; the licence switch and the summary author's name are read
 * with the admin client because they are not readable through a user
 * session. The neurological examination rows are the page's own read (it
 * already makes one) and are passed in.
 *
 * Neurological pages only: another condition type must not make these calls,
 * the same two-phase rule as pain_assessments and neuro_assessments.
 */
export async function loadNeuroReads(
  client: AnyClient,
  patientId: string,
  opts: { kind: NeuroKind }
): Promise<Omit<NeuroReads, "exams" | "examsFailed"> & { nowMs: number }> {
  const admin = createAdminClient();
  const [measurements, goals, careStatus, diary, intakeHistory, licence] = await Promise.all([
    loadMeasurements(client, patientId),
    loadGoalAndMilestones(client, patientId),
    loadCareStatus(client, patientId, { profileKind: opts.kind }),
    loadDiaryEntries(client, patientId),
    loadIntakeHistory(client, patientId),
    loadEnabledLicensedMeasures(admin),
  ]);
  const summaryAuthorName = careStatus.status === "ok" ? await loadSummaryAuthorName(admin, careStatus.events, opts.kind) : null;
  return {
    nowMs: Date.now(),
    measurements,
    goals,
    careStatus: careStatus.status === "ok" ? { status: "ok", events: careStatus.events } : { status: "unreadable" },
    diary: diary.status === "ok" ? { status: "ok", entries: diary.entries } : { status: "unreadable" },
    intakeHistory,
    licence: licence.status === "ok" ? { status: "ok", keys: licence.keys } : { status: "unreadable" },
    summaryAuthorName,
  };
}
