import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverNowMs } from "@/lib/debugClock";
import { preExerciseCheck, resolveOxygenStopLimit, type PreExerciseCheck } from "@/lib/cardioSafety";
import type { MeasurementConditions } from "@/lib/outcomeMeasures";
import { OUTCOME_MEASUREMENT_SELECT, parseMeasurementRow, type MeasurementPoint } from "@/lib/outcomeSeries";
import { needsPreExerciseCheck, sessionProtocol, type ProtocolStep, type SessionProtocol } from "@/lib/sessionProtocols";
import {
  ASSESSMENT_LIVE_DISPLAY_SELECT,
  ASSESSMENT_RUN_EVENT_SELECT,
  ASSESSMENT_RUN_SELECT,
  checkRunAbandon,
  checkRunOpen,
  checkRunSave,
  orderRunEvents,
  parseLiveDisplayRow,
  parseRunEventRow,
  parseRunRow,
  preExerciseVitalsFromRun,
  runStateFromEvents,
  type AssessmentRun,
  type LiveDisplayView,
  type LiveDisplayWrite,
  type RunEvent,
  type RunRefusal,
  type RunState,
} from "@/lib/assessmentRun";
import { requireAssignedTherapist, requireSignedInUser, requireStartedSession } from "@/lib/therapistClinicalGate";
import { isProfileActiveAndApproved, profileCheckUnavailable } from "@/lib/supabase/requireActiveProfile";
import { isTherapistAssignedToPatient } from "@/lib/conditionAccess";

// The server half of the guided video assessment (phase 7a): the reads every
// screen uses and the gate every run route shares. The shapes and the rules
// are assessmentRun.ts (pure, tested); this file only reads and answers.
//
// Every read answers a discriminated result -- "could not read" is never
// "no run" (clinical.md's rule 7 for the exam reads, and "a check that could
// not be run is not a check that came back negative").

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyClient = SupabaseClient<any, any, any>;
type AdminClient = ReturnType<typeof createAdminClient>;

/** Generous: a run is tens of events. Past it the run is unreadable rather
 *  than judged on a short history. */
export const RUN_EVENTS_MAX_ROWS = 2_000;

const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

export function databaseNotReady(): NextResponse {
  return NextResponse.json(
    { error: "This database has not been updated for guided video assessments yet.", code: "not_migrated" },
    { status: 503 }
  );
}

export function couldNotCheck(): NextResponse {
  return NextResponse.json({ error: "We couldn't check this assessment just now. Please try again." }, { status: 503 });
}

export function refusalResponse(refusal: RunRefusal): NextResponse {
  return NextResponse.json({ error: refusal.error, code: refusal.code }, { status: refusal.status });
}

// --- Reads ------------------------------------------------------------------------

export type RunRead =
  | { status: "ok"; run: AssessmentRun; events: RunEvent[] }
  | { status: "not_found" }
  | { status: "not_migrated" }
  | { status: "unreadable" };

async function loadEvents(client: AnyClient, runId: string): Promise<RunEvent[] | null> {
  const { data, error } = await client
    .from("assessment_run_events")
    .select(ASSESSMENT_RUN_EVENT_SELECT)
    .eq("run_id", runId)
    .order("created_at", { ascending: true })
    .limit(RUN_EVENTS_MAX_ROWS + 1);
  if (error || !data || data.length > RUN_EVENTS_MAX_ROWS) return null;
  const events = data.map(parseRunEventRow);
  if (events.some((e) => e === null)) return null;
  return orderRunEvents(events as RunEvent[]);
}

/** One run and its events. The therapist's cockpit and the admin's read
 *  pass the service-role client after their own access checks. */
