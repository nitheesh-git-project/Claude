"use client";

import { useState } from "react";
import Link from "next/link";

// One-time welcome modal on a patient's first dashboard visit —
// skippable by design (see the onboarding product decision): it never
// blocks the dashboard, and dismissing it (either button) just marks
// onboarding_seen_at so it doesn't show again. The separate
// "complete your health profile" reminder banner keeps nudging
// independently of this, based on intake status rather than this flag.
export default function OnboardingWelcomeModal() {
  const [open, setOpen] = useState(true);
  const [dismissing, setDismissing] = useState(false);

  if (!open) return null;

  // Fire-and-forget: don't block the Skip button or the Health Profile
  // link's own navigation on this request finishing.
  function markSeen() {
    setDismissing(true);
    fetch("/api/patient/dismiss-onboarding", { method: "POST" }).catch(() => {});
  }

  function handleSkip() {
    markSeen();
    setOpen(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-slate-800 mb-1">Welcome to your dashboard</h2>
        <p className="text-sm text-slate-600 mb-4">A quick tour of what&apos;s here:</p>
        <ul className="space-y-2 mb-5 text-sm text-slate-600">
          <li>
            <span className="font-semibold text-slate-800">Your Sessions</span> — book, join, and review
            appointments.
          </li>
          <li>
            <span className="font-semibold text-slate-800">Session Packages</span> — bundles of sessions with
            one therapist.
          </li>
          <li>
            <span className="font-semibold text-slate-800">Health Profile</span> — tell us about your
            condition, and see your therapist&apos;s pain assessments after each exam.
          </li>
          <li>
            <span className="font-semibold text-slate-800">Edit Profile</span> — your contact and account
            details.
          </li>
        </ul>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSkip}
            disabled={dismissing}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-60"
          >
            Skip for now
          </button>
          <Link
            href="/patient/dashboard/health-profile"
            onClick={markSeen}
            className="ml-auto bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          >
            Fill your Health Profile
          </Link>
        </div>
      </div>
    </div>
  );
}
