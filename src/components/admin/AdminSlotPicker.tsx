"use client";

import { useState } from "react";
import BookingCalendar from "@/components/booking/BookingCalendar";
import {
  BOOKING_OPTION_CELL_COMPACT,
  BOOKING_OPTION_GRID_COMPACT,
  bookingCellClass,
} from "@/lib/bookingCellStyles";
import {
  BOOKING_LEAD_TIME_HOURS,
  bookableHoursForDate,
  earliestBookableDateKey,
  formatDateKeyLong,
  slotStartMs,
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
 */
export default function AdminSlotPicker({
  dateKey,
  hour,
  onChange,
  nowMs,
  label = "Session date & time",
  disabled = false,
}: {
  dateKey: string;
  hour: number | null;
  onChange: (next: { dateKey: string; hour: number | null }) => void;
  /** Owned by the parent, so the form validates against the same instant. */
  nowMs: number;
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const hours = dateKey ? bookableHoursForDate(dateKey, nowMs) : [];

  function selectDate(nextDateKey: string) {
    // Keep the hour when the new date still offers it; otherwise fall to that
    // day's earliest bookable one rather than silently keeping a time the
    // lead-time rule has just ruled out.
    const nextHours = bookableHoursForDate(nextDateKey, nowMs);
    const keep = hour !== null && nextHours.includes(hour) ? hour : (nextHours[0] ?? null);
    onChange({ dateKey: nextDateKey, hour: keep });
  }

  const chosen =
    dateKey && hour !== null
      ? `${formatDateKeyLong(dateKey)} · ${formatHourRange(hour)}`
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
            nowMs={nowMs}
            autoSelected={false}
          />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">
              Time
            </p>
            {hours.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                No times left on this date — pick another day.
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
          {/* Says why yesterday and this afternoon are not on offer, rather
              than leaving an admin to work it out from greyed-out cells. */}
          <p className="text-[10px] text-slate-500">
            Earliest bookable time is {BOOKING_LEAD_TIME_HOURS} hours from now — the same
            rule the patient&apos;s own booking screen follows.
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
export function earliestSlot(nowMs: number): { dateKey: string; hour: number | null } {
  const dateKey = earliestBookableDateKey(nowMs) ?? "";
  return { dateKey, hour: dateKey ? (bookableHoursForDate(dateKey, nowMs)[0] ?? null) : null };
}

/** Local-time epoch ms for a chosen slot, or null when one is incomplete. */
export function slotToMs(dateKey: string, hour: number | null): number | null {
  if (!dateKey || hour === null) return null;
  return slotStartMs(dateKey, hour);
}
