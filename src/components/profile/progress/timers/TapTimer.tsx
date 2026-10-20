"use client";

import { useMemo, useState } from "react";
import { readClock, useRunClock } from "@/components/profile/progress/timers/useRunClock";
import { formatReading } from "@/lib/progressChart";
import {
  IDLE_STOPWATCH,
  formatStopwatch,
  msToSeconds,
  secondsToSpeeds,
  startStopwatch,
  stopStopwatch,
  stopwatchElapsedMs,
  summariseTrials,
  type StopwatchState,
  type TrialKeep,
} from "@/lib/testTimers";

export type TapTimerResult = {
  /** The one the measure's keep rule stores. */
  value: number;
  /** Every counted trial, in the measure's own unit (seconds, or m/s when a
   *  distance was marked out). */
  trials: number[];
  /** The raw stopwatch seconds behind them. */
  seconds: number[];
  /** The page was in the background, or the device slept, during a trial. */
  interrupted: boolean;
};

type Trial = { seconds: number; practice: boolean };

const KEEP_WORD: Record<TrialKeep, string> = { best: "best", average: "average", median: "middle" };

/**
 * A stopwatch for timed trials: Timed Up and Go, the 10-metre and 4-metre
 * walks, the five sit-to-stands, standing time. One huge button starts and
 * stops it (it fills the width and is easy to hit one-handed with a thumb, a
 * phone held in the other hand or propped up); each stop is kept as the next
 * trial. A practice trial, where the rule has one, is shown and never counted.
 *
 * With `distanceMetres` each time is turned into m/s (`secondsToSpeeds`) and
 * the trials, average, best and median are speeds; without it they are
 * seconds. The result is the one the measure's keep rule names, rounded the
 * way `validateMeasurement` re-derives it - the screen and the route agree.
 *
 * There is no pause: an interrupted Timed Up and Go is not one. A trial can be
 * thrown away while it runs or after. The clock is a timestamp (see
 * `testTimers.ts`), so a busy or background tab cannot make a trial short, and
 * a timing the page cannot vouch for is flagged. No animation, so nothing to
 * reduce.
 */
