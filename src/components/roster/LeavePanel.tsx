"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusPill } from "@/components/dashboard/SurfaceCard";
import { describeLeave } from "@/lib/availabilityRanges";

// Leave, as its own thing rather than a fortnight of hourly exceptions.
//
// The weekly schedule is never touched by any of this: going on leave sets
// one flag, coming back clears it, and the hours underneath are exactly
// where they were. The dates and reason are recorded beside the flag so the
// roster can say when somebody is back -- they do not themselves make
// anybody available or unavailable, which is the rule schema.sql spells out.

export default function LeavePanel({
  endpoint,
  therapistId,
  onLeave,
  from,
  to,
  reason,
  voice,
  therapistName,
}: {
  endpoint: string;
  /** Only the admin door sends one; the therapist's route reads the session. */
  therapistId?: string;
  onLeave: boolean;
  from: string | null;
  to: string | null;
  reason: string | null;
  voice: "self" | "clinician";
  therapistName?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState(from ?? "");
  const [toDate, setToDate] = useState(to ?? "");
  const [reasonText, setReasonText] = useState(reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const who = voice === "self" ? "You" : therapistName || "This therapist";
  const summary = describeLeave({ onLeave, from, to, reason });

  async function submit(next: boolean) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(therapistId ? { therapistId } : {}),
          onLeave: next,
          from: next ? fromDate || null : null,
          to: next ? toDate || null : null,
          reason: next ? reasonText.trim() || null : null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Couldn't update time off. Nothing was changed.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Nothing was changed.");
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={onLeave ? "warn" : "good"} icon={onLeave ? "fa-plane" : "fa-check"}>
              {onLeave ? "On leave" : "Available for bookings"}
            </StatusPill>
            {summary && <span className="text-[11px] text-slate-500">{summary}</span>}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {onLeave
              ? `${who} ${voice === "self" ? "are" : "is"} unavailable for every slot until this is turned off. The weekly schedule underneath is untouched and comes straight back.`
              : `Time off takes ${voice === "self" ? "you" : "them"} off the roster completely, without changing the weekly schedule.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onLeave ? (
            <button
              type="button"
              onClick={() => void submit(false)}
              disabled={busy}
              className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {busy ? "Saving…" : "End time off"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-expanded={open}
              className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100"
            >
              {open ? "Cancel" : "Add time off"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[11px] font-semibold text-red-700">
          {error}
        </p>
      )}

      {open && !onLeave && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap gap-3">
            <div>
              <label htmlFor="leave-from" className="block text-[11px] font-bold text-slate-700">
                From (optional)
              </label>
              <input
                id="leave-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label htmlFor="leave-to" className="block text-[11px] font-bold text-slate-700">
                To (optional)
              </label>
              <input
                id="leave-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              />
            </div>
            <div className="min-w-[12rem] flex-1">
              <label htmlFor="leave-reason" className="block text-[11px] font-bold text-slate-700">
                Reason (optional)
              </label>
              <input
                id="leave-reason"
                type="text"
                maxLength={200}
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="Annual leave"
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Dates are for everyone&apos;s information — time off starts the moment this is saved and
            ends when it is turned off.
          </p>
          <button
            type="button"
            onClick={() => void submit(true)}
            disabled={busy}
            className="mt-3 rounded-lg bg-amber-100 px-4 py-2 text-xs font-bold text-amber-900 hover:bg-amber-200 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Start time off"}
          </button>
        </div>
      )}
    </div>
  );
}
