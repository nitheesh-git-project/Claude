"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  SCHEDULE_PRESETS,
  cloneWeekly,
  describeDay,
  findAppointmentsInRemovedHours,
  formatRanges,
  formatShortDate,
  formatTimeLabel,
  nextFreePeriod,
  normalizeRanges,
  totalWeeklyHours,
  validateRanges,
  type ScheduledAppointment,
  type TimeRange,
  type WeeklySchedule,
} from "@/lib/availabilityRanges";
import { DAY_LABELS, DAY_LABELS_SHORT, DAY_ORDER } from "@/lib/therapistAvailability";

// The weekly schedule editor, shared by the therapist's own screen and the
// admin's roster. One component rather than two, for the same reason
// authorCarePlanVersion is one function behind two doors: the rules that
// decide what a valid week looks like must not be able to differ between
// who is looking at it.
//
// It edits working *periods*. The rows the database stores are still one
// per hour -- the translation happens in availabilityRanges.ts on the way in
// and in the API route on the way out. Nobody clicks eighteen cells.

const WEEKDAYS = [1, 2, 3, 4, 5];

const START_HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR },
  (_, i) => DAY_START_HOUR + i
);
const END_HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR },
  (_, i) => DAY_START_HOUR + 1 + i
);

export type WeeklyScheduleEditorProps = {
  initialWeekly: WeeklySchedule;
  initialVersion: number;
  timezone: string | null;
  /** Where Save posts. The two routes take the same body apart from
   *  therapistId, which only the admin door sends. */
  endpoint: string;
  therapistId?: string;
  /** Future sessions belonging to this therapist, used only to warn about
   *  hours being removed underneath a booking. Nothing here ever changes an
   *  appointment. */
  appointments?: ScheduledAppointment[];
  /** Whose schedule the copy reads as -- the same `voice` split the intake
   *  screens use, because "your hours" is wrong on an admin's screen and
   *  "this therapist's hours" is wrong on the therapist's own. */
  voice: "self" | "clinician";
  therapistName?: string | null;
};

type ConflictState = {
  affected: { id: string; label: string; dayOfWeek: number; hour: number; dateKey: string }[];
  next: WeeklySchedule;
};

