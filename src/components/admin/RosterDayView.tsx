"use client";

import { useEffect, useRef, useState } from "react";
import DateField from "@/components/system/DateField";
import Spinner from "@/components/system/Spinner";
import SpecialtyChip from "@/components/SpecialtyChip";
import { EmptyState, StatusPill } from "@/components/dashboard/SurfaceCard";
import { formatHourLabel } from "@/lib/therapistAvailability";
import { formatRanges } from "@/lib/availabilityRanges";
import { summariseRosterDay, type RosterDayEntry } from "@/lib/rosterDay";

// The roster, read the other way round: one date, every therapist.
//
// The screen next door answers "what does this therapist normally work", which
// is the right question when you are editing somebody's hours and the wrong one
// when a patient is on the phone asking for Thursday afternoon. Answering that
// meant opening each therapist in turn and holding the answer in your head.
//
// A **view switch, not a second sidebar entry** -- the same rows arranged
// differently, which is the rule this codebase already follows for Sessions
// (List/Calendar) and the therapist's My Patients (Patients/Programmes).
//
// Deliberately read-only. Nothing here books, moves or frees an hour: the
// roster is the clinic's planning record, and it does not filter the patient's
// own picker. A free hour on this screen means "nobody has it and she works
// then", never "sell it".
export default function RosterDayView({ todayKey }: { todayKey: string }) {
  const [dateKey, setDateKey] = useState(todayKey);
  const [entries, setEntries] = useState<RosterDayEntry[] | null>(null);
  // Starts true and is cleared when the first answer lands. The spinner is
  // *not* raised inside the effect below -- setting state synchronously in an
  // effect body is a cascading render, so the busy state is set where the
  // change actually originates: here on mount, and in the date handler.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // Only the newest request may write. Tapping through three dates faster than
  // the server answers would otherwise paint whichever reply happened to land
  // last, which is a screen showing one date under another date's heading.
  const requestId = useRef(0);

  // The fetch lives in the effect rather than in a callback the effect calls,
  // so every state write here sits after an `await` -- setting state
  // synchronously in an effect body is a cascading render, which the hook lint
  // refuses and is right to.
  useEffect(() => {
    const id = ++requestId.current;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/admin/roster-day", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: dateKey }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          entries?: RosterDayEntry[];
          error?: string;
        };
        // Only the newest request may write. Tapping through three dates faster
        // than the server answers would otherwise paint whichever reply landed
        // last, which is one date's roster under another date's heading.
        if (cancelled || id !== requestId.current) return;
        if (!res.ok) {
          // A read that failed is not a day with nobody working -- opposite
          // facts that would render identically as an empty list.
          setError(data.error ?? "Couldn't read that day's roster. Please try again.");
          setEntries(null);
          return;
        }
        setError(null);
        setEntries(data.entries ?? []);
      } catch {
        if (cancelled || id !== requestId.current) return;
        setError("Couldn't reach the server. Please try again.");
        setEntries(null);
      } finally {
        if (!cancelled && id === requestId.current) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dateKey]);

  const summary = entries ? summariseRosterDay(entries) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1 text-xs">
          <span className="font-semibold text-slate-500">Date</span>
          <DateField
            value={dateKey}
            onChange={(next) => {
              if (!next) return;
              setOpenId(null);
              setLoading(true);
              setError(null);
              setDateKey(next);
            }}
            ariaLabel="Roster date"
            clearable={false}
            className="w-44"
          />
        </div>
        {summary && (
          <p className="text-xs text-slate-600" aria-live="polite">
            <strong className="text-slate-900">{summary.available}</strong> working ·{" "}
            <strong className="text-slate-900">{summary.freeHours}</strong> free{" "}
            {summary.freeHours === 1 ? "hour" : "hours"} ·{" "}
            <strong className="text-slate-900">{summary.bookedHours}</strong> booked
            {summary.onLeave > 0 && <> · {summary.onLeave} on leave</>}
          </p>
        )}
        {loading && <Spinner />}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          {error}
        </p>
      )}

      {entries && entries.length === 0 && !error && (
        <EmptyState
          icon="fa-user-doctor"
          title="No therapists yet"
          body="Approved therapists appear here with their hours for the day you pick."
        />
      )}

      {entries && entries.length > 0 && (
        <ul aria-label="Therapists on this date" className="space-y-2">
          {entries.map((entry) => {
            const open = openId === entry.therapist.id;
            const working = entry.hours.filter((h) => h.state !== "off");
            return (
              <li
                key={entry.therapist.id}
                className={`rounded-xl border px-3 py-3 sm:px-4 ${
                  entry.available ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"
                }`}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : entry.therapist.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-800">
                      {entry.therapist.fullName ?? "Unnamed"}
                    </span>
                    <SpecialtyChip specialization={entry.therapist.specialization} size="xs" />
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    {/* Not rostered and on leave say different things, because
                        they are different pieces of work: one is a schedule to
                        fill in, the other a person who is away. */}
                    {entry.reason === "on_leave" ? (
                      <StatusPill tone="warn">On leave</StatusPill>
                    ) : entry.reason === "not_rostered" ? (
                      <StatusPill tone="neutral">Not working this day</StatusPill>
                    ) : (
                      <>
                        <StatusPill tone="good">
                          {entry.freeCount} free
                        </StatusPill>
                        <span className="text-slate-500">
                          {entry.bookedCount} booked · {formatRanges(rangesOf(entry))}
                        </span>
                      </>
                    )}
                    <i
                      className={`fa-solid ${open ? "fa-chevron-up" : "fa-chevron-down"} text-slate-500`}
                      aria-hidden="true"
                    ></i>
                  </span>
                </button>

                {open && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    {working.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        {entry.reason === "on_leave"
                          ? "Away for the whole day. Their weekly schedule is untouched - time off never clears it."
                          : "No working hours on this date. Their weekly schedule and exceptions decide this."}
                      </p>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5">
                        {working.map((slot) => (
                          <li key={slot.hour}>
                            <span
                              className={`inline-flex flex-col rounded-lg border px-2 py-1 text-[11px] ${
                                slot.state === "booked"
                                  ? "border-slate-300 bg-slate-100 text-slate-700"
                                  : "border-teal-300 bg-teal-50 text-teal-800"
                              }`}
                            >
                              <span className="font-bold">{formatHourLabel(slot.hour)}</span>
                              <span className={slot.state === "booked" ? "" : "font-semibold"}>
                                {slot.state === "booked"
                                  ? slot.appointment?.sessionCode
                                    ? `${slot.appointment.label} · ${slot.appointment.sessionCode}`
                                    : slot.appointment?.label ?? "Booked"
                                  : "Free"}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The working hours as periods, so the collapsed row reads "10 AM - 1 PM"
 *  rather than eighteen chips. Rebuilt from the strip itself so the summary
 *  line and the hours under it can never disagree. */
function rangesOf(entry: RosterDayEntry) {
  const ranges: { startHour: number; endHour: number }[] = [];
  for (const slot of entry.hours) {
    if (slot.state === "off") continue;
    const last = ranges[ranges.length - 1];
    if (last && last.endHour === slot.hour) last.endHour = slot.hour + 1;
    else ranges.push({ startHour: slot.hour, endHour: slot.hour + 1 });
  }
  return ranges;
}
