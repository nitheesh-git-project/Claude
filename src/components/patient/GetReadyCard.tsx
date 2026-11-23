"use client";

import { useState } from "react";
import Spinner from "@/components/system/Spinner";
import { formatClinicDateTime, formatClinicTime } from "@/lib/formatDateTime";
import type { PrepIcon, PrepItem } from "@/lib/sessionPrep";

const ICON: Record<PrepIcon, string> = {
  chair: "fa-chair",
  towel: "fa-scroll",
  path: "fa-person-walking",
  shoes: "fa-shoe-prints",
  helper: "fa-user-group",
  device: "fa-mobile-screen",
  space: "fa-up-down-left-right",
  toy: "fa-puzzle-piece",
  monitor: "fa-heart-pulse",
  medicine: "fa-pills",
};

/**
 * "Get ready for your session" (guided check, phase 2, P1): from two days
 * before a video session until it ends, the few things to have to hand, in
 * plain words with a picture each, and one button - "I'm ready" - that tells
 * the physiotherapist before the call. Nothing here is required: the
 * physiotherapist still checks the set-up on camera.
 */
export default function GetReadyCard({
  appointmentId,
  slotTime,
  items,
  readyAt: initialReadyAt,
}: {
  appointmentId: string;
  slotTime: string;
  items: readonly PrepItem[];
  readyAt: string | null;
}) {
  const [readyAt, setReadyAt] = useState<string | null>(initialReadyAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ready() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/patient/session-ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
      });
      const body = (await res.json().catch(() => ({}))) as { readyAt?: string; error?: string };
      if (res.ok && body.readyAt) setReadyAt(body.readyAt);
      else setError(body.error ?? "That didn't save. Please try again.");
    } catch {
      setError("We couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="get-ready-heading" data-testid="get-ready-card" className="mb-6 rounded-2xl border border-teal-200 bg-white p-4 sm:p-5">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-teal-800">Before your video session · {formatClinicDateTime(slotTime)}</p>
      <h2 id="get-ready-heading" className="mt-1 font-display text-lg font-bold text-slate-900">
        Get ready for your session
      </h2>
      <p className="mt-1 text-[15px] text-slate-700">Have these to hand, so the call can go straight to your exercises.</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2" data-testid="get-ready-items">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 rounded-xl bg-slate-50 px-3 py-2.5 text-[15px] leading-snug text-slate-900">
            <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-800">
              <i className={`fa-solid ${ICON[item.icon]} text-sm`} />
            </span>
            <span className="min-w-0 pt-1">{item.text}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {readyAt ? (
          <p role="status" data-testid="get-ready-done" className="flex min-h-[48px] items-center gap-2 text-[15px] font-semibold text-emerald-900">
            <i aria-hidden="true" className="fa-solid fa-circle-check text-emerald-700" />
            Thanks. Your physiotherapist can see you{"'"}re ready (you said so at {formatClinicTime(readyAt)}).
          </p>
        ) : (
          <>
            <button
              type="button"
              data-testid="get-ready-button"
              onClick={() => void ready()}
              disabled={busy}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-teal-700 px-5 text-base font-bold text-white hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {busy && <Spinner />}
              {busy ? "Saving…" : "I'm ready"}
            </button>
            <span className="text-sm text-slate-700">Missing something? That{"'"}s fine - your physiotherapist will help on the call.</span>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-red-800">
          {error}
        </p>
      )}
    </section>
  );
}
