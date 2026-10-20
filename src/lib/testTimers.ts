// The clinic's test timers, as state machines and arithmetic.
//
// The tap timer for walk and Timed Up and Go trials, the 30-second chair
// stand, the four-stage balance holds and the six-minute walk all share one
// design, and it is here so the components are thin and the rules are tested
// without a browser:
//
//   - **Time is a timestamp, never a count.** Every machine stores the
//     moment it started (a monotonic reading, performance.now() in the
//     browser) and derives "elapsed" and "remaining" from `now`. A
//     setInterval that is throttled in a background tab, or that drifts a
//     few milliseconds each tick, cannot lose time because nothing is
//     being counted: the next render simply asks the clock. Functions take
//     `now` as an argument and never read a clock themselves, so a test
//     controls it.
//   - **A clinical timed test cannot be paused.** The six-minute walk's
//     clock keeps running if the patient rests (that is the protocol), and
//     a Timed Up and Go that was interrupted is not a Timed Up and Go. The
//     only exits are "finished" and "discard"; there is no pause that could
//     leave a half-trusted number behind.
//   - **A device that slept is told.** performance.now() can stop while a
//     phone sleeps; the wall clock does not. `clockDisagreement()` compares
//     the two so a result timed across a sleep is flagged instead of
//     quietly recorded short.
//
// Everything that turns a reading into a number the record stores goes
// through clinicalCalculators.ts, so the screen and the route (which
// re-checks with validateMeasurement) agree.

import {
  SIX_MINUTE_WALK_EQUATIONS,
  averageOfTrials,
  bestOfTrials,
  medianOfTrials,
  percentOfPredicted,
  predictedSixMinuteWalk,
  roundTo,
  walkSpeedMps,
  DEFAULT_SIX_MINUTE_WALK_EQUATION,
  type CalcResult,
  type Sex,
  type SixMinuteWalkEquationKey,
} from "@/lib/clinicalCalculators";

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// --- Stopwatch (one trial) -----------------------------------------------------------------

export type StopwatchState =
  | { status: "idle"; startedAt: null; elapsedMs: 0 }
  | { status: "running"; startedAt: number; elapsedMs: 0 }
  | { status: "stopped"; startedAt: number; elapsedMs: number };

export const IDLE_STOPWATCH: StopwatchState = { status: "idle", startedAt: null, elapsedMs: 0 };

export function startStopwatch(state: StopwatchState, now: number): StopwatchState {
  if (state.status === "running") return state;
  return { status: "running", startedAt: now, elapsedMs: 0 };
}

/** Elapsed milliseconds at `now`; never negative (a clock that went back
 *  reads as zero rather than as a negative time). */
export function stopwatchElapsedMs(state: StopwatchState, now: number): number {
  if (state.status === "idle") return 0;
  if (state.status === "stopped") return state.elapsedMs;
  return Math.max(0, now - state.startedAt);
}

export function stopStopwatch(state: StopwatchState, now: number): StopwatchState {
  if (state.status !== "running") return state;
  return { status: "stopped", startedAt: state.startedAt, elapsedMs: Math.max(0, now - state.startedAt) };
}

// --- Countdown ---------------------------------------------------------------------------------

export type CountdownState = {
  durationMs: number;
  status: "idle" | "running" | "finished" | "aborted";
  startedAt: number | null;
};

export function createCountdown(durationMs: number): CountdownState {
  return { durationMs: finite(durationMs) && durationMs > 0 ? durationMs : 0, status: "idle", startedAt: null };
}

export function startCountdown(state: CountdownState, now: number): CountdownState {
  if (state.status === "running" || state.durationMs <= 0) return state;
  return { ...state, status: "running", startedAt: now };
}

export function countdownElapsedMs(state: CountdownState, now: number): number {
  if (state.status === "idle" || state.startedAt === null) return 0;
  if (state.status === "finished") return state.durationMs;
  return Math.min(state.durationMs, Math.max(0, now - state.startedAt));
}

export function countdownRemainingMs(state: CountdownState, now: number): number {
  if (state.status === "idle") return state.durationMs;
  if (state.status === "finished") return 0;
  return Math.max(0, state.durationMs - countdownElapsedMs(state, now));
}

/** Moves a running countdown to finished once its time is up. Call it on
 *  every tick; it is idempotent. */
