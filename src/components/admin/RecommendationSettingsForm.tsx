"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminSettings } from "@/lib/adminSettings";

async function saveSetting(key: string, value: boolean | number) {
  const res = await fetch("/api/admin/update-setting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not save. Please try again.");
}

/**
 * The three settings behind a therapist's recommendation.
 *
 * They existed as columns before this form did, which meant the one control
 * deciding whether a patient is shown a recommendation at all could only be
 * changed in the database. A rule nobody can find is a rule nobody can turn
 * off when it is wrong, and this one holds up a patient who has just
 * finished a session.
 */
export default function RecommendationSettingsForm({
  settings,
}: {
  settings: AdminSettings;
}) {
  const router = useRouter();

  const [optimisticApproval, setOptimisticApproval] = useOptimistic(
    settings.carePlanRequiresApproval
  );
  const [isApprovalPending, startApprovalTransition] = useTransition();
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const [expiryInput, setExpiryInput] = useState(String(settings.carePlanDefaultExpiryDays));
  const [isExpiryPending, startExpiryTransition] = useTransition();
  const [expiryError, setExpiryError] = useState<string | null>(null);
  const [expirySaved, setExpirySaved] = useState(false);

  const [frequencyInput, setFrequencyInput] = useState(
    String(settings.carePlanMaxFrequencyPerWeek)
  );
  const [isFrequencyPending, startFrequencyTransition] = useTransition();
  const [frequencyError, setFrequencyError] = useState<string | null>(null);
  const [frequencySaved, setFrequencySaved] = useState(false);

  function handleToggleApproval() {
    const next = !optimisticApproval;
    setApprovalError(null);
    startApprovalTransition(async () => {
      setOptimisticApproval(next);
      try {
        await saveSetting("care_plan_requires_approval", next);
        router.refresh();
      } catch (e) {
        setApprovalError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  function handleSaveExpiry() {
    const days = Math.max(1, Math.floor(Number(expiryInput) || 1));
    setExpiryError(null);
    setExpirySaved(false);
    startExpiryTransition(async () => {
      try {
        await saveSetting("care_plan_default_expiry_days", days);
        setExpiryInput(String(days));
        setExpirySaved(true);
        router.refresh();
      } catch (e) {
        setExpiryError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  function handleSaveFrequency() {
    const n = Math.min(7, Math.max(1, Math.floor(Number(frequencyInput) || 1)));
    setFrequencyError(null);
    setFrequencySaved(false);
    startFrequencyTransition(async () => {
      try {
        await saveSetting("care_plan_max_frequency_per_week", n);
        setFrequencyInput(String(n));
        setFrequencySaved(true);
        router.refresh();
      } catch (e) {
        setFrequencyError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-800">
              Approve recommendations before the patient sees them
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              A therapist&apos;s recommendation is the only way a patient can buy a course of
              treatment, so it is a bill as well as a clinical note. With this on, one lands
              in Sessions → Recommendations and the patient is shown nothing until an admin
              decides. With it off, it reaches the patient the moment the therapist saves.
            </p>
            <p className="text-xs text-slate-400 mt-2 max-w-md">
              Leaving it on costs the patient a wait after a session that has just ended.
              Watch that queue.
            </p>
          </div>
          <button
            onClick={handleToggleApproval}
            disabled={isApprovalPending}
            className={`text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60 ${
              optimisticApproval
                ? "bg-teal-700 hover:bg-teal-800 text-white"
                : "bg-slate-200 hover:bg-slate-300 text-slate-800"
            }`}
          >
            {optimisticApproval ? "Required" : "Not required"}
          </button>
        </div>
        {approvalError && <p className="text-[11px] text-red-600 mt-2">{approvalError}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800">How long a recommendation holds</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md">
          How long the patient has to answer. Counted from when the recommendation is
          approved, not from when the therapist wrote it — otherwise the ones the clinic
          took longest over would reach the patient with the least time left on them.
        </p>
        <div className="flex items-center gap-3 mt-3">
          <input
            type="number"
            min={1}
            value={expiryInput}
            onChange={(e) => {
              setExpiryInput(e.target.value);
              setExpirySaved(false);
            }}
            className="w-24 text-xs px-3 py-2 rounded-lg border border-slate-300"
          />
          <span className="text-xs text-slate-500">days</span>
          <button
            onClick={handleSaveExpiry}
            disabled={isExpiryPending}
            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
          >
            {isExpiryPending ? "Saving..." : "Save"}
          </button>
          {expirySaved && <span className="text-[11px] text-teal-700 font-semibold">Saved.</span>}
        </div>
        {expiryError && <p className="text-[11px] text-red-600 mt-2">{expiryError}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800">Most sessions a week a clinician may ask for</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md">
          A ceiling over the programme&apos;s own rule, whichever is lower. It stops a
          recommendation being written that the booking rules would then refuse — which the
          patient would discover at checkout rather than the therapist at writing.
        </p>
        <div className="flex items-center gap-3 mt-3">
          <input
            type="number"
            min={1}
            max={7}
            value={frequencyInput}
            onChange={(e) => {
              setFrequencyInput(e.target.value);
              setFrequencySaved(false);
            }}
            className="w-24 text-xs px-3 py-2 rounded-lg border border-slate-300"
          />
          <span className="text-xs text-slate-500">a week</span>
          <button
            onClick={handleSaveFrequency}
            disabled={isFrequencyPending}
            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
          >
            {isFrequencyPending ? "Saving..." : "Save"}
          </button>
          {frequencySaved && (
            <span className="text-[11px] text-teal-700 font-semibold">Saved.</span>
          )}
        </div>
        {frequencyError && <p className="text-[11px] text-red-600 mt-2">{frequencyError}</p>}
      </div>
    </div>
  );
}
