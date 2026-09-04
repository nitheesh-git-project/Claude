"use client";

import { useRef, useState } from "react";
import { useRouter } from "@/lib/useRouter";
import {
  bookableHoursForDate,
  earliestBookableDateKey,
  leadTimeMsFromHours,
} from "@/lib/bookingSlots";
import BookingCalendar from "@/components/booking/BookingCalendar";
import {
  BOOKING_OPTION_CELL_COMPACT,
  BOOKING_OPTION_GRID_COMPACT,
  bookingCellClass,
} from "@/lib/bookingCellStyles";
import { formatHourRange } from "@/lib/therapistAvailability";
import { debugNow } from "@/lib/debugNow";
import { suggestionState } from "@/lib/sessionSuggestions";

export type PendingSuggestion = {
  id: string;
  slotTime: string;
  note: string | null;
};

/**
 * The therapist's half of a suggested session: pick a time, send it, or take
 * back one the patient hasn't answered yet.
 *
 * Two things this component is careful about, both of which are the same
 * problem -- a request that is slower than the person pressing the button:
 *
 * 1. The submit is guarded by a ref, not only by disabled state. A disabled
 *    attribute is applied on the next render, which a fast double-click can
 *    beat; the ref is set synchronously in the handler, so the second click
 *    returns immediately. The database's one-pending-per-purchase index is
 *    the real guarantee, and this stops the therapist ever seeing the error
 *    it produces.
 * 2. Nothing is cleared optimistically. The dialog stays open, with its
 *    values, until the server confirms -- so a request that fails on a bad
 *    connection leaves the therapist exactly where they were, able to retry,
 *    rather than closing over a suggestion that was never created.
 */
export default function SuggestSessionControl({
  purchaseId,
  patientName,
  sessionsRemaining,
  leadTimeHours,
  pending,
}: {
  purchaseId: string;
  patientName: string;
  sessionsRemaining: number;
  leadTimeHours: number;
  pending: PendingSuggestion | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [hour, setHour] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const nowMs = debugNow();
  const leadMs = leadTimeMsFromHours(leadTimeHours);

  // Seeded when the picker is opened rather than in an effect: the earliest
  // bookable slot is a function of the clock at that moment, so computing it
  // on open is both simpler and more correct than syncing it afterwards.
  function openPicker() {
    if (!date) {
      const earliest = earliestBookableDateKey(nowMs, leadMs);
      if (earliest) {
        setDate(earliest);
        setHour(bookableHoursForDate(earliest, nowMs, leadMs)[0] ?? "");
      }
    }
    setOpen(true);
  }

  const hours = date ? bookableHoursForDate(date, nowMs, leadMs) : [];

  async function send() {
    // Synchronous guard -- see the component comment.
    if (inFlight.current) return;
    if (!date || hour === "") {
      setError("Pick a date and time.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/therapist/suggest-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseId,
          slotTime: `${date}T${String(hour).padStart(2, "0")}:00`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not send that suggestion. Try again.");
        return;
      }
      setOpen(false);
      setNote("");
      router.refresh();
    } catch {
      // Network failure, not a server answer: the suggestion may or may not
      // have been created, so say so rather than guessing. A retry is safe
      // either way -- a duplicate is refused by the unique index.
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function withdraw() {
    if (inFlight.current || !pending) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/therapist/withdraw-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId: pending.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not withdraw that suggestion.");
        return;
      }
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (pending) {
    const state = suggestionState(
      { status: "pending", slot_time: pending.slotTime },
      nowMs,
      leadMs
    );
    return (
      <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-teal-800">
          {state === "lapsed" ? "Suggestion lapsed" : "Waiting on the patient"}
        </p>
        <p className="mt-1 text-xs text-teal-900">
          {new Date(pending.slotTime).toLocaleString()}
        </p>
        {state === "lapsed" && (
          <p className="mt-1 text-[11px] text-teal-800">
            Too close to book now. Withdraw it to suggest another time.
          </p>
        )}
        <button
          type="button"
          onClick={withdraw}
          disabled={busy}
          className="mt-2 rounded-lg border border-teal-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-teal-800 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Withdrawing…" : "Withdraw suggestion"}
        </button>
        {error && <p className="mt-2 text-[11px] font-semibold text-rose-700">{error}</p>}
      </div>
    );
  }

  if (sessionsRemaining <= 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPicker}
        className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-50"
      >
        Suggest next session
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-900">
        Suggest a time to {patientName}
      </p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        {sessionsRemaining} session{sessionsRemaining === 1 ? "" : "s"} left. They confirm before
        anything is booked.
      </p>

      {/* The patient's own calendar and hour cells, compact. A therapist
          proposing a time and a patient accepting it must be looking at the
          same control -- a native date box beside a dropdown offered dates
          the patient's screen would then refuse, and read as a different
          product besides. */}
      <div className="mt-2.5 space-y-2">
        <BookingCalendar
          compact
          selectedDateKey={date}
          onSelect={(nextDate) => {
            setDate(nextDate);
            const nextHours = bookableHoursForDate(nextDate, nowMs, leadMs);
            // Keep the hour when the new day still offers it, so moving a
            // proposal a week later does not silently change the time too.
            setHour((prev) =>
              prev !== "" && nextHours.includes(prev) ? prev : (nextHours[0] ?? "")
            );
          }}
          nowMs={nowMs}
          leadTimeMs={leadMs}
          autoSelected={false}
        />
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
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
                  onClick={() => setHour(h)}
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
      </div>

      <label className="mt-2 block">
        <span className="mb-1 block text-[11px] font-semibold text-slate-700">
          Note <span className="font-normal text-slate-400">(optional)</span>
        </span>
        <input
          type="text"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Same time next week works well for your knee"
          className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs"
        />
      </label>

      {error && <p className="mt-2 text-[11px] font-semibold text-rose-700">{error}</p>}

      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={send}
          disabled={busy || hours.length === 0}
          className="rounded-lg bg-teal-700 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Sending…" : "Send suggestion"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
