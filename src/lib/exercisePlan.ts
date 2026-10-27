import type { ProfileKind } from "@/lib/outcomeMeasures";
import { CARDIO_CONDITION_OPEN_HEART } from "@/lib/intakeCardio";
import { GERI_FALLS_ONE_INJURED, GERI_FALLS_TWO_PLUS } from "@/lib/intakeGeriatric";
import { sentenceCount, type ProtocolStep, type SessionProtocol } from "@/lib/sessionProtocols";
import { checkStepAction, type RunRefusal, type RunState } from "@/lib/assessmentRun";
import { parseClinicDate, type PreExerciseCheck } from "@/lib/cardioSafety";
import { clinicDateKey } from "@/lib/clinicWeek";
import {
  CONTRA_FLAG_TEXT,
  DOSE_LIMITS,
  doseShapeProblem,
  exerciseByKey,
  type ContraFlag,
  type Exercise,
  type ExerciseDose,
} from "@/lib/exerciseLibrary";

// HOME EXERCISES (Health Profile redesign, phase 7d): the plan a
// physiotherapist publishes for a patient, and what they record while they
// teach it live on video. Pure and dependency-free -- the publish and teach
// routes call these with what they read, so every refusal is a sentence here
// first and is tested without a database.
//
// Three tables (schema.sql, phase 7d):
//   exercise_plans          one row per version; one ACTIVE per patient; a new
//                           version replaces the old (status 'replaced'), never edits it;
//   exercise_plan_items     the exercises and doses of one version, written in
//                           the same transaction as the version, append-only;
//   exercise_teaching_events  what the physiotherapist SAW on camera: performed
//                           correctly / needs practice (one cue) / not attempted
//                           (one reason). Append-only, only inside a run in progress.
//
// Vocabulary: "Home exercises" -- never "care plan", which is the programme
// recommendation (care_plans). The patient reads this plan; nothing in it
// asks them to report anything back.

// --- Limits ---------------------------------------------------------------------

export const PLAN_ITEMS_MIN = 1;
export const PLAN_ITEMS_MAX = 12;
export const DOSE_NOTE_MAX_CHARS = 140;
export const DOSE_NOTE_MAX_SENTENCES = 2;

// --- Fixed lists ------------------------------------------------------------------

export type TeachingOutcome = "performed_correctly" | "needs_practice" | "not_attempted";
export const TEACHING_OUTCOMES: readonly TeachingOutcome[] = ["performed_correctly", "needs_practice", "not_attempted"];

/** The cockpit's three buttons. */
export const TEACHING_OUTCOME_LABELS: Record<TeachingOutcome, string> = {
  performed_correctly: "Performed correctly",
  needs_practice: "Needs practice",
  not_attempted: "Not attempted",
};

/** One coaching cue for "needs practice", said to the patient and kept on
 *  their plan. Plain words, one short sentence each. Matches the CHECK on
 *  exercise_teaching_events.cue_key. */
export const COACHING_CUES = {
  slow_down: "Go slower and keep it smooth.",
  smaller_range: "Only go as far as is comfortable.",
  stand_tall: "Stand tall and look ahead.",
  breathe_out: "Breathe out as you push.",
  keep_breathing: "Keep breathing all the way through.",
  back_flat: "Keep your back flat.",
  knee_in_line: "Keep your knee in line with your toes.",
  hold_support: "Keep a hand on the support.",
  feet_apart: "Keep your feet hip-width apart.",
  full_hold: "Hold for the full count.",
  bigger_movement: "Make the movement bigger.",
  relax_shoulders: "Let your shoulders relax.",
} as const;
export type CoachingCue = keyof typeof COACHING_CUES;

/** Why an exercise was not attempted. The cockpit's wording; the patient's
 *  plan says only that it will be practised together next time. Matches the
 *  CHECK on exercise_teaching_events.reason_key. */
export const NOT_ATTEMPTED_REASONS = {
  too_painful: "Too painful today",
  too_tired: "Too tired or breathless today",
  not_safe: "Not safe without more support",
  no_helper: "No one could stand beside the patient",
  no_space: "Not enough space",
  no_equipment: "The equipment was not to hand",
  patient_declined: "The patient preferred not to",
  out_of_time: "Ran out of time",
} as const;
export type NotAttemptedReason = keyof typeof NOT_ATTEMPTED_REASONS;

/** Why a mark is corrected (phase 7d-3): the physiotherapist's own words in
 *  the cockpit, and the chart's. Matches the CHECK on
 *  exercise_teaching_events.correction_reason. Never shown to the patient. */
export const CORRECTION_REASONS = {
  wrong_button: "I tapped the wrong button",
  tried_again_correctly: "They tried again and did it right",
  see_summary: "Other: I will explain in the summary",
} as const;
export type CorrectionReason = keyof typeof CORRECTION_REASONS;

/** The chart's wording for a correction's reason (third person). */
export const CORRECTION_REASON_CHART: Record<CorrectionReason, string> = {
  wrong_button: "the wrong button was tapped",
  tried_again_correctly: "they tried again and did it right",
  see_summary: "explained in the session summary",
};

export type TeachingEventKind = "mark" | "correction";

const has = <T extends string>(table: Record<T, string>, key: unknown): key is T =>
  typeof key === "string" && Object.prototype.hasOwnProperty.call(table, key);

// --- Refusals ------------------------------------------------------------------------

export type ExerciseRefusalCode =
  | "bad_request"
  | "unknown_exercise"
  | "exercise_not_for_profile"
  | "duplicate_exercise"
  | "too_many_exercises"
  | "no_exercises"
  | "bad_dose"
  | "note_not_plain"
  | "contraindicated"
  | "helper_needs_run"
  | "helper_not_confirmed"
  | "milestone_not_found"
  | "no_active_plan"
  | "not_in_plan"
  | "already_marked"
  | "correction_needs_mark"
  | "bad_correction_reason"
  | "no_teach_step"
  | "changed_elsewhere";

