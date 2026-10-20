"use client";

import { useEffect, useState } from "react";
import { readClock, useRunClock } from "@/components/profile/progress/timers/useRunClock";
import {
  CHAIR_STAND_MAX,
  CHAIR_STAND_SECONDS,
  abortCountdown,
  adjustCount,
  countdownRemainingMs,
  createCountdown,
  formatCountdown,
  settleCountdown,
  startCountdown,
  type CountdownState,
} from "@/lib/testTimers";

export type CountdownCounterResult = {
  /** Full stands; 0 when the arms were used. */
  stands: number;
  armsUsed: boolean;
  /** What was counted before the arms rule zeroed it, for the session note. */
  standsWithArms: number | null;
  interrupted: boolean;
};

/**
 * The 30-second chair stand: a 30:00 countdown and a very large tap target
 * for counting full stands, so it works with one thumb while the other hand
 * guards the patient. Chair without arms, seat about 43 cm, against a wall,
 * arms crossed on the chest; "go", count each full stand; more than halfway
 * up at 30 seconds counts.
 *
 * After the time is up the count can still be corrected with minus and plus
 * (a tap that landed late is the usual error), and "arms used" turns the score
 * to 0 as the protocol says, keeping what was counted to write in the session
 * note. Same timestamp clock as every timer here (no setInterval drift, a
 * background tab cannot shorten it); no animation.
 */
export default function CountdownCounter({
  seconds = CHAIR_STAND_SECONDS,
  max = CHAIR_STAND_MAX,
  title,
  description,
  onUse,
  disabled = false,
}: {
  seconds?: number;
  max?: number;
  /** Defaults to "30-second chair stand" for the default length. */
  title?: string;
  description?: string;
  onUse: (result: CountdownCounterResult) => void;
  disabled?: boolean;
}) {
  const [countdown, setCountdown] = useState<CountdownState>(() => createCountdown(seconds * 1000));
  const [count, setCount] = useState(0);
  const [armsUsed, setArmsUsed] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const running = countdown.status === "running";
  const clock = useRunClock(running);

  // Time up: settle the state once the clock says so, and carry the
  // "background" flag across, since the clock hook resets with the run.
  const settled = settleCountdown(countdown, clock.now);
  useEffect(() => {
    if (settled !== countdown) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the countdown reaching zero is a fact about time, applied once
      setCountdown(settled);
      if (clock.interrupted) setInterrupted(true);
    }
  }, [settled, countdown, clock.interrupted]);

  const remaining = countdownRemainingMs(settled, clock.now);

  function start() {
    if (disabled) return;
    setCount(0);
    setArmsUsed(false);
    setInterrupted(false);
    setCountdown(startCountdown(createCountdown(seconds * 1000), readClock()));
  }

  function tap() {
    if (settled.status === "running" && countdownRemainingMs(settled, readClock()) > 0) setCount((c) => adjustCount(c, 1, max));
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">{title ?? `${seconds}-second chair stand`}</p>
      <p className="mt-0.5 text-xs text-slate-600">
        {description ??
          "Chair without arms, seat about 43 cm, against a wall. Feet flat, arms crossed on the chest. Say \u201CGo\u201D and count each full stand. If they are more than halfway up when time ends, count it."}
      </p>

      <p role="timer" aria-label="Time left" className="mt-4 text-center font-display text-6xl font-bold tabular-nums text-slate-900">
        {formatCountdown(remaining)}
      </p>

      {settled.status === "idle" || settled.status === "aborted" ? (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          className="mt-4 min-h-[5rem] w-full rounded-2xl bg-teal-700 text-xl font-bold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/40 disabled:opacity-50"
        >
          {settled.status === "aborted" ? "Start again" : `Start the ${seconds} seconds`}
        </button>
      ) : running ? (
        <>
          <button
            type="button"
            onClick={tap}
            className="mt-4 flex min-h-[9rem] w-full flex-col items-center justify-center rounded-2xl bg-teal-700 text-white transition active:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/40"
          >
            <span className="font-display text-6xl font-extrabold tabular-nums">{count}</span>
            <span className="text-base font-semibold">Tap for each full stand</span>
          </button>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setCount((c) => adjustCount(c, -1, max))}
              className="min-h-[48px] flex-1 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              Undo the last tap
            </button>
            <button
              type="button"
              onClick={() => setCountdown(abortCountdown(countdown))}
              className="min-h-[48px] flex-1 rounded-xl border border-red-300 text-sm font-semibold text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
            >
              Stop and discard
            </button>
          </div>
        </>
      ) : (
        <div className="mt-4 space-y-3">
          <p role="status" className="text-center text-sm font-semibold text-slate-800">
            Time. {armsUsed ? "Arms were used, so the score is 0." : `${count} full ${count === 1 ? "stand" : "stands"} counted.`}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              aria-label="One fewer stand"
              onClick={() => setCount((c) => adjustCount(c, -1, max))}
              className="min-h-[56px] min-w-[56px] rounded-xl border border-slate-300 text-2xl font-bold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              {"−"}
            </button>
            <span className="min-w-[4ch] text-center font-display text-4xl font-extrabold tabular-nums text-slate-900">
              {armsUsed ? 0 : count}
            </span>
            <button
              type="button"
              aria-label="One more stand"
              onClick={() => setCount((c) => adjustCount(c, 1, max))}
              className="min-h-[56px] min-w-[56px] rounded-xl border border-slate-300 text-2xl font-bold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              +
            </button>
          </div>
          <label className="flex min-h-[44px] items-start gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={armsUsed}
              onChange={(e) => setArmsUsed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-teal-700"
            />
            <span>
              They had to use their arms. The score is 0; the stands counted ({count}) go in the session note.
            </span>
          </label>
          {interrupted && (
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              The screen was in the background, or the device slept, during this test. The clock kept running, but check the
              count against what you saw.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={start}
              className="min-h-[48px] flex-1 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              Do it again
            </button>
            <button
              type="button"
              onClick={() =>
                onUse({ stands: armsUsed ? 0 : count, armsUsed, standsWithArms: armsUsed ? count : null, interrupted })
              }
              disabled={disabled}
              className="min-h-[48px] flex-1 rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-60"
            >
              Use {armsUsed ? 0 : count}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
