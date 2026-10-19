"use client";

import { useEffect, useState } from "react";
import { formatClinicDate } from "@/lib/formatDateTime";
import { SESSION_SUMMARY_FIELDS, type SessionSummaryText } from "@/lib/sessionSummary";

type Loaded = SessionSummaryText & { writtenBy: string | null; createdAt: string; updatedAt: string | null };

/**
 * The patient's summary of a session, in the admin session drawer -- what
 * the patient was told, read from /api/admin/session-summary. Rendered only
 * for a desk that manages Sessions (the route refuses the rest), and only on
 * a delivered session. Three outcomes kept apart: written, not written, and
 * "we couldn't check", which is never shown as "not written".
 */
export default function AdminSessionSummary({ appointmentId }: { appointmentId: string }) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error"; message: string } | { kind: "loaded"; summary: Loaded | null }
  >({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/session-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appointmentId }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) {
          setState({ kind: "error", message: data.error ?? "We couldn't load the patient's summary just now." });
          return;
        }
        setState({ kind: "loaded", summary: (data.summary as Loaded | null) ?? null });
      })
      .catch(() => {
        if (alive) setState({ kind: "error", message: "We couldn't load the patient's summary just now." });
      });
    return () => {
      alive = false;
    };
  }, [appointmentId, attempt]);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-bold text-slate-800">Summary for the patient</p>
        <p className="text-[11px] text-slate-500">What the patient reads - not the clinical note</p>
      </div>
      {state.kind === "loading" ? (
        <p className="text-slate-500">Loading…</p>
      ) : state.kind === "error" ? (
        <p className="text-amber-700">
          {state.message}{" "}
          <button
            type="button"
            onClick={() => {
              setState({ kind: "loading" });
              setAttempt((n) => n + 1);
            }}
            className="font-semibold text-teal-700 hover:underline"
          >
            Try again
          </button>
        </p>
      ) : !state.summary ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-3.5 py-3 text-slate-500">
          The therapist hasn&apos;t written a summary for this session.
        </p>
      ) : (
        <div className="space-y-2 rounded-xl border border-teal-100 bg-teal-50/60 p-3.5">
          <p className="text-[11px] text-slate-500">
            {`By ${state.summary.writtenBy ?? "the therapist"} · ${formatClinicDate(state.summary.createdAt)}`}
            {state.summary.updatedAt ? ` · edited ${formatClinicDate(state.summary.updatedAt)}` : ""}
          </p>
          {SESSION_SUMMARY_FIELDS.map((field) => {
            const text = state.summary?.[field.bodyKey];
            if (!text) return null;
            return (
              <div key={field.key}>
                <p className="font-semibold text-slate-700">{field.patientLabel}</p>
                <p className="whitespace-pre-line text-slate-700">{text}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