export type ExerciseRefusal = { status: 400 | 403 | 404 | 409; code: ExerciseRefusalCode; error: string };

const refuse = (status: ExerciseRefusal["status"], code: ExerciseRefusalCode, error: string): ExerciseRefusal => ({ status, code, error });

/** One sentence and the single fix for every refusal code, for the cockpit
 *  (phase 7d-2) -- the cockpitFailure() posture. */
export const EXERCISE_REFUSAL_TEXT: Record<ExerciseRefusalCode, { message: string; fix: string }> = {
  bad_request: { message: "That did not go through.", fix: "Reload the page and try again." },
  unknown_exercise: { message: "That exercise is not in the clinic's library.", fix: "Pick it again from the list." },
  exercise_not_for_profile: { message: "That exercise is not offered for this patient's condition type.", fix: "Pick one from the list shown." },
  duplicate_exercise: { message: "The same exercise is in the plan twice.", fix: "Remove one of them." },
  too_many_exercises: { message: `A plan holds at most ${PLAN_ITEMS_MAX} exercises.`, fix: "Keep the few that matter most." },
  no_exercises: { message: "The plan has no exercises.", fix: "Add at least one exercise." },
  bad_dose: { message: "Part of a dose is outside what the plan allows.", fix: "Check the sets, repetitions, hold and days." },
  note_not_plain: { message: "A note is too long.", fix: `Keep it to ${DOSE_NOTE_MAX_SENTENCES} short sentences.` },
  contraindicated: { message: "The Health Profile rules that exercise out for this patient.", fix: "Pick the easier version or another exercise." },
  helper_needs_run: { message: "That exercise needs another adult beside the patient.", fix: "Add it during the guided session, with the helper confirmed." },
  helper_not_confirmed: { message: "Nobody is confirmed as beside the patient.", fix: "Tick that another adult is beside the patient on this step." },
  milestone_not_found: { message: "That milestone is not one of this patient's.", fix: "Pick a milestone from their Health Profile, or none." },
  no_active_plan: { message: "There is no home exercise plan to teach yet.", fix: "Save the plan first, then teach it." },
  not_in_plan: { message: "That exercise is not in the current plan.", fix: "Add it to the plan and save it first." },
  already_marked: { message: "This exercise is already marked for this session.", fix: "If the mark is wrong, tap Fix this mark." },
  correction_needs_mark: { message: "There is no mark on this exercise yet to fix.", fix: "Mark it with one of the three buttons." },
  bad_correction_reason: { message: "A fix needs one of the three reasons.", fix: "Pick the reason, then the right mark." },
  no_teach_step: { message: "This assessment has no Home exercises step.", fix: "End it and start a new one." },
  changed_elsewhere: { message: "The plan or the assessment changed while you were saving.", fix: "Reload the page and try again." },
};

// --- Contraindications from the intake ---------------------------------------------------

const norm = (v: unknown) => (typeof v === "string" ? v.replace(/[‘’ʼ]/g, "'").replace(/\s+/g, " ").trim().toLowerCase() : "");

/**
 * What the answers on file rule out, "where available": an answer that was
 * never given raises nothing (the physiotherapist, who is watching, decides).
 * Sternal precautions hold from an open-heart answer until the date the
 * surgeon gave has passed; a date that cannot be read keeps them on.
 */
export function contraFlagsFromIntake(intake: Readonly<Record<string, unknown>> | null | undefined, nowMs: number): Set<ContraFlag> {
  const flags = new Set<ContraFlag>();
  const a = intake ?? {};
  if (norm(a.cardio_condition) === norm(CARDIO_CONDITION_OPEN_HEART)) {
    // The same reading of the surgeon's date as the Cardio profile uses
    // (cardioSafety.sternalPrecautions): day-first "05/09/2026" is 5 September,
    // and the precautions hold through the whole of the last day in the
    // clinic's zone. A date that cannot be read keeps them on.
    const until = typeof a.cardio_sternal_precautions_until === "string" ? parseClinicDate(a.cardio_sternal_precautions_until) : null;
    if (!until || clinicDateKey(nowMs) <= until) flags.add("sternal_precautions");
  }
  const geriFalls = norm(a.geri_falls_12m);
  const neuroFalls = norm(a.neuro_falls);
  const freezing = norm(a.neuro_pd_freezing);
  if (
    geriFalls === norm(GERI_FALLS_TWO_PLUS) ||
    geriFalls === norm(GERI_FALLS_ONE_INJURED) ||
    neuroFalls === "two or three" ||
    neuroFalls === "more than three" ||
    freezing === "most days" ||
    freezing === "several times a day"
  ) {
    flags.add("high_fall_risk");
  }
  const mobility = norm(a.neuro_mobility);
  if (mobility === "use a wheelchair" || mobility === "mostly in bed" || neuroFalls === "not applicable - cannot stand") flags.add("cannot_stand");
  return flags;
}

export function contraindicationsHit(exercise: Exercise, flags: ReadonlySet<ContraFlag>): ContraFlag[] {
  return exercise.contraindications.filter((f) => flags.has(f));
}

// --- The dose ----------------------------------------------------------------------------

function intOrNull(v: unknown): number | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v === "number" && Number.isInteger(v)) return v;
  return undefined;
}

/**
 * The dose as it will be stored: the exercise's dose kind decides which of
 * repetitions, hold and minutes it has, inside DOSE_LIMITS. A field the body
 * leaves out takes the exercise's default; one it sends must be a whole
 * number in range. The note is trimmed, empty is none, and it must be plain:
 * at most two short sentences. (It is also contact-scanned at the route.)
 */