export async function loadRun(client: AnyClient, runId: string): Promise<RunRead> {
  try {
    const { data, error } = await client.from("assessment_runs").select(ASSESSMENT_RUN_SELECT).eq("id", runId).maybeSingle();
    if (error) {
      if (MISSING_TABLE.has(error.code ?? "")) return { status: "not_migrated" };
      if (error.code === "22P02") return { status: "not_found" };
      return { status: "unreadable" };
    }
    if (!data) return { status: "not_found" };
    const run = parseRunRow(data);
    if (!run) return { status: "unreadable" };
    const events = await loadEvents(client, run.id);
    if (!events) return { status: "unreadable" };
    return { status: "ok", run, events };
  } catch {
    return { status: "unreadable" };
  }
}

export type ActiveRunRead =
  | { status: "ok"; run: AssessmentRun | null; events: RunEvent[] }
  | { status: "not_migrated" }
  | { status: "unreadable" };

/** The patient's run in progress, if there is one (at most one, by index). */
export async function loadActiveRun(client: AnyClient, patientId: string): Promise<ActiveRunRead> {
  try {
    const { data, error } = await client
      .from("assessment_runs")
      .select(ASSESSMENT_RUN_SELECT)
      .eq("patient_id", patientId)
      .eq("status", "in_progress")
      .maybeSingle();
    if (error) return MISSING_TABLE.has(error.code ?? "") ? { status: "not_migrated" } : { status: "unreadable" };
    if (!data) return { status: "ok", run: null, events: [] };
    const run = parseRunRow(data);
    if (!run) return { status: "unreadable" };
    const events = await loadEvents(client, run.id);
    if (!events) return { status: "unreadable" };
    return { status: "ok", run, events };
  } catch {
    return { status: "unreadable" };
  }
}

export type LiveDisplayRead =
  | { status: "ok"; display: LiveDisplayView | null; serverNow: string }
  | { status: "unreadable" };

/**
 * What the patient's companion screen shows: their newest live display row,
 * read with THEIR OWN RLS-scoped client (assessment_live_display_select_own
 * is the gate). Null when there is none. A row whose text does not pass the
 * patient-safe whitelist is not shown at all -- "unreadable", never a
 * partial screen. `serverNow` lets the screen correct its own clock.
 */