export default function WeeklyScheduleEditor({
  initialWeekly,
  initialVersion,
  timezone,
  endpoint,
  therapistId,
  appointments = [],
  voice,
  therapistName,
}: WeeklyScheduleEditorProps) {
  const router = useRouter();
  const [saved, setSaved] = useState<WeeklySchedule>(() => cloneWeekly(initialWeekly));
  const [draft, setDraft] = useState<WeeklySchedule>(() => cloneWeekly(initialWeekly));
  const [version, setVersion] = useState(initialVersion);
  const [copyOpenFor, setCopyOpenFor] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  // A `disabled` attribute lands a render too late to stop a double click --
  // same guard the suggestion controls use.
  const inFlight = useRef(false);

  const dirty = useMemo(() => !weeklySame(saved, draft), [saved, draft]);

  // The server is the only thing that decides a schedule is stored, so
  // fresh props -- a router.refresh(), another tab's save arriving over
  // realtime, the "reload the latest" button after a conflict -- have to
  // win over whatever this component believed the committed schedule was.
  //
  // Done as React's adjust-state-while-rendering pattern rather than an
  // effect: an effect would paint the stale schedule once first, and this
  // is a screen where the difference between what is stored and what is
  // shown is the whole point. Keyed on the schedule's contents, not the
  // prop's identity -- a Server Component hands back a fresh object every
  // render, and keying on that would reset an edit somebody is still
  // typing. A draft in progress is deliberately left alone; only the
  // committed baseline moves under it, so the unsaved-changes bar keeps
  // telling the truth.
  const incomingKey = `${DAY_ORDER.map((day) => rangesKey(initialWeekly[day] ?? [])).join("|")}#${initialVersion}`;
  const [baselineKey, setBaselineKey] = useState(incomingKey);
  if (incomingKey !== baselineKey) {
    setBaselineKey(incomingKey);
    setSaved(cloneWeekly(initialWeekly));
    setVersion(initialVersion);
    if (!dirty) setDraft(cloneWeekly(initialWeekly));
  }

  const dayErrors = useMemo(() => {
    const errors: Record<number, string> = {};
    for (const day of DAY_ORDER) {
      const message = validateRanges(draft[day] ?? []);
      if (message) errors[day] = message;
    }
    return errors;
  }, [draft]);
  const hasErrors = Object.keys(dayErrors).length > 0;

  // Losing a schedule somebody has just typed out is the one failure this
  // screen must not have. There is no route-change hook in the App Router
  // that can cancel a navigation, so this covers the reload/close case and
  // the sticky bar below covers the rest by never letting the state be
  // invisible.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const mutate = useCallback((day: number, next: TimeRange[]) => {
    setError(null);
    setSavedAt(null);
    setDraft((current) => {
      const updated = cloneWeekly(current);
      updated[day] = next;
      return updated;
    });
  }, []);

  function setWorking(day: number, working: boolean) {
    if (!working) {
      mutate(day, []);
      return;
    }
    const fallback = saved[day]?.length ? saved[day] : [{ startHour: 9, endHour: 13 }];
    mutate(day, fallback.map((r) => ({ ...r })));
  }

  function addPeriod(day: number) {
    const existing = draft[day] ?? [];
    const next = nextFreePeriod(existing);
    // Null means the day has no free hour left. The button is disabled in
    // that state, so this is belt and braces rather than a live path.
    if (!next) return;
    mutate(day, [...existing, next]);
  }

  function updatePeriod(day: number, index: number, patch: Partial<TimeRange>) {
    const existing = (draft[day] ?? []).map((r, i) => (i === index ? { ...r, ...patch } : r));
    // Nudging the other end when a start passes it keeps the common edit
    // ("actually she starts at 2") from failing validation on the way past.
    const fixed = existing.map((range, i) => {
      if (i !== index) return range;
      if (range.startHour >= range.endHour) {
        return patch.startHour !== undefined
          ? { startHour: range.startHour, endHour: Math.min(range.startHour + 1, DAY_END_HOUR) }
          : { startHour: Math.max(range.endHour - 1, DAY_START_HOUR), endHour: range.endHour };
      }
      return range;
    });
    mutate(day, fixed);
  }

  function removePeriod(day: number, index: number) {
    mutate(day, (draft[day] ?? []).filter((_, i) => i !== index));
  }

  function applyPreset(day: number, ranges: TimeRange[]) {
    mutate(day, ranges.map((r) => ({ ...r })));
  }

  function copyDayTo(day: number, targets: number[]) {
    const source = (draft[day] ?? []).map((r) => ({ ...r }));
    setError(null);
    setSavedAt(null);
    setDraft((current) => {
      const updated = cloneWeekly(current);
      for (const target of targets) updated[target] = source.map((r) => ({ ...r }));
      return updated;
    });
    setCopyOpenFor(null);
  }

  function discard() {
    setDraft(cloneWeekly(saved));
    setError(null);
    setConflict(null);
    setSavedAt(null);
  }

  async function submit(next: WeeklySchedule) {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setError(null);
    setConflict(null);

    const body: Record<string, unknown> = {
      days: DAY_ORDER.map((day) => ({
        day_of_week: day,
        ranges: normalizeRanges(next[day] ?? []),
      })),
      expectedVersion: version,
    };
    if (therapistId) body.therapistId = therapistId;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        version?: number;
      };
      if (!res.ok) {
        // Never show "Saved" for something the server refused, and never
        // move the displayed schedule off what is actually stored.
        setError(
          data.error ??
            "Couldn't save the schedule. Your previous hours are still active. Please try again."
        );
        setStale(res.status === 409);
        return;
      }
      setStale(false);
      setSaved(cloneWeekly(next));
      setDraft(cloneWeekly(next));
      if (typeof data.version === "number") setVersion(data.version);
      setSavedAt(Date.now());
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Your previous hours are still active.");
    } finally {
      setSaving(false);
      inFlight.current = false;
    }
  }

  function handleSave() {
    if (hasErrors || inFlight.current) return;
    const next = cloneWeekly(draft);
    const affected = findAppointmentsInRemovedHours(appointments, saved, next, {
      timeZone: timezone || "Asia/Kolkata",
      nowMs: Date.now(),
    });
    if (affected.length > 0) {
      setConflict({ affected, next });
      return;
    }
    void submit(next);
  }

  const zoneLabel = timezone || "Asia/Kolkata";
  const totalHours = totalWeeklyHours(draft);

  return (
    <div>
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-xs font-semibold text-slate-700">Schedule timezone: {zoneLabel}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {voice === "self"
            ? "All times below are your own local time."
            : `All times below are ${therapistName ? `${therapistName}'s` : "the therapist's"} local time, not yours.`}
        </p>
      </div>

      {stale && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-900">
            Someone else changed this schedule while you were editing.
          </p>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-lg bg-amber-200 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-300"
          >
            Reload the latest
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700"
        >
          {error}
        </div>
      )}

      <ul className="space-y-2">
        {DAY_ORDER.map((day) => {
          const ranges = draft[day] ?? [];
          const working = ranges.length > 0;
          const dayError = dayErrors[day];
          return (
            <li
              key={day}
              className={`rounded-xl border px-3 py-3 sm:px-4 ${
                dayError ? "border-red-300 bg-red-50/40" : "border-slate-200 bg-white"
              }`}
            >
              <div
                role="group"
                aria-label={describeDay(day, ranges)}
                className="flex flex-col gap-3 sm:flex-row sm:items-start"
              >
                <div className="flex items-center justify-between gap-3 sm:w-44 sm:shrink-0">
                  <span className="text-sm font-bold text-slate-800">{DAY_LABELS[day]}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={working}
                    aria-label={`${DAY_LABELS[day]} working`}
                    onClick={() => setWorking(day, !working)}
                    className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                      working
                        ? "bg-teal-700 text-white hover:bg-teal-800"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {working ? "Working" : "Off"}
                  </button>
                </div>

                <div className="min-w-0 flex-1">
                  {!working ? (
                    <p className="text-xs text-slate-400">
                      Not working. Turn on to add hours.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {ranges.map((range, index) => (
                        <div key={index} className="flex flex-wrap items-center gap-2">
                          <label className="sr-only" htmlFor={`start-${day}-${index}`}>
                            {DAY_LABELS[day]} period {index + 1} starts at
                          </label>
                          <select
                            id={`start-${day}-${index}`}
                            value={range.startHour}
                            onChange={(e) =>
                              updatePeriod(day, index, { startHour: Number(e.target.value) })
                            }
                            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-800"
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
                          <label className="sr-only" htmlFor={`end-${day}-${index}`}>
                            {DAY_LABELS[day]} period {index + 1} ends at
                          </label>
                          <select
                            id={`end-${day}-${index}`}
                            value={range.endHour}
                            onChange={(e) =>
                              updatePeriod(day, index, { endHour: Number(e.target.value) })
                            }
                            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-800"
                          >
                            {END_HOURS.map((hour) => (
                              <option key={hour} value={hour}>
                                {formatTimeLabel(hour)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removePeriod(day, index)}
                            aria-label={`Remove ${DAY_LABELS[day]} period ${index + 1}`}
                            className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      {dayError && (
                        <p className="text-[11px] font-semibold text-red-700">{dayError}</p>
                      )}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => addPeriod(day)}
                      disabled={nextFreePeriod(ranges) === null}
                      title={
                        nextFreePeriod(ranges) === null
                          ? `${DAY_LABELS[day]} has no free hours left.`
                          : undefined
                      }
                      className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
                    >
                      Add hours
                    </button>
                    {SCHEDULE_PRESETS.map((preset) => (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => applyPreset(day, preset.ranges)}
                        aria-label={`Set ${DAY_LABELS[day]} to ${preset.label}, ${formatRanges(preset.ranges)}`}
                        className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      >
                        {preset.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCopyOpenFor(copyOpenFor === day ? null : day)}
                      aria-expanded={copyOpenFor === day}
                      className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    >
                      Copy to…
                    </button>
                    {working && (
                      <button
                        type="button"
                        onClick={() => mutate(day, [])}
                        className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        Clear day
                      </button>
                    )}
                  </div>

                  {copyOpenFor === day && (
                    <CopyToDays
                      sourceDay={day}
                      onCopy={(targets) => copyDayTo(day, targets)}
                      onCancel={() => setCopyOpenFor(null)}
                    />
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {conflict && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3"
        >
          <p className="text-xs font-bold text-amber-900">
            {conflict.affected.length} existing{" "}
            {conflict.affected.length === 1 ? "session is" : "sessions are"}{" "}
            inside the hours you&apos;re removing.
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-amber-900">
            {conflict.affected.map((item) => (
              <li key={item.id}>
                {DAY_LABELS_SHORT[item.dayOfWeek]} {formatShortDate(item.dateKey)} ·{" "}
                {formatTimeLabel(item.hour)} · {item.label}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-amber-800">
            Changing hours will not cancel these sessions — they stay exactly as booked.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void submit(conflict.next)}
              disabled={saving}
              className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              Keep sessions and update hours
            </button>
            <button
              type="button"
              onClick={() => setConflict(null)}
              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-[11px] text-slate-500" aria-live="polite">
          {dirty
            ? "You have unsaved changes."
            : savedAt
              ? "Schedule saved."
              : `${totalHours} bookable ${totalHours === 1 ? "hour" : "hours"} a week.`}
        </p>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              type="button"
              onClick={discard}
              disabled={saving}
              className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              Discard changes
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving || hasErrors}
            className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-teal-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

function weeklySame(a: WeeklySchedule, b: WeeklySchedule): boolean {
  for (const day of DAY_ORDER) {
    const left = normalizeRanges(a[day] ?? []);
    const right = normalizeRanges(b[day] ?? []);
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (left[i].startHour !== right[i].startHour || left[i].endHour !== right[i].endHour) {
        return false;
      }
    }
  }
  return true;
}

/** "Copy Monday to…" -- an inline panel rather than a dialog, since the
 *  thing it is copying has to stay on screen while you choose. */
function CopyToDays({
  sourceDay,
  onCopy,
  onCancel,
}: {
  sourceDay: number;
  onCopy: (targets: number[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const targets = DAY_ORDER.filter((day) => day !== sourceDay);

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <fieldset>
        <legend className="text-[11px] font-bold text-slate-700">
          Copy {DAY_LABELS[sourceDay]}&apos;s hours to
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {targets.map((day) => (
            <label key={day} className="flex items-center gap-1.5 text-[11px] text-slate-700">
              <input
                type="checkbox"
                checked={selected.includes(day)}
                onChange={(e) =>
                  setSelected((current) =>
                    e.target.checked ? [...current, day] : current.filter((d) => d !== day)
                  )
                }
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              {DAY_LABELS[day]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onCopy(selected)}
          disabled={selected.length === 0}
          className="rounded-lg bg-teal-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-teal-800 disabled:opacity-40"
        >
          Copy to {selected.length || "…"}
        </button>
        <button
          type="button"
          onClick={() => onCopy(WEEKDAYS.filter((day) => day !== sourceDay))}
          className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
        >
          All weekdays
        </button>
        <button
          type="button"
          onClick={() => onCopy(DAY_ORDER.filter((day) => day !== sourceDay))}
          className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
        >
          Whole week
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function rangesKey(ranges: TimeRange[]): string {
  return normalizeRanges(ranges)
    .map((r) => `${r.startHour}-${r.endHour}`)
    .join(",");
}
