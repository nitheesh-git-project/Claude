"use client";

import Spinner from "@/components/system/Spinner";

const SKIP_REASON = "This step cannot be skipped";

/**
 * The same three actions on every step, always on screen (sticky at the
 * bottom of a phone): Stop test throws this step's reading away, Skip leaves
 * the step out (only where the step may be left out), and one big Save and
 * next that stays disabled until the set-up is ticked and a result exists,
 * with the line underneath saying what is missing. A Skip that is off says
 * why in a line of its own (a title alone is read by neither a phone nor a
 * screen reader, and a disabled button cannot be focused to find it).
 */
export default function ActionBar({
  skippable,
  canSave,
  saving,
  busy,
  primaryLabel,
  note,
  onStop,
  onSkip,
  onSave,
}: {
  skippable: boolean;
  canSave: boolean;
  /** Save and next is working: it shows a spinner. */
  saving: boolean;
  /** Anything is working: the other two wait. */
  busy: boolean;
  primaryLabel: string;
  /** What is missing, or the reminder that Stop test keeps nothing. */
  note: string;
  onStop: () => void;
  onSkip: () => void;
  onSave: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-3 space-y-1.5 bg-slate-50 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:-mx-1 sm:px-1">
      <div role="group" aria-label="Step actions" className="flex flex-wrap gap-2.5 rounded-2xl border border-slate-200 bg-white p-3">
        <button
          type="button"
          data-testid="action-stop"
          onClick={onStop}
          disabled={busy}
          className="min-h-[56px] flex-1 basis-[7.5rem] rounded-xl border border-red-200 bg-red-50 text-base font-bold text-red-800 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          Stop test
        </button>
        <button
          type="button"
          data-testid="action-skip"
          onClick={onSkip}
          disabled={busy || !skippable}
          aria-describedby={skippable ? undefined : "action-skip-reason"}
          title={skippable ? undefined : SKIP_REASON}
          className="min-h-[56px] flex-1 basis-[6.5rem] rounded-xl border border-slate-300 bg-white text-base font-semibold text-slate-900 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Skip
        </button>
        <button
          type="button"
          data-testid="action-save"
          onClick={onSave}
          disabled={busy || !canSave}
          aria-describedby="action-note"
          className="inline-flex min-h-[56px] flex-[3_1_14rem] items-center justify-center gap-2 rounded-xl bg-teal-700 text-lg font-bold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {saving && <Spinner />}
          {saving ? "Saving…" : primaryLabel}
        </button>
      </div>
      {!skippable && (
        <p id="action-skip-reason" data-testid="action-skip-reason" className="px-1 text-center text-xs text-slate-700">
          {SKIP_REASON}.
        </p>
      )}
      <p id="action-note" data-testid="action-note" aria-live="polite" className="px-1 text-center text-[13px] text-slate-700">
        {note}
      </p>
    </div>
  );
}
