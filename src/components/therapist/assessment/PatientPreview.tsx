"use client";

import { useEffect, useState } from "react";
import type { LiveDisplayText, LiveDisplayView } from "@/lib/assessmentRun";
import { clockShown } from "@/lib/companionScreen";
import type { PatientControl } from "@/lib/cockpit";
import { useToast } from "@/lib/toast";

export type PreviewStatus = "idle" | "sending" | "live" | "failed";

const PATIENT_SCREEN_PATH = "/patient/dashboard/session";

/**
 * "What the patient sees": a small live preview of the display-only screen,
 * the four things the physiotherapist can tell it (get ready, go, done, rest;
 * only a phase and whether the clock starts, never words), and how to put the
 * screen in front of the patient: share this one, or have them open the
 * page on a second device. Nothing on the patient's own screen can be pressed.
 */
export default function PatientPreview({
  firstName,
  text,
  view,
  serverOffsetMs,
  controls,
  activeControl,
  status,
  onControl,
  onRetry,
}: {
  firstName: string;
  text: LiveDisplayText;
  view: LiveDisplayView | null;
  serverOffsetMs: number;
  controls: PatientControl[];
  activeControl: string | null;
  status: PreviewStatus;
  onControl: (control: PatientControl) => void;
  onRetry: () => void;
}) {
  const { show } = useToast();
  // The mini clock reads the same server-corrected time as the patient's own
  // screen. Read in an effect, never during render.
  const [now, setNow] = useState<number | null>(null);
  const ticking = !!view?.clock;
  useEffect(() => {
    if (!ticking) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [ticking]);
  const clock = view && now !== null ? clockShown(view, now, serverOffsetMs) : null;

  async function copyLink() {
    const url = `${window.location.origin}${PATIENT_SCREEN_PATH}`;
    try {
      await navigator.clipboard.writeText(url);
      show("Link to the patient screen copied");
    } catch {
      show(url);
    }
  }

  return (
    <section aria-labelledby="preview-heading" className="rounded-2xl bg-[#0f172a] p-3.5 text-white">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 id="preview-heading" className="font-display text-base font-bold">
          What {firstName} sees
        </h3>
        <span
          role="status"
          data-testid="preview-status"
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            status === "failed" ? "bg-red-900 text-red-100" : "bg-[#1e293b] text-blue-200"
          }`}
        >
          {status === "sending" ? "Updating" : status === "failed" ? "Not updated" : "Live"}
        </span>
      </div>

      <div data-testid="preview-card" className="rounded-xl bg-[#1e293b] p-4 text-center">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-300">{text.progress}</div>
        <div className="mt-1.5 font-display text-xl font-bold leading-snug">{text.line}</div>
        {text.sub && <div className="mt-1 text-sm text-slate-300">{text.sub}</div>}
        {clock && (
          <div className="mt-2" aria-hidden="true">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300">{clock.label}</div>
            <div className={`font-display text-4xl font-extrabold leading-none ${clock.tone === "ready" ? "text-amber-300" : clock.tone === "finished" ? "text-teal-300" : "text-white"}`}>
              {clock.text}
            </div>
          </div>
        )}
      </div>

      <div role="group" aria-label={`Show on ${firstName}'s screen`} className="mt-3 grid grid-cols-2 gap-2">
        {controls.map((c) => (
          <button
            key={c.key}
            type="button"
            data-testid={`patient-${c.key}`}
            aria-pressed={activeControl === c.key}
            onClick={() => onControl(c)}
            className={`min-h-[44px] rounded-lg border px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a] ${
              activeControl === c.key ? "border-teal-300 bg-teal-700 text-white" : "border-slate-600 bg-[#334155] text-white hover:border-teal-300"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {status === "failed" && (
        <p role="alert" className="mt-2 text-sm text-red-200">
          {firstName}{"'"}s screen could not be updated.{" "}
          <button type="button" onClick={onRetry} className="min-h-[44px] font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300">
            Try again
          </button>
        </p>
      )}

      <p className="mt-3 text-[13px] leading-relaxed text-slate-300">
        <strong className="text-white">Open the patient screen.</strong> {firstName} only watches; nothing on it can be pressed. Ask them to open{" "}
        <span className="font-semibold text-white [overflow-wrap:anywhere]">{PATIENT_SCREEN_PATH}</span> on a second device or window, signed in as
        themselves. It follows this page by itself.
      </p>
      <button
        type="button"
        data-testid="open-patient-screen"
        onClick={() => void copyLink()}
        className="mt-2 min-h-[44px] rounded-lg border border-slate-600 bg-[#334155] px-3 text-sm font-semibold text-white hover:border-teal-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
      >
        <i aria-hidden="true" className="fa-solid fa-copy mr-1.5" />
        Copy the patient screen link
      </button>
    </section>
  );
}