export async function loadLiveDisplay(client: AnyClient, patientId: string): Promise<LiveDisplayRead> {
  try {
    const { data, error } = await client
      .from("assessment_live_display")
      .select(ASSESSMENT_LIVE_DISPLAY_SELECT)
      .eq("patient_id", patientId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const serverNow = new Date().toISOString();
    if (error) return MISSING_TABLE.has(error.code ?? "") ? { status: "ok", display: null, serverNow } : { status: "unreadable" };
    if (!data) return { status: "ok", display: null, serverNow };
    const view = parseLiveDisplayRow(data, sessionProtocol);
    if (!view) return { status: "unreadable" };
    return { status: "ok", display: view, serverNow };
  } catch {
    return { status: "unreadable" };
  }
}

/** The outcome measurements a run's "saved" events point at. */
export async function loadRunMeasurements(
  client: AnyClient,
  events: readonly RunEvent[]
): Promise<{ status: "ok"; measurements: MeasurementPoint[] } | { status: "unreadable" }> {
  const ids = [...new Set(events.map((e) => e.measurementId).filter((id): id is string => !!id))];
  if (ids.length === 0) return { status: "ok", measurements: [] };
  try {
    const { data, error } = await client.from("outcome_measurements").select(OUTCOME_MEASUREMENT_SELECT).in("id", ids);
    if (error || !data) return { status: "unreadable" };
    const points = data.map(parseMeasurementRow).filter((p): p is MeasurementPoint => !!p);
    return { status: "ok", measurements: points };
  } catch {
    return { status: "unreadable" };
  }
}

// --- The pre-exercise check, re-derived ---------------------------------------------

/**
 * The heart and lung pre-exercise check for this run, worked out on the
 * server from the resting vitals SAVED IN THIS RUN and the patient's own
 * oxygen limit (the intake; the default for the condition when none) --
 * never from what the cockpit says. Null when no step here needs it.
 */
export async function runPreExerciseCheck(
  admin: AdminClient,
  run: AssessmentRun,
  protocol: SessionProtocol,
  state: RunState,
  events: readonly RunEvent[]
): Promise<{ ok: true; check: PreExerciseCheck } | { ok: false }> {
  const measurements = await loadRunMeasurements(admin, events);
  if (measurements.status !== "ok") return { ok: false };
  const { data, error } = await admin.from("patient_condition_profiles").select("data").eq("patient_id", run.patientId).maybeSingle();
  if (error) return { ok: false };
  const intake = (data?.data ?? {}) as Record<string, string | undefined>;
  const vitals = preExerciseVitalsFromRun(
    protocol,
    state,
    measurements.measurements.map((m) => ({ id: m.id, measureKey: m.measureKey, variant: m.variant, value: m.value, items: m.items, measuredAt: m.measuredAt }))
  );
  return { ok: true, check: preExerciseCheck(vitals, resolveOxygenStopLimit(intake)) };
}

/** The check only where a step (or the measure saved in it) needs one. */
export async function preExerciseFor(
  admin: AdminClient,
  ctx: { run: AssessmentRun; protocol: SessionProtocol; state: RunState; events: readonly RunEvent[] },
  step: ProtocolStep,
  measureKey?: string
): Promise<{ ok: true; check: PreExerciseCheck | null } | { ok: false; response: NextResponse }> {
  if (!needsPreExerciseCheck(ctx.protocol, step, measureKey)) return { ok: true, check: null };
  const computed = await runPreExerciseCheck(admin, ctx.run, ctx.protocol, ctx.state, ctx.events);
  if (!computed.ok) return { ok: false, response: couldNotCheck() };
  return { ok: true, check: computed.check };
}

// --- The gate every run route shares --------------------------------------------------

export type RunGate = {
  admin: AdminClient;
  therapistId: string;
  nowMs: number;
  run: AssessmentRun;
  events: RunEvent[];
  protocol: SessionProtocol;
  state: RunState;
};

/**
 * Signed in; the run exists; the caller is an active therapist assigned to
 * the run's patient (live or delivered care) with a session that has
 * started or been delivered on the debug bar's clock; the run is theirs,
 * in progress, and on the protocol version it started with. `patientId`,
 * when the caller names one (the measurement route), must be the run's.
 */
export async function requireOpenRun(
  request: NextRequest,
  rawRunId: unknown,
  opts: { patientId?: string } = {}
): Promise<{ ok: true; gate: RunGate } | { ok: false; response: NextResponse }> {
  const who = await requireSignedInUser();
  if (!who.ok) return who;
  if (typeof rawRunId !== "string" || !rawRunId.trim()) {
    return { ok: false, response: NextResponse.json({ error: "Missing runId", code: "bad_request" }, { status: 400 }) };
  }
  // The service role reads the run to learn whose it is; nothing is
  // answered from it until the caller has passed the therapist gate below.
  const read = await loadRun(createAdminClient(), rawRunId.trim());
  if (read.status === "not_migrated") return { ok: false, response: databaseNotReady() };
  if (read.status === "unreadable") return { ok: false, response: couldNotCheck() };
  if (read.status === "not_found") {
    return { ok: false, response: NextResponse.json({ error: "That assessment could not be found.", code: "run_not_found" }, { status: 404 }) };
  }
  const { run, events } = read;

  const gate = await requireAssignedTherapist(
    who.userId,
    run.patientId,
    "You can only run an assessment for a patient you've been assigned to."
  );
  if (!gate.ok) return gate;
  const nowMs = serverNowMs(request);
  const notStarted = await requireStartedSession(
    gate.admin,
    gate.therapistId,
    run.patientId,
    nowMs,
    "A guided assessment runs inside a session you've started with this patient."
  );
  if (notStarted) return { ok: false, response: notStarted };

  const protocol = sessionProtocol(run.protocolKey);
  const open = checkRunOpen(run, { therapistId: gate.therapistId, patientId: opts.patientId, protocol });
  if (open) return { ok: false, response: refusalResponse(open) };
  return {
    ok: true,
    gate: {
      admin: gate.admin,
      therapistId: gate.therapistId,
      nowMs,
      run,
      events,
      protocol: protocol!,
      state: runStateFromEvents(events),
    },
  };
}

export type AbandonGate = {
  admin: AdminClient;
  therapistId: string;
  run: AssessmentRun;
  events: RunEvent[];
  /** The run's protocol when it is still the version the run started on;
   *  null when the steps changed (or the protocol is gone), so nothing is
   *  drafted from steps the run never had. */
  protocol: SessionProtocol | null;
  /** The current protocol of the run's key, whatever its version: enough to
   *  move the patient's screen to "All done". */
  displayProtocol: SessionProtocol | null;
};

/**
 * The gate for ABANDONING a run (the end route with outcome "abandoned"):
 * signed in, an active approved therapist, the run in progress, and the
 * caller its own physiotherapist or one assigned to the patient now
 * (checkRunAbandon). Deliberately NOT the protocol-version or started-session
 * checks requireOpenRun makes: those are what leave a run stuck -- the steps
 * changed, the assignment moved, the session is over -- and "End it and
 * start a new one" has to be something the physiotherapist can do.
 */
export async function requireRunToAbandon(
  rawRunId: unknown
): Promise<{ ok: true; gate: AbandonGate } | { ok: false; response: NextResponse }> {
  const who = await requireSignedInUser();
  if (!who.ok) return who;
  if (typeof rawRunId !== "string" || !rawRunId.trim()) {
    return { ok: false, response: NextResponse.json({ error: "Missing runId", code: "bad_request" }, { status: 400 }) };
  }
  const standing = await isProfileActiveAndApproved(who.userId);
  if (standing === null) return { ok: false, response: profileCheckUnavailable() };
  if (!standing) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Your account is not active - it is either awaiting admin approval or has been suspended." },
        { status: 403 }
      ),
    };
  }
  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", who.userId).maybeSingle();
  if (profileError) return { ok: false, response: profileCheckUnavailable() };
  if (profile?.role !== "therapist") return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  const read = await loadRun(admin, rawRunId.trim());
  if (read.status === "not_migrated") return { ok: false, response: databaseNotReady() };
  if (read.status === "unreadable") return { ok: false, response: couldNotCheck() };
  const run = read.status === "ok" ? read.run : null;

  // Assignment is asked only of somebody else's run: the owner may always
  // close their own, even after the patient moved to a colleague.
  let assignedToPatient = false;
  if (run && run.therapistId !== who.userId) {
    const assigned = await isTherapistAssignedToPatient(admin, who.userId, run.patientId);
    if (assigned === null) return { ok: false, response: profileCheckUnavailable() };
    assignedToPatient = assigned;
  }
  const refused = checkRunAbandon(run, { therapistId: who.userId, assignedToPatient });
  if (refused) return { ok: false, response: refusalResponse(refused) };
  if (!run || read.status !== "ok") return { ok: false, response: couldNotCheck() }; // unreachable: checkRunAbandon refuses no run
  const current = sessionProtocol(run.protocolKey);
  return {
    ok: true,
    gate: {
      admin,
      therapistId: who.userId,
      run,
      events: read.events,
      protocol: current && current.version === run.protocolVersion ? current : null,
      displayProtocol: current,
    },
  };
}