export function validateDose(exercise: Exercise, raw: unknown): { ok: true; dose: ExerciseDose } | { ok: false; refusal: ExerciseRefusal } {
  if (raw !== undefined && (typeof raw !== "object" || raw === null || Array.isArray(raw))) {
    return { ok: false, refusal: refuse(400, "bad_dose", `The dose for ${exercise.name} is not readable.`) };
  }
  const body = (raw ?? {}) as Record<string, unknown>;
  const extra = Object.keys(body).filter((k) => !["sets", "reps", "holdSeconds", "minutes", "timesPerDay", "daysPerWeek", "note"].includes(k));
  if (extra.length) return { ok: false, refusal: refuse(400, "bad_dose", `Unknown dose field: ${extra.join(", ")}.`) };
  const d = exercise.defaultDose;
  const pick = (k: "sets" | "reps" | "holdSeconds" | "minutes" | "timesPerDay" | "daysPerWeek"): number | null | undefined =>
    k in body ? intOrNull(body[k]) : d[k];
  const fields = {
    sets: pick("sets"),
    reps: pick("reps"),
    holdSeconds: pick("holdSeconds"),
    minutes: pick("minutes"),
    timesPerDay: pick("timesPerDay"),
    daysPerWeek: pick("daysPerWeek"),
  };
  if (Object.values(fields).some((v) => v === undefined)) {
    return { ok: false, refusal: refuse(400, "bad_dose", `Every number in the dose for ${exercise.name} is a whole number.`) };
  }
  if (fields.sets === null || fields.timesPerDay === null || fields.daysPerWeek === null) {
    return { ok: false, refusal: refuse(400, "bad_dose", `The dose for ${exercise.name} needs sets, times a day and days a week.`) };
  }
  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") return { ok: false, refusal: refuse(400, "bad_dose", "A note is text.") };
    const trimmed = body.note.replace(/\s+/g, " ").trim();
    if (trimmed) {
      if (trimmed.length > DOSE_NOTE_MAX_CHARS || sentenceCount(trimmed) > DOSE_NOTE_MAX_SENTENCES) {
        return { ok: false, refusal: refuse(400, "note_not_plain", `Keep the note for ${exercise.name} to two short sentences.`) };
      }
      note = trimmed;
    }
  }
  const dose: ExerciseDose = {
    sets: fields.sets as number,
    reps: fields.reps as number | null,
    holdSeconds: fields.holdSeconds as number | null,
    minutes: fields.minutes as number | null,
    timesPerDay: fields.timesPerDay as number,
    daysPerWeek: fields.daysPerWeek as number,
    note,
  };
  const problem = doseShapeProblem(exercise.doseKind, dose);
  if (problem) return { ok: false, refusal: refuse(400, "bad_dose", `${exercise.name}: ${problem}.`) };
  return { ok: true, dose };
}

const times = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

/** The dose in plain words, as the patient's plan and the cockpit say it:
 *  "2 sets of 10, holding each for 5 seconds. Twice a day, 5 days a week." */
export function doseText(dose: ExerciseDose): string {
  let what: string;
  if (dose.minutes !== null) what = `${dose.minutes} ${dose.minutes === 1 ? "minute" : "minutes"}`;
  else if (dose.reps !== null && dose.holdSeconds !== null) {
    what = `${dose.sets === 1 ? "" : `${dose.sets} sets of `}${dose.reps}${dose.sets === 1 ? " times" : ""}, holding each for ${dose.holdSeconds} seconds`;
  } else if (dose.reps !== null) what = dose.sets === 1 ? `${dose.reps} times` : `${dose.sets} sets of ${dose.reps}`;
  else what = `Hold for ${dose.holdSeconds} seconds, ${times(dose.sets)}`;
  const when = `${times(dose.timesPerDay)} a day, ${dose.daysPerWeek === 7 ? "every day" : `${dose.daysPerWeek} ${dose.daysPerWeek === 1 ? "day" : "days"} a week`}`;
  const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return `${capital(what)}. ${capital(when)}.`;
}

/** The stored jsonb: exactly these keys, nulls kept (the table's CHECK). */
export function doseJson(dose: ExerciseDose): Record<string, number | string | null> {
  return {
    sets: dose.sets,
    reps: dose.reps,
    holdSeconds: dose.holdSeconds,
    minutes: dose.minutes,
    timesPerDay: dose.timesPerDay,
    daysPerWeek: dose.daysPerWeek,
    note: dose.note,
  };
}

export function parseDose(raw: unknown): ExerciseDose | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);
  const sets = n(r.sets);
  const timesPerDay = n(r.timesPerDay);
  const daysPerWeek = n(r.daysPerWeek);
  if (sets === null || timesPerDay === null || daysPerWeek === null) return null;
  return {
    sets,
    reps: n(r.reps),
    holdSeconds: n(r.holdSeconds),
    minutes: n(r.minutes),
    timesPerDay,
    daysPerWeek,
    note: typeof r.note === "string" && r.note.trim() ? r.note : null,
  };
}

// --- The publish request --------------------------------------------------------------

