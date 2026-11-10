"use client";

import { useEffect, useRef } from "react";
import type { StepMark, StepNavItem } from "@/lib/cockpit";

const MARK_WORD: Record<StepMark, string> = { done: "done", skipped: "skipped", stopped: "stopped", todo: "" };

/**
 * The steps across the top, one 44px-plus button each: a tick once a step is
 * saved, the number before that, the current one filled. A step the clinical
 * order keeps shut (before the safety questions are answered, or any test
 * after a yes) is disabled and says why to a screen reader. On a phone this
 * is the only step list, and it scrolls sideways rather than wrapping.
 */
export default function StepBar({ items, onPick }: { items: StepNavItem[]; onPick: (id: string) => void }) {
  const currentRef = useRef<HTMLButtonElement>(null);
  const currentId = items.find((i) => i.current)?.id;
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentId]);

  return (
    <nav aria-label="Steps" data-testid="step-bar">
      <ol className="flex gap-1.5 overflow-x-auto pb-1">
        {items.map((item) => {
          const word = MARK_WORD[item.mark];
          return (
            <li key={item.id} className="flex-1 basis-0 min-w-fit">
              <button
                ref={item.current ? currentRef : undefined}
                type="button"
                data-testid={`step-${item.id}`}
                disabled={!item.available}
                aria-current={item.current ? "step" : undefined}
                aria-label={`Step ${item.index + 1}, ${item.short}${word ? `, ${word}` : ""}${item.lockedReason ? `. ${item.lockedReason}` : ""}`}
                onClick={() => onPick(item.id)}
                className={`flex min-h-[44px] w-full items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                  item.current
                    ? "border-teal-700 bg-teal-700 font-bold text-white"
                    : "border-slate-300 bg-white font-medium text-slate-900 hover:border-teal-500"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-xs font-bold ${
                    item.current
                      ? "bg-white text-teal-800"
                      : item.mark === "done"
                        ? "bg-teal-700 text-white"
                        : item.mark === "skipped" || item.mark === "stopped"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {item.mark === "done" ? "✓" : item.mark === "skipped" ? "–" : item.mark === "stopped" ? "!" : item.index + 1}
                </span>
                {item.short}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
