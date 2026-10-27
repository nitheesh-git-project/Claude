import { CLOCK_LABELS, LIVE_PHASES, clockReading, type ClockLabel, type LiveDisplayView } from "@/lib/assessmentRun";
import { PATIENT_PICTURES, type PatientPicture } from "@/lib/sessionProtocols";
import { EXERCISE_PICTURES } from "@/lib/exerciseLibrary";
import type { LiveExerciseDemo } from "@/lib/assessmentRun";

// The patient's companion screen, as functions (Health Profile redesign,
// phase 7b): what the screen is showing at a moment, how the big clock reads,
// and how it corrects for the device's own clock being wrong. The screen
// itself (src/components/patient/session/*) only draws what this returns.
// The server decides every word (assessmentRun.ts buildLiveDisplay); nothing
// here adds text beyond a handful of fixed phrases and picture descriptions.

/** Poll the loader this often while live updates are not reaching the screen. */
export const COMPANION_POLL_MS = 3000;
/** How long to wait for the realtime socket before polling anyway. */
export const COMPANION_REALTIME_GRACE_MS = 4000;
/** "All done" is shown for this long after a run ends, then the screen goes
 *  back to waiting (it must not greet tomorrow's visit with yesterday's end). */
export const ENDED_SCREEN_MAX_AGE_MS = 15 * 60_000;
/** A run nobody has touched for this long is not a run in progress. */
export const LIVE_SCREEN_MAX_AGE_MS = 6 * 60 * 60_000;

export type CompanionMoment =
  | { kind: "waiting" }
  | { kind: "live"; view: LiveDisplayView }
  | { kind: "ended"; view: LiveDisplayView };

export function companionMoment(view: LiveDisplayView | null, nowMs: number): CompanionMoment {
  if (!view) return { kind: "waiting" };
  const age = nowMs - Date.parse(view.updatedAt);
  if (!Number.isFinite(age)) return { kind: "waiting" };
  if (view.ended) return age <= ENDED_SCREEN_MAX_AGE_MS ? { kind: "ended", view } : { kind: "waiting" };
  return age <= LIVE_SCREEN_MAX_AGE_MS ? { kind: "live", view } : { kind: "waiting" };
}

/** How far this device's clock is behind (positive) or ahead (negative) of
 *  the server's, from the loader's `serverNow` and the moment it arrived. */
export function serverOffsetMs(serverNowIso: string, receivedAtMs: number): number {
  const server = Date.parse(serverNowIso);
  return Number.isFinite(server) ? server - receivedAtMs : 0;
}

export type ClockShown = {
  seconds: number;
  text: string;
  label: string;
  tone: "ready" | "go" | "finished";
};

