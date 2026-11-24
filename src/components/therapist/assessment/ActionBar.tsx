"use client";

import { useState } from "react";
import Spinner from "@/components/system/Spinner";
import { screenStatusLine, type PatientControl } from "@/lib/cockpit";
import type { PreviewStatus } from "@/components/therapist/assessment/PatientPreview";
import type { CompanionSeen } from "@/lib/companionScreen";

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
 * Above them, one line says whether the patient can see their screen (one
 * dot, one sentence: `screenStatusLine`). The patient's screen follows the
 * test by itself - a step opens on Get ready, a timer's start is Go, its end
 * Done, a redo Get ready again, Stop test Rest - so the manual controls sit
 * folded behind "Patient screen: Auto", for the rare override.
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
    /** Whether the patient's screen is open (E12); null while not yet known. */
    seen: CompanionSeen | null;
  };
  /** The one-line keyboard hint; shown from `md` up (a keyboard is likely). */
  keyHint?: string;
}) {
  return (
    <div className="sticky bottom-0 z-20 -mx-3 space-y-1.5 bg-slate-50 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 sm:-mx-1 sm:px-1">
      {screen && <ScreenRow screen={screen} />}
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

type ScreenProps = NonNullable<Parameters<typeof ActionBar>[0]["screen"]>;

/** The status line and the folded manual controls for the patient's screen. */
function ScreenRow({ screen }: { screen: ScreenProps }) {
  const [open, setOpen] = useState(false);
  const line = screenStatusLine(screen.status, screen.seen, screen.firstName);
  const DOT: Record<typeof line.tone, string> = { ok: "bg-emerald-600", wait: "bg-amber-500", bad: "bg-red-600", idle: "bg-slate-400" };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-2 py-1 sm:px-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <p data-testid="bar-screen-status" className={`flex min-h-[40px] min-w-0 items-center gap-2 text-[13px] font-semibold ${line.tone === "bad" ? "text-red-800" : "text-slate-800"}`}>
          <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[line.tone]}`} />
          <span className="min-w-0">{line.text}</span>
          {screen.status === "failed" && (
            <button type="button" onClick={screen.onRetry} className="min-h-[44px] font-bold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
              Try again
            </button>
          )}
        </p>
        <button
          type="button"
          data-testid="patient-screen-toggle"
          aria-expanded={open}
          aria-controls="patient-screen-controls"
          onClick={() => setOpen((v) => !v)}
          className="min-h-[44px] rounded-lg px-2 text-[13px] font-semibold text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        >
          Patient screen: Auto <span aria-hidden="true">{open ? "▴" : "▾"}</span>
        </button>
      </div>
      {open && (
        <div
          id="patient-screen-controls"
          role="group"
          aria-label={`${screen.firstName}'s screen`}
          data-testid="patient-screen-controls"
          className="mb-1 flex min-w-0 overflow-x-auto rounded-xl border border-slate-300 bg-slate-100 p-0.5"
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
      )}
    </div>
  );
}
