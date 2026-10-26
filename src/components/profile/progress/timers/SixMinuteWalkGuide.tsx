"use client";

import { useEffect, useId, useState } from "react";
import { readClock, useRunClock } from "@/components/profile/progress/timers/useRunClock";
import type { SixMinuteWalkEquationKey } from "@/lib/clinicalCalculators";
import { duringExerciseOxygenCheck, preExerciseCheck, resolveOxygenStopLimit, type OxygenStopLimit } from "@/lib/cardioSafety";
import { TALK_TEST_GRADES } from "@/lib/outcomeMeasures";
import {
  SIX_MINUTE_WALK_LAP_METRES,
  SIX_MINUTE_WALK_MS,
  SIX_MINUTE_WALK_SAFETY_CHECKS,
  SIX_MINUTE_WALK_START_SCRIPT,
  SIX_MINUTE_WALK_STOP_RULES,
  abortCountdown,
  adjustCount,
  countdownElapsedMs,
  countdownRemainingMs,
  createCountdown,
  formatCountdown,
  msToNextPhrase,
  phraseAt,
  preTestConcerns,
  safetyChecklistComplete,
  settleCountdown,
  sixMinuteWalkDistance,
  sixMinuteWalkPrediction,
  startCountdown,
  vitalsProblems,
  type CountdownState,
  type WalkVitals,
} from "@/lib/testTimers";

export type SixMinuteWalkResult = {
  /** Metres: laps x 60 + the last part lap. */
  distance: number;
  laps: number;
  partLapMetres: number;
  /** The walk was stopped before six minutes (symptoms, or the patient
   *  could not go on). The distance is what was covered. */
  stoppedEarly: boolean;
  before: WalkVitals;
  after: WalkVitals;
  /** Whole per cent of the predicted distance; null when it could not be
   *  worked out (see `prediction`). */
  percentPredicted: number | null;
  /** The equation named under the figure, or null when none applies. */
  equation: string | null;
  /** How the walk felt to talk through (0 too easy, 1 just right, 2 too
   *  hard), or null when it was not asked. */
  talkTest: 0 | 1 | 2 | null;
  interrupted: boolean;
};

type PatientFacts = {
  sex?: "female" | "male" | null;
  ageYears?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
};

type VitalsText = Record<keyof WalkVitals, string>;
const EMPTY_VITALS: VitalsText = { heartRate: "", systolic: "", diastolic: "", spo2: "", breathlessness: "", legTiredness: "" };

function toVitals(text: VitalsText): WalkVitals {
  const out: WalkVitals = {};
  for (const key of Object.keys(text) as (keyof WalkVitals)[]) {
    const raw = text[key].trim();
    if (raw !== "") out[key] = Number(raw);
  }
  return out;
}

function VitalsFields({
  legend,
  value,
  onChange,
  withLegs,
  spo2Label = "Oxygen (%)",
}: {
  legend: string;
  value: VitalsText;
  onChange: (next: VitalsText) => void;
  withLegs: boolean;
  spo2Label?: string;
}) {
  const id = useId();
  const field = (key: keyof WalkVitals, label: string, hint: string) => (
    <div key={key}>
      <label htmlFor={`${id}-${key}`} className="block text-xs font-semibold text-slate-800">
        {label}
      </label>
      <input
        id={`${id}-${key}`}
        type="number"
        inputMode="numeric"
        step={1}
        value={value[key]}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        placeholder={hint}
        className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
      />
    </div>
  );
  return (
    <fieldset className="rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-sm font-semibold text-slate-900">{legend}</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {field("heartRate", "Heart rate (beats a minute)", "e.g. 78")}
        {field("systolic", "Blood pressure, top", "e.g. 128")}
        {field("diastolic", "Blood pressure, bottom", "e.g. 80")}
        {field("spo2", spo2Label, "e.g. 96")}
        {field("breathlessness", "Breathlessness, 0 to 10", "0 = none")}
        {withLegs && field("legTiredness", "Leg tiredness, 0 to 10", "0 = none")}
      </div>
    </fieldset>
  );
}