export function settleCountdown(state: CountdownState, now: number): CountdownState {
  if (state.status === "running" && countdownRemainingMs(state, now) <= 0) return { ...state, status: "finished" };
  return state;
}

export function abortCountdown(state: CountdownState): CountdownState {
  return state.status === "running" ? { ...state, status: "aborted" } : state;
}

// --- Reading a clock out loud --------------------------------------------------------------------

/** "0:07.4" -- minutes, seconds and tenths, for a stopwatch face. */
export function formatStopwatch(ms: number): string {
  const safe = finite(ms) && ms > 0 ? ms : 0;
  const tenths = Math.floor(safe / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor((tenths % 600) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths % 10}`;
}

/** "5:59" -- a countdown face rounds UP, so it reads 0:00 only when the time
 *  really is up. */
export function formatCountdown(remainingMs: number): string {
  const safe = finite(remainingMs) && remainingMs > 0 ? remainingMs : 0;
  const total = Math.ceil(safe / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** Seconds to the precision a stopwatch reading is kept at (tenths). */
export function msToSeconds(ms: number, decimals = 1): number {
  return roundTo((finite(ms) && ms > 0 ? ms : 0) / 1000, decimals);
}

// --- Sleep detection -------------------------------------------------------------------------------

/**
 * Whether the monotonic clock and the wall clock disagree about how long a
 * timing ran by more than `toleranceMs`: the signature of a device that
 * slept (or whose clock was changed) mid-test. Either clock alone can be
 * fooled; both agreeing is the evidence.
 */
export function clockDisagreement(monotonicDeltaMs: number, wallDeltaMs: number, toleranceMs = 2000): boolean {
  if (!finite(monotonicDeltaMs) || !finite(wallDeltaMs)) return true;
  return Math.abs(wallDeltaMs - monotonicDeltaMs) > toleranceMs;
}

// --- Trials -------------------------------------------------------------------------------------------

export type TrialKeep = "best" | "average" | "median";

export type TrialSummary = {
  count: number;
  average: number | null;
  best: number | null;
  median: number | null;
  /** The one the measure's keep rule stores. */
  kept: number | null;
};

/**
 * Average, best and median of the trials, and the one the measure keeps.
 * `better` decides what "best" is (fewest seconds, most seconds standing);
 * a measure with no better direction has no best, and a "best" rule on it
 * keeps nothing rather than guessing. Rounded to the measure's precision
 * exactly as validateMeasurement re-derives it.
 */
export function summariseTrials(
  trials: readonly number[],
  rule: { keep: TrialKeep },
  better: "higher" | "lower" | string | null,
  decimals: number
): TrialSummary {
  const values = trials.filter(finite);
  const round = (v: number | null) => (v === null ? null : roundTo(v, decimals));
  const direction = better === "higher" || better === "lower" ? better : null;
  const average = round(averageOfTrials(values));
  const best = direction ? round(bestOfTrials(values, direction)) : null;
  const median = round(medianOfTrials([...values]));
  const kept = rule.keep === "average" ? average : rule.keep === "best" ? best : median;
  return { count: values.length, average, best, median, kept };
}

/** Goniometry: two readings more than `tolerance` degrees apart ask for a
 *  third, and the middle one is kept. */
export function needsThirdReading(readings: readonly number[], tolerance = 5): boolean {
  const v = readings.filter(finite);
  return v.length === 2 && Math.abs(v[0] - v[1]) > tolerance;
}

/** Stopwatch seconds over a marked distance to speeds (m/s), the unit the
 *  10-metre and 4-metre walks store their trials in. Refuses on the first
 *  time that is not usable, saying which trial. */
export function secondsToSpeeds(seconds: readonly number[], distanceMetres: number): CalcResult<number[]> {
  const out: number[] = [];
  for (let i = 0; i < seconds.length; i += 1) {
    const speed = walkSpeedMps(seconds[i], distanceMetres);
    if (!speed.ok) return { ok: false, error: `Trial ${i + 1}: ${speed.error}` };
    out.push(speed.value);
  }
  return { ok: true, value: out, working: `${seconds.length} trial${seconds.length === 1 ? "" : "s"} over ${distanceMetres} m` };
}

// --- 30-second chair stand ----------------------------------------------------------------------------

export const CHAIR_STAND_SECONDS = 30;
export const CHAIR_STAND_MAX = 40;

/** A tap counter that cannot go below zero or above what a person can do
 *  in thirty seconds (the registry's own ceiling). */
export function adjustCount(count: number, delta: number, max = CHAIR_STAND_MAX): number {
  const next = (finite(count) ? count : 0) + (finite(delta) ? delta : 0);
  return Math.min(max, Math.max(0, Math.round(next)));
}

// --- Four-stage balance ------------------------------------------------------------------------------------

export const BALANCE_HOLD_MS = 10_000;

export const BALANCE_STAGES: readonly { stage: 1 | 2 | 3 | 4; label: string; how: string }[] = [
  { stage: 1, label: "Feet side by side", how: "Both feet together, side by side." },
  { stage: 2, label: "Semi-tandem", how: "The instep of one foot touching the big toe of the other." },
  { stage: 3, label: "Tandem", how: "One foot directly in front of the other, heel to toe." },
  { stage: 4, label: "One leg", how: "Standing on one leg." },
];

export type BalanceStageState = "pending" | "running" | "held" | "not_held";

export type BalanceState = {
  stages: { state: BalanceStageState; startedAt: number | null; heldMs: number }[];
};

export function createBalance(): BalanceState {
  return { stages: BALANCE_STAGES.map(() => ({ state: "pending" as const, startedAt: null, heldMs: 0 })) };
}

/** The stage that can be started or is running now: the first not yet held,
 *  or null when all four are held or one was not held (the test is over --
 *  "move to the next stage only if the current one is held for 10 seconds"). */
export function currentBalanceStage(state: BalanceState): number | null {
  for (let i = 0; i < state.stages.length; i += 1) {
    const s = state.stages[i].state;
    if (s === "held") continue;
    return s === "not_held" ? null : i;
  }
  return null;
}

export function startBalanceStage(state: BalanceState, now: number): BalanceState {
  const i = currentBalanceStage(state);
  if (i === null || state.stages[i].state !== "pending") return state;
  return replaceStage(state, i, { state: "running", startedAt: now, heldMs: 0 });
}

function replaceStage(state: BalanceState, index: number, next: BalanceState["stages"][number]): BalanceState {
  return { stages: state.stages.map((s, i) => (i === index ? next : s)) };
}

/** Marks the running stage held once ten seconds have passed. Idempotent. */
export function settleBalance(state: BalanceState, now: number): BalanceState {
  const i = state.stages.findIndex((s) => s.state === "running");
  if (i < 0) return state;
  const s = state.stages[i];
  if (s.startedAt !== null && now - s.startedAt >= BALANCE_HOLD_MS) {
    return replaceStage(state, i, { state: "held", startedAt: s.startedAt, heldMs: BALANCE_HOLD_MS });
  }
  return state;
}

/** The patient stepped out, held on, or lost their balance before ten
 *  seconds: the stage is not held and the test ends there. */
export function endBalanceStage(state: BalanceState, now: number): BalanceState {
  const settled = settleBalance(state, now);
  const i = settled.stages.findIndex((s) => s.state === "running");
  if (i < 0) return settled;
  const s = settled.stages[i];
  return replaceStage(settled, i, { state: "not_held", startedAt: s.startedAt, heldMs: Math.max(0, now - (s.startedAt ?? now)) });
}

export function balanceHeldMs(state: BalanceState, index: number, now: number): number {
  const s = state.stages[index];
  if (!s) return 0;
  if (s.state === "running" && s.startedAt !== null) return Math.min(BALANCE_HOLD_MS, Math.max(0, now - s.startedAt));
  return s.heldMs;
}

/** The stage reached: how many stages in a row were held for ten seconds
 *  (0-4), what four_stage_balance stores. null until the test is over. */
export function balanceResult(state: BalanceState): number | null {
  if (state.stages.some((s) => s.state === "running")) return null;
  const held = state.stages.filter((s) => s.state === "held").length;
  const over = held === state.stages.length || state.stages.some((s) => s.state === "not_held");
  return over ? held : null;
}

// --- Six-minute walk ----------------------------------------------------------------------------------------------

export const SIX_MINUTE_WALK_MS = 6 * 60_000;
/** The standard 30 m course walked up and back: one lap is 60 m. */
export const SIX_MINUTE_WALK_LAP_METRES = 60;

/** What is said each minute, word for word. "Extra encouragement changes the
 *  result", so the app shows these and nothing else. */
export const SIX_MINUTE_WALK_PHRASES: readonly { atMs: number; minute: number; phrase: string }[] = [
  { atMs: 1 * 60_000, minute: 1, phrase: "You are doing well. You have 5 minutes to go." },
  { atMs: 2 * 60_000, minute: 2, phrase: "Keep up the good work. You have 4 minutes to go." },
  { atMs: 3 * 60_000, minute: 3, phrase: "You are doing well. You are halfway done." },
  { atMs: 4 * 60_000, minute: 4, phrase: "Keep up the good work. You have only 2 minutes left." },
  { atMs: 5 * 60_000, minute: 5, phrase: "You are doing well. You have only 1 minute to go." },
];

export const SIX_MINUTE_WALK_START_SCRIPT =
  "Walk as far as possible for six minutes, back and forth around the cones. You may slow down, stop and rest if you need to, then carry on.";

/** The phrase due at this elapsed time: the latest one whose minute has
 *  arrived, or null before the first minute. */
export function phraseAt(elapsedMs: number): { minute: number; phrase: string } | null {
  let due: { minute: number; phrase: string } | null = null;
  for (const p of SIX_MINUTE_WALK_PHRASES) {
    if (elapsedMs >= p.atMs) due = { minute: p.minute, phrase: p.phrase };
  }
  return due;
}

/** Milliseconds to the next phrase, or null once the last has been said. */
export function msToNextPhrase(elapsedMs: number): number | null {
  const next = SIX_MINUTE_WALK_PHRASES.find((p) => p.atMs > elapsedMs);
  return next ? next.atMs - elapsedMs : null;
}

export type CheckItem = { key: string; label: string };

/** The cardiopulmonary safety check, from the assessment handbook: do not
 *  test, and contact the doctor, if any of these is present. The test does
 *  not start until each is confirmed. */
export const SIX_MINUTE_WALK_SAFETY_CHECKS: readonly CheckItem[] = [
  { key: "no_chest_pain", label: "No chest pain at rest and no new chest pain" },
  { key: "no_recent_cardiac_event", label: "No heart attack or unstable angina in the last month (this rules the walk out)" },
  { key: "heart_rate_ok", label: "Resting heart rate is not over 120" },
  { key: "blood_pressure_ok", label: "Blood pressure is not over 180/100" },
  { key: "oxygen_ok", label: "Oxygen at rest is not below the level the doctor set" },
  { key: "no_new_symptoms", label: "No new swelling, fever or sudden weight gain" },
  { key: "rested", label: "Rested sitting for 10 minutes before the walk" },
  { key: "course_ready", label: "Flat 30 m course with cones, stopwatch, pulse oximeter and blood pressure monitor to hand" },
];

export const SIX_MINUTE_WALK_STOP_RULES =
  "Stop the walk at once for chest pain, breathlessness that will not settle, dizziness, leg cramps, staggering, heavy sweating, turning pale or grey, or oxygen dropping below the patient's set limit.";

export function safetyChecklistComplete(ticked: ReadonlySet<string> | readonly string[], checks: readonly CheckItem[] = SIX_MINUTE_WALK_SAFETY_CHECKS): boolean {
  const set = ticked instanceof Set ? ticked : new Set(ticked);
  return checks.every((c) => set.has(c.key));
}

export function unticked(ticked: ReadonlySet<string> | readonly string[], checks: readonly CheckItem[] = SIX_MINUTE_WALK_SAFETY_CHECKS): CheckItem[] {
  const set = ticked instanceof Set ? ticked : new Set(ticked);
  return checks.filter((c) => !set.has(c.key));
}

/** Distance = laps x lap length + the last part lap, in whole metres. */
export function sixMinuteWalkDistance(input: {
  laps: number;
  partLapMetres: number;
  lapMetres?: number;
}): CalcResult<number> {
  const lap = input.lapMetres ?? SIX_MINUTE_WALK_LAP_METRES;
  if (!finite(lap) || lap <= 0 || lap > 200) return { ok: false, error: "The lap length must be more than 0 and no more than 200 metres." };
  if (!finite(input.laps) || !Number.isInteger(input.laps) || input.laps < 0 || input.laps > 60) {
    return { ok: false, error: "Laps must be a whole number from 0 to 60." };
  }
  if (!finite(input.partLapMetres) || input.partLapMetres < 0) {
    return { ok: false, error: "The last part lap is a distance in metres, 0 or more." };
  }
  if (input.partLapMetres >= lap) {
    return { ok: false, error: `The last part lap is under ${lap} m. A whole lap goes in the lap count.` };
  }
  const value = Math.round(input.laps * lap + input.partLapMetres);
  return {
    ok: true,
    value,
    working: `${input.laps} lap${input.laps === 1 ? "" : "s"} x ${lap} m + ${Math.round(input.partLapMetres)} m = ${value} m`,
  };
}

export type WalkVitals = {
  heartRate?: number;
  systolic?: number;
  diastolic?: number;
  spo2?: number;
  /** 0-10 plain rating (not the licensed Borg scale). */
  breathlessness?: number;
  /** 0-10 plain rating. */
  legTiredness?: number;
};

/** Problems with a set of vitals, one sentence each; empty when usable.
 *  Every field is optional (a monitor may not be to hand) but one that is
 *  given must be a possible reading. */
export function vitalsProblems(v: WalkVitals): string[] {
  const out: string[] = [];
  const check = (value: number | undefined, label: string, min: number, max: number, whole = true) => {
    if (value === undefined) return;
    if (!finite(value) || value < min || value > max || (whole && !Number.isInteger(value))) {
      out.push(`${label} must be ${whole ? "a whole number " : ""}from ${min} to ${max}.`);
    }
  };
  check(v.heartRate, "Heart rate", 30, 250);
  check(v.systolic, "Top blood pressure number", 60, 260);
  check(v.diastolic, "Bottom blood pressure number", 30, 160);
  check(v.spo2, "Oxygen", 50, 100);
  check(v.breathlessness, "Breathlessness", 0, 10);
  check(v.legTiredness, "Leg tiredness", 0, 10);
  if (finite(v.systolic) && finite(v.diastolic) && v.systolic <= v.diastolic) {
    out.push("The top blood pressure number must be above the bottom one.");
  }
  return out;
}

/** Resting readings that mean the walk should not start (the handbook's
 *  limits). Advice, not a lock: the clinician decides. */
export function preTestConcerns(v: WalkVitals): string[] {
  const out: string[] = [];
  if (finite(v.heartRate) && v.heartRate > 120) out.push("Resting heart rate is over 120. Do not start the walk; contact the doctor.");
  if ((finite(v.systolic) && v.systolic > 180) || (finite(v.diastolic) && v.diastolic > 100)) {
    out.push("Blood pressure is over 180/100. Do not start the walk; contact the doctor.");
  }
  return out;
}

export type PredictedWalk =
  | { status: "ok"; predicted: number; percent: number | null; equation: string; working: string }
  /** The clinic has not chosen the equation yet: said plainly, no number. */
  | { status: "equation_not_chosen"; equation: string }
  | { status: "needs_details"; missing: string[] }
  | { status: "unusable"; error: string };

/**
 * The walked distance against the predicted one. Names the equation used and
 * says so honestly when the clinic has not chosen one, rather than falling
 * back to a different population's formula.
 */
export function sixMinuteWalkPrediction(input: {
  walkedMetres: number | null;
  patient: { sex?: Sex | null; ageYears?: number | null; heightCm?: number | null; weightKg?: number | null } | null;
  equationKey?: SixMinuteWalkEquationKey;
}): PredictedWalk {
  const key = input.equationKey ?? DEFAULT_SIX_MINUTE_WALK_EQUATION;
  const equation = SIX_MINUTE_WALK_EQUATIONS[key];
  if (!equation) return { status: "unusable", error: "Unknown six-minute walk equation." };
  if (!equation.predict) return { status: "equation_not_chosen", equation: equation.label };
  const p = input.patient;
  const missing: string[] = [];
  if (!p?.sex) missing.push("sex");
  if (!finite(p?.ageYears)) missing.push("age");
  if (!finite(p?.heightCm)) missing.push("height");
  if (!finite(p?.weightKg)) missing.push("weight");
  if (missing.length > 0) return { status: "needs_details", missing };
  const predicted = predictedSixMinuteWalk(
    { sex: p!.sex as Sex, ageYears: p!.ageYears as number, heightCm: p!.heightCm as number, weightKg: p!.weightKg as number },
    key
  );
  if (!predicted.ok) return { status: "unusable", error: predicted.error };
  return {
    status: "ok",
    predicted: predicted.value,
    percent: input.walkedMetres !== null && finite(input.walkedMetres) ? percentOfPredicted(input.walkedMetres, predicted.value) : null,
    equation: equation.label,
    working: predicted.working,
  };
}
