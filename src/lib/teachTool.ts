import type { ProgressApiFailure } from "@/lib/progressErrors";
import { cockpitFailure, type CockpitFailure } from "@/lib/cockpit";
import {
  CONTRA_FLAG_TEXT,
  DOSE_LIMITS,
  type ContraFlag,
  type DoseKind,
  type Exercise,
  type ExerciseDose,
} from "@/lib/exerciseLibrary";
import {
  COACHING_CUES,
  DOSE_NOTE_MAX_CHARS,
  contraindicationsHit,
  DOSE_NOTE_MAX_SENTENCES,
  EXERCISE_REFUSAL_TEXT,
  NOT_ATTEMPTED_REASONS,
  type CoachingCue,
  type ExerciseRefusalCode,
  type NotAttemptedReason,
  type TeachingEvent,
  type TeachingOutcome,
} from "@/lib/exercisePlan";
import { sentenceCount } from "@/lib/sessionProtocols";

// The pure half of the physiotherapist's TEACH TOOL on the guided session's
// Home exercises step (phase 7d-2; src/components/therapist/assessment/teach/):
// what a draft plan is, how a stepper moves a dose, what is wrong with a
// draft before it is sent, the body of each request, and the one sentence
// and single fix for every refusal. The screens only draw what this decides.

/** The cockpit offers this many exercises in a plan; the server allows more
 *  (PLAN_ITEMS_MAX) but a plan the patient can keep up with is a short one. */
export const PLAN_PICK_MAX = 6;

// --- The dose, with big steppers ---------------------------------------------------------

export type DoseField = "sets" | "reps" | "holdSeconds" | "minutes" | "timesPerDay" | "daysPerWeek";

export const DOSE_FIELD_TEXT: Record<DoseField, { label: string; unit: string }> = {
  sets: { label: "Sets", unit: "sets" },
  reps: { label: "Repetitions", unit: "times" },
  holdSeconds: { label: "Hold", unit: "seconds" },
  minutes: { label: "Minutes", unit: "minutes" },
  timesPerDay: { label: "Times a day", unit: "a day" },
  daysPerWeek: { label: "Days a week", unit: "a week" },
};

/** The numbers an exercise of this kind is dosed with, in the order shown. */
export function doseFieldsFor(kind: DoseKind): DoseField[] {
  switch (kind) {
    case "reps":
      return ["sets", "reps", "timesPerDay", "daysPerWeek"];
    case "reps_hold":
      return ["sets", "reps", "holdSeconds", "timesPerDay", "daysPerWeek"];
    case "hold":
      return ["sets", "holdSeconds", "timesPerDay", "daysPerWeek"];
    case "minutes":
      return ["minutes", "timesPerDay", "daysPerWeek"];
  }
}

/** One tap of a stepper: the number moves by one and never leaves the
 *  bounds the server enforces (DOSE_LIMITS). */
export function stepDose(dose: ExerciseDose, field: DoseField, delta: 1 | -1): ExerciseDose {
  const limit = DOSE_LIMITS[field];
  const current = dose[field];
  if (current === null) return dose;
  const next = Math.min(limit.max, Math.max(limit.min, current + delta));
  return next === current ? dose : { ...dose, [field]: next };
}

export function canStep(dose: ExerciseDose, field: DoseField, delta: 1 | -1): boolean {
  const current = dose[field];
  if (current === null) return false;
  const limit = DOSE_LIMITS[field];
  return delta === 1 ? current < limit.max : current > limit.min;
}

/** What is wrong with a note before it is sent (the server says it again). */
export function noteProblem(note: string): string | null {
  const t = note.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (t.length > DOSE_NOTE_MAX_CHARS) return `Keep the note under ${DOSE_NOTE_MAX_CHARS} characters.`;
  if (sentenceCount(t) > DOSE_NOTE_MAX_SENTENCES) return `Keep the note to ${DOSE_NOTE_MAX_SENTENCES} short sentences.`;
  return null;
}