export type PlanItemInput = { exercise: Exercise; dose: ExerciseDose; milestoneId: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The publish body's items, checked against the library and what the server
 * knows about this patient and this session -- never against what the
 * cockpit says:
 *   - every key is in the library and offered for the patient's profile kind;
 *   - no exercise twice, 1 to 12 of them, every dose valid for its kind;
 *   - nothing the intake rules out (contraFlagsFromIntake);
 *   - an exercise that needs another adult beside the patient is published
 *     only inside a guided run whose Home exercises step confirmed that
 *     helper (`helper`: "no_run" outside a run, "not_confirmed" or
 *     "confirmed" inside one).
 * Order is kept: it is the order the patient reads them in.
 */
export function validatePlanItems(
  raw: unknown,
  ctx: { profileKind: ProfileKind; contraFlags: ReadonlySet<ContraFlag>; helper: "no_run" | "not_confirmed" | "confirmed" }
): { ok: true; items: PlanItemInput[] } | { ok: false; refusal: ExerciseRefusal } {
  if (!Array.isArray(raw)) return { ok: false, refusal: refuse(400, "bad_request", "Send the plan's exercises as a list.") };
  if (raw.length < PLAN_ITEMS_MIN) return { ok: false, refusal: refuse(400, "no_exercises", "Add at least one exercise.") };
  if (raw.length > PLAN_ITEMS_MAX) return { ok: false, refusal: refuse(400, "too_many_exercises", `A plan holds at most ${PLAN_ITEMS_MAX} exercises.`) };
  const seen = new Set<string>();
  const items: PlanItemInput[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { ok: false, refusal: refuse(400, "bad_request", "Each exercise is { exerciseKey, dose }.") };
    }
    const e = entry as Record<string, unknown>;
    const extra = Object.keys(e).filter((k) => !["exerciseKey", "dose", "milestoneId"].includes(k));
    if (extra.length) return { ok: false, refusal: refuse(400, "bad_request", `Unknown field: ${extra.join(", ")}.`) };
    const exercise = typeof e.exerciseKey === "string" ? exerciseByKey(e.exerciseKey) : null;
    if (!exercise) return { ok: false, refusal: refuse(400, "unknown_exercise", "That exercise is not in the clinic's library.") };
    if (!exercise.profileKinds.includes(ctx.profileKind)) {
      return { ok: false, refusal: refuse(409, "exercise_not_for_profile", `${exercise.name} is not offered for this patient's condition type.`) };
    }
    if (seen.has(exercise.key)) return { ok: false, refusal: refuse(400, "duplicate_exercise", `${exercise.name} is in the plan twice.`) };
    seen.add(exercise.key);
    const hit = contraindicationsHit(exercise, ctx.contraFlags);
    if (hit.length) {
      return {
        ok: false,
        refusal: refuse(409, "contraindicated", `${exercise.name} is ruled out: ${hit.map((f) => CONTRA_FLAG_TEXT[f]).join("; ")}.`),
      };
    }
    if (exercise.needsHelper && ctx.helper === "no_run") {
      return { ok: false, refusal: refuse(409, "helper_needs_run", `${exercise.name} needs another adult beside the patient, so it is added during the guided session.`) };
    }
    if (exercise.needsHelper && ctx.helper === "not_confirmed") {
      return { ok: false, refusal: refuse(409, "helper_not_confirmed", `${exercise.name} needs another adult beside the patient. Tick that they are, first.`) };
    }
    const dose = validateDose(exercise, e.dose);
    if (!dose.ok) return dose;
    let milestoneId: string | null = null;
    if (e.milestoneId !== undefined && e.milestoneId !== null && e.milestoneId !== "") {
      if (typeof e.milestoneId !== "string" || !UUID_RE.test(e.milestoneId)) {
        return { ok: false, refusal: refuse(400, "bad_request", "milestoneId must be a milestone id.") };
      }
      milestoneId = e.milestoneId;
    }
    items.push({ exercise, dose: dose.dose, milestoneId });
  }
  return { ok: true, items };
}

/** The p_items jsonb publish_exercise_plan() takes, in order. */
export function planItemsJson(items: readonly PlanItemInput[]): { exercise_key: string; dose: Record<string, number | string | null>; milestone_id: string | null }[] {
  return items.map((i) => ({ exercise_key: i.exercise.key, dose: doseJson(i.dose), milestone_id: i.milestoneId }));
}

// --- The teach request ---------------------------------------------------------------------

export type TeachRequest =
  | { kind: "display"; exerciseKey: string; phase: "demo" | "go" }
  | { kind: "outcome"; exerciseKey: string; outcome: TeachingOutcome; cueKey: CoachingCue | null; reasonKey: NotAttemptedReason | null }
  | {
      kind: "correction";
      exerciseKey: string;
      outcome: TeachingOutcome;
      cueKey: CoachingCue | null;
      reasonKey: NotAttemptedReason | null;
      correctionReason: CorrectionReason;
    };

type OutcomeShape = { outcome: TeachingOutcome; cueKey: CoachingCue | null; reasonKey: NotAttemptedReason | null };

/** One outcome with its cue or reason, from the fixed lists -- a mark's and a correction's alike. */
function parseOutcome(b: Record<string, unknown>): { ok: true; value: OutcomeShape } | { ok: false; refusal: ExerciseRefusal } {
  if (!(TEACHING_OUTCOMES as readonly unknown[]).includes(b.outcome)) return { ok: false, refusal: refuse(400, "bad_request", "Unknown outcome.") };
  const outcome = b.outcome as TeachingOutcome;
  const cue = b.cueKey === undefined || b.cueKey === null ? null : b.cueKey;
  const reason = b.reasonKey === undefined || b.reasonKey === null ? null : b.reasonKey;
  if (cue !== null && !has(COACHING_CUES, cue)) return { ok: false, refusal: refuse(400, "bad_request", "Unknown coaching cue.") };
  if (reason !== null && !has(NOT_ATTEMPTED_REASONS, reason)) return { ok: false, refusal: refuse(400, "bad_request", "Unknown reason.") };
  if (outcome === "needs_practice" && (cue === null || reason !== null)) {
    return { ok: false, refusal: refuse(400, "bad_request", "Needs practice takes one coaching cue.") };
  }
  if (outcome === "not_attempted" && (reason === null || cue !== null)) {
    return { ok: false, refusal: refuse(400, "bad_request", "Not attempted takes one reason.") };
  }
  if (outcome === "performed_correctly" && (cue !== null || reason !== null)) {
    return { ok: false, refusal: refuse(400, "bad_request", "Performed correctly takes no cue or reason.") };
  }
  return { ok: true, value: { outcome, cueKey: cue as CoachingCue | null, reasonKey: reason as NotAttemptedReason | null } };
}

