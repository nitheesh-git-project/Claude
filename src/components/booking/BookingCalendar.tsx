"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  BOOKING_DAY_CELL,
  BOOKING_DAY_CELL_COMPACT,
  bookingCellClass,
} from "@/lib/bookingCellStyles";
import {
  WEEKDAY_HEADERS,
  buildCalendarMonth,
  formatDateKeyLong,
  fromDateKey,
  isMonthEntirelyUnbookable,
} from "@/lib/bookingSlots";

// Month-grid date picker for Step 1. Replaces the old <input type="date">,
// whose native picker happily offered dates the 12-hour lead-time rule
// would then reject on Continue -- here an ineligible date is simply not
// clickable, so the rule is visible instead of being a post-hoc error.
export default function BookingCalendar({
  selectedDateKey,
  onSelect,
  nowMs,
  autoSelected,
  leadTimeMs,
  compact = false,
}: {
  selectedDateKey: string;
  onSelect: (dateKey: string) => void;
  nowMs: number;
  // True while `selectedDateKey` is still the earliest-eligible date we
  // picked automatically, so the cue only plays for our choice.
  autoSelected: boolean;
  // Home visits use a longer lead time than online sessions. Omitted by the
  // online wizard, which keeps the 12-hour default.
  leadTimeMs?: number;
  // A mode, not a second calendar. The admin back office needs this control
  // inline inside a referral card rather than as the main event of a booking
  // step, and the patient-sized version filled that card on its own. Same
  // component, same lead-time rule, smaller cells -- forking it would be how
  // the two quietly grow different ideas of which dates are bookable.
  compact?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  // Open on the selected date's month so the preselection is on screen
  // without the patient navigating to it.
  const [view, setView] = useState(() => {
    const base = selectedDateKey ? fromDateKey(selectedDateKey) : new Date(nowMs);
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  const calendar = buildCalendarMonth(view.year, view.month, nowMs, leadTimeMs);

  function shiftMonth(delta: number) {
    setView((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  // Nothing bookable ever lies in the past, so stop the back arrow at the
  // first month that still has an eligible date rather than letting the
  // patient wander through empty grids.
  const previousMonth = new Date(view.year, view.month - 1, 1);
  const canGoBack = !isMonthEntirelyUnbookable(
    previousMonth.getFullYear(),
    previousMonth.getMonth(),
    nowMs,
    leadTimeMs
  );

  return (
    // Tight padding on phones: a 7-column month grid only has ~55px of
    // viewport per column at 390px, so every px of chrome comes straight
    // out of the day cells' width.
    <div
      className={`rounded-2xl border border-slate-200 bg-white ${
        compact ? "p-2" : "p-2 sm:p-4"
      }`}
    >
      <div className={`flex items-center justify-between ${compact ? "mb-1.5" : "mb-3"}`}>
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          disabled={!canGoBack}
          aria-label="Previous month"
          className={`${
            compact ? "w-7 h-7 text-xs" : "w-11 h-11"
          } rounded-xl text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600`}
        >
          <i className="fa-solid fa-chevron-left" aria-hidden="true"></i>
        </button>
        {/* aria-live so keyboard/screen-reader users hear the month change,
            which is otherwise a silent repaint of the grid below. */}
        <span
          aria-live="polite"
          className={`font-bold text-slate-900 ${compact ? "text-xs" : "text-sm"}`}
        >
          {calendar.label}
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          className={`${
            compact ? "w-7 h-7 text-xs" : "w-11 h-11"
          } rounded-xl text-slate-600 hover:bg-slate-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600`}
        >
          <i className="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>

      <div className={`grid grid-cols-7 mb-1 ${compact ? "gap-1" : "gap-1.5 sm:gap-2"}`}>
        {WEEKDAY_HEADERS.map((day) => (
          <div
            key={day}
            aria-hidden="true"
            className={`text-center font-bold uppercase tracking-wide text-slate-400 ${
              compact ? "text-[9px]" : "text-[10px] py-1"
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* The selected cell's halo extends ~4px past its box. Only one day
          is ever selected, so a 6px gap on phones is enough for the ring to
          sit in clear space without stealing width from the cells; desktop
          has room for a full 8px. */}
      <div
        role="grid"
        aria-label="Choose a date"
        className={`grid grid-cols-7 ${compact ? "gap-1" : "gap-1.5 sm:gap-2"}`}
      >
        {calendar.cells.map((cell, index) => {
          if (!cell) return <div key={`pad-${index}`} aria-hidden="true" />;

          const selected = cell.dateKey === selectedDateKey;
          const showCue = selected && autoSelected && !reduceMotion;

          return (
            <motion.button
              key={cell.dateKey}
              type="button"
              role="gridcell"
              disabled={!cell.bookable}
              aria-selected={selected}
              aria-label={formatDateKeyLong(cell.dateKey)}
              onClick={() => onSelect(cell.dateKey)}
              // Shares the exact state palette of the time/language cells
              // (see lib/bookingCellStyles). Fixed height rather than
              // aspect-square: the columns get wide on desktop and square
              // cells would stretch each row to ~80px, pushing the time
              // slots below the fold.
              className={`relative ${bookingCellClass({
                selected,
                disabled: !cell.bookable,
              })} ${compact ? BOOKING_DAY_CELL_COMPACT : BOOKING_DAY_CELL}`}
              initial={showCue ? { scale: 0.85 } : false}
              animate={showCue ? { scale: 1 } : undefined}
              whileTap={cell.bookable && !reduceMotion ? { scale: 0.94 } : undefined}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              {cell.dayOfMonth}
              {cell.isToday && !selected && (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-teal-600"
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
