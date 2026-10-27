import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { createAdminClient } from "@/lib/supabase/admin";
import { parseConditionSpecialty } from "@/lib/conditionSpecialty";
import { profileKindFor } from "@/lib/profileKind";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import type { ContraFlag } from "@/lib/exerciseLibrary";
import {
  EXERCISE_PLAN_ITEM_SELECT,
  EXERCISE_PLAN_SELECT,
  EXERCISE_TEACHING_EVENT_SELECT,
  contraFlagsFromIntake,
  homeExerciseNotePrefill,
  orderTeachingEvents,
  parsePlanItemRow,
  parsePlanRow,
  parseTeachingEventRow,
  planItemsJson,
  type ExercisePlan,
  type ExerciseRefusal,
  type PlanItemInput,
  type TeachingEvent,
} from "@/lib/exercisePlan";

// The server half of HOME EXERCISES (phase 7d): the reads every screen uses
// and the publish call. The shapes and the rules are exercisePlan.ts (pure,
// tested); this file only reads and writes.
//
// Every read answers a discriminated result -- "could not read" is never
// "no plan" ("a check that could not be run is not a check that came back
// negative"). The patient's dashboard passes the PATIENT'S OWN client: RLS
// (exercise_plans_select_own_active and friends) is the gate, so they read
// their own active plan and nothing else. The therapist's cockpit and chart
// and the admin's read pass the service-role client after their own access
// checks, or their own client under the clinical-access policies.

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = SupabaseClient<any, any, any>;
type AdminClient = ReturnType<typeof createAdminClient>;

const MISSING = new Set(["42P01", "PGRST205", "42883", "PGRST202"]);

/** Past this a plan's history is unreadable rather than judged short. */
export const TEACHING_EVENTS_MAX_ROWS = 500;
export const PLAN_HISTORY_MAX = 50;

export function exerciseRefusalResponse(refusal: ExerciseRefusal): NextResponse {
  return NextResponse.json({ error: refusal.error, code: refusal.code }, { status: refusal.status });
}

export function exercisesNotMigrated(): NextResponse {
  return NextResponse.json(
    { error: "This database has not been updated for home exercises yet.", code: "not_migrated" },
    { status: 503 }
  );
}

export function exercisesCouldNotCheck(): NextResponse {
  return NextResponse.json({ error: "We couldn't check the home exercises just now. Please try again." }, { status: 503 });
}

// --- Reads ----------------------------------------------------------------------------

async function loadItems(client: AnyClient, planIds: readonly string[]) {
  if (planIds.length === 0) return [];
  const { data, error } = await client.from("exercise_plan_items").select(EXERCISE_PLAN_ITEM_SELECT).in("plan_id", planIds).order("sort_order");
  if (error || !data) return null;
  const items = data.map(parsePlanItemRow);
  if (items.some((i) => i === null)) return null;
  return items as NonNullable<(typeof items)[number]>[];
}

async function loadEventsWhere(client: AnyClient, column: "plan_id" | "run_id" | "patient_id", value: string): Promise<TeachingEvent[] | null> {
  const { data, error } = await client
    .from("exercise_teaching_events")
    .select(EXERCISE_TEACHING_EVENT_SELECT)
    .eq(column, value)
    .order("created_at", { ascending: true })
    .limit(TEACHING_EVENTS_MAX_ROWS + 1);
  if (error || !data || data.length > TEACHING_EVENTS_MAX_ROWS) return null;
  const events = data.map(parseTeachingEventRow);
  if (events.some((e) => e === null)) return null;
  return orderTeachingEvents(events as TeachingEvent[]);
}

export type ActivePlanRead =
  | { status: "ok"; plan: ExercisePlan | null; teaching: TeachingEvent[] }
  | { status: "not_migrated" }
  | { status: "unreadable" };

/**
 * The patient's ACTIVE plan (at most one, by index) with its items in order
 * and the teaching marks recorded against it. With the patient's own client
 * this is exactly what their dashboard may show; null when there is none.
 */