/**
 * The teach route's body, exactly one of:
 *   `{ runId, exerciseKey, phase: "demo" | "go" }` -- show the demo or the
 *     patient's turn on the companion;
 *   `{ runId, exerciseKey, outcome, cueKey?, reasonKey? }` -- record what the
 *     physiotherapist saw;
 *   `{ runId, exerciseKey, correct: { outcome, cueKey?, reasonKey?, correctionReason } }`
 *     -- correct this run's mark on that exercise (phase 7d-3): a new row
 *     referencing the latest one, the original kept.
 * Never text: a cue, a reason and a correction reason are keys from the
 * fixed lists. "Needs practice" takes exactly one cue, "not attempted"
 * exactly one reason, "performed correctly" neither.
 */
export function validateTeachRequest(raw: unknown): { ok: true; request: TeachRequest } | { ok: false; refusal: ExerciseRefusal } {
  if (!isObj(raw)) return { ok: false, refusal: refuse(400, "bad_request", "Nothing to record.") };
  const b = raw;
  const extra = Object.keys(b).filter((k) => !["runId", "exerciseKey", "phase", "outcome", "cueKey", "reasonKey", "correct"].includes(k));
  if (extra.length) return { ok: false, refusal: refuse(400, "bad_request", `The teach step takes keys only (${extra.join(", ")}).`) };
  if (typeof b.exerciseKey !== "string" || !exerciseByKey(b.exerciseKey)) {
    return { ok: false, refusal: refuse(400, "unknown_exercise", "That exercise is not in the clinic's library.") };
  }
  const kinds = [b.phase !== undefined, b.outcome !== undefined, b.correct !== undefined].filter(Boolean).length;
  if (kinds !== 1) return { ok: false, refusal: refuse(400, "bad_request", "Send a phase to show, an outcome to record, or a correction.") };
  if (b.phase !== undefined) {
    if (b.phase !== "demo" && b.phase !== "go") return { ok: false, refusal: refuse(400, "bad_request", "The phase is demo or go.") };
    if (b.cueKey !== undefined || b.reasonKey !== undefined) return { ok: false, refusal: refuse(400, "bad_request", "A cue or a reason goes with an outcome.") };
    return { ok: true, request: { kind: "display", exerciseKey: b.exerciseKey, phase: b.phase } };
  }
  if (b.correct !== undefined) {
    if (b.cueKey !== undefined || b.reasonKey !== undefined) {
      return { ok: false, refusal: refuse(400, "bad_request", "A correction carries its cue or reason inside `correct`.") };
    }
    if (!isObj(b.correct)) return { ok: false, refusal: refuse(400, "bad_request", "A correction is an object.") };
    const c = b.correct;
    const extraC = Object.keys(c).filter((k) => !["outcome", "cueKey", "reasonKey", "correctionReason"].includes(k));
    if (extraC.length) return { ok: false, refusal: refuse(400, "bad_request", `A correction takes keys only (${extraC.join(", ")}).`) };
    if (!has(CORRECTION_REASONS, c.correctionReason)) {
      return { ok: false, refusal: refuse(400, "bad_correction_reason", "A correction needs one of the three reasons.") };
    }
    const shape = parseOutcome(c);
    if (!shape.ok) return shape;
    return { ok: true, request: { kind: "correction", exerciseKey: b.exerciseKey, ...shape.value, correctionReason: c.correctionReason } };
  }
  const shape = parseOutcome(b);
  if (!shape.ok) return shape;
  return { ok: true, request: { kind: "outcome", exerciseKey: b.exerciseKey, ...shape.value } };
}

/**
 * The teach gate past the run's own (assessmentRun.ts checkStepAction does
 * the red flags, the set-up and the heart and lung pre-exercise check): the
 * exercise is in the patient's ACTIVE plan, and an exercise that needs
 * another adult is shown "go" or marked done only once the Home exercises
 * step's set-up ticked the helper. "Not attempted" needs no helper -- nothing
 * was done.
 */
export function checkTeachExercise(input: {
  plan: { id: string; exerciseKeys: readonly string[] } | null;
  exercise: Exercise;
  request: TeachRequest;
  helperConfirmed: boolean;
}): { ok: true; index: number; total: number } | { ok: false; refusal: ExerciseRefusal } {
  const { plan, exercise, request } = input;
  if (!plan) return { ok: false, refusal: refuse(409, "no_active_plan", "Save the home exercise plan before teaching it.") };
  const index = plan.exerciseKeys.indexOf(exercise.key);
  if (index < 0) return { ok: false, refusal: refuse(409, "not_in_plan", `${exercise.name} is not in the current plan.`) };
  const doing = teachAction(request) === "doing";
  if (exercise.needsHelper && doing && !input.helperConfirmed) {
    return { ok: false, refusal: refuse(409, "helper_not_confirmed", `${exercise.name} needs another adult beside the patient. Tick that they are, first.`) };
  }
  return { ok: true, index, total: plan.exerciseKeys.length };
}

/**
 * The run's own gate for the Home exercises step, in the clinical order
 * (assessmentRun.ts checkStepAction): the red flags answered before
 * anything; a demo is refused once one was answered yes (no exercise
 * today); the patient's turn and a "performed" or "needs practice" mark are
 * a save -- the step's required set-up ticked (its helper, for a child) and,
 * on the heart and lung protocol, the pre-exercise check clear. "Not
 * attempted" needs only the red flags answered: nothing was done.
 */
