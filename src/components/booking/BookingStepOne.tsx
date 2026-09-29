"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import BookingCalendar from "@/components/booking/BookingCalendar";
import SelectableChipGroup from "@/components/booking/SelectableChipGroup";
import {
  bookableHoursForDate,
  leadTimeMsFromHours,
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
  serviceSlot,
  serviceChosen,
  timezone,
  nowMs,
  leadTimeHours,
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
  /** The service picker, rendered first. Taken as a node rather than as
   *  catalogue props so this component stays a screen of scheduling
   *  controls and knows nothing about what the clinic sells. */
  serviceSlot: React.ReactNode;
  /** Whether that picker has an answer yet. Part of `ready` for the same
   *  reason the date and the hour are: Continue is offered once the screen
   *  is complete, and the service is now the first thing on it. */
  serviceChosen: boolean;
  timezone: string;
  nowMs: number;
  /** How far ahead a session must be booked, from the clinic's own settings.
   *  This screen printed `BOOKING_LEAD_TIME_HOURS` and filtered on it, while
   *  `/api/appointments/create` has read the admin setting since it became
   *  one -- so a clinic that widened the window went on being offered the old
   *  one here and had the booking refused at the last step of checkout, which
   *  is the "two answers to when can this be booked" failure this codebase
   *  corrects everywhere else. The constant is the default, never the answer;
   *  same shape as `cancellationRefundHours` one screen along. */
  leadTimeHours: number;
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
  const leadTimeMs = leadTimeMsFromHours(leadTimeHours);
  const hours = dateKey ? bookableHoursForDate(dateKey, nowMs, leadTimeMs) : [];
  const ready = serviceChosen && Boolean(dateKey) && hour !== "" && Boolean(language);

  return (
    <>
      {/* First, because everything under it is a decision about a thing the
          patient has not been shown yet otherwise: this screen used to ask
          for a date and an hour while the wizard header read "pricing shown
          once you pick a concern", and the price and the session length only
          arrived on Step 2. */}
      {serviceSlot}

      <div className="w-full rounded-xl bg-teal-50/70 px-4 py-3.5 text-slate-700">
        <i className="fa-solid fa-globe text-teal-600 mr-2.5" aria-hidden="true"></i>
        Times shown in <strong className="font-bold text-slate-900">{timezone || "your"}</strong>{" "}
        timezone - detected automatically
      </div>

      <div>
        <label className="block font-semibold mb-1.5 text-slate-900">
          Preferred Date
          <span className="font-normal text-xs text-slate-500">
            {" "}
            (at least {leadTimeHours} hour{leadTimeHours === 1 ? "" : "s"} from now)
          </span>
        </label>
        <BookingCalendar
          selectedDateKey={dateKey}
          onSelect={onDateChange}
          nowMs={nowMs}
          leadTimeMs={leadTimeMs}
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
                emptyMessage="No times left on this date - please pick another day."
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
                emptyMessage="No languages are configured yet - please contact us to book."
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-xs text-slate-500">
        This is your preferred time - we&apos;ll confirm the exact slot with you
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