// --- The draft plan -------------------------------------------------------------------------------

export type DraftItem = { exerciseKey: string; dose: ExerciseDose };

export const newDraftItem = (exercise: Exercise): DraftItem => ({ exerciseKey: exercise.key, dose: { ...exercise.defaultDose } });

/** Tick or untick an exercise. Past PLAN_PICK_MAX the pick is refused, not dropped. */
export function toggleDraft(draft: readonly DraftItem[], exercise: Exercise, max: number = PLAN_PICK_MAX): { draft: DraftItem[]; tooMany: boolean } {
  if (draft.some((d) => d.exerciseKey === exercise.key)) return { draft: draft.filter((d) => d.exerciseKey !== exercise.key), tooMany: false };
  if (draft.length >= max) return { draft: [...draft], tooMany: true };
  return { draft: [...draft, newDraftItem(exercise)], tooMany: false };
}

export function updateDraft(draft: readonly DraftItem[], key: string, change: (d: ExerciseDose) => ExerciseDose): DraftItem[] {
  return draft.map((d) => (d.exerciseKey === key ? { ...d, dose: change(d.dose) } : d));
}

/** The note text as the server will store it: trimmed, empty is none. */
export function withNote(dose: ExerciseDose, text: string): ExerciseDose {
  return { ...dose, note: text.trim() ? text : null };
}

/** How an exercise is offered for this patient: open, or ruled out by what
 *  the intake says (the server decides again, from the record). */
export type Offer = { kind: "open" } | { kind: "ruled_out"; message: string; reason: string; easier: string | null };

export function offerFor(exercise: Exercise, contraFlags: ReadonlySet<ContraFlag>): Offer {
  const hit = contraindicationsHit(exercise, contraFlags);
  if (hit.length === 0) return { kind: "open" };
  return {
    kind: "ruled_out",
    message: EXERCISE_REFUSAL_TEXT.contraindicated.message,
    reason: hit.map((f) => CONTRA_FLAG_TEXT[f]).join("; "),
    easier: exercise.easier ?? null,
  };
}

/** What stops "Use this plan", in one sentence, or null. */
export function draftProblem(
  draft: readonly DraftItem[],
  input: { helperTicked: boolean; needsHelper: (key: string) => boolean }
): string | null {
  if (draft.length === 0) return "Pick at least one exercise.";
  for (const d of draft) {
    const note = d.dose.note ? noteProblem(d.dose.note) : null;
    if (note) return note;
  }
  if (draft.some((d) => input.needsHelper(d.exerciseKey)) && !input.helperTicked) {
    return "One of these needs another adult beside the patient. Tick that above, or take it out.";
  }
  return null;
}

export function publishBody(runId: string, draft: readonly DraftItem[]): Record<string, unknown> {
  return { runId, items: draft.map((d) => ({ exerciseKey: d.exerciseKey, dose: d.dose })) };
}

// --- The teaching loop --------------------------------------------------------------------------------

export type MarkChoice =
  | { outcome: "performed_correctly" }
  | { outcome: "needs_practice"; cueKey: CoachingCue }
  | { outcome: "not_attempted"; reasonKey: NotAttemptedReason };

export const MARK_BUTTONS: { outcome: TeachingOutcome; label: string; follow: string | null }[] = [
  { outcome: "performed_correctly", label: "Did it correctly", follow: null },
  { outcome: "needs_practice", label: "Needs practice", follow: "Pick one thing to remind them." },
  { outcome: "not_attempted", label: "Not attempted", follow: "Why not?" },
];

export const COACHING_CUE_OPTIONS = (Object.entries(COACHING_CUES) as [CoachingCue, string][]).map(([key, label]) => ({ key, label }));
export const NOT_ATTEMPTED_OPTIONS = (Object.entries(NOT_ATTEMPTED_REASONS) as [NotAttemptedReason, string][]).map(([key, label]) => ({ key, label }));