export function checkTeachStep(input: {
  protocol: SessionProtocol;
  step: ProtocolStep;
  state: RunState;
  action: "demo" | "doing" | "not_attempted";
  preExercise?: PreExerciseCheck | null;
}): RunRefusal | null {
  const { protocol, step, state, action } = input;
  if (action === "doing") return checkStepAction({ protocol, step, state, action: "save", preExercise: input.preExercise });
  const answered = checkStepAction({ protocol, step, state, action: "skip" });
  if (answered) return answered;
  if (action === "demo" && state.redFlags && state.redFlags.flagged.length > 0) {
    return { status: 409, code: "red_flag_present", error: "A safety question was answered yes, so no exercises today. Go to the summary." };
  }
  return null;
}

/** What a teach request does, for the gate above. */
export function teachAction(request: TeachRequest): "demo" | "doing" | "not_attempted" {
  if (request.kind === "display") return request.phase === "demo" ? "demo" : "doing";
  // A correction passes the same gate as the mark it now says: on a red-flag
  // day only "not attempted" goes through, before or after a correction.
  return request.outcome === "not_attempted" ? "not_attempted" : "doing";
}

/**
 * What a correction does, decided from this run's events (phase 7d-3):
 * refused when the exercise has no mark in this run on this plan yet; a
 * success with nothing written when the latest row already says this (a
 * retry, or a fix that changes nothing); otherwise a new row referencing
 * the LATEST row for that exercise -- the one the chain allows.
 */
export function planCorrection(
  events: readonly TeachingEvent[],
  input: { runId: string; planId: string; exerciseKey: string; outcome: TeachingOutcome; cueKey: CoachingCue | null; reasonKey: NotAttemptedReason | null }
): { kind: "no_mark" } | { kind: "same"; event: TeachingEvent } | { kind: "write"; correctsEventId: string } {
  const mine = events.filter((e) => e.runId === input.runId && e.planId === input.planId && e.exerciseKey === input.exerciseKey);
  if (!mine.some((e) => e.kind === "mark")) return { kind: "no_mark" };
  const latest = latestTeachingEvents(mine)[0];
  if (latest.outcome === input.outcome && latest.cueKey === input.cueKey && latest.reasonKey === input.reasonKey) return { kind: "same", event: latest };
  return { kind: "write", correctsEventId: latest.id };
}

/** Whether a retried plain mark is the one already recorded (the ORIGINAL
 *  mark, not a later correction of it). */
export function sameOriginalMark(events: readonly TeachingEvent[], input: { runId: string; planId: string; exerciseKey: string } & OutcomeShape): TeachingEvent | null {
  const mark = events.find((e) => e.kind === "mark" && e.runId === input.runId && e.planId === input.planId && e.exerciseKey === input.exerciseKey);
  return mark && mark.outcome === input.outcome && mark.cueKey === input.cueKey && mark.reasonKey === input.reasonKey ? mark : null;
}

/** Whether every exercise in the plan has a mark in this run -- what Save
 *  and next on the Home exercises step needs (the event route refuses it
 *  otherwise, `exercises_not_marked`). */
export function allExercisesMarked(plan: { id: string; exerciseKeys: readonly string[] }, events: readonly TeachingEvent[], runId: string): boolean {
  const marked = new Set(events.filter((e) => e.runId === runId && e.planId === plan.id).map((e) => e.exerciseKey));
  return plan.exerciseKeys.length > 0 && plan.exerciseKeys.every((k) => marked.has(k));
}

// --- Rows ---------------------------------------------------------------------------------------

export type ExercisePlanStatus = "active" | "replaced";

export type ExercisePlanItem = {
  id: string;
  planId: string;
  exerciseKey: string;
  dose: ExerciseDose;
  milestoneId: string | null;
  sortOrder: number;
};

export type ExercisePlan = {
  id: string;
  patientId: string;
  version: number;
  authoredBy: string;
  runId: string | null;
  appointmentId: string | null;
  profileKind: ProfileKind | null;
  status: ExercisePlanStatus;
  createdAt: string;
  replacedAt: string | null;
  items: ExercisePlanItem[];
};

export type TeachingEvent = {
  id: string;
  /** "mark" for every row a patient's own client reads (it has no access to the
   *  correction columns), and for the original mark; "correction" for a fix. */
  kind: TeachingEventKind;
  correctsEventId: string | null;
  correctionReason: CorrectionReason | null;
  runId: string;
  planId: string;
  patientId: string;
  exerciseKey: string;
  outcome: TeachingOutcome;
  cueKey: CoachingCue | null;
  reasonKey: NotAttemptedReason | null;
  helperPresent: boolean;
  actor: string;
  createdAt: string;
};

export const EXERCISE_PLAN_SELECT = "id, patient_id, version, authored_by, run_id, appointment_id, profile_kind, status, created_at, replaced_at";
export const EXERCISE_PLAN_ITEM_SELECT = "id, plan_id, exercise_key, dose, milestone_id, sort_order";
/** The columns a browser session may read (column privileges): the patient's
 *  own client uses this one, and never learns that a mark was corrected. */
export const EXERCISE_TEACHING_EVENT_SELECT =
  "id, run_id, plan_id, patient_id, exercise_key, outcome, cue_key, reason_key, helper_present, actor, created_at";
/** The clinician's read (service role, after the access checks): with the correction columns. */
export const EXERCISE_TEACHING_EVENT_CLINICIAN_SELECT = `${EXERCISE_TEACHING_EVENT_SELECT}, kind, corrects_event_id, correction_reason`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const KINDS: readonly string[] = ["ortho", "neuro", "neuro_parkinsons", "pediatrics", "geriatric", "cardiopulmonary"];