// --- Writes -------------------------------------------------------------------------

export async function insertRunEvent(
  admin: AdminClient,
  input: { runId: string; stepId: string; kind: RunEvent["kind"]; details: Record<string, unknown>; measurementId?: string | null; actor: string }
): Promise<{ ok: true; event: RunEvent } | { ok: false; code: "duplicate" | "run_not_in_progress" | "not_migrated" | "failed" }> {
  const { data, error } = await admin
    .from("assessment_run_events")
    .insert({
      run_id: input.runId,
      step_id: input.stepId,
      kind: input.kind,
      measurement_id: input.measurementId ?? null,
      details: input.details,
      actor: input.actor,
    })
    .select(ASSESSMENT_RUN_EVENT_SELECT)
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, code: "duplicate" };
    // The guard's own refusal: the run ended between the read and the write.
    if (error.code === "P0001") return { ok: false, code: "run_not_in_progress" };
    if (MISSING_TABLE.has(error.code ?? "")) return { ok: false, code: "not_migrated" };
    return { ok: false, code: "failed" };
  }
  const event = parseRunEventRow(data);
  return event ? { ok: true, event } : { ok: false, code: "failed" };
}

/** Write (insert or replace) the run's live display row. The clock's start
 *  is the server's real time: the patient's screen counts from it. */
