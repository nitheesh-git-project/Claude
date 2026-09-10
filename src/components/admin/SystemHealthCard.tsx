"use client";

import { useId, useState, type ReactNode } from "react";
import { StatusPill } from "@/components/dashboard/SurfaceCard";
import { STATUS_LABEL, type HealthCheck, type HealthStatus } from "@/lib/systemHealth";

// One check, rendered the same way as every other check.
//
// The screen this replaced gave each subsystem its own shape: a paragraph
// here, a bordered warning there, a list somewhere else. An owner had to
// learn five layouts to read one screen, and could not compare two panels
// without re-reading both. So the card is fixed -- status word, one line,
// what to do, then the rows -- and only the words inside it change.
//
// The teaching half (what this watches, and one thing that would go wrong)
// sits behind an (i) rather than on the card. It is what somebody needs the
// first time they open this screen and never again, and printing it inline
// is what made the old screen a wall of text.

const TONE: Record<HealthStatus, { pill: string; card: string; icon: string; dot: string }> = {
  healthy: {
    pill: "good",
    card: "border-slate-200 bg-white",
    icon: "fa-circle-check",
    dot: "text-emerald-500",
  },
  attention: {
    pill: "warn",
    card: "border-amber-300 bg-amber-50/60",
    icon: "fa-triangle-exclamation",
    dot: "text-amber-500",
  },
  broken: {
    pill: "bad",
    card: "border-red-300 bg-red-50/70",
    icon: "fa-circle-exclamation",
    dot: "text-red-500",
  },
  off: {
    pill: "neutral",
    card: "border-slate-200 bg-white",
    icon: "fa-circle-minus",
    dot: "text-slate-400",
  },
  unknown: {
    pill: "neutral",
    card: "border-slate-200 bg-white",
    icon: "fa-circle-question",
    dot: "text-slate-400",
  },
};

export default function SystemHealthCard({
  check,
  children,
}: {
  check: HealthCheck;
  /** The rows behind the count, if this check has any. */
  children?: ReactNode;
}) {
  const [showInfo, setShowInfo] = useState(false);
  const infoId = useId();
  const tone = TONE[check.status];

  return (
    <section
      // Jump chips in the verdict strip scroll to this. scroll-mt keeps the
      // heading clear of the dashboard's sticky header.
      id={`health-${check.id}`}
      className={`scroll-mt-24 rounded-2xl border shadow-sm ${tone.card}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <i aria-hidden className={`fa-solid ${tone.icon} text-sm ${tone.dot}`} />
            <h3 className="font-display text-base font-bold text-slate-800">{check.label}</h3>
            <StatusPill tone={tone.pill}>{STATUS_LABEL[check.status]}</StatusPill>
          </div>
          <p className="mt-1.5 max-w-xl text-xs leading-relaxed text-slate-600">
            {check.headline}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          aria-expanded={showInfo}
          aria-controls={infoId}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 transition hover:border-teal-500 hover:text-teal-700"
        >
          {/* The label says which check, because a screen reader hearing
              five "What is this?" buttons in a row learns nothing. */}
          <span className="sr-only">{`What is ${check.label}?`}</span>
          <i aria-hidden className="fa-solid fa-info text-[11px]" />
        </button>
      </div>

      {check.fix.length > 0 && (
        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              How to fix it yourself
            </p>
            <ol className="mt-2 space-y-1.5">
              {check.fix.map((step, i) => (
                <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-700">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                    {i + 1}
                  </span>
                  <span className="min-w-0 break-words">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {showInfo && (
        <div
          id={infoId}
          className="border-t border-slate-200 bg-slate-50/80 px-5 py-4 sm:px-6"
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            What this watches
          </p>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-600">{check.what}</p>
          <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            For example
          </p>
          <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-600">{check.example}</p>
        </div>
      )}

      {children && <div className="border-t border-slate-200 px-5 py-4 sm:px-6">{children}</div>}
    </section>
  );
}