export function parsePlanRow(raw: unknown, items: readonly ExercisePlanItem[] = []): ExercisePlan | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const patientId = str(raw.patient_id);
  const authoredBy = str(raw.authored_by);
  const createdAt = str(raw.created_at);
  if (!id || !patientId || !authoredBy || !createdAt || typeof raw.version !== "number") return null;
  if (raw.status !== "active" && raw.status !== "replaced") return null;
  return {
    id,
    patientId,
    version: raw.version,
    authoredBy,
    runId: str(raw.run_id),
    appointmentId: str(raw.appointment_id),
    profileKind: typeof raw.profile_kind === "string" && KINDS.includes(raw.profile_kind) ? (raw.profile_kind as ProfileKind) : null,
    status: raw.status,
    createdAt,
    replacedAt: str(raw.replaced_at),
    items: items.filter((i) => i.planId === id).sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export function parsePlanItemRow(raw: unknown): ExercisePlanItem | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const planId = str(raw.plan_id);
  const exerciseKey = str(raw.exercise_key);
  const dose = parseDose(raw.dose);
  if (!id || !planId || !exerciseKey || !dose || typeof raw.sort_order !== "number") return null;
  return { id, planId, exerciseKey, dose, milestoneId: str(raw.milestone_id), sortOrder: raw.sort_order };
}

export function parseTeachingEventRow(raw: unknown): TeachingEvent | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  const runId = str(raw.run_id);
  const planId = str(raw.plan_id);
  const patientId = str(raw.patient_id);
  const exerciseKey = str(raw.exercise_key);
  const actor = str(raw.actor);
  const createdAt = str(raw.created_at);
  if (!id || !runId || !planId || !patientId || !exerciseKey || !actor || !createdAt) return null;
  if (!(TEACHING_OUTCOMES as readonly unknown[]).includes(raw.outcome)) return null;
  const kind: TeachingEventKind = raw.kind === "correction" ? "correction" : "mark";
  if (raw.kind !== undefined && raw.kind !== "mark" && raw.kind !== "correction") return null;
  const correctsEventId = str(raw.corrects_event_id);
  const correctionReason = has(CORRECTION_REASONS, raw.correction_reason) ? raw.correction_reason : null;
  if (kind === "correction" && (!correctsEventId || !correctionReason)) return null;
  return {
    id,
    kind,
    correctsEventId: kind === "correction" ? correctsEventId : null,
    correctionReason: kind === "correction" ? correctionReason : null,
    runId,
    planId,
    patientId,
    exerciseKey,
    outcome: raw.outcome as TeachingOutcome,
    cueKey: has(COACHING_CUES, raw.cue_key) ? raw.cue_key : null,
    reasonKey: has(NOT_ATTEMPTED_REASONS, raw.reason_key) ? raw.reason_key : null,
    helperPresent: raw.helper_present === true,
    actor,
    createdAt,
  };
}

/** Oldest first; in a tie a correction comes after the row it corrects (its
 *  depth in the chain), then by id. */