/** "19", "1:05", "1:02:03": a big clock reads as the plainest number it can. */
export function formatClockSeconds(total: number): string {
  const s = Math.max(0, Math.floor(total));
  if (s < 60) return String(s);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}:${String(r).padStart(2, "0")}`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** The clock for a view at `nowMs` on this device, corrected by `offsetMs`.
 *  Never a client-trusted timer: it is a start time and a length the server
 *  wrote, read against server time. Null when the step has no clock. */
export function clockShown(view: LiveDisplayView, nowMs: number, offsetMs: number): ClockShown | null {
  if (!view.clock) return null;
  const seconds = clockReading(view.clock, nowMs + offsetMs);
  const finished = view.clock.mode === "countdown" && seconds === 0 && view.phase === "go";
  return {
    seconds,
    text: formatClockSeconds(seconds),
    label: finished ? "Finished" : view.text.clockLabel ?? (view.clock.mode === "countdown" ? "Time left" : "Time"),
    tone: finished ? "finished" : view.phase === "ready" ? "ready" : "go",
  };
}

/** The clock should tick on screen only while it can change. */
export function clockIsRunning(view: LiveDisplayView, nowMs: number, offsetMs: number): boolean {
  if (!view.clock) return false;
  if (view.clock.mode === "count_up") return true;
  return clockReading(view.clock, nowMs + offsetMs) > 0;
}

export const PICTURE_DESCRIPTIONS: Record<PatientPicture, string> = {
  sitting: "A person sitting upright on a chair",
  standing: "A person standing tall",
  lying: "A person lying on their back",
  chair_stand: "A person standing up from a chair",
  walking: "A person walking",
  balance: "A person standing steadily, with another adult beside them",
  talking: "Two people talking",
};

/** What the screen says to a screen reader when the moment changes. */
export function liveAnnouncement(moment: CompanionMoment): string {
  if (moment.kind === "waiting") return "Waiting for your physiotherapist.";
  const t = moment.view.text;
  if (t.exercise) {
    const steps = moment.view.phase === "demo" ? t.exercise.steps.map((s, i) => `${i + 1}. ${s}`) : [];
    return [t.exercise.counter, t.title, t.line, ...steps, t.sub].filter(Boolean).join(". ");
  }
  return [t.progress, t.title, t.line, t.sub].filter(Boolean).join(". ");
}

export const WAITING_TEXT = {
  title: "Your physiotherapist will start the guided check soon",
  line: "You do not need to do anything yet. This screen will change by itself when it starts.",
  calm: "Sit comfortably and take a slow breath.",
} as const;

// --- Reading what the poll route sends ------------------------------------------------------------------

const isText = (v: unknown): v is string => typeof v === "string";

/** "Exercise 2 of 4", the only counter the server writes. */
const EXERCISE_COUNTER_RE = /^Exercise ([1-9]\d?) of ([1-9]\d?)$/;

/**
 * The exercise a Home exercises display carries (phase 7d): the library's
 * key, one of its 36 pictures, one to five short step lines and the
 * "Exercise n of N" counter. Exactly that shape or null -- a view whose
 * exercise cannot be vouched for is not drawn at all.
 */
export function asLiveExerciseDemo(raw: unknown): LiveExerciseDemo | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const e = raw as Record<string, unknown>;
  if (Object.keys(e).some((k) => !["key", "picture", "steps", "counter"].includes(k))) return null;
  if (!isText(e.key) || !isText(e.counter) || !isText(e.picture)) return null;
  if (!(EXERCISE_PICTURES as readonly string[]).includes(e.picture)) return null;
  const m = EXERCISE_COUNTER_RE.exec(e.counter);
  if (!m || Number(m[1]) > Number(m[2])) return null;
  if (!Array.isArray(e.steps) || e.steps.length < 1 || e.steps.length > 5 || !e.steps.every((s) => isText(s) && s.length > 0 && s.length <= 140)) return null;
  return { key: e.key, picture: e.picture as LiveExerciseDemo["picture"], steps: [...(e.steps as string[])], counter: e.counter };
}

/**
 * The shape of a display view that came over the wire (the poll route sends
 * the view the server already checked against the patient-safe whitelist).
 * Anything that is not exactly that shape is null: the screen keeps what it
 * has rather than draw something it cannot vouch for.
 */
export function asLiveDisplayView(raw: unknown): LiveDisplayView | null {
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as Record<string, unknown>;
  const text = v.text as Record<string, unknown> | null;
  if (!isText(v.runId) || !isText(v.stepId) || !isText(v.updatedAt) || typeof v.ended !== "boolean") return null;
  if (!(LIVE_PHASES as readonly unknown[]).includes(v.phase)) return null;
  if (typeof text !== "object" || text === null) return null;
  if (!isText(text.progress) || !isText(text.title) || !isText(text.line) || !isText(text.picture)) return null;
  if (text.sub !== undefined && !isText(text.sub)) return null;
  if (text.clockLabel !== undefined && !isText(text.clockLabel)) return null;
  let clock: LiveDisplayView["clock"] = null;
  if (v.clock !== null && v.clock !== undefined) {
    const c = v.clock as Record<string, unknown>;
    if (!isText(c.startedAt) || !Number.isFinite(Date.parse(c.startedAt))) return null;
    if (c.mode === "countdown" && typeof c.seconds === "number" && c.seconds > 0) clock = { mode: "countdown", seconds: c.seconds, startedAt: c.startedAt };
    else if (c.mode === "count_up") clock = { mode: "count_up", startedAt: c.startedAt };
    else return null;
  }
  if (!(PATIENT_PICTURES as readonly string[]).includes(text.picture)) return null;
  const exercise = text.exercise === undefined ? undefined : asLiveExerciseDemo(text.exercise);
  if (exercise === null) return null;
  if (text.clockLabel !== undefined && !(CLOCK_LABELS as readonly string[]).includes(text.clockLabel as string)) return null;
  return {
    runId: v.runId,
    stepId: v.stepId,
    phase: v.phase as LiveDisplayView["phase"],
    clock,
    text: {
      progress: text.progress,
      title: text.title,
      line: text.line,
      picture: text.picture as PatientPicture,
      ...(isText(text.sub) ? { sub: text.sub } : {}),
      ...(isText(text.clockLabel) ? { clockLabel: text.clockLabel as ClockLabel } : {}),
      ...(exercise ? { exercise } : {}),
    },
    ended: v.ended,
    updatedAt: v.updatedAt,
  };
}
