"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { EmptyState, StatusPill } from "@/components/dashboard/SurfaceCard";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  describeException,
  formatExceptionDate,
  formatTimeLabel,
  listExceptions,
  nextFreePeriod,
  type ScheduleException,
  type TimeRange,
} from "@/lib/availabilityRanges";
import type { OverrideRow, TemplateRow } from "@/lib/therapistAvailability";

// One date that differs from the weekly schedule. Called an exception
// everywhere a person can see it -- "override" is the column's word, not
// theirs.
//
// The write is a whole day at a time (/api/admin/set-availability-exception),
// so an admin says "she's off on Tuesday" once instead of clicking eighteen
// cells. The rows underneath are unchanged, and a sparse row written by the
// old grid still reads correctly here, because the effective hours are
// recomputed from the weekly schedule plus the exception rather than read
// off the exception alone.

const START_HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR },
  (_, i) => DAY_START_HOUR + i
);
const END_HOURS = START_HOURS.map((h) => h + 1);

export default function ScheduleExceptionsPanel({
  therapistId,
  therapistName,
  templateRows,
  overrideRows,
  todayKey,
  readOnly = false,
}: {
  therapistId: string;
  therapistName: string;
  templateRows: TemplateRow[];
  overrideRows: OverrideRow[];
  /** Passed in rather than computed: this renders on the server and hydrates
   *  in a browser, and a "today" from whichever clock is running is the
   *  hydration mismatch this codebase has already fixed twice. */
  todayKey: string;
  /** A therapist sees their exceptions and cannot write them -- the same
   *  rule as before the redesign. Broadening that is its own decision, not a
   *  side effect of a new screen. */
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(todayKey);
  const [mode, setMode] = useState<"unavailable" | "custom_hours">("unavailable");
  const [ranges, setRanges] = useState<TimeRange[]>([{ startHour: 10, endHour: 14 }]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const inFlight = useRef(false);

  const upcoming = useMemo(
    () => listExceptions(templateRows, overrideRows, { fromDateKey: todayKey }),
    [templateRows, overrideRows, todayKey]
  );

  async function post(body: Record<string, unknown>, forDate: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusyDate(forDate);
    setError(null);
    try {
      const res = await fetch("/api/admin/set-availability-exception", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ therapistId, ...body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Couldn't save that exception. Nothing was changed.");
        return;
      }
      setAdding(false);
      setNote("");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Nothing was changed.");
    } finally {
      setBusyDate(null);
      inFlight.current = false;
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {readOnly
            ? "Dates the clinic has set differently from your weekly hours. Everything else follows your schedule above."
            : "Dates that differ from the weekly schedule. Everything else follows the schedule above."}
        </p>
        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              setAdding((open) => !open);
              setError(null);
            }}
            aria-expanded={adding}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-200"
          >
            {adding ? "Cancel" : "Add exception"}
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700"
        >
          {error}
        </div>
      )}

      {adding && !readOnly && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="exception-date"
                className="block text-[11px] font-bold text-slate-700"
              >
                Date
              </label>
              <input
                id="exception-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              />
            </div>
            <fieldset>
              <legend className="text-[11px] font-bold text-slate-700">
                On this date {therapistName} is
              </legend>
              <div className="mt-1 flex gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-700">
                  <input
                    type="radio"
                    name="exception-mode"
                    checked={mode === "unavailable"}
                    onChange={() => setMode("unavailable")}
                  />
                  Unavailable all day
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-700">
                  <input
                    type="radio"
                    name="exception-mode"
                    checked={mode === "custom_hours"}
                    onChange={() => setMode("custom_hours")}
                  />
                  Available for set hours
                </label>
              </div>
            </fieldset>
          </div>

          {mode === "custom_hours" && (
            <div className="mt-3 space-y-2">
              {ranges.map((range, index) => (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`exc-start-${index}`}>
                    Period {index + 1} starts at
                  </label>
                  <select
                    id={`exc-start-${index}`}
                    value={range.startHour}
                    onChange={(e) =>
                      setRanges((current) =>
                        current.map((r, i) =>
                          i === index ? { ...r, startHour: Number(e.target.value) } : r
                        )
                      )
                    }
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold"
                  >
                    {START_HOURS.map((hour) => (
                      <option key={hour} value={hour}>
                        {formatTimeLabel(hour)}
                      </option>
                    ))}
                  </select>
                  <span aria-hidden className="text-xs text-slate-400">
                    to
                  </span>
                  <label className="sr-only" htmlFor={`exc-end-${index}`}>
                    Period {index + 1} ends at
                  </label>
                  <select
                    id={`exc-end-${index}`}
                    value={range.endHour}
                    onChange={(e) =>
                      setRanges((current) =>
                        current.map((r, i) =>
                          i === index ? { ...r, endHour: Number(e.target.value) } : r
                        )
                      )
                    }
                    className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold"
                  >
                    {END_HOURS.map((hour) => (
                      <option key={hour} value={hour}>
                        {formatTimeLabel(hour)}
                      </option>
                    ))}
                  </select>
                  {ranges.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setRanges((current) => current.filter((_, i) => i !== index))
                      }
                      aria-label={`Remove period ${index + 1}`}
                      className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setRanges((current) => {
                    const next = nextFreePeriod(current);
                    return next ? [...current, next] : current;
                  })
                }
                disabled={nextFreePeriod(ranges) === null}
                className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                Add hours
              </button>
            </div>
          )}

          <div className="mt-3">
            <label htmlFor="exception-note" className="block text-[11px] font-bold text-slate-700">
              Note (optional)
            </label>
            <input
              id="exception-note"
              type="text"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this date is different"
              className="mt-1 w-full max-w-md rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            />
          </div>

          <button
            type="button"
            onClick={() =>
              void post({ date, mode, ranges: mode === "custom_hours" ? ranges : [], note }, date)
            }
            disabled={busyDate !== null}
            className="mt-3 rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {busyDate ? "Saving…" : "Save exception"}
          </button>
        </div>
      )}

      {upcoming.length === 0 ? (
        <EmptyState
          icon="fa-calendar-day"
          title="No upcoming exceptions"
          body={`Every upcoming date follows ${
            readOnly ? "your" : `${therapistName}'s`
          } weekly schedule.`}
        />
      ) : (
        <ul className="space-y-2">
          {upcoming.map((exception) => (
            <ExceptionRow
              key={exception.dateKey}
              exception={exception}
              readOnly={readOnly}
              busy={busyDate === exception.dateKey}
              onClear={() => void post({ date: exception.dateKey, mode: "clear" }, exception.dateKey)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ExceptionRow({
  exception,
  readOnly,
  busy,
  onClear,
}: {
  exception: ScheduleException;
  readOnly: boolean;
  busy: boolean;
  onClear: () => void;
}) {
  const description = describeException(exception);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-800">{formatExceptionDate(exception.dateKey)}</p>
        <p className="text-[11px] text-slate-500">{description}</p>
        {exception.note && (
          <p className="text-[11px] italic text-slate-400">{exception.note}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <StatusPill
          tone={exception.kind === "unavailable_all_day" ? "bad" : "brand"}
          icon={exception.kind === "unavailable_all_day" ? "fa-ban" : "fa-clock"}
        >
          {exception.kind === "unavailable_all_day" ? "Unavailable" : "Custom hours"}
        </StatusPill>
        {!readOnly && (
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
          >
            {busy ? "Removing…" : "Remove"}
          </button>
        )}
      </div>
    </li>
  );
}
