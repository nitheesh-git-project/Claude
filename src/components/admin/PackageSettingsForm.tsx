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

// The package-wide controls that used to live scattered between Site
// Content (the PackageManager list itself, moved to the Catalog section of
// this tab) and Feature Control (just the visibility toggle). All of it
// now lives together in Session Manager, since every one of these settings
// is specifically about packages.
export default function PackageSettingsForm({
  settings,
  therapistSuggestionsEnabled = false,
}: {
  settings: AdminSettings;
  // Read by the caller in its own query rather than through AdminSettings:
  // the column is newer than the rest, and a database without it should
  // leave the feature off rather than break this whole form.
  therapistSuggestionsEnabled?: boolean;
}) {
  const router = useRouter();

  const [optimisticSuggestions, setOptimisticSuggestions] = useOptimistic(
    therapistSuggestionsEnabled
  );
  const [isSuggestionsPending, startSuggestionsTransition] = useTransition();
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  const [optimisticVisible, setOptimisticVisible] = useOptimistic(settings.sessionPackagesVisible);
  const [isVisiblePending, startVisibleTransition] = useTransition();
  const [visibleError, setVisibleError] = useState<string | null>(null);

  const [optimisticLockEnabled, setOptimisticLockEnabled] = useOptimistic(
    settings.packageTherapistLockEnabled
  );
  const [isLockPending, startLockTransition] = useTransition();
  const [lockError, setLockError] = useState<string | null>(null);

  const [validityInput, setValidityInput] = useState(String(settings.packageDefaultValidityDays));
  const [isValidityPending, startValidityTransition] = useTransition();
  const [validityError, setValidityError] = useState<string | null>(null);
  const [validitySaved, setValiditySaved] = useState(false);

  const [bulkMaxInput, setBulkMaxInput] = useState(String(settings.packageBulkScheduleMax));
  const [isBulkMaxPending, startBulkMaxTransition] = useTransition();
  const [bulkMaxError, setBulkMaxError] = useState<string | null>(null);
  const [bulkMaxSaved, setBulkMaxSaved] = useState(false);

  const [reminderInput, setReminderInput] = useState(String(settings.packageExpiryReminderDays));
  const [isReminderPending, startReminderTransition] = useTransition();
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [reminderSaved, setReminderSaved] = useState(false);

  function handleToggleVisible() {
    const next = !optimisticVisible;
    setVisibleError(null);
    startVisibleTransition(async () => {
      setOptimisticVisible(next);
      try {
        await saveSetting("session_packages_visible", next);
        router.refresh();
      } catch (e) {
        setVisibleError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  function handleToggleLock() {
    const next = !optimisticLockEnabled;
    setLockError(null);
    startLockTransition(async () => {
      setOptimisticLockEnabled(next);
      try {
        await saveSetting("package_therapist_lock_enabled", next);
        router.refresh();
      } catch (e) {
        setLockError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  function handleToggleSuggestions() {
    const next = !optimisticSuggestions;
    setSuggestionsError(null);
    startSuggestionsTransition(async () => {
      setOptimisticSuggestions(next);
      try {
        await saveSetting("therapist_suggestions_enabled", next);
        router.refresh();
      } catch (e) {
        setSuggestionsError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  function handleSaveValidity() {
    const days = Math.max(1, Math.floor(Number(validityInput) || 1));
    setValidityError(null);
    setValiditySaved(false);
    startValidityTransition(async () => {
      try {
        await saveSetting("package_default_validity_days", days);
        setValidityInput(String(days));
        setValiditySaved(true);
        router.refresh();
      } catch (e) {
        setValidityError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  function handleSaveBulkMax() {
    const n = Math.max(1, Math.floor(Number(bulkMaxInput) || 1));
    setBulkMaxError(null);
    setBulkMaxSaved(false);
    startBulkMaxTransition(async () => {
      try {
        await saveSetting("package_bulk_schedule_max", n);
        setBulkMaxInput(String(n));
        setBulkMaxSaved(true);
        router.refresh();
      } catch (e) {
        setBulkMaxError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  function handleSaveReminder() {
    const days = Math.max(0, Math.floor(Number(reminderInput) || 0));
    setReminderError(null);
    setReminderSaved(false);
    startReminderTransition(async () => {
      try {
        await saveSetting("package_expiry_reminder_days", days);
        setReminderInput(String(days));
        setReminderSaved(true);
        router.refresh();
      } catch (e) {
        setReminderError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-800">Session Packages Visible</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              When off, patients can&apos;t buy or see session packages anywhere on the site —
              existing purchases and their remaining sessions are unaffected.
            </p>
          </div>
          <button
            onClick={handleToggleVisible}
            disabled={isVisiblePending}
            className={`text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60 ${
              optimisticVisible ? "bg-teal-700 hover:bg-teal-800 text-white" : "bg-slate-200 hover:bg-slate-300 text-slate-800"
            }`}
          >
            {optimisticVisible ? "Visible" : "Hidden"}
          </button>
        </div>
        {visibleError && <p className="text-[11px] text-red-600 mt-2">{visibleError}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-800">Therapist Lock (site-wide)</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              When off, no package locks to a single therapist regardless of each package&apos;s
              own setting — every session is assigned individually, as before. Turn off only if
              you no longer want the continuity promise enforced anywhere.
            </p>
          </div>
          <button
            onClick={handleToggleLock}
            disabled={isLockPending}
            className={`text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60 ${
              optimisticLockEnabled ? "bg-teal-700 hover:bg-teal-800 text-white" : "bg-slate-200 hover:bg-slate-300 text-slate-800"
            }`}
          >
            {optimisticLockEnabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        {lockError && <p className="text-[11px] text-red-600 mt-2">{lockError}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-800">Therapist-Suggested Sessions</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              Lets a therapist suggest the next session on a programme locked to them. The patient
              still confirms — nothing is booked and no session is used until they accept. Turning
              this off hides the control and refuses new suggestions; ones already waiting can
              still be answered.
            </p>
          </div>
          <button
            onClick={handleToggleSuggestions}
            disabled={isSuggestionsPending}
            className={`text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60 ${
              optimisticSuggestions ? "bg-teal-700 hover:bg-teal-800 text-white" : "bg-slate-200 hover:bg-slate-300 text-slate-800"
            }`}
          >
            {optimisticSuggestions ? "Enabled" : "Disabled"}
          </button>
        </div>
        {suggestionsError && (
          <p className="text-[11px] text-red-600 mt-2">{suggestionsError}</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800">Default Validity</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md">
          How long a purchase has to use all its sessions when the package itself doesn&apos;t
          set its own validity. Editing this never changes packages already sold.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <input
            type="number"
            min={1}
            step={1}
            value={validityInput}
            onChange={(e) => {
              setValidityInput(e.target.value);
              setValiditySaved(false);
            }}
            className="w-24 text-xs px-3 py-2 rounded-lg border border-slate-300"
          />
          <span className="text-xs text-slate-500">days</span>
          <button onClick={handleSaveValidity} disabled={isValidityPending} className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition">
            {isValidityPending ? "Saving..." : "Save"}
          </button>
          {validitySaved && <span className="text-[11px] text-teal-700 font-semibold">Saved.</span>}
        </div>
        {validityError && <p className="text-[11px] text-red-600 mt-2">{validityError}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800">Bulk Scheduler Limit</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md">
          The most dates a patient can select in one go on the &quot;Schedule sessions&quot;
          calendar in their package widget.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <input
            type="number"
            min={1}
            step={1}
            value={bulkMaxInput}
            onChange={(e) => {
              setBulkMaxInput(e.target.value);
              setBulkMaxSaved(false);
            }}
            className="w-24 text-xs px-3 py-2 rounded-lg border border-slate-300"
          />
          <span className="text-xs text-slate-500">dates at once</span>
          <button onClick={handleSaveBulkMax} disabled={isBulkMaxPending} className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition">
            {isBulkMaxPending ? "Saving..." : "Save"}
          </button>
          {bulkMaxSaved && <span className="text-[11px] text-teal-700 font-semibold">Saved.</span>}
        </div>
        {bulkMaxError && <p className="text-[11px] text-red-600 mt-2">{bulkMaxError}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800">Expiry Reminder Lead Time</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md">
          How many days before a purchase expires it&apos;s flagged in the Purchases table&apos;s
          &quot;Expiring soon&quot; filter and surfaced to the patient.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <input
            type="number"
            min={0}
            step={1}
            value={reminderInput}
            onChange={(e) => {
              setReminderInput(e.target.value);
              setReminderSaved(false);
            }}
            className="w-24 text-xs px-3 py-2 rounded-lg border border-slate-300"
          />
          <span className="text-xs text-slate-500">days</span>
          <button onClick={handleSaveReminder} disabled={isReminderPending} className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition">
            {isReminderPending ? "Saving..." : "Save"}
          </button>
          {reminderSaved && <span className="text-[11px] text-teal-700 font-semibold">Saved.</span>}
        </div>
        {reminderError && <p className="text-[11px] text-red-600 mt-2">{reminderError}</p>}
      </div>
    </div>
  );
}
