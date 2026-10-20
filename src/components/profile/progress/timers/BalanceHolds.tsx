"use client";

import { useEffect, useState } from "react";
import { readClock, useRunClock } from "@/components/profile/progress/timers/useRunClock";
import {
  BALANCE_HOLD_MS,
  BALANCE_STAGES,
  balanceHeldMs,
  balanceResult,
  createBalance,
  currentBalanceStage,
  endBalanceStage,
  formatCountdown,
  settleBalance,
  startBalanceStage,
  type BalanceState,
} from "@/lib/testTimers";

export type BalanceHoldsResult = {
  /** Stages held for ten seconds in a row, 0-4. */
  stage: number;
  interrupted: boolean;
};

/**
 * The four-stage balance test: feet together, semi-tandem, tandem, one leg,
 * each held for ten seconds without holding on, moving to the next only if
 * the last was held. Not holding the third (heel to toe) for ten seconds
 * means higher fall risk, which the record works out from the stage reached.
 *
 * One stage is live at a time. Its hold starts on a tap and finishes by
 * itself at ten seconds (a stage that ran its ten seconds is held even if the
 * tap to stop came late); "Lost balance" ends the test at that stage. The
 * clock is a timestamp (testTimers.ts), the page flags a timing it cannot
 * vouch for, and there is no pause - a hold that was interrupted is not held.
 * Large buttons; a safety line first, because this is a standing test.
 */
export default function BalanceHolds({
  onUse,
  helperRequired = false,
  disabled = false,
}: {
  onUse: (result: BalanceHoldsResult) => void;
  /** Over video: another adult must be standing beside the patient. */
  helperRequired?: boolean;
  disabled?: boolean;
}) {
  const [state, setState] = useState<BalanceState>(createBalance);
  const [interrupted, setInterrupted] = useState(false);
  const running = state.stages.some((s) => s.state === "running");
  const clock = useRunClock(running);

  const settled = settleBalance(state, clock.now);
  useEffect(() => {
    if (settled !== state) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ten seconds passing is a fact about time, applied once
      setState(settled);
      if (clock.interrupted) setInterrupted(true);
    }
  }, [settled, state, clock.interrupted]);

  const current = currentBalanceStage(settled);
  const result = balanceResult(settled);
  const liveInterrupted = interrupted || (running && clock.interrupted);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">4-stage balance test</p>
      <p className="mt-0.5 text-xs text-slate-600">
        Show each position, then ask them to hold it for 10 seconds without holding on. Stand close beside them throughout.
        {helperRequired && " Over video, another adult must be standing beside the patient."}
      </p>

      <ol className="mt-3 space-y-2">
        {BALANCE_STAGES.map((stage, i) => {
          const s = settled.stages[i];
          const isCurrent = current === i && result === null;
          const heldMs = balanceHeldMs(settled, i, clock.now);
          return (
            <li
              key={stage.stage}
              className={`rounded-xl border p-3 ${
                s.state === "held"
                  ? "border-emerald-300 bg-emerald-50"
                  : s.state === "not_held"
                    ? "border-red-300 bg-red-50"
                    : isCurrent
                      ? "border-teal-700 bg-white ring-2 ring-teal-700"
                      : "border-slate-200 bg-slate-50"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-semibold text-slate-900">
                  {stage.stage}. {stage.label}
                </p>
                <p className="text-xs font-semibold text-slate-700">
                  {s.state === "held"
                    ? "Held 10 seconds"
                    : s.state === "not_held"
                      ? `Not held (${(s.heldMs / 1000).toFixed(1)} s)`
                      : s.state === "running"
                        ? `${formatCountdown(BALANCE_HOLD_MS - heldMs)} left`
                        : isCurrent
                          ? "Ready"
                          : "Not reached"}
                </p>
              </div>
              <p className="mt-0.5 text-xs text-slate-600">{stage.how}</p>

              {s.state === "running" && (
                <>
                  <div
                    role="progressbar"
                    aria-label={`${stage.label} hold`}
                    aria-valuemin={0}
                    aria-valuemax={10}
                    aria-valuenow={Math.floor(heldMs / 1000)}
                    className="mt-2 h-3 rounded-full bg-slate-200"
                  >
                    <div className="h-3 rounded-full bg-teal-700" style={{ width: `${(heldMs / BALANCE_HOLD_MS) * 100}%` }} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setState(endBalanceStage(settled, readClock()))}
                    className="mt-2 min-h-[56px] w-full rounded-xl bg-red-700 text-base font-bold text-white hover:bg-red-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-600/40"
                  >
                    Lost balance or held on
                  </button>
                </>
              )}
              {isCurrent && s.state === "pending" && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setInterrupted(false);
                    setState(startBalanceStage(settled, readClock()));
                  }}
                  className="mt-2 min-h-[56px] w-full rounded-xl bg-teal-700 text-base font-bold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-600/40 disabled:opacity-50"
                >
                  Start the 10-second hold
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {liveInterrupted && (
        <p role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          The screen was in the background, or the device slept, during a hold. The clock kept running, but check the result
          against what you saw.
        </p>
      )}

      {result !== null && (
        <div className="mt-4 space-y-2">
          <p role="status" className="text-sm font-semibold text-slate-900">
            {result === 4
              ? "All four positions held for 10 seconds."
              : `Reached stage ${result === 0 ? "0 (the first position was not held)" : result}. The test ends at the first position not held.`}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setState(createBalance());
                setInterrupted(false);
              }}
              className="min-h-[48px] flex-1 rounded-xl border border-slate-300 text-sm font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              Start over
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onUse({ stage: result, interrupted: liveInterrupted })}
              className="min-h-[48px] flex-1 rounded-xl bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-60"
            >
              Use stage {result}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
