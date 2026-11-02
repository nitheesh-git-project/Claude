"use client";

import { useEffect, useRef, useState } from "react";
import { readClock, useRunClock } from "@/components/profile/progress/timers/useRunClock";
import { createCountdown, countdownRemainingMs, formatCountdown, settleCountdown, startCountdown, type CountdownState } from "@/lib/testTimers";

/** The resting check's rest: five minutes sitting before the readings. */
export const REST_MINUTES = 5;

/**
 * The five-minute rest before the heart and lung resting check (E14): a
 * countdown on the same timestamp clock as every timer here, that puts Rest
 * on the patient's screen when it starts and Get ready when it ends, and
 * then ticks "rested sitting for 5 minutes" (untick it if they moved). It can
 * be started again; nothing is recorded by it.
 */
export default function RestTimer({ onStart, onDone }: { onStart: () => void; onDone: () => void }) {
  const [state, setState] = useState<CountdownState>(() => createCountdown(REST_MINUTES * 60_000));
  const running = state.status === "running";
  const clock = useRunClock(running);
  const settled = settleCountdown(state, clock.now);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  useEffect(() => {
    if (settled !== state) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- five minutes passing is a fact about time, applied once
      setState(settled);
      if (settled.status === "finished") doneRef.current();
    }
  }, [settled, state]);
  const remaining = countdownRemainingMs(settled, clock.now);

  return (
    <div data-testid="rest-timer" className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 px-3 py-2">
      <p className="font-display text-2xl font-bold tabular-nums text-slate-900" role="timer" aria-label="Rest time left">
        {formatCountdown(remaining)}
      </p>
      {settled.status === "finished" ? (
        <p role="status" className="text-sm font-semibold text-teal-900">
          Rested 5 minutes: ticked for you. Untick it if they got up.
        </p>
      ) : (
        <button
          type="button"
          disabled={running}
          onClick={() => {
            setState(startCountdown(createCountdown(REST_MINUTES * 60_000), readClock()));
            onStart();
          }}
          className="min-h-[44px] rounded-xl border border-teal-700 bg-white px-4 text-sm font-bold text-teal-900 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-60"
        >
          {running ? "Resting… their screen says Rest" : "Start the 5-minute rest"}
        </button>
      )}
    </div>
  );
}
