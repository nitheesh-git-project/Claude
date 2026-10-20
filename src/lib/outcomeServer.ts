import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllRows } from "@/lib/supabase/readAllRows";
import { parseConditionSpecialty, type ConditionSpecialty } from "@/lib/conditionSpecialty";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import { profileKindFor } from "@/lib/profileKind";
import { parseEnabledLicensedMeasures, type LicensedMeasuresRead } from "@/lib/licensedMeasures";
import { OUTCOME_MEASUREMENT_SELECT, type OutcomeMeasurementRow } from "@/lib/outcomeSeries";
import {
  CARE_GOAL_SELECT,
  CARE_MILESTONE_SELECT,
  parseCareGoalRow,
  parseCareMilestoneRow,
  type CareGoal,
  type CareMilestone,
} from "@/lib/careGoals";

// The server reads of the measurement and milestone layers (Health Profile
// redesign, phase 2a). Shaping is outcomeSeries.ts / careGoals.ts.
//
// Every read is its own call and answers a discriminated result, never a
// bare array: "the read failed" and "nothing recorded yet" are different
// sentences on the card (docs/rules/clinical.md -- the neurological exam's
// rule 7, and "a check that could not be run is not a check that came back
// negative"). A database without one of these tables costs that card, not
// the page.
//
// Each takes the client to read with: the patient's own page passes its
// RLS-scoped server client (the policies are the gate), the therapist's
// and the admin's pages pass the service-role client after their own
// access checks -- the same split the neurological exam's reads use.

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = SupabaseClient<any, any, any>;

/** Generous enough that no patient reaches it; a record that does is
 *  refused rather than drawn short ("complete or refused"). */
export const MEASUREMENTS_MAX_ROWS = 5_000;

export type MeasurementsRead =
  | { status: "ok"; rows: OutcomeMeasurementRow[] }
  | { status: "unreadable"; reason: "error" | "too_many" };

/**
 * Every outcome measurement on a patient's record, oldest first, paged
 * through readAllRows (PostgREST stops at 1,000 rows without saying so).
 * A walk that hits MEASUREMENTS_MAX_ROWS is "unreadable", never a graph
 * missing its newest points.
 */
export async function loadMeasurements(client: AnyClient, patientId: string): Promise<MeasurementsRead> {
  try {
    const { rows, error, truncated } = await readAllRows<OutcomeMeasurementRow>(
      () =>
        client
          .from("outcome_measurements")
          .select(OUTCOME_MEASUREMENT_SELECT)
          .eq("patient_id", patientId)
          .order("measured_at", { ascending: true })
          .order("id", { ascending: true }),
      { maxRows: MEASUREMENTS_MAX_ROWS }
    );
    if (error) return { status: "unreadable", reason: "error" };
    if (truncated) return { status: "unreadable", reason: "too_many" };
    return { status: "ok", rows };
  } catch {
    return { status: "unreadable", reason: "error" };
  }
}

export type GoalAndMilestonesRead =
  | {
      status: "ok";
      /** The goal at the top of the profile, or null when none is active. */
      activeGoal: CareGoal | null;
      /** Every goal, newest first -- achieved and closed ones included. */
      goals: CareGoal[];
      /** Every milestone of every goal, in no particular order: the screen
       *  filters by goalId and orders with shapeMilestones(). */
      milestones: CareMilestone[];
    }
  | { status: "unreadable" };

/** The patient's goals and milestones. Both reads must succeed: a goal
 *  drawn without its milestones would read as "no steps planned". */
export async function loadGoalAndMilestones(client: AnyClient, patientId: string): Promise<GoalAndMilestonesRead> {
  try {
    const [goals, milestones] = await Promise.all([
      readAllRows<Record<string, unknown>>(() =>
        client
          .from("care_goals")
          .select(CARE_GOAL_SELECT)
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
      ),
      readAllRows<Record<string, unknown>>(() =>
        client
          .from("care_milestones")
          .select(CARE_MILESTONE_SELECT)
          .eq("patient_id", patientId)
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true })
      ),
    ]);
    if (goals.error || milestones.error || goals.truncated || milestones.truncated) return { status: "unreadable" };
    const parsedGoals = goals.rows.map(parseCareGoalRow).filter((g): g is CareGoal => g !== null);
    return {
      status: "ok",
      activeGoal: parsedGoals.find((g) => g.status === "active") ?? null,
      goals: parsedGoals,
      milestones: milestones.rows.map(parseCareMilestoneRow).filter((m): m is CareMilestone => m !== null),
    };
  } catch {
    return { status: "unreadable" };
  }
}

/**
 * The licensed scales the clinic has switched on
 * (site_settings.enabled_licensed_measures). Its own call, never through
 * SITE_SETTINGS_SELECT -- the newest-column rule -- and failing CLOSED:
 * "unreadable" enables nothing (enabledLicensedSet()). The one exception
 * is a database without the column at all (42703): nothing can have been
 * switched on there, so that is an honest empty list, the same exception
 * resolveAdminScope makes for a database without admin_scope.
 */
export async function loadEnabledLicensedMeasures(admin: AnyClient): Promise<LicensedMeasuresRead> {
  try {
    const { data, error } = await admin.from("site_settings").select("enabled_licensed_measures").eq("id", true).maybeSingle();
    if (error) return error.code === "42703" ? { status: "ok", keys: [] } : { status: "unreadable" };
    return { status: "ok", keys: parseEnabledLicensedMeasures(data?.enabled_licensed_measures) };
  } catch {
    return { status: "unreadable" };
  }
}

export type PatientProfileKindRead =
  | { status: "ok"; specialty: ConditionSpecialty; profileKind: ProfileKind }
  /** No condition profile on file: nobody has recorded what kind of
   *  patient this is, so no measure can be checked against it. */
  | { status: "no_profile" }
  | { status: "unreadable" };

/**
 * Which profile kind a patient's measurements and milestones are checked
 * against, re-derived on the server from the recorded condition type and
 * the intake answers (profileKindFor) -- never taken from the client. A
 * failed read is "unreadable" (a 503), never a fall-back to orthopaedic:
 * the column's ortho default is exactly how a neurological patient would be
 * measured against the wrong thresholds.
 */
export async function loadPatientProfileKind(admin: AnyClient, patientId: string): Promise<PatientProfileKindRead> {
  try {
    const { data, error } = await admin
      .from("patient_condition_profiles")
      .select("specialty, data")
      .eq("patient_id", patientId)
      .maybeSingle();
    if (error) return { status: "unreadable" };
    if (!data) return { status: "no_profile" };
    const specialty = parseConditionSpecialty(data.specialty);
    const intake = (data.data ?? {}) as Record<string, unknown>;
    return { status: "ok", specialty, profileKind: profileKindFor(specialty, intake) };
  } catch {
    return { status: "unreadable" };
  }
}