export async function loadActiveExercisePlan(client: AnyClient, patientId: string): Promise<ActivePlanRead> {
  try {
    const { data, error } = await client
      .from("exercise_plans")
      .select(EXERCISE_PLAN_SELECT)
      .eq("patient_id", patientId)
      .eq("status", "active")
      .maybeSingle();
    if (error) return MISSING.has(error.code ?? "") ? { status: "not_migrated" } : { status: "unreadable" };
    if (!data) return { status: "ok", plan: null, teaching: [] };
    const items = await loadItems(client, [data.id as string]);
    if (!items) return { status: "unreadable" };
    const plan = parsePlanRow(data, items);
    if (!plan) return { status: "unreadable" };
    const teaching = await loadEventsWhere(client, "plan_id", plan.id);
    if (!teaching) return { status: "unreadable" };
    return { status: "ok", plan, teaching };
  } catch {
    return { status: "unreadable" };
  }
}

export type PlanHistoryRead = { status: "ok"; plans: ExercisePlan[] } | { status: "not_migrated" } | { status: "unreadable" };

/** Every version, newest first, with items -- the clinician's history
 *  (the patient's own client sees only the active one, by RLS). */
export async function loadExercisePlanHistory(client: AnyClient, patientId: string): Promise<PlanHistoryRead> {
  try {
    const { data, error } = await client
      .from("exercise_plans")
      .select(EXERCISE_PLAN_SELECT)
      .eq("patient_id", patientId)
      .order("version", { ascending: false })
      .limit(PLAN_HISTORY_MAX);
    if (error) return MISSING.has(error.code ?? "") ? { status: "not_migrated" } : { status: "unreadable" };
    const rows = data ?? [];
    const items = await loadItems(client, rows.map((r) => r.id as string));
    if (!items) return { status: "unreadable" };
    const plans = rows.map((r) => parsePlanRow(r, items));
    if (plans.some((p) => p === null)) return { status: "unreadable" };
    return { status: "ok", plans: plans as ExercisePlan[] };
  } catch {
    return { status: "unreadable" };
  }
}

export type TeachingRead = { status: "ok"; events: TeachingEvent[] } | { status: "not_migrated" } | { status: "unreadable" };

/** What was marked while teaching in one guided run, oldest first. */
export async function loadTeachingEvents(client: AnyClient, runId: string): Promise<TeachingRead> {
  try {
    const { error: probe } = await client.from("exercise_teaching_events").select("id").limit(0);
    if (probe) return MISSING.has(probe.code ?? "") ? { status: "not_migrated" } : { status: "unreadable" };
    const events = await loadEventsWhere(client, "run_id", runId);
    return events ? { status: "ok", events } : { status: "unreadable" };
  } catch {
    return { status: "unreadable" };
  }
}

export type PatientTeachingRead = { status: "ok"; events: TeachingEvent[] } | { status: "not_migrated" } | { status: "unreadable" };

/** Every teaching mark for a patient across all plan versions, oldest first
 *  (the clinician's chart; past the row cap it is unreadable, not short). */
export async function loadPatientTeachingEvents(client: AnyClient, patientId: string): Promise<PatientTeachingRead> {
  try {
    const { error: probe } = await client.from("exercise_teaching_events").select("id").limit(0);
    if (probe) return MISSING.has(probe.code ?? "") ? { status: "not_migrated" } : { status: "unreadable" };
    const events = await loadEventsWhere(client, "patient_id", patientId);
    return events ? { status: "ok", events } : { status: "unreadable" };
  } catch {
    return { status: "unreadable" };
  }
}

/**
 * For the session note dialog's prefill: each patient's ACTIVE plan as the
 * clinician-register line (homeExerciseNotePrefill). A convenience, so it
 * is tolerant: a database without the tables, or a read that fails, gives
 * an empty map and the field simply stays empty -- never a refusal.
 */
export async function loadHomeExerciseNotePrefills(client: AnyClient, patientIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    for (let i = 0; i < patientIds.length; i += 100) {
      const chunk = patientIds.slice(i, i + 100);
      const { data, error } = await client.from("exercise_plans").select(EXERCISE_PLAN_SELECT).eq("status", "active").in("patient_id", chunk);
      if (error || !data || data.length === 0) continue;
      const items = await loadItems(client, data.map((r) => r.id as string));
      if (!items) continue;
      for (const row of data) {
        const plan = parsePlanRow(row, items);
        if (plan && plan.items.length > 0) out.set(plan.patientId, homeExerciseNotePrefill(plan));
      }
    }
  } catch {
    /* the prefill is a convenience */
  }
  return out;
}