/**
 * A guided six-minute walk, in the order the American Thoracic Society method
 * asks for:
 *
 *   1. **Safety check.** Every box must be ticked - the walk does not start
 *      until they are, and a resting heart rate over 120 or blood pressure over
 *      180/100 is called out beside the vitals (advice, not a lock; the
 *      clinician decides). A heart attack or unstable angina in the last month
 *      rules the walk out and is the second box.
 *   2. **The walk.** A 6:00 countdown on the shared timestamp clock, the
 *      standard phrase for each minute word for word and nothing else ("extra
 *      encouragement changes the result"), a lap counter with a very large
 *      tap target, and the stop rules in view. The clock keeps running if the
 *      patient rests, as the protocol says; there is no pause. "Stop early"
 *      keeps the distance covered and says it was stopped early.
 *   3. **After the walk.** The last part lap in metres, after-walk vitals,
 *      the distance (laps x 60 m + part lap) and the percentage of predicted -
 *      against the equation the clinic chose, named under the figure, and
 *      saying plainly when the clinic has not chosen one yet instead of using
 *      a different population's formula.
 *
 * The prediction needs the patient's sex, age, height and weight (`patient`);
 * missing ones are listed, never guessed.
 */
export default function SixMinuteWalkGuide({
  patient,
  equationKey,
  equationUnreadable = false,
  oxygenLimit,
  onUse,
  disabled = false,
}: {
  patient: PatientFacts | null;
  /** The patient's own oxygen stop limit (cardioSafety.ts). Absent means the
   *  heart default; the screen always passes the patient's. */
  oxygenLimit?: OxygenStopLimit;
  /** The clinic's choice from Settings -> Clinical Questions
   *  (loadSixMinuteWalkEquation). Absent is "formula not chosen yet". */
  equationKey?: SixMinuteWalkEquationKey;
  /** That setting could not be read: says "we couldn't check". */
  equationUnreadable?: boolean;
  onUse: (result: SixMinuteWalkResult) => void;
  disabled?: boolean;
}) {
  const [step, setStep] = useState<"check" | "walk" | "after">("check");
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [before, setBefore] = useState<VitalsText>(EMPTY_VITALS);
  const [after, setAfter] = useState<VitalsText>(EMPTY_VITALS);
  const [countdown, setCountdown] = useState<CountdownState>(() => createCountdown(SIX_MINUTE_WALK_MS));
  const [laps, setLaps] = useState(0);
  const [partLap, setPartLap] = useState("");
  const [stoppedEarly, setStoppedEarly] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [talk, setTalk] = useState<0 | 1 | 2 | null>(null);
  const partId = useId();

  const running = countdown.status === "running";
  const clock = useRunClock(running);
  const settled = settleCountdown(countdown, clock.now);
  useEffect(() => {
    if (settled !== countdown) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- six minutes passing is a fact about time, applied once
      setCountdown(settled);
      if (clock.interrupted) setInterrupted(true);
      try {
        navigator.vibrate?.([300, 120, 300]);
      } catch {
        // No vibration motor: the screen says Stop.
      }
    }
  }, [settled, countdown, clock.interrupted]);

  const elapsed = countdownElapsedMs(settled, clock.now);
  const remaining = countdownRemainingMs(settled, clock.now);
  const phrase = phraseAt(elapsed);
  const toNext = msToNextPhrase(elapsed);
  const finished = settled.status === "finished";

  const beforeVitals = toVitals(before);
  const afterVitals = toVitals(after);
  const beforeProblems = vitalsProblems(beforeVitals);
  const afterProblems = vitalsProblems(afterVitals);
  const concerns = preTestConcerns(beforeVitals);
  const limit = oxygenLimit ?? resolveOxygenStopLimit({});
  // The pre-exercise refusal is enforced here, on the screen: a resting
  // reading over the red flags means the walk cannot be started (the route
  // has no say in when a walk starts, so this is the only door).
  const preCheck = preExerciseCheck(
    { restingHeartRate: beforeVitals.heartRate, systolic: beforeVitals.systolic, diastolic: beforeVitals.diastolic, spo2Rest: beforeVitals.spo2 },
    limit
  );
  const refused = preCheck.status === "stop";
  const afterOxygen = duringExerciseOxygenCheck({ spo2Lowest: afterVitals.spo2, spo2Rest: beforeVitals.spo2, limit });
  const checklistDone = safetyChecklistComplete(ticked);
  const canStart = checklistDone && beforeProblems.length === 0 && !refused && !disabled;

  const partMetres = partLap.trim() === "" ? 0 : Number(partLap);
  const distance = sixMinuteWalkDistance({ laps, partLapMetres: partMetres });
  const prediction = sixMinuteWalkPrediction({
    walkedMetres: distance.ok ? distance.value : null,
    patient,
    equationKey,
    equationUnreadable,
  });

  function begin() {
    if (!canStart) return;
    setCountdown(startCountdown(createCountdown(SIX_MINUTE_WALK_MS), readClock()));
    setLaps(0);
    setPartLap("");
    setStoppedEarly(false);
    setInterrupted(false);
    setStep("walk");
  }

  function stopEarly() {
    setCountdown(abortCountdown(countdown));
    setStoppedEarly(true);
    if (clock.interrupted) setInterrupted(true);
    setStep("after");
  }

  function reset() {
    setStep("check");
    setCountdown(createCountdown(SIX_MINUTE_WALK_MS));
    setLaps(0);
    setPartLap("");
    setStoppedEarly(false);
    setInterrupted(false);
    setAfter(EMPTY_VITALS);
    setTalk(null);
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">Six-minute walk test</p>
      <p className="mt-0.5 text-xs text-slate-600">
        A flat 30 m course with a cone at each end: one lap is up and back, {SIX_MINUTE_WALK_LAP_METRES} m. Do not walk with
        the patient.
      </p>

      {step === "check" && (
        <div className="mt-4 space-y-4">
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">Before the walk: tick each one</legend>
            <p className="mt-0.5 text-xs text-slate-600">
              If any of these is not true, do not test, and contact the doctor.
            </p>
            <ul className="mt-2 space-y-1.5">
              {SIX_MINUTE_WALK_SAFETY_CHECKS.map((check) => (
                <li key={check.key}>
                  <label className="flex min-h-[44px] items-start gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      checked={ticked.has(check.key)}
                      onChange={(e) =>
                        setTicked((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(check.key);
                          else next.delete(check.key);
                          return next;
                        })
                      }
                      className="mt-0.5 h-5 w-5 shrink-0 accent-teal-700"
                    />
                    <span>{check.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <VitalsFields legend="Resting readings, seated" value={before} onChange={setBefore} withLegs={false} />
          {beforeProblems.map((p) => (
            <p key={p} role="alert" className="text-sm text-red-800">
              {p}
            </p>
          ))}
          {refused && preCheck.refusal && (
            <div role="alert" data-testid="walk-refusal" className="rounded-xl border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-900">
              <p className="font-bold">{preCheck.refusal.clinician}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {preCheck.flags.map((f) => (
                  <li key={f.code}>{f.clinicianText}</li>
                ))}
              </ul>
              <p className="mt-1 text-xs">The walk cannot be started while this stands. Re-check the reading if it looks wrong.</p>
            </div>
          )}
          {!refused && preCheck.status === "incomplete" && (
            <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
              Not checked: {preCheck.notChecked.join(", ")}. A reading not taken is not a clear reading.
            </p>
          )}
          {!refused &&
            concerns.map((c) => (
              <p key={c} role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                {c}
              </p>
            ))}

          <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Say to the patient</p>
            <p className="mt-1">{SIX_MINUTE_WALK_START_SCRIPT}</p>
          </div>

          <button
            type="button"
            disabled={!canStart}
            onClick={begin}
            className="min-h-[5rem] w-full rounded-2xl bg-teal-700 text-xl font-bold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start the 6:00 walk
          </button>
          {!canStart && (
            <p className="text-xs text-slate-600">
              {!checklistDone
                ? "Tick every safety check to start the walk."
                : beforeProblems.length > 0
                  ? "Fix the readings above to start."
                  : refused
                    ? "Not today: see the reading above."
                    : ""}
            </p>
          )}
        </div>
      )}

      {step === "walk" && (
        <div className="mt-4 space-y-3">
          <p role="timer" aria-label="Time left" className="text-center font-display text-6xl font-bold tabular-nums text-slate-900">
            {formatCountdown(remaining)}
          </p>

          <div
            aria-live="polite"
            className={`rounded-xl border px-3 py-3 text-center ${finished ? "border-red-300 bg-red-50" : "border-teal-200 bg-teal-50"}`}
          >
            {finished ? (
              <p className="text-xl font-bold text-red-800">Stop. Mark where they are.</p>
            ) : phrase ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Say now (minute {phrase.minute})</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{phrase.phrase}</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-slate-800">
                Say only the standard phrase each minute. The first is due at 1:00.
              </p>
            )}
            {!finished && toNext !== null && (
              <p className="mt-1 text-xs text-slate-600">Next phrase in {formatCountdown(toNext)}</p>
            )}
          </div>

          {!finished && (
            <>
              <button
                type="button"
                onClick={() => setLaps((l) => adjustCount(l, 1, 60))}
                className="flex min-h-[8rem] w-full flex-col items-center justify-center rounded-2xl bg-teal-700 text-white transition active:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/40"
              >
                <span className="font-display text-6xl font-extrabold tabular-nums">{laps}</span>
                <span className="text-base font-semibold">Tap at the end of each lap ({SIX_MINUTE_WALK_LAP_METRES} m)</span>
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLaps((l) => adjustCount(l, -1, 60))}
                  className="min-h-[48px] flex-1 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                >
                  Undo the last lap
                </button>
                <button
                  type="button"
                  onClick={stopEarly}
                  className="min-h-[48px] flex-1 rounded-xl border border-red-300 text-sm font-semibold text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                >
                  Stop early
                </button>
              </div>
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">{SIX_MINUTE_WALK_STOP_RULES}</p>
              <p className="text-xs text-slate-600">
                If they stop to rest, the clock keeps running. Say nothing but the standard phrases.
              </p>
            </>
          )}
          {finished && (
            <button
              type="button"
              onClick={() => setStep("after")}
              className="min-h-[56px] w-full rounded-2xl bg-teal-700 text-lg font-bold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/40"
            >
              Record the distance
            </button>
          )}
        </div>
      )}

      {step === "after" && (
        <div className="mt-4 space-y-4">
          <p role="status" className="text-sm font-semibold text-slate-900">
            {stoppedEarly
              ? "The walk was stopped early. The distance is what was covered."
              : "Time. Measure the last part lap, then the readings."}
          </p>

          <div>
            <p className="text-sm text-slate-800">
              <span className="font-semibold">{laps}</span> {laps === 1 ? "lap" : "laps"} counted
              <button
                type="button"
                onClick={() => setLaps((l) => adjustCount(l, -1, 60))}
                className="ml-3 min-h-[44px] rounded-lg px-2 text-xs font-semibold text-slate-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                One fewer
              </button>
              <button
                type="button"
                onClick={() => setLaps((l) => adjustCount(l, 1, 60))}
                className="min-h-[44px] rounded-lg px-2 text-xs font-semibold text-slate-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                One more
              </button>
            </p>
            <label htmlFor={partId} className="mt-2 block text-sm font-semibold text-slate-800">
              Last part lap, in metres
            </label>
            <input
              id={partId}
              type="number"
              inputMode="decimal"
              min={0}
              max={SIX_MINUTE_WALK_LAP_METRES - 1}
              step={1}
              value={partLap}
              onChange={(e) => setPartLap(e.target.value)}
              placeholder="0 if they ended at a cone"
              className="mt-1 min-h-[44px] w-full max-w-xs rounded-xl border border-slate-300 px-3 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            />
          </div>

          <VitalsFields legend="Readings straight after the walk" value={after} onChange={setAfter} withLegs spo2Label="Lowest oxygen on the walk (%)" />
          {afterProblems.map((p) => (
            <p key={p} role="alert" className="text-sm text-red-800">
              {p}
            </p>
          ))}
          {afterOxygen.stop && afterOxygen.reason && (
            <p role="alert" data-testid="walk-oxygen-stop" className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900">
              {afterOxygen.reason.clinician}
            </p>
          )}
          <fieldset>
            <legend className="text-sm font-semibold text-slate-900">How did talking feel on the walk?</legend>
            <div className="mt-1 grid gap-2 sm:grid-cols-3">
              {TALK_TEST_GRADES.map((g) => (
                <label
                  key={g.value}
                  className={`flex min-h-[44px] cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-center text-sm font-semibold focus-within:ring-2 focus-within:ring-teal-600 ${
                    talk === g.value ? "border-teal-700 bg-teal-50 text-teal-900" : "border-slate-300 bg-white text-slate-800"
                  }`}
                >
                  <input type="radio" name="walk-talk" className="sr-only" checked={talk === g.value} onChange={() => setTalk(g.value as 0 | 1 | 2)} />
                  {g.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="rounded-xl bg-slate-50 p-3">
            {distance.ok ? (
              <>
                <p className="font-display text-3xl font-bold tabular-nums text-slate-900">{distance.value} m</p>
                <p className="text-xs text-slate-600">{distance.working}</p>
              </>
            ) : (
              <p role="alert" className="text-sm text-red-800">
                {distance.error}
              </p>
            )}
            <div className="mt-2 text-sm text-slate-800">
              {prediction.status === "ok" && (
                <>
                  <p>
                    Predicted {prediction.predicted} m
                    {prediction.percent !== null && (
                      <>
                        {" "}
                        - walked <span className="font-semibold">{prediction.percent}%</span> of predicted
                      </>
                    )}
                    .
                  </p>
                  <p className="text-xs text-slate-600">Equation: {prediction.equation}. {prediction.working}</p>
                </>
              )}
              {prediction.status === "equation_not_chosen" && (
                <p className="text-sm">
                  <span className="font-semibold">Formula not chosen yet.</span> The clinic has not picked a
                  predicted-distance equation on Settings, so no percentage of predicted is shown. The distance walked is
                  still recorded.
                </p>
              )}
              {prediction.status === "equation_unreadable" && (
                <p className="text-sm">
                  We couldn{"'"}t check which predicted-distance formula the clinic chose just now, so no percentage of
                  predicted is shown. The distance walked is still recorded.
                </p>
              )}
              {prediction.status === "needs_details" && (
                <p className="text-sm">
                  A percentage of predicted needs the patient{"'"}s {prediction.missing.join(", ")} on their profile. The
                  distance walked is still recorded.
                </p>
              )}
              {prediction.status === "unusable" && <p className="text-sm">No prediction: {prediction.error}</p>}
            </div>
          </div>

          {interrupted && (
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              The screen was in the background, or the device slept, during the walk. The clock kept running, but check the
              time against your own stopwatch.
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              className="min-h-[48px] flex-1 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              Start over
            </button>
            <button
              type="button"
              disabled={disabled || !distance.ok || afterProblems.length > 0}
              onClick={() => {
                if (!distance.ok) return;
                onUse({
                  distance: distance.value,
                  laps,
                  partLapMetres: Math.round(partMetres),
                  stoppedEarly,
                  before: beforeVitals,
                  after: afterVitals,
                  percentPredicted: prediction.status === "ok" ? prediction.percent : null,
                  equation: prediction.status === "ok" ? prediction.equation : null,
                  talkTest: talk,
                  interrupted,
                });
              }}
              className="min-h-[48px] flex-1 rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {distance.ok ? `Use ${distance.value} m` : "Fix the distance to use it"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
