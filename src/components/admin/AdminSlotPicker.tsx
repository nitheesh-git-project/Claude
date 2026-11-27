"use client";

import { useState } from "react";
import BookingCalendar from "@/components/booking/BookingCalendar";
import {
  BOOKING_OPTION_CELL_COMPACT,
  BOOKING_OPTION_GRID_COMPACT,
  bookingCellClass,
} from "@/lib/bookingCellStyles";
import {
  bookableHoursForDate,
  earliestBookableDateKey,
  formatDateKeyLong,
  BOOKING_LEAD_TIME_MS,
  CLINIC_TIMEZONE,
  wallClockMs,
  wallClockShiftMs,
  zonedSlotMs,
  zonedSlotParts,
  zoneLabel,
  type SlotOpenCheck,
} from "@/lib/bookingSlots";
import { formatHourRange } from "@/lib/therapistAvailability";

/**
 * The patient's date+time picker, compact and inline, for admin screens.
 *
 * The admin surfaces that set a slot used `<input type="datetime-local">`
 * with a five-minute minimum, so an admin could hand a referred patient a
 * time the platform's own 12-hour lead-time rule refuses -- two different
 * answers to "when can this be booked", in the one place where the person
 * choosing is not the person who has to live with it.
 *
 * It reads `src/lib/bookingSlots.ts`, the same module the wizard's picker
 * and its validator share, so an ineligible date is not clickable rather
 * than being an error after the fact. `BookingCalendar` is the same
 * component too, in its `compact` mode: an admin card already carries a
 * therapist dropdown and a button, and the patient-sized control filled the
 * row on its own. Inline by design -- a dialog would hide the referral it
 * is being chosen for.
 *
 * Hours are the booking's zone's hours -- the clinic's by default -- never
 * the browser's. An admin on a laptop set to UTC used to choose "10:00",
 * which the browser turned into 15:30 IST, and every route refused it as
 * "Sessions start on the hour". The grid is handed a clock shifted to the
 * zone's wall time (`wallClockMs`), and `slotToMs` / `slotFromIso` convert
 * in that same zone.
 */