export type ExerciseContextRead =
  | { status: "ok"; profileKind: ProfileKind; contraFlags: Set<ContraFlag> }
  | { status: "no_profile" }
  | { status: "unreadable" };

/** The patient's profile kind and what the intake rules out, re-derived on
 *  the server from the record (never from the request). */
export async function loadPatientExerciseContext(admin: AdminClient, patientId: string, nowMs: number): Promise<ExerciseContextRead> {
  try {
    const { data, error } = await admin.from("patient_condition_profiles").select("specialty, data").eq("patient_id", patientId).maybeSingle();
    if (error) return { status: "unreadable" };
    if (!data) return { status: "no_profile" };
    const intake = (data.data ?? {}) as Record<string, unknown>;
    return {
      status: "ok",
      profileKind: profileKindFor(parseConditionSpecialty(data.specialty), intake),
      contraFlags: contraFlagsFromIntake(intake, nowMs),
    };
  } catch {
    return { status: "unreadable" };
  }
}

// --- Writes --------------------------------------------------------------------------------

export type PublishResult =
  | { ok: true; planId: string; version: number }
  | { ok: false; code: "not_migrated" | "changed_elsewhere" | "refused_by_storage" | "failed"; message?: string };

/** One transaction: publish_exercise_plan() retires the active version and
 *  writes the next with its items, or changes nothing. */
export async function publishExercisePlan(
  admin: AdminClient,
  input: { patientId: string; authoredBy: string; runId: string | null; appointmentId: string | null; profileKind: ProfileKind; items: readonly PlanItemInput[] }
): Promise<PublishResult> {
  const { data, error } = await admin.rpc("publish_exercise_plan", {
    p_patient_id: input.patientId,
    p_authored_by: input.authoredBy,
    p_run_id: input.runId,
    p_appointment_id: input.appointmentId,
    p_profile_kind: input.profileKind,
    p_items: planItemsJson(input.items),
  });
  if (error) {
    if (MISSING.has(error.code ?? "")) return { ok: false, code: "not_migrated" };
    // The function's or a guard's own refusal: the run ended, or two
    // publishes crossed (the per-patient lock makes the second wait, so this
    // is the run ending in between).
    if (error.code === "P0001" || error.code === "23505") return { ok: false, code: "changed_elsewhere", message: error.message };
    if (error.code === "23514" || error.code === "23503") return { ok: false, code: "refused_by_storage", message: error.message };
    return { ok: false, code: "failed", message: error.message };
  }
  const row = data as { id?: unknown; version?: unknown } | null;
  if (!row || typeof row.id !== "string" || typeof row.version !== "number") return { ok: false, code: "failed" };
  return { ok: true, planId: row.id, version: row.version };
}

export type TeachingInsert =
  | { ok: true; event: TeachingEvent }
  | { ok: false; code: "duplicate" | "changed_elsewhere" | "not_migrated" | "failed" };

export async function insertTeachingEvent(
  admin: AdminClient,
  input: Omit<TeachingEvent, "id" | "createdAt">
): Promise<TeachingInsert> {
  const { data, error } = await admin
    .from("exercise_teaching_events")
    .insert({
      run_id: input.runId,
      plan_id: input.planId,
      patient_id: input.patientId,
      exercise_key: input.exerciseKey,
      outcome: input.outcome,
      cue_key: input.cueKey,
      reason_key: input.reasonKey,
      helper_present: input.helperPresent,
      actor: input.actor,
    })
    .select(EXERCISE_TEACHING_EVENT_SELECT)
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, code: "duplicate" };
    // The guard: the run ended, or the plan was replaced, between the read and the write.
    if (error.code === "P0001") return { ok: false, code: "changed_elsewhere" };
    if (MISSING.has(error.code ?? "")) return { ok: false, code: "not_migrated" };
    return { ok: false, code: "failed" };
  }
  const event = parseTeachingEventRow(data);
  return event ? { ok: true, event } : { ok: false, code: "failed" };
}
