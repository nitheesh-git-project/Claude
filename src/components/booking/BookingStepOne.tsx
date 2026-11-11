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
import { stepOneBlocker } from "@/lib/bookingStepOne";
import { requestedTimeNotice } from "@/lib/clinicPromises";

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
  confirmationHours,
  onContinue,
  continuePending = false,
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
  // patient's own choice -- drives the one-shot highlight on each. The hour is
  // never preselected: the date is a starting point on a calendar the patient
  // can see, but a time is the decision, and a Continue that is lit before it
  // is made lets a patient move on without ever reading it.
  autoPicked: { date: boolean; language: boolean };
  /** The hours the clinic says it takes to confirm a requested time, from
   *  `src/lib/clinicPromises.ts` (a setting once there is a column for it). */
  confirmationHours: number;
  onContinue: () => void;
  /** The time is being checked against the patient's own sessions. */
  continuePending?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const leadTimeMs = leadTimeMsFromHours(leadTimeHours);
  const hours = dateKey ? bookableHoursForDate(dateKey, nowMs, leadTimeMs) : [];
  // The first unanswered thing, said next to the disabled Continue. Null
  // means the patient may go on.
  const blocker = stepOneBlocker({
    serviceChosen,
    dateKey,
    hour,
    language,
    languageCount: languages.length,
  });

  return (
    <>
      {/* First, because everything under it is a decision about a thing the
          patient has not been shown yet otherwise: this screen used to ask
          for a date and an hour while the wizard header read "pricing shown
          once you pick a concern", and the price and the session length only
          arrived on Step 2. */}
      {serviceSlot}

      <div className="w-full rounded-xl bg-teal-50/70 px-4 py-3.5 text-sm text-slate-700">
        <i className="fa-solid fa-globe text-teal-600 mr-2.5" aria-hidden="true"></i>
        Times shown in <strong className="font-bold text-slate-900">{timezone || "your"}</strong>{" "}
        timezone - detected automatically
      </div>

      <div>
        <p id="booking-date-label" className="block font-semibold mb-1.5 text-slate-900">
          Date
          <span className="font-normal text-sm text-slate-600">
            {" "}
            (at least {leadTimeHours} hour{leadTimeHours === 1 ? "" : "s"} from now)
          </span>
        </p>
        <BookingCalendar
          selectedDateKey={dateKey}
          onSelect={onDateChange}
          nowMs={nowMs}
          leadTimeMs={leadTimeMs}
          autoSelected={autoPicked.date}
        />
        {dateKey && (
          <p className="text-sm text-teal-800 font-semibold mt-2">
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
              <p id="booking-time-label" className="block font-semibold mb-1.5 text-slate-900">
                Time
              </p>
              <SelectableChipGroup
                idPrefix="booking-hour"
                label="Time"
                options={hours.map((h) => ({ value: String(h), label: formatHourRange(h) }))}
                value={hour === "" ? "" : String(hour)}
                onChange={(next) => onHourChange(Number(next))}
                emptyMessage="No times left on this date - please pick another day."
              />
            </div>

            <div>
              <p id="booking-language-label" className="block font-semibold mb-1.5 text-slate-900">
                Language
              </p>
              <SelectableChipGroup
                idPrefix="booking-language"
                label="Language"
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

      {/* Said plainly where the time is chosen, and again before paying: the
          time is a request, and there are two honest ways it can end if the
          clinic cannot meet it. The figure is the clinic's own promise
          (src/lib/clinicPromises.ts), never a number typed here. */}
      <p
        data-testid="booking-request-notice"
        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700"
      >
        <i className="fa-solid fa-circle-info mr-2 text-teal-700" aria-hidden="true"></i>
        {requestedTimeNotice(confirmationHours)}
      </p>

      {/* Always on screen. While something is unanswered it is disabled and
          the reason sits beside it in words: a button that appears and
          disappears hides what is left to do, and one that is dead without a
          reason reads as broken. */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={onContinue}
          disabled={blocker !== null || continuePending}
          aria-busy={continuePending || undefined}
          aria-describedby={blocker ? "booking-continue-reason" : undefined}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 py-3.5 text-base font-bold text-white shadow-lg transition-colors hover:bg-teal-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
        >
          {continuePending ? (
            <>
              <i className="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
              <span>Checking your time{"\u2026"}</span>
            </>
          ) : (
            <>
              <span>Continue to your details</span>
              <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </>
          )}
        </button>
        {blocker && (
          <p
            id="booking-continue-reason"
            data-testid="booking-continue-reason"
            className="text-center text-sm font-semibold text-slate-600"
          >
            {blocker}
          </p>
        )}
      </div>
    </>
  );
}
