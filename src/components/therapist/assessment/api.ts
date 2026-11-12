import { debugNowHeaders } from "@/lib/debugNow";
import { OFFLINE_FAILURE, cockpitFailure, type CockpitFailure } from "@/lib/cockpit";
import { readProgressFailure, type ProgressApiFailure } from "@/lib/progressErrors";
import { teachFailure } from "@/lib/teachTool";
import type { TeachingEvent } from "@/lib/exercisePlan";
import type { ExerciseDose } from "@/lib/exerciseLibrary";
import type { AssessmentRun, EndReason, LiveDisplayView, LivePhase, RunEvent, RunEventKind } from "@/lib/assessmentRun";

// The cockpit's calls to the four run routes, each answering a discriminated
// result: a coded refusal, "could not check" and "could not reach the server"
// are three different answers and stay three (cockpit.ts words each one).

export type ApiResult<T> = { ok: true; data: T } | { ok: false; failure: CockpitFailure };

async function post<T>(url: string, body: Record<string, unknown>, words: (f: ProgressApiFailure) => CockpitFailure = cockpitFailure): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      // The routes judge "a session has started" on the debug bar's clock.
      headers: { "Content-Type": "application/json", ...debugNowHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, failure: words(await readProgressFailure(res)) };
    return { ok: true, data: (await res.json().catch(() => ({}))) as T };
  } catch {
    return { ok: false, failure: OFFLINE_FAILURE };
  }
}

export type StartResponse = { success: true; run: AssessmentRun; displayWritten: boolean };
export type StartConflict = { code: "run_in_progress"; runId: string | null; yours: boolean };

/** Starts a run, or says one is already open (resumed when it is yours). */
export async function startRun(input: {
  patientId: string;
  appointmentId?: string | null;
  protocolKey?: string;
}): Promise<ApiResult<StartResponse> | { ok: false; conflict: StartConflict; failure: CockpitFailure }> {
  try {
    const res = await fetch("/api/therapist/assessment-runs/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...debugNowHeaders() },
      body: JSON.stringify(input),
    });
    if (res.ok) return { ok: true, data: (await res.json()) as StartResponse };
    const body: unknown = await res.json().catch(() => null);
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const failure = cockpitFailure({ status: res.status, error: record.error, code: record.code });
    if (res.status === 409 && record.code === "run_in_progress") {
      return {
        ok: false,
        conflict: { code: "run_in_progress", runId: typeof record.runId === "string" ? record.runId : null, yours: record.yours === true },
        failure: { ...failure, message: typeof record.error === "string" ? record.error : failure.message },
      };
    }
    // The route's own sentence (it is written for a person) beats a generic one.
    const own = typeof record.error === "string" && record.error.trim() ? record.error.trim() : null;
    return { ok: false, failure: res.status === 503 || !own ? failure : { ...failure, message: own, fix: null } };
  } catch {
    return { ok: false, failure: OFFLINE_FAILURE };
  }
}

export type EventResponse = {
  success: true;
  event?: RunEvent;
  duplicate?: true;
  flagged?: string[];
  preExercise?: { status: string; flags: string[]; notChecked: string[]; refusal: string | null };
};

export function postEvent(input: {
  runId: string;
  stepId: string;
  kind: RunEventKind;
  details?: Record<string, unknown>;
  measurementId?: string;
}): Promise<ApiResult<EventResponse>> {
  return post<EventResponse>("/api/therapist/assessment-runs/event", input);
}

export type DisplayResponse = { success: true; display: LiveDisplayView | null; serverNow: string };

export function postDisplay(input: { runId: string; stepId: string; phase: LivePhase; startClock?: boolean }): Promise<ApiResult<DisplayResponse>> {
  return post<DisplayResponse>("/api/therapist/assessment-runs/display", input);
}

export type EndResponse = { success: true; run: AssessmentRun; summaryDraft: string | null; summaryDraftReadable: boolean };

export function postEnd(input: { runId: string; outcome: "completed" | "abandoned"; reason?: EndReason }): Promise<ApiResult<EndResponse>> {
  return post<EndResponse>("/api/therapist/assessment-runs/end", input);
}

export type PublishResponse = {
  success: true;
  plan: { id: string; version: number };
  items: { exerciseKey: string; dose: ExerciseDose; doseText: string }[];
};

/** Publishes the draft as the patient's home exercises (a new version). */
export function postPublish(body: Record<string, unknown>): Promise<ApiResult<PublishResponse>> {
  return post<PublishResponse>("/api/therapist/exercise-plans/publish", body, teachFailure);
}

export type TeachResponse = { success: true; display?: LiveDisplayView; event?: TeachingEvent; duplicate?: true; displayWritten?: boolean };

/** Shows one exercise on the patient's screen ({ phase }) or marks it ({ outcome }). */
export function postTeach(body: Record<string, unknown>): Promise<ApiResult<TeachResponse>> {
  return post<TeachResponse>("/api/therapist/assessment-runs/teach", body, teachFailure);
}
