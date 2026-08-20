"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { leadTimeMsFromHours } from "@/lib/bookingSlots";
import { debugNow } from "@/lib/debugNow";
import { suggestionState } from "@/lib/sessionSuggestions";

export type PatientSuggestion = {
  id: string;
  slotTime: string;
  note: string | null;
  therapistName: string;
  packageTitle: string;
  sessionNumber: number;
  sessionCount: number;
};

/**
 * "Your therapist suggested a time." Accept books it; decline clears it.
 *
 * The same two protections as the therapist's side, for the same reason --
 * the person is faster than the request:
 *
 * - A synchronous ref guard, so a double-tapped Accept sends one request.
 *   The route is idempotent regardless (a second accept returns the same
 *   appointment rather than booking twice), but a patient should never see
 *   two requests race over their session.
 * - Nothing is hidden optimistically. The card stays until the server has
 *   answered, so a failed request on a weak connection leaves the patient
 *   looking at the suggestion they still have to answer, not at a card that
 *   vanished without booking anything.
 *
 * A suggestion whose slot has come too close to book shows as lapsed and
 * offers no buttons -- computed from the slot, never a stored status, since
 * nothing sweeps these.
 */
export default function PatientSuggestionCard({
  suggestion,
  leadTimeHours,
}: {
  suggestion: PatientSuggestion;
  leadTimeHours: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);
  const inFlight = useRef(false);

  const state = suggestionState(
    { status: "pending", slot_time: suggestion.slotTime },
    debugNow(),
    leadTimeMsFromHours(leadTimeHours)
  );

  async function respond(answer: "accept" | "decline") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(answer);
    setError(null);
    try {
      const res = await fetch("/api/patient/respond-suggestion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId: suggestion.id, answer }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save your answer. Try again.");
        return;
      }
      setDone(answer === "accept" ? "accepted" : "declined");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  const when = new Date(suggestion.slotTime).toLocaleString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

  if (done) {
    return (
      <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5">
        <p className="text-sm font-bold text-teal-900">
          {done === "accepted" ? "Booked" : "Declined"}
        </p>
        <p className="mt-1 text-xs text-teal-800">
          {done === "accepted"
            ? `${when} is in your sessions now. The calendar invite is on its way.`
            : "Your therapist will suggest another time."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
        Suggested by your therapist
      </p>
      <p className="font-display mt-1.5 text-lg font-bold text-slate-900">{when}</p>
      <p className="mt-1 text-xs text-slate-500">
        {suggestion.therapistName} · session {suggestion.sessionNumber} of{" "}
        {suggestion.sessionCount} · {suggestion.packageTitle}
      </p>
      {suggestion.note && (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs italic leading-relaxed text-slate-700">
          “{suggestion.note}”
        </p>
      )}

      {state === "lapsed" ? (
        <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          This time is too close now to book. Your therapist can suggest another, or you can pick
          one yourself from your package below.
        </p>
      ) : (
        <>
          <p className="mt-3 text-[11px] text-slate-500">
            Already paid for as part of your package — accepting just books the time.
          </p>
          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 p-2.5 text-xs font-semibold text-rose-700">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => respond("accept")}
              disabled={busy !== null}
              className="rounded-xl bg-teal-700 px-5 py-2.5 text-xs font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "accept" ? "Booking…" : "Accept this time"}
            </button>
            <button
              type="button"
              onClick={() => respond("decline")}
              disabled={busy !== null}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === "decline" ? "Declining…" : "Decline"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
