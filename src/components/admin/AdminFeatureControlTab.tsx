"use client";

import { useState } from "react";
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

export default function AdminFeatureControlTab({ settings }: { settings: AdminSettings }) {
  const router = useRouter();
  const [packagesVisible, setPackagesVisible] = useState(settings.sessionPackagesVisible);
  const [savingPackages, setSavingPackages] = useState(false);
  const [packagesError, setPackagesError] = useState<string | null>(null);

  const [timeoutInput, setTimeoutInput] = useState(String(settings.sessionTimeoutMinutes));
  const [savingTimeout, setSavingTimeout] = useState(false);
  const [timeoutError, setTimeoutError] = useState<string | null>(null);
  const [timeoutSaved, setTimeoutSaved] = useState(false);

  async function handleTogglePackages() {
    const next = !packagesVisible;
    setSavingPackages(true);
    setPackagesError(null);
    try {
      await saveSetting("session_packages_visible", next);
      setPackagesVisible(next);
      router.refresh();
    } catch (e) {
      setPackagesError(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setSavingPackages(false);
    }
  }

  async function handleSaveTimeout() {
    const minutes = Math.max(0, Math.floor(Number(timeoutInput) || 0));
    setSavingTimeout(true);
    setTimeoutError(null);
    setTimeoutSaved(false);
    try {
      await saveSetting("session_timeout_minutes", minutes);
      setTimeoutInput(String(minutes));
      setTimeoutSaved(true);
      router.refresh();
    } catch (e) {
      setTimeoutError(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setSavingTimeout(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-lg text-slate-900">Feature Control</h2>
        <p className="text-xs text-slate-500 mt-1">
          Platform-wide toggles and settings, applied everywhere immediately.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-800">Session Packages</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              When off, patients can&apos;t buy or see session packages anywhere on the site —
              existing package purchases and their remaining sessions are unaffected.
            </p>
          </div>
          <button
            onClick={handleTogglePackages}
            disabled={savingPackages}
            className={`text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60 ${
              packagesVisible
                ? "bg-teal-700 hover:bg-teal-800 text-white"
                : "bg-slate-200 hover:bg-slate-300 text-slate-800"
            }`}
          >
            {savingPackages ? "Saving..." : packagesVisible ? "Visible" : "Hidden"}
          </button>
        </div>
        {packagesError && <p className="text-[11px] text-red-600 mt-2">{packagesError}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800">Session Timeout of Inactivity</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md">
          Automatically sign out any patient, therapist, hospital, or admin after this many
          minutes of no activity (mouse, keyboard, or touch). Set to 0 to disable.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <input
            type="number"
            min={0}
            step={1}
            value={timeoutInput}
            onChange={(e) => {
              setTimeoutInput(e.target.value);
              setTimeoutSaved(false);
            }}
            className="w-24 text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
          <span className="text-xs text-slate-500">minutes</span>
          <button
            onClick={handleSaveTimeout}
            disabled={savingTimeout}
            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
          >
            {savingTimeout ? "Saving..." : "Save"}
          </button>
          {timeoutSaved && <span className="text-[11px] text-teal-700 font-semibold">Saved.</span>}
        </div>
        {timeoutError && <p className="text-[11px] text-red-600 mt-2">{timeoutError}</p>}
      </div>
    </div>
  );
}
