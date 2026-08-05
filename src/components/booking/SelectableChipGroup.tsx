"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  BOOKING_OPTION_CELL,
  BOOKING_OPTION_GRID,
  bookingCellClass,
} from "@/lib/bookingCellStyles";

export type ChipOption = {
  value: string;
  label: string;
};

// One selectable-chip row, shared by Step 1's time-slot and language
// pickers so the two can't drift apart in appearance, keyboard behaviour or
// animation. Chips rather than a <select> on purpose: every option stays
// visible and one tap away, which is the whole point of the Step 1 rework.
//
// Implemented as a real radiogroup: arrow keys move between chips and only
// the selected chip is in the tab order (roving tabindex), which is what
// screen-reader and keyboard users expect from a single-choice group --
// a row of plain <button>s would force them to tab through every option.
export default function SelectableChipGroup({
  options,
  value,
  onChange,
  label,
  idPrefix,
  // Chip that animates on mount to point out an automatic preselection.
  // Null once the patient has made a choice of their own -- we only ever
  // highlight *our* pick, never re-animate theirs.
  autoSelectedValue = null,
  emptyMessage = "Nothing available.",
}: {
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  idPrefix: string;
  autoSelectedValue?: string | null;
  emptyMessage?: string;
}) {
  const reduceMotion = useReducedMotion();

  if (options.length === 0) {
    return <p className="text-xs text-slate-500">{emptyMessage}</p>;
  }

  function focusChip(index: number) {
    const next = options[(index + options.length) % options.length];
    document.getElementById(`${idPrefix}-${next.value}`)?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const back = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !back) return;
    // Arrow keys in a radiogroup both move focus and select, so the group's
    // value always matches what's focused.
    event.preventDefault();
    const nextIndex = index + (forward ? 1 : -1);
    const next = options[(nextIndex + options.length) % options.length];
    onChange(next.value);
    focusChip(nextIndex);
  }

  return (
    <div role="radiogroup" aria-label={label} className={BOOKING_OPTION_GRID}>
      {options.map((option, index) => {
        const selected = option.value === value;
        const isAutoSelected = selected && option.value === autoSelectedValue;
        return (
          <motion.button
            key={option.value}
            id={`${idPrefix}-${option.value}`}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`${bookingCellClass({ selected, disabled: false })} ${BOOKING_OPTION_CELL}`}
            // Only the auto-picked chip animates in, and only on mount --
            // a quiet "we chose this for you" cue, not a loop.
            initial={isAutoSelected && !reduceMotion ? { scale: 0.9, opacity: 0 } : false}
            animate={isAutoSelected && !reduceMotion ? { scale: 1, opacity: 1 } : undefined}
            // Every cell gets the press feedback, so switching choices feels
            // as responsive as the initial pick.
            whileTap={reduceMotion ? undefined : { scale: 0.96 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {option.label}
          </motion.button>
        );
      })}
    </div>
  );
}