export function orderTeachingEvents(events: readonly TeachingEvent[]): TeachingEvent[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  const depth = (e: TeachingEvent): number => {
    let d = 0;
    for (let at: TeachingEvent | undefined = e; at?.correctsEventId && d < events.length; at = byId.get(at.correctsEventId)) d++;
    return d;
  };
  return [...events].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || depth(a) - depth(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * The LATEST row per exercise per plan -- what the patient, the chart's
 * headline, the summary draft and Save and next read (phase 7d-3). A row a
 * correction references is superseded whatever the clocks say (the chain is
 * the truth); among the rest the newest wins, so across runs the latest run's
 * outcome stands, and a patient's read -- which has no correction columns --
 * is simply newest-first. Oldest first, like orderTeachingEvents; every
 * original stays in the input for the history.
 */
export function latestTeachingEvents(events: readonly TeachingEvent[]): TeachingEvent[] {
  const superseded = new Set(events.map((e) => e.correctsEventId).filter((id): id is string => !!id));
  const latest = new Map<string, TeachingEvent>();
  for (const e of orderTeachingEvents(events)) {
    if (superseded.has(e.id)) continue;
    latest.set(`${e.planId}\u0000${e.exerciseKey}`, e);
  }
  return orderTeachingEvents([...latest.values()]);
}

// --- The patient's plan (read-only) ----------------------------------------------------------

export type PlanItemView = {
  key: string;
  name: string;
  picture: Exercise["picture"];
  steps: readonly string[];
  dose: string;
  note: string | null;
  safety: string;
  /** "Do this with another adult beside you." for an exercise that needs one. */
  helperLine: string | null;
  /** The newest time it was practised with the physiotherapist, if it was. */
  practised: { at: string; outcome: TeachingOutcome; cue: string | null } | null;
};

export type PlanView = { planId: string; version: number; publishedAt: string; items: PlanItemView[] };

export const HELPER_LINE = { patient: "Do this with another adult beside you.", parent: "Do this together with your child." } as const;

/**
 * What the patient's dashboard draws: the plan's exercises in order, each
 * with the library's picture and steps, the dose in plain words, the
 * physiotherapist's note, the safety line and -- from the teaching events on
 * THIS plan -- when it was last practised together and the one cue to
 * remember. An item whose exercise left the library is dropped rather than
 * drawn half-empty. Nothing here is something the patient fills in.
 */
export function exercisePlanView(plan: ExercisePlan, events: readonly TeachingEvent[], opts: { parent?: boolean } = {}): PlanView {
  const latest = new Map<string, TeachingEvent>();
  for (const e of latestTeachingEvents(events.filter((x) => x.planId === plan.id))) latest.set(e.exerciseKey, e);
  const items: PlanItemView[] = [];
  for (const item of plan.items) {
    const ex = exerciseByKey(item.exerciseKey);
    if (!ex) continue;
    const t = latest.get(ex.key);
    items.push({
      key: ex.key,
      name: ex.name,
      picture: ex.picture,
      steps: ex.steps,
      dose: doseText(item.dose),
      note: item.dose.note,
      safety: ex.safety,
      helperLine: ex.needsHelper ? (opts.parent ? HELPER_LINE.parent : HELPER_LINE.patient) : null,
      practised: t ? { at: t.createdAt, outcome: t.outcome, cue: t.cueKey ? COACHING_CUES[t.cueKey] : null } : null,
    });
  }
  return { planId: plan.id, version: plan.version, publishedAt: plan.createdAt, items };
}

/** The patient's line under an exercise, with the date already formatted in
 *  the clinic's zone by the caller (formatDateTime.ts). */
export function practisedLine(practised: PlanItemView["practised"], dateText: string, opts: { parent?: boolean } = {}): string {
  const who = opts.parent ? "Your child" : "You";
  const physio = opts.parent ? "the physiotherapist" : "your physiotherapist";
  if (!practised) return opts.parent ? "Your physiotherapist will go through this with your child." : "Your physiotherapist will go through this with you.";
  if (practised.outcome === "performed_correctly") return `${who} did this well with ${physio} on ${dateText}.`;
  if (practised.outcome === "needs_practice") return `Practised with ${physio} on ${dateText}. Remember: ${practised.cue ?? "take it slowly."}`;
  return opts.parent ? "Your child will practise this together with the physiotherapist next time." : "You will practise this together next time.";
}

/**
 * What the session note's free-text "Home exercise prescribed" field starts
 * with. Text already there is never touched; the prefill goes in ONLY when
 * the note is NEW and the field is empty -- an existing note's empty field
 * is the therapist's own choice and stays empty.
 */
export function homeExerciseInitialValue(input: { existingText: string | null | undefined; isNewNote: boolean; prefill: string | null | undefined }): string {
  const existing = input.existingText ?? "";
  if (existing.trim()) return existing;
  if (!input.isNewNote) return existing;
  return input.prefill?.trim() ? input.prefill : "";
}

// --- The session's summary draft and the session note --------------------------------------------

const lowerFirst = (t: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The sentence the run's summary draft adds about what was TAUGHT (the
 * latest outcome per exercise in the run): honest about "needs practice"
 * and about what was not attempted. Null when nothing was marked.
 */
export function teachingSummarySentence(events: readonly TeachingEvent[], voice: "patient" | "clinician"): string | null {
  const latest = new Map<string, TeachingEvent>();
  for (const e of latestTeachingEvents(events)) latest.set(e.exerciseKey, e);
  if (latest.size === 0) return null;
  const name = (k: string) => lowerFirst(exerciseByKey(k)?.name ?? k);
  const well: string[] = [];
  const practice: string[] = [];
  const notYet: string[] = [];
  for (const e of latest.values()) {
    if (e.outcome === "performed_correctly") well.push(name(e.exerciseKey));
    else if (e.outcome === "needs_practice") {
      practice.push(voice === "patient" ? name(e.exerciseKey) : `${name(e.exerciseKey)} (${lowerFirst(COACHING_CUES[e.cueKey ?? "slow_down"]).replace(/\.$/, "")})`);
    } else notYet.push(voice === "clinician" && e.reasonKey ? `${name(e.exerciseKey)} (${lowerFirst(NOT_ATTEMPTED_REASONS[e.reasonKey])})` : name(e.exerciseKey));
  }
  const taught = well.length + practice.length;
  if (voice === "patient") {
    const clauses: string[] = [];
    if (well.length) clauses.push(`${listWords(well)} went well`);
    if (practice.length) clauses.push(`${listWords(practice)} ${practice.length === 1 ? "needs" : "need"} more practice`);
    const out: string[] = [];
    if (taught > 0) {
      out.push(`We practised ${taught} home ${taught === 1 ? "exercise" : "exercises"} together${clauses.length ? `: ${clauses.join(", and ")}` : ""}.`);
    }
    if (notYet.length) out.push(`We will try ${listWords(notYet)} next time.`);
    return out.join(" ");
  }
  const parts: string[] = [`Home exercises taught: ${taught} of ${latest.size}`];
  if (well.length) parts.push(`performed correctly: ${listWords(well)}`);
  if (practice.length) parts.push(`needs practice: ${listWords(practice)}`);
  if (notYet.length) parts.push(`not attempted: ${listWords(notYet)}`);
  // The clinician's draft says a mark was corrected (the patient's never does).
  const corrected = [...new Set(events.filter((e) => e.kind === "correction").map((e) => e.exerciseKey))].filter((k) => latest.has(k));
  if (corrected.length) parts.push(`mark corrected during the session: ${listWords(corrected.map(name))}`);
  return `${parts.join("; ")}.`;
}

/**
 * Session notes keep their free-text "Home exercise prescribed" field
 * (sessionNotes.ts), and old text is never touched. For a NEW note the
 * dialog may prefill an EMPTY field from the structured plan with this
 * clinician-register line; the therapist edits or clears it, and what is
 * saved is their own text. The structured plan is the record the patient
 * reads; the note stays the clinicians' working copy.
 */
export function homeExerciseNotePrefill(plan: ExercisePlan): string {
  const lines = plan.items
    .map((i) => {
      const ex = exerciseByKey(i.exerciseKey);
      if (!ex) return null;
      return `${ex.name}: ${doseText(i.dose).replace(/\.$/, "")}${i.dose.note ? ` (${i.dose.note.replace(/\.$/, "")})` : ""}`;
    })
    .filter((l): l is string => !!l);
  return `Home exercises, version ${plan.version}: ${lines.join("; ")}.`;
}

export { DOSE_LIMITS };
