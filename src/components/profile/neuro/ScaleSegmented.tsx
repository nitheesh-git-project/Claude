"use client";

import { useRef, type KeyboardEvent } from "react";
import type { ScaleOption } from "@/lib/neuroExam";

/**
 * One score on a published scale, as a segmented control -- never a number
 * box, because a scale's grades are the only valid answers and a typed "6"
 * on a 0-5 scale is a value nobody can offer by tapping.
 *
 * A real radio group: `role="radiogroup"` named by the caller ("Elbow
 * flexors, left"), one `role="radio"` per grade, a roving tab stop (one Tab
 * into the group, arrows move between grades and choose as they go), and
 * the grade's own definition as each option's accessible description, so a
 * screen reader hears "1+, Slight increase - a catch, then minimal
 * resistance..." rather than a bare digit.
 *
 * The first segment is **Not tested** (a dash), and it is a choice like any
 * other: "not tested" and "normal" are different facts on a clinical
 * record, and a form that can only express the second by leaving a blank is
 * how one gets read as the other.
 */
export default function ScaleSegmented({
  label,
  options,
  value,
  onChange,
  normalValue,
  previous,
  compact = false,
}: {
  /** The group's accessible name, e.g. "Elbow flexors, left". */
  label: string;
  options: readonly ScaleOption[];
  /** Undefined = not tested. */
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  /** Tinted differently when chosen, so an abnormal grade stands out. */
  normalValue: string;
  /** Last exam's value on this cell, marked with a small dot. */
  previous?: string;
  compact?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const choices: { value: string | undefined; short: string; meaning: string }[] = [
    { value: undefined, short: "–", meaning: "Not tested" },
    ...options.map((o) => ({ value: o.value, short: o.short, meaning: o.meaning })),
  ];
  const selectedIndex = Math.max(
    0,
    choices.findIndex((c) => c.value === value)
  );

  function move(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % choices.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + choices.length) % choices.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = choices.length - 1;
    else return;
    e.preventDefault();
    onChange(choices[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid w-full gap-0.5 rounded-lg bg-slate-100 p-0.5"
      style={{ gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}
    >
      {choices.map((choice, index) => {
        const checked = index === selectedIndex && (choice.value !== undefined || value === undefined);
        const abnormal = choice.value !== undefined && choice.value !== normalValue;
        const wasPrevious = previous !== undefined && choice.value === previous;
        return (
          <button
            key={choice.short + index}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={choice.value === undefined ? "Not tested" : `${choice.short}, ${choice.meaning}`}
            title={choice.meaning}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => onChange(choice.value)}
            onKeyDown={(e) => move(e, index)}
            className={`relative min-w-0 truncate rounded-md font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 ${
              compact ? "px-1 py-1.5 text-[11px]" : "px-1.5 py-2 text-xs"
            } ${
              checked
                ? choice.value === undefined
                  ? "bg-white text-slate-600 shadow-sm"
                  : abnormal
                    ? "bg-amber-700 text-white shadow-sm"
                    : "bg-teal-700 text-white shadow-sm"
                : "text-slate-600 hover:bg-white/70 hover:text-slate-800"
            }`}
          >
            {choice.short}
            {wasPrevious && (
              <span
                aria-hidden
                title="Last exam"
                className={`absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ${checked ? "bg-white" : "bg-violet-500"}`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
