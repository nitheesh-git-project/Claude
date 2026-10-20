import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCareStatus, loadEnabledLicensedMeasures, loadGoalAndMilestones, loadMeasurements } from "@/lib/outcomeServer";
import { loadSummaryAuthorName } from "@/lib/careStatusAuthor";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAllRows } from "@/lib/supabase/readAllRows";
import { parsePedsAssessments, PEDS_ASSESSMENT_SELECT, type PedsAssessmentRow } from "@/lib/pedsExam";
import { pedsTodayIso } from "@/lib/pedsAge";
import type { PedsReads } from "@/lib/pedsProfileView";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = SupabaseClient<any, any, any>;

/** More examinations than a child's record will ever hold; past it the read
 *  is "unreadable" rather than silently cut short. */
export const PEDS_EXAMS_MAX_ROWS = 1_000;

/**
 * The paediatric examinations, newest first, through `client` -- the
 * patient's own session, the assigned therapist's, or the admin client; RLS
 * (peds_assessments_select_*) is the authorisation. Its own call, so a
 * database without the table costs the exam card, which says it could not
 * load rather than "nothing recorded", and not the page.
 */
export async function loadPedsExams(client: AnyClient, patientId: string): Promise<PedsReads["exams"]> {
  try {
    const { rows, error, truncated } = await readAllRows<PedsAssessmentRow>(
      () =>
        client
          .from("peds_assessments")
          .select(PEDS_ASSESSMENT_SELECT)
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true }),
      { maxRows: PEDS_EXAMS_MAX_ROWS }
    );
    if (error || truncated) return { status: "unreadable" };
    return { status: "ok", exams: parsePedsAssessments(rows) };
  } catch {
    return { status: "unreadable" };
  }
}

/**
 * The child's date of birth and gender (`profiles.date_of_birth`,
 * `profiles.gender` -- the patient record's own; the intake does not ask
 * again). Read with the admin client because a therapist's session cannot
 * read a patient's profile row; the caller has already authorised the
 * page. Only the shaper sees the date itself (pedsProfileView.ts).
 */
export async function loadPedsBirth(admin: AnyClient, patientId: string): Promise<PedsReads["birth"]> {
  try {
    const { data, error } = await admin.from("profiles").select("date_of_birth, gender").eq("id", patientId).maybeSingle();
    if (error) return { status: "unreadable" };
    return {
      status: "ok",
      birthDate: typeof data?.date_of_birth === "string" ? data.date_of_birth : null,
      gender: typeof data?.gender === "string" ? data.gender : null,
    };
  } catch {
    return { status: "unreadable" };
  }
}

/**
 * Every read behind the paediatric Health Profile, each its own call and run
 * together: the examinations, the date of birth, the recorded measurements
 * (standing time and independent steps live there), the goal and steps, the
 * phase and status history, the licence switch, and the name behind "Where
 * things stand". No diary: the paediatric profile keeps none (owner's
 * decision). Paediatric pages only -- another condition type makes none of
 * these calls, the same two-phase rule as the other exam layers.
 */
export async function loadPedsReads(client: AnyClient, patientId: string): Promise<PedsReads> {
  const admin = createAdminClient();
  const [exams, birth, measurements, goals, careStatus, licence] = await Promise.all([
    loadPedsExams(client, patientId),
    loadPedsBirth(admin, patientId),
    loadMeasurements(client, patientId),
    loadGoalAndMilestones(client, patientId),
    loadCareStatus(client, patientId, { profileKind: "pediatrics" }),
    loadEnabledLicensedMeasures(admin),
  ]);
  const summaryAuthorName =
    careStatus.status === "ok" ? await loadSummaryAuthorName(admin, careStatus.events, "pediatrics") : null;
  const nowMs = Date.now();
  return {
    exams,
    birth,
    measurements,
    goals,
    careStatus: careStatus.status === "ok" ? { status: "ok", events: careStatus.events } : { status: "unreadable" },
    licence: licence.status === "ok" ? { status: "ok", keys: licence.keys } : { status: "unreadable" },
    summaryAuthorName,
    nowMs,
    todayIso: pedsTodayIso(nowMs),
  };
}