export default function TapTimer({
  label,
  count,
  maxTrials = count,
  keep,
  better,
  decimals,
  practice = 0,
  distanceMetres,
  requireAll = false,
  onUse,
  disabled = false,
}: {
  label: string;
  /** How many counted trials the measure asks for. */
  count: number;
  /** How many it will take (a median rule may take a third). */
  maxTrials?: number;
  keep: TrialKeep;
  better: string;
  /** The measure's precision. */
  decimals: number;
  /** Practice trials before the counted ones. */
  practice?: number;
  /** When set, trials are speeds over this marked distance. */
  distanceMetres?: number;
  /** The record needs every trial (Parkinson's). */
  requireAll?: boolean;
  onUse: (result: TapTimerResult) => void;
  disabled?: boolean;
}) {
  const [watch, setWatch] = useState<StopwatchState>(IDLE_STOPWATCH);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [interrupted, setInterrupted] = useState(false);
  const running = watch.status === "running";
  const clock = useRunClock(running);

  const counted = trials.filter((t) => !t.practice);
  const nextIsPractice = trials.filter((t) => t.practice).length < practice;
  const full = counted.length >= maxTrials;
  const elapsed = stopwatchElapsedMs(watch, clock.now);

  const converted = useMemo(() => {
    const seconds = trials.filter((t) => !t.practice).map((t) => t.seconds);
    if (distanceMetres === undefined) return { ok: true as const, values: seconds };
    const speeds = secondsToSpeeds(seconds, distanceMetres);
    return speeds.ok ? { ok: true as const, values: speeds.value } : { ok: false as const, error: speeds.error };
  }, [trials, distanceMetres]);

  const summary = converted.ok ? summariseTrials(converted.values, { keep }, better, decimals) : null;
  const unit = distanceMetres === undefined ? "seconds" : "m/s";
  const show = (v: number) => formatReading(v, decimals, unit);
  const enough = requireAll ? counted.length >= count : counted.length >= 1;

  function press() {
    if (disabled) return;
    if (!running) {
      if (full) return;
      setInterrupted(false);
      setWatch(startStopwatch(IDLE_STOPWATCH, readClock()));
      return;
    }
    const stopped = stopStopwatch(watch, readClock());
    if (stopped.status === "stopped") {
      const seconds = msToSeconds(stopped.elapsedMs, 2);
      // A trial that reads as zero was a double tap, not a walk.
      if (seconds > 0) setTrials((t) => [...t, { seconds, practice: nextIsPractice }]);
      if (clock.interrupted) setInterrupted(true);
    }
    setWatch(IDLE_STOPWATCH);
  }

  const buttonText = running ? "Stop" : full ? "All trials done" : nextIsPractice ? "Start practice" : `Start trial ${counted.length + 1}`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">{label}</p>
      <p className="mt-0.5 text-xs text-slate-600">
        {count === 1 ? "One timed trial." : `${count} timed trials`}
        {practice > 0 ? `, after ${practice} practice (not counted).` : "."}{" "}
        {count > 1 && <>The {KEEP_WORD[keep]} is kept.</>}
      </p>

      <p
        role="timer"
        aria-label="Stopwatch"
        className="mt-4 text-center font-display text-5xl font-bold tabular-nums text-slate-900 sm:text-6xl"
      >
        {formatStopwatch(elapsed)}
      </p>

      <button
        type="button"
        onClick={press}
        disabled={disabled || (!running && full)}
        className={`mt-4 min-h-[5rem] w-full rounded-2xl text-xl font-bold text-white transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/40 disabled:opacity-50 ${
          running ? "bg-red-700 hover:bg-red-800" : "bg-teal-700 hover:bg-teal-800"
        }`}
      >
        {buttonText}
      </button>

      {running && (
        <button
          type="button"
          onClick={() => setWatch(IDLE_STOPWATCH)}
          className="mt-2 min-h-[44px] w-full rounded-xl text-sm font-semibold text-slate-700 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        >
          Throw this attempt away
        </button>
      )}

      {(running ? clock.interrupted : interrupted) && (
        <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          The screen was in the background, or the device slept, while this was timed. The clock kept running, but check the
          time against your own stopwatch before you use it.
        </p>
      )}

      {trials.length > 0 && (
        <ol className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {trials.map((t, i) => {
            const countedIndex = trials.slice(0, i + 1).filter((x) => !x.practice).length;
            const speed = distanceMetres !== undefined ? secondsToSpeeds([t.seconds], distanceMetres) : null;
            return (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                <span className="min-w-0 text-slate-700">
                  {t.practice ? "Practice" : `Trial ${countedIndex}`}
                  {t.practice && <span className="text-xs text-slate-600"> (not counted)</span>}
                </span>
                <span className="font-semibold tabular-nums text-slate-900">
                  {t.seconds.toFixed(2)} s
                  {speed?.ok && <span className="font-normal text-slate-600"> · {show(speed.value[0])}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => setTrials((all) => all.filter((_, j) => j !== i))}
                  aria-label={`Remove ${t.practice ? "the practice trial" : `trial ${countedIndex}`}`}
                  className="min-h-[44px] min-w-[44px] rounded-lg text-xs font-semibold text-slate-600 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {!converted.ok && (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {converted.error}
        </p>
      )}

      {summary && summary.count > 0 && (
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          {(
            [
              ["Average", summary.average, "average"],
              ["Best", summary.best, "best"],
              ["Middle", summary.median, "median"],
            ] as const
          ).map(([name, value, rule]) => (
            <div
              key={name}
              className={`rounded-xl px-2 py-2 ${rule === keep ? "bg-teal-50 ring-2 ring-teal-700" : "bg-slate-50"}`}
            >
              <dt className="text-xs font-semibold text-slate-600">
                {name}
                {rule === keep && <span className="sr-only"> (the one that is kept)</span>}
              </dt>
              <dd className="font-display text-lg font-bold tabular-nums text-slate-900">{value === null ? "-" : show(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      <button
        type="button"
        disabled={disabled || !enough || !summary || summary.kept === null}
        onClick={() => {
          if (!summary || summary.kept === null || !converted.ok) return;
          onUse({ value: summary.kept, trials: converted.values, seconds: counted.map((t) => t.seconds), interrupted });
        }}
        className="mt-4 min-h-[48px] w-full rounded-xl border border-teal-700 bg-white text-sm font-semibold text-teal-800 transition hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-600 disabled:opacity-70"
      >
        {enough ? `Use ${summary?.kept === null || !summary ? "this result" : show(summary.kept)}` : `Time ${requireAll ? `all ${count} trials` : "at least one trial"} to use the result`}
      </button>
    </div>
  );
}
