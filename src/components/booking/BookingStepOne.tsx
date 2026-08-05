"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import BookingCalendar from "@/components/booking/BookingCalendar";
import SelectableChipGroup from "@/components/booking/SelectableChipGroup";
import {
  BOOKING_LEAD_TIME_HOURS,
  bookableHoursForDate,
  formatDateKeyLong,
} from "@/lib/bookingSlots";
import { formatHourRange } from "@/lib/therapistAvailability";

// Shared entrance for each section as it becomes relevant. Small and
// ease-out -- these fire in sequence as the patient makes choices, so
// anything longer reads as lag rather than polish.
const REVEAL = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.22, ease: "easeOut" as const },
};

export default function BookingStepOne({
  timezone,
  nowMs,
  dateKey,
  onDateChange,
  hour,
  onHourChange,
  language,
  onLanguageChange,
  languages,
  autoPicked,
  onContinue,
}: {
  timezone: string;
  nowMs: number;
  dateKey: string;
  onDateChange: (dateKey: string) => void;
  hour: number | "";
  onHourChange: (hour: number) => void;
  language: string;
  onLanguageChange: (language: string) => void;
  languages: string[];
  // Which fields still hold *our* automatic preselection rather than the
  // patient's own choice -- drives the one-shot highlight on each.
  autoPicked: { date: boolean; hour: boolean; language: boolean };
  onContinue: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const hours = dateKey ? bookableHoursForDate(dateKey, nowMs) : [];
  const ready = Boolean(dateKey) && hour !== "" && Boolean(language);

  return (
    <>
      <div className="w-full rounded-xl bg-teal-50/70 px-4 py-3.5 text-slate-700">
        <i className="fa-solid fa-globe text-teal-600 mr-2.5" aria-hidden="true"></i>
        Times shown in <strong className="font-bold text-slate-900">{timezone || "your"}</strong>{" "}
        timezone — detected automatically
      </div>

      <div>
        <label className="block font-semibold mb-1.5 text-slate-900">
          Preferred Date
          <span className="font-normal text-xs text-slate-500">
            {" "}
            (at least {BOOKING_LEAD_TIME_HOURS} hours from now)
          </span>
        </label>
        <BookingCalendar
          selectedDateKey={dateKey}
          onSelect={onDateChange}
          nowMs={nowMs}
          autoSelected={autoPicked.date}
        />
        {dateKey && (
          <p className="text-xs text-teal-800 font-semibold mt-2">
            <i className="fa-solid fa-calendar-check mr-1" aria-hidden="true"></i>
            {formatDateKeyLong(dateKey)}
          </p>
        )}
      </div>

      {/* Time, language and Continue are all gated on a date existing.
          Normally one is preselected on arrival so they're visible
          immediately; this collapses cleanly if nothing is bookable. */}
      <AnimatePresence initial={false}>
        {dateKey && (
          <motion.div key="time" {...(reduceMotion ? {} : REVEAL)} className="space-y-5">
            <div>
              <label className="block font-semibold mb-1.5 text-slate-900">
                Preferred Time
              </label>
              <SelectableChipGroup
                idPrefix="booking-hour"
                label="Preferred time"
                options={hours.map((h) => ({ value: String(h), label: formatHourRange(h) }))}
                value={hour === "" ? "" : String(hour)}
                onChange={(next) => onHourChange(Number(next))}
                autoSelectedValue={autoPicked.hour && hour !== "" ? String(hour) : null}
                emptyMessage="No times left on this date — please pick another day."
              />
            </div>

            <div>
              <label className="block font-semibold mb-1.5 text-slate-900">
                Preferred Language
              </label>
              <SelectableChipGroup
                idPrefix="booking-language"
                label="Preferred language"
                options={languages.map((l) => ({ value: l, label: l }))}
                value={language}
                onChange={onLanguageChange}
                autoSelectedValue={autoPicked.language ? language : null}
                emptyMessage="No languages are configured yet — please contact us to book."
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-xs text-slate-400">
        This is your preferred time — we&apos;ll confirm the exact slot with you
        before the session.
      </p>

      <AnimatePresence initial={false}>
        {ready && (
          <motion.button
            key="continue"
            onClick={onContinue}
            {...(reduceMotion
              ? {}
              : {
                  initial: { opacity: 0, y: 10 },
                  animate: { opacity: 1, y: 0 },
                  exit: { opacity: 0, y: 10 },
                  transition: { duration: 0.28, ease: "easeOut" as const },
                })}
            className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold py-3.5 rounded-xl text-sm transition-colors shadow-lg flex justify-center items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
          >
            Continue to Medical Details{" "}
            <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
