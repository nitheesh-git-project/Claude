"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { setupProgress } from "@/lib/cockpit";
import type { ProtocolStep } from "@/lib/sessionProtocols";

/** The helper item's words once another adult has already been ticked as
 *  beside the patient on an earlier step: the tick stays on every step that
 *  has one (the server needs it), only the words say it is a re-check. */
export const HELPER_STILL_LABEL = "Helper still beside them";

/**
 * The current step as one card: where we are, the set-up checklist (real
 * checkboxes; every required one must be ticked before Save and next
 * unlocks), a red-bordered safety line when another adult has to stand
 * beside the patient, then what to say to the patient in large type with the
 * step's own tool directly under it.
 *
 * Beside Google Meet the card is narrow, so once the set-up is ticked it
 * folds into one line ("3/3 set up ✓ · Edit") and the script and the tool
 * move up. Folding never unticks anything; Edit opens the list again.
 */
export default function StepCard({
  step,
  number,
  total,
  ticked,
  onToggle,
  locked,
  helperCarried = false,
  children,
}: {
  step: ProtocolStep;
  number: number;
  total: number;
  ticked: ReadonlySet<string>;
  onToggle: (itemId: string) => void;
  /** A step the clinical order keeps shut: nothing on it can be changed. */
  locked: string | null;
  /** A helper was ticked on an earlier step of this run. */
  helperCarried?: boolean;
  children: ReactNode;
}) {
  const progress = setupProgress(step, ticked);
  const optionalOpen = step.setup.filter((i) => i.optional === true && !ticked.has(i.id)).length;
  const [editing, setEditing] = useState(false);
  const folded = !locked && progress.remaining === 0 && !editing;

  // Ticking the last box folds the list away and takes the focused checkbox
  // with it: hand the focus to Edit rather than dropping it on the page.
  const focusInList = useRef(false);
  const editRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (folded && focusInList.current) {
      focusInList.current = false;
      editRef.current?.focus();
    }
  }, [folded]);

  const label = (item: ProtocolStep["setup"][number]) => (item.helper === true && helperCarried && item.optional !== true ? HELPER_STILL_LABEL : item.label);

  return (
    <div data-testid="step-card" className="flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="text-[13px] font-bold uppercase tracking-wider text-teal-800">
            Step {number} of {total}
          </p>
          <h2 data-testid="step-title" className="mt-1 font-display text-[clamp(1.375rem,3vw,1.75rem)] font-extrabold leading-tight text-slate-900">
            {step.title}
          </h2>
        </div>
        {folded && (
          <p data-testid="setup-folded" className="flex min-h-[44px] items-center gap-1 rounded-xl bg-teal-50 pl-3 text-sm font-semibold text-teal-900">
            <span>
              {progress.done}/{progress.total} set up <span aria-hidden="true">✓</span>
              {optionalOpen > 0 && <span className="font-normal text-slate-700"> · helper not ticked</span>}
            </span>
            <button
              ref={editRef}
              type="button"
              data-testid="setup-edit"
              onClick={() => setEditing(true)}
              aria-label="Edit the set-up"
              className="min-h-[44px] rounded-xl px-3 font-bold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              Edit
            </button>
          </p>
        )}
      </div>

      {locked && (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[15px] font-semibold text-amber-900">
          {locked}
        </p>
      )}

      {!folded && (
        <fieldset
          disabled={!!locked}
          className="min-w-0"
          onFocus={() => {
            focusInList.current = true;
          }}
          onBlur={(e) => {
            // A checkbox removed by the fold has no next target: keep the flag.
            const next = e.relatedTarget as Node | null;
            if (next && !e.currentTarget.contains(next)) focusInList.current = false;
          }}
        >
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-700">Set up first</legend>
          <ul className="flex flex-col gap-1.5">
            {step.setup.map((item) => {
              const on = ticked.has(item.id);
              return (
                <li key={item.id}>
                  <label
                    className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2 text-base text-slate-900 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal-600 has-[:focus-visible]:ring-offset-1 ${
                      on ? "border-teal-700 bg-teal-50" : "border-slate-300 bg-white hover:border-teal-500"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        focusInList.current = true;
                        onToggle(item.id);
                      }}
                      data-testid={`setup-${item.id}`}
                      className="h-6 w-6 shrink-0 accent-teal-700 focus-visible:outline-none"
                    />
                    <span className="min-w-0 [overflow-wrap:anywhere]">{label(item)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {editing && progress.remaining === 0 && (
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="mt-2 min-h-[44px] rounded-xl px-3 text-sm font-semibold text-teal-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              Done
            </button>
          )}
        </fieldset>
      )}

      {step.needsHelper && (
        <div
          data-testid="helper-warning"
          role="note"
          className="rounded-xl border-2 border-red-600 bg-red-50 px-3.5 py-2 text-[15px] leading-snug text-red-950"
        >
          <strong>Safety:</strong> someone must stand beside the patient for this test. Do not start until you have seen them on camera.
        </div>
      )}

      <div className="flex items-start gap-3 rounded-xl bg-teal-50 px-4 py-3">
        <i aria-hidden="true" className="fa-solid fa-comment-dots mt-1 shrink-0 text-lg text-teal-800" />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-teal-800">Say to the patient</p>
          <p data-testid="step-script" className="mt-1 text-lg font-medium leading-relaxed text-slate-900 sm:text-[1.1875rem]">
            {step.script}
          </p>
        </div>
      </div>

      <div>{children}</div>
    </div>
  );
}
