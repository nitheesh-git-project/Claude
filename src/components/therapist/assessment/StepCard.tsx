"use client";

import type { ReactNode } from "react";
import type { ProtocolStep } from "@/lib/sessionProtocols";

/**
 * The current step as one card: where we are, what to say to the patient in
 * large type, the set-up checklist (real checkboxes; every one must be ticked
 * before Save and next unlocks), a red-bordered safety line when another
 * adult has to stand beside the patient, and then the step's own tool.
 */
export default function StepCard({
  step,
  number,
  total,
  ticked,
  onToggle,
  locked,
  children,
}: {
  step: ProtocolStep;
  number: number;
  total: number;
  ticked: ReadonlySet<string>;
  onToggle: (itemId: string) => void;
  /** A step the clinical order keeps shut: nothing on it can be changed. */
  locked: string | null;
  children: ReactNode;
}) {
  return (
    <div data-testid="step-card" className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div>
        <p className="text-[13px] font-bold uppercase tracking-wider text-teal-800">
          Step {number} of {total}
        </p>
        <h2 data-testid="step-title" className="mt-1 font-display text-[clamp(1.375rem,3vw,1.75rem)] font-extrabold leading-tight text-slate-900">
          {step.title}
        </h2>
      </div>

      {locked && (
        <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[15px] font-semibold text-amber-900">
          {locked}
        </p>
      )}

      <div className="flex items-start gap-3 rounded-xl bg-teal-50 px-4 py-3.5">
        <i aria-hidden="true" className="fa-solid fa-comment-dots mt-1 shrink-0 text-lg text-teal-800" />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-teal-800">Say to the patient</p>
          <p data-testid="step-script" className="mt-1 text-lg font-medium leading-relaxed text-slate-900 sm:text-[1.1875rem]">
            {step.script}
          </p>
        </div>
      </div>

      <fieldset disabled={!!locked} className="min-w-0">
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
                    onChange={() => onToggle(item.id)}
                    data-testid={`setup-${item.id}`}
                    className="h-6 w-6 shrink-0 accent-teal-700 focus-visible:outline-none"
                  />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{item.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {step.needsHelper && (
        <div
          data-testid="helper-warning"
          role="note"
          className="rounded-xl border-2 border-red-600 bg-red-50 px-4 py-3 text-[15px] leading-snug text-red-950"
        >
          <strong>Safety:</strong> someone must stand beside the patient for this test. Do not start until you have seen them on camera.
        </div>
      )}

      <div className="border-t border-slate-200 pt-4">{children}</div>
    </div>
  );
}