export function markBody(runId: string, exerciseKey: string, choice: MarkChoice): Record<string, unknown> {
  return { runId, exerciseKey, ...choice };
}

export function markText(e: Pick<TeachingEvent, "outcome" | "cueKey" | "reasonKey">): string {
  if (e.outcome === "performed_correctly") return "Did it correctly";
  if (e.outcome === "needs_practice") return `Needs practice: ${COACHING_CUES[e.cueKey ?? "slow_down"]}`;
  return `Not attempted: ${e.reasonKey ? NOT_ATTEMPTED_REASONS[e.reasonKey] : "no reason given"}`;
}

/** The first exercise in the plan with no mark, from `from` round the list. */
export function nextUnmarked(planKeys: readonly string[], marked: ReadonlySet<string>, from = 0): number | null {
  for (let i = 0; i < planKeys.length; i++) {
    const at = (from + i) % planKeys.length;
    if (!marked.has(planKeys[at])) return at;
  }
  return null;
}

/** "Exercise 2 of 4", the counter the patient's screen shows too. */
export const exerciseProgress = (index: number, total: number) => `Exercise ${index + 1} of ${total}`;

/** What Save and next on the step is waiting for, or null when every
 *  exercise has a mark. */
export function teachMissing(hasPlan: boolean, planKeys: readonly string[], marked: ReadonlySet<string>): string | null {
  if (!hasPlan) return "Pick the exercises and tap Use this plan.";
  const open = planKeys.filter((k) => !marked.has(k)).length;
  if (open === 0) return null;
  return `Mark ${open} more ${open === 1 ? "exercise" : "exercises"}, or skip this step.`;
}

// --- Words for every refusal ---------------------------------------------------------------------------------

const EXTRA: Record<string, { message: string; fix: string }> = {
  no_condition_profile: { message: "This patient's condition type has not been recorded yet.", fix: "Record it on their Health Profile first." },
  not_migrated: { message: "Home exercises are not set up on this database yet.", fix: "Ask the clinic to apply the latest schema." },
  run_patient_mismatch: { message: "That assessment is for a different patient.", fix: "Go back to the chart of the patient you are seeing." },
};

/**
 * One sentence and the single fix for a failed publish or teach request.
 * A coded exercise refusal has its own (EXERCISE_REFUSAL_TEXT), a blocked
 * note says so and what to take out, a run refusal is the cockpit's; a 503
 * is "we could not check", never "not allowed", and a 429 is "wait".
 */
export function teachFailure(failure: ProgressApiFailure): CockpitFailure {
  const code = typeof failure.code === "string" ? failure.code : null;
  if (failure.status === 503 && code !== "not_migrated") {
    return { message: "We could not check that just now, so nothing was saved.", fix: "Try again in a moment.", kind: "unchecked" };
  }
  if (failure.status === 429) return cockpitFailure(failure);
  if (code === "note_blocked") {
    return { message: "A note cannot be sent as written.", fix: "Take out any phone number, email address or link.", kind: "refused" };
  }
  if (code && Object.prototype.hasOwnProperty.call(EXERCISE_REFUSAL_TEXT, code)) {
    const t = EXERCISE_REFUSAL_TEXT[code as ExerciseRefusalCode];
    // A contraindicated, helper or dose refusal names the exercise in the route's own sentence.
    const own = typeof failure.error === "string" && failure.error.trim() && failure.status !== 503 ? failure.error.trim() : null;
    const named = own && (code === "contraindicated" || code === "bad_dose" || code === "helper_not_confirmed" || code === "note_not_plain" || code === "exercise_not_for_profile");
    return { message: named ? own : t.message, fix: t.fix, kind: "refused" };
  }
  if (code && Object.prototype.hasOwnProperty.call(EXTRA, code)) return { ...EXTRA[code], kind: failure.status === 503 ? "unchecked" : "refused" };
  return cockpitFailure(failure);
}
