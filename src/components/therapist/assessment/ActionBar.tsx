"use client";

import Spinner from "@/components/system/Spinner";
import type { PatientControl } from "@/lib/cockpit";
import { PREVIEW_STATUS_LABEL, type PreviewStatus } from "@/components/therapist/assessment/PatientPreview";

const SKIP_REASON = "This step cannot be skipped";

/**
 * The same three actions on every step, always on screen (sticky at the
 * bottom of every width): Stop test is an emergency stop (it stops the clock
 * and puts Rest on the patient's screen at once, then asks why), Skip leaves
 * the step out (only where the step may be left out), and one big Save and
 * next that stays disabled until the set-up is ticked and a result exists,
 * with the line underneath saying what is missing. A Skip that is off says
 * why in a line of its own (a title alone is read by neither a phone nor a
 * screen reader, and a disabled button cannot be focused to find it).
 *
 * Above them, in a group of its own so the three stay three, the patient's
 * screen as a compact segmented control (Get ready, Go, Done, Rest): beside
 * Google Meet the preview is folded away, and these are pressed mid-test.
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
  screen,
  keyHint,
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
  screen?: {
    firstName: string;
    controls: PatientControl[];
    active: string | null;
    status: PreviewStatus;
    onControl: (control: PatientControl) => void;
    onRetry: () => void;
  };
  /** The one-line keyboard hint; shown from `md` up (a keyboard is likely). */
  keyHint?: string;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-3 space-y-1.5 bg-slate-50 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:-mx-1 sm:px-1">
      {screen && (
        <div className="flex items-center gap-x-2.5 rounded-2xl border border-slate-200 bg-white px-2 py-1.5 sm:px-3">
          <span id="patient-screen-label" className="sr-only text-[13px] font-bold text-slate-800 sm:not-sr-only sm:shrink-0">
            {screen.firstName}
            {"'"}s screen
          </span>
          <div
            role="group"
            aria-labelledby="patient-screen-label"
            data-testid="patient-screen-controls"
            className="flex min-w-0 flex-1 overflow-x-auto rounded-xl border border-slate-300 bg-slate-100 p-0.5"
          >
            {screen.controls.map((c) => (
              <button
                key={c.key}
                type="button"
                data-testid={`patient-${c.key}`}
                aria-pressed={screen.active === c.key}
                onClick={() => screen.onControl(c)}
                className={`min-h-[44px] flex-1 whitespace-nowrap rounded-lg px-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                  screen.active === c.key ? "bg-teal-700 text-white" : "text-slate-900 hover:bg-white"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <span
            data-testid="bar-screen-status"
            className={`shrink-0 text-[13px] font-semibold ${screen.status === "failed" ? "text-red-800" : "text-slate-700"}`}
          >
            {PREVIEW_STATUS_LABEL[screen.status]}
            {screen.status === "failed" && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={screen.onRetry}
                  className="min-h-[44px] font-bold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                >
                  Try again
                </button>
              </>
            )}
          </span>
        </div>
      )}
      <div role="group" aria-label="Step actions" className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-2 sm:gap-2.5 sm:p-3">
        <button
          type="button"
          data-testid="action-stop"
          onClick={onStop}
          disabled={busy}
          className="min-h-[52px] flex-[1_1_5.5rem] rounded-xl border border-red-200 bg-red-50 text-base font-bold text-red-800 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:opacity-60"
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
          className="min-h-[52px] flex-[1_1_4.5rem] rounded-xl border border-slate-300 bg-white text-base font-semibold text-slate-900 transition hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Skip
        </button>
        <button
          type="button"
          data-testid="action-save"
          onClick={onSave}
          disabled={busy || !canSave}
          aria-describedby="action-note"
          className="inline-flex min-h-[52px] flex-[3_1_8rem] items-center justify-center gap-2 rounded-xl bg-teal-700 px-2 text-base sm:text-lg font-bold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400"
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
      {keyHint && (
        <p data-testid="key-hint" className="hidden px-1 text-center text-xs text-slate-600 md:block">
          {keyHint}
        </p>
      )}
    </div>
  );
}