export default function AdminSlotPicker({
  dateKey,
  hour,
  onChange,
  nowMs,
  label = "Session date & time",
  disabled = false,
  leadTimeMs = BOOKING_LEAD_TIME_MS,
  startOpen = false,
  timeZone = CLINIC_TIMEZONE,
  isSlotOpen = null,
  openHoursLoading = false,
  openHoursChecked = false,
}: {
  dateKey: string;
  hour: number | null;
  onChange: (next: { dateKey: string; hour: number | null }) => void;
  /** Owned by the parent, so the form validates against the same instant. */
  nowMs: number;
  label?: string;
  disabled?: boolean;
  /**
   * How far ahead a slot must be. Defaults to the patient's 12 hours.
   *
   * Pass 0 where the screen is an admin override lane rather than a booking:
   * rescheduling a session that already exists, or creating one for a patient
   * who telephoned, are exactly the cases the lead time is not about. They get
   * the same control and the same colours -- only the boundary moves, and it
   * never moves into the past.
   */
  leadTimeMs?: number;
  /** Expanded from the start, where the screen exists to choose a time. */
  startOpen?: boolean;
  /** The zone the hours are in: the booking's own, else the clinic's. */
  timeZone?: string | null;
  /** Which real slot starts a therapist can take (useOpenSlots). Null: not
   *  checked, and every hour that clears the lead time is offered. */
  isSlotOpen?: SlotOpenCheck;
  /** The open hours are on their way: the calendar says it is checking and
   *  the hours wait, as on the patient's picker. */
  openHoursLoading?: boolean;
  /** The hours on screen are the roster's ("Available times"). */
  openHoursChecked?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  // "Now" as the zone's wall clock, so the lead time and "today" are judged
  // there rather than in the browser's zone.
  const wallNowMs = wallClockMs(nowMs, timeZone);
  // The grid judges slots on the shifted clock, so a real instant is the
  // shifted one moved back by the same offset before it is looked up.
  // Whole minutes: the raw difference carries the sub-second part of `now`
  // that the zone conversion drops, which broke every exact-hour lookup
  // below (wallClockShiftMs).
  const shift = wallClockShiftMs(nowMs, timeZone);
  const openOnGrid: SlotOpenCheck = isSlotOpen ? (shiftedMs: number) => isSlotOpen(shiftedMs - shift) : null;

  const hours = dateKey ? bookableHoursForDate(dateKey, wallNowMs, leadTimeMs, openOnGrid) : [];

  function selectDate(nextDateKey: string) {
    // Keep the hour when the new date still offers it; otherwise fall to that
    // day's earliest bookable one rather than silently keeping a time the
    // lead-time rule has just ruled out.
    const nextHours = bookableHoursForDate(nextDateKey, wallNowMs, leadTimeMs, openOnGrid);
    const keep = hour !== null && nextHours.includes(hour) ? hour : (nextHours[0] ?? null);
    onChange({ dateKey: nextDateKey, hour: keep });
  }

  const chosen =
    dateKey && hour !== null
      ? `${formatDateKeyLong(dateKey)} · ${formatHourRange(hour)} · ${zoneLabel(timeZone)}`
      : "No time chosen yet";

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-700">{label}</p>
          <p className="text-[11px] text-slate-600 truncate">{chosen}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          aria-expanded={open}
          className="text-[11px] font-semibold text-teal-700 hover:underline disabled:opacity-60"
        >
          {open ? "Hide calendar" : dateKey && hour !== null ? "Change" : "Pick a time"}
        </button>
      </div>

      {open && (
        <div className="space-y-2">
          <BookingCalendar
            compact
            selectedDateKey={dateKey}
            onSelect={selectDate}
            nowMs={wallNowMs}
            isSlotOpen={openOnGrid}
            leadTimeMs={leadTimeMs}
            autoSelected={false}
            loading={openHoursLoading}
          />
          {!openHoursLoading && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
              {openHoursChecked ? "Available times" : "Time"} ({zoneLabel(timeZone)})
            </p>
            {hours.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                No times left on this date - pick another day.
              </p>
            ) : (
              <div className={BOOKING_OPTION_GRID_COMPACT}>
                {hours.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onChange({ dateKey, hour: h })}
                    aria-pressed={h === hour}
                    className={`${bookingCellClass({
                      selected: h === hour,
                      disabled: false,
                    })} ${BOOKING_OPTION_CELL_COMPACT}`}
                  >
                    {formatHourRange(h)}
                  </button>
                ))}
              </div>
            )}
          </div>
          )}
          {/* Says why yesterday and this afternoon are not on offer, rather
              than leaving an admin to work it out from greyed-out cells. */}
          <p className="text-[10px] text-slate-500">
            {/* Branches on whether a lead time applies at all, not on
                whether it equals the constant: the rule is an admin setting
                now, so a clinic running a 24-hour window would otherwise be
                told its own referral screen was an override lane. The hours
                are read back off the value in force rather than printed from
                the constant, for the same reason. */}
            {leadTimeMs > 0
              ? `Earliest bookable time is ${Math.round(leadTimeMs / 3_600_000)} hour${
                  Math.round(leadTimeMs / 3_600_000) === 1 ? "" : "s"
                } from now - the same rule the patient's own booking screen follows.`
              : "Any time from now on - this screen is an override, so the patient's lead-time rule does not apply."}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The initial `{dateKey, hour}` for a fresh picker: the earliest slot the
 * lead-time rule allows, so the commonest choice needs no taps. Returns an
 * empty date when nothing qualifies, which the caller must treat as "no
 * availability" rather than assuming a day.
 */
export function earliestSlot(
  nowMs: number,
  leadTimeMs: number = BOOKING_LEAD_TIME_MS,
  timeZone: string | null = CLINIC_TIMEZONE
): { dateKey: string; hour: number | null } {
  const wallNowMs = wallClockMs(nowMs, timeZone);
  const dateKey = earliestBookableDateKey(wallNowMs, leadTimeMs) ?? "";
  return {
    dateKey,
    hour: dateKey ? (bookableHoursForDate(dateKey, wallNowMs, leadTimeMs)[0] ?? null) : null,
  };
}

/** Splits a stored ISO instant back into the picker's `{dateKey, hour}` on
 *  the zone's wall clock. Minutes are dropped, because every slot in this
 *  app starts on the hour; a legacy row at 10:30 opens the picker on 10 and
 *  is rewritten on save. */
export function slotFromIso(
  iso: string | null,
  timeZone: string | null = CLINIC_TIMEZONE
): { dateKey: string; hour: number | null } {
  return zonedSlotParts(iso, timeZone);
}

/** Epoch ms for a chosen slot in the zone, or null when one is incomplete. */
export function slotToMs(
  dateKey: string,
  hour: number | null,
  timeZone: string | null = CLINIC_TIMEZONE
): number | null {
  return zonedSlotMs(dateKey, hour, timeZone);
}
