"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Step = {
  targetId?: string; // DOM id (see DashboardShell's `nav-${item.id}`) — omitted for the intro step
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    title: "Welcome to your dashboard",
    body: "A quick tour of what's here — Skip anytime, this only shows once.",
  },
  { targetId: "nav-sessions", title: "Your Sessions", body: "Book, join, and review your appointments." },
  {
    targetId: "nav-session-packages",
    title: "Session Packages",
    body: "Bundles of sessions with one therapist, at a bundle price.",
  },
  {
    targetId: "nav-health-profile",
    title: "Health Profile",
    body: "Tell us about your condition, and see your therapist's pain assessments after each exam.",
  },
  { targetId: "nav-edit-profile", title: "Edit Profile", body: "Your contact and account details." },
];

type Rect = { top: number; left: number; width: number; height: number };

// Guided spotlight tour on a patient's first dashboard visit — steps
// through the actual sidebar nav items (see DashboardShell's `nav-${id}`
// ids) rather than a static "here's what's here" list. Skippable at any
// point (see the onboarding product decision); dismissing either way marks
// onboarding_seen_at so it never shows again. The separate
// "complete your health profile" reminder banner keeps nudging
// independently of this, based on intake status rather than this flag.
export default function OnboardingTour() {
  const [open, setOpen] = useState(true);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const router = useRouter();

  // Starts as the full list so server and client render the same thing on
  // first hydration (no document access here) — the effect below narrows
  // it to only steps whose target actually exists right now (a new
  // patient might not have a package yet, so "Session Packages" may not
  // be in the sidebar at all) in a normal post-mount client update.
  const [steps, setSteps] = useState<Step[]>(STEPS);
  useEffect(() => {
    // Filtering by DOM presence can only happen post-mount -- there's no
    // external system besides the DOM this could otherwise sync from.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSteps(STEPS.filter((s) => !s.targetId || document.getElementById(s.targetId)));
  }, []);

  const step = steps[Math.min(stepIndex, steps.length - 1)];

  useEffect(() => {
    if (!open || !step?.targetId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRect(null);
      return;
    }
    function measure() {
      const el = document.getElementById(step.targetId!);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, step]);

  if (!open || steps.length === 0) return null;

  function markSeen() {
    fetch("/api/patient/dismiss-onboarding", { method: "POST" }).catch(() => {});
  }

  function finish() {
    markSeen();
    setOpen(false);
    router.refresh();
  }

  function next() {
    if (stepIndex >= steps.length - 1) {
      finish();
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  function prev() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  const tooltipStyle = rect
    ? {
        top: Math.min(Math.max(rect.top - 8, 16), window.innerHeight - 200),
        left: rect.left + rect.width + 16,
      }
    : null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" />

      {rect && (
        <div
          className="pointer-events-none absolute rounded-xl ring-4 ring-teal-400"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}

      <div
        className={`absolute w-80 rounded-2xl bg-white p-5 shadow-xl ${
          tooltipStyle ? "" : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        }`}
        style={tooltipStyle ? { top: tooltipStyle.top, left: tooltipStyle.left } : undefined}
      >
        <p className="text-[11px] font-semibold text-teal-600 mb-1">
          {stepIndex + 1} of {steps.length}
        </p>
        <h2 className="text-base font-bold text-slate-800 mb-1">{step.title}</h2>
        <p className="text-sm text-slate-600 mb-4">{step.body}</p>
        <div className="flex items-center gap-3">
          <button onClick={finish} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
            Skip
          </button>
          <div className="ml-auto flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                onClick={prev}
                className="text-xs font-semibold text-slate-600 hover:text-slate-800 px-3 py-2"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              {stepIndex >= steps.length - 1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
