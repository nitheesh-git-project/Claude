"use client";

import { useState } from "react";
import Spinner from "@/components/system/Spinner";
import type { CorrectionReason, TeachingEvent } from "@/lib/exercisePlan";
import {
  COACHING_CUE_OPTIONS,
  CORRECTION_REASON_OPTIONS,
  MARK_BUTTONS,
  NOT_ATTEMPTED_OPTIONS,
  fixChangesNothing,
  markText,
  type MarkChoice,
} from "@/lib/teachTool";

/**
 * "Fix this mark" (phase 7d-3): one tap opens this small sheet. First the
 * reason (three fixed ones), then the right mark (the same three buttons, a
 * cue or a reason where one is needed), then Save the fix. The fix is a new
 * record after the old one, which stays on the record; the patient sees only
 * the latest. No free text anywhere.
 */
export default function FixMarkSheet({
  exerciseName,
  current,
  busy,
  onSave,
  onCancel,
}: {
  exerciseName: string;
  current: TeachingEvent;
  busy: boolean;
  onSave: (choice: MarkChoice, reason: CorrectionReason) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<CorrectionReason | null>(null);
  const [picking, setPicking] = useState<"needs_practice" | "not_attempted" | null>(null);
  const [choice, setChoice] = useState<MarkChoice | null>(null);
  const same = choice ? fixChangesNothing(current, choice) : false;

  const option =
    "min-h-[48px] rounded-xl border px-3 py-2 text-left text-[15px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50";
  const on = "border-teal-700 bg-teal-700 text-white";
  const off = "border-slate-300 bg-white text-slate-900 hover:border-teal-600";

  return (
    <section
      role="group"
      aria-label={`Fix the mark for ${exerciseName}`}
      className="space-y-3 rounded-xl border-2 border-teal-700 bg-white p-3.5"
      data-testid="teach-fix-sheet"
    >
      <p className="text-sm text-slate-800">
        Now marked: <span className="font-semibold">{markText(current)}</span>
      </p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-bold text-slate-900">1. Why are you fixing it?</legend>
        <div className="grid grid-cols-1 gap-2">
          {CORRECTION_REASON_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={reason === o.key}
              data-testid={`fix-reason-${o.key}`}
              disabled={busy}
              onClick={() => setReason(o.key)}
              className={`${option} ${reason === o.key ? on : off}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      {reason && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold text-slate-900">2. What is the right mark?</legend>
          <div className="grid grid-cols-3 gap-2">
            {MARK_BUTTONS.map((b) => {
              const picked = choice?.outcome === b.outcome || picking === b.outcome;
              return (
                <button
                  key={b.outcome}
                  type="button"
                  aria-pressed={picked}
                  data-testid={`fix-mark-${b.outcome}`}
                  disabled={busy}
                  onClick={() => {
                    if (b.outcome === "performed_correctly") {
                      setPicking(null);
                      setChoice({ outcome: "performed_correctly" });
                    } else {
                      setChoice(null);
                      setPicking(b.outcome as "needs_practice" | "not_attempted");
                    }
                  }}
                  className={`flex min-h-[56px] items-center justify-center rounded-xl border px-2 text-center text-base font-bold leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-50 ${picked ? on : "border-teal-700 bg-white text-teal-900 hover:bg-teal-50"}`}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
          {picking && (
            <fieldset className="space-y-2" data-testid={`fix-pick-${picking}`}>
              <legend className="px-1 text-sm font-bold text-slate-900">{picking === "needs_practice" ? "Pick one thing to remind them." : "Why not?"}</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(picking === "needs_practice" ? COACHING_CUE_OPTIONS : NOT_ATTEMPTED_OPTIONS).map((o) => {
                  const picked =
                    choice !== null &&
                    (("cueKey" in choice && choice.cueKey === o.key) || ("reasonKey" in choice && choice.reasonKey === o.key));
                  return (
                    <button
                      key={o.key}
                      type="button"
                      aria-pressed={picked}
                      disabled={busy}
                      data-testid={`fix-${picking === "needs_practice" ? "cue" : "reason"}-${o.key}`}
                      onClick={() =>
                        setChoice(
                          picking === "needs_practice"
                            ? { outcome: "needs_practice", cueKey: o.key as Extract<MarkChoice, { outcome: "needs_practice" }>["cueKey"] }
                            : { outcome: "not_attempted", reasonKey: o.key as Extract<MarkChoice, { outcome: "not_attempted" }>["reasonKey"] }
                        )
                      }
                      className={`${option} ${picked ? on : off}`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}
        </fieldset>
      )}

      {same && <p className="text-sm font-semibold text-slate-900">That is what it already says. Pick a different mark.</p>}

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          data-testid="fix-save"
          disabled={busy || !reason || !choice || same}
          onClick={() => reason && choice && onSave(choice, reason)}
          className="inline-flex min-h-[56px] flex-1 basis-[10rem] items-center justify-center gap-2 rounded-xl border border-transparent bg-teal-700 px-4 text-lg font-bold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy && <Spinner />}
          {choice && !same ? `Save the fix: ${markText({ outcome: choice.outcome, cueKey: "cueKey" in choice ? choice.cueKey : null, reasonKey: "reasonKey" in choice ? choice.reasonKey : null })}` : "Save the fix"}
        </button>
        <button
          type="button"
          data-testid="fix-cancel"
          disabled={busy}
          onClick={onCancel}
          className="min-h-[56px] rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-900 hover:border-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50"
        >
          Keep the mark
        </button>
      </div>
    </section>
  );
}