export async function writeLiveDisplay(
  admin: AdminClient,
  run: AssessmentRun,
  write: LiveDisplayWrite,
  opts: { ended?: boolean } = {}
): Promise<{ ok: true; row: Record<string, unknown> } | { ok: false }> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("assessment_live_display")
    .upsert(
      {
        run_id: run.id,
        patient_id: run.patientId,
        therapist_id: run.therapistId,
        protocol_key: run.protocolKey,
        current_step_id: write.currentStepId,
        phase: write.phase,
        clock_started_at: write.clock ? now : null,
        clock_seconds: write.clock?.mode === "countdown" ? write.clock.seconds : null,
        display: write.display,
        ended_at: opts.ended ? now : null,
        updated_at: now,
      },
      { onConflict: "run_id" }
    )
    .select(ASSESSMENT_LIVE_DISPLAY_SELECT)
    .single();
  if (error || !data) return { ok: false };
  return { ok: true, row: data as Record<string, unknown> };
}

/**
 * The measurement route's half (/api/therapist/measurements/submit with
 * `runId` and `stepId`): the caller has already passed the therapist gate
 * for this patient, so this reads the run, checks it is theirs, this
 * patient's and in progress, re-derives the step from the protocol, and
 * refuses a save the step does not allow (checkRunSave) -- including, on the
 * heart and lung protocol, an exertion measure without a clear pre-exercise
 * check worked out from this run's own resting vitals.
 */
export async function checkMeasurementInRun(
  admin: AdminClient,
  input: {
    therapistId: string;
    patientId: string;
    runId: unknown;
    stepId: unknown;
    measurement: { measureKey: string; variant: string | null; conditions: MeasurementConditions };
  }
): Promise<{ ok: true; run: AssessmentRun; step: ProtocolStep } | { ok: false; response: NextResponse }> {
  if (typeof input.runId !== "string" || !input.runId.trim() || typeof input.stepId !== "string" || !input.stepId.trim()) {
    return {
      ok: false,
      response: NextResponse.json({ error: "A reading in an assessment names both runId and stepId.", code: "bad_request" }, { status: 400 }),
    };
  }
  const read = await loadRun(admin, input.runId.trim());
  if (read.status === "not_migrated") return { ok: false, response: databaseNotReady() };
  if (read.status === "unreadable") return { ok: false, response: couldNotCheck() };
  if (read.status === "not_found") {
    return { ok: false, response: NextResponse.json({ error: "That assessment could not be found.", code: "run_not_found" }, { status: 404 }) };
  }
  const protocol = sessionProtocol(read.run.protocolKey);
  const open = checkRunOpen(read.run, { therapistId: input.therapistId, patientId: input.patientId, protocol });
  if (open) return { ok: false, response: refusalResponse(open) };
  const state = runStateFromEvents(read.events);
  const ctx = { run: read.run, protocol: protocol!, state, events: read.events };
  const step0 = protocol!.steps.find((s) => s.id === (input.stepId as string).trim());
  let preExercise: PreExerciseCheck | null = null;
  if (step0) {
    const pre = await preExerciseFor(admin, ctx, step0, input.measurement.measureKey);
    if (!pre.ok) return pre;
    preExercise = pre.check;
  }
  const checked = checkRunSave({
    protocol: protocol!,
    stepId: (input.stepId as string).trim(),
    state,
    measurement: input.measurement,
    preExercise,
  });
  if (!checked.ok) return { ok: false, response: refusalResponse(checked.refusal) };
  return { ok: true, run: read.run, step: checked.step };
}
