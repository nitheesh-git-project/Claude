"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminSettings } from "@/lib/adminSettings";
import AccountSecuritySection from "@/components/profile/AccountSecuritySection";

async function saveSetting(key: string, value: boolean | number) {
  const res = await fetch("/api/admin/update-setting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not save. Please try again.");
}

export type GoogleMeetSyncIssue = {
  id: string;
  sessionCode: string | null;
  slotTime: string | null;
  patientName: string;
  therapistName: string | null;
  error: string | null;
};

export default function AdminFeatureControlTab({
  settings,
  syncIssues,
  adminEmail,
}: {
  settings: AdminSettings;
  syncIssues: GoogleMeetSyncIssue[];
  adminEmail: string;
}) {
  const router = useRouter();
  const [packagesVisible, setPackagesVisible] = useState(settings.sessionPackagesVisible);
  const [savingPackages, setSavingPackages] = useState(false);
  const [packagesError, setPackagesError] = useState<string | null>(null);

  const [timeoutInput, setTimeoutInput] = useState(String(settings.sessionTimeoutMinutes));
  const [savingTimeout, setSavingTimeout] = useState(false);
  const [timeoutError, setTimeoutError] = useState<string | null>(null);
  const [timeoutSaved, setTimeoutSaved] = useState(false);

  const [meetEnabled, setMeetEnabled] = useState(settings.googleMeetEnabled);
  const [savingMeetEnabled, setSavingMeetEnabled] = useState(false);
  const [meetEnabledError, setMeetEnabledError] = useState<string | null>(null);

  const [joinWindowInput, setJoinWindowInput] = useState(String(settings.joinWindowMinutes));
  const [savingJoinWindow, setSavingJoinWindow] = useState(false);
  const [joinWindowError, setJoinWindowError] = useState<string | null>(null);
  const [joinWindowSaved, setJoinWindowSaved] = useState(false);

  const [joinWindowAfterInput, setJoinWindowAfterInput] = useState(
    String(settings.joinWindowAfterMinutes)
  );
  const [savingJoinWindowAfter, setSavingJoinWindowAfter] = useState(false);
  const [joinWindowAfterError, setJoinWindowAfterError] = useState<string | null>(null);
  const [joinWindowAfterSaved, setJoinWindowAfterSaved] = useState(false);

  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryErrors, setRetryErrors] = useState<Record<string, string>>({});

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

  async function handleToggleMeetEnabled() {
    const next = !meetEnabled;
    setSavingMeetEnabled(true);
    setMeetEnabledError(null);
    try {
      await saveSetting("google_meet_enabled", next);
      setMeetEnabled(next);
      router.refresh();
    } catch (e) {
      setMeetEnabledError(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setSavingMeetEnabled(false);
    }
  }

  async function handleSaveJoinWindow() {
    const minutes = Math.max(0, Math.floor(Number(joinWindowInput) || 0));
    setSavingJoinWindow(true);
    setJoinWindowError(null);
    setJoinWindowSaved(false);
    try {
      await saveSetting("join_window_minutes", minutes);
      setJoinWindowInput(String(minutes));
      setJoinWindowSaved(true);
      router.refresh();
    } catch (e) {
      setJoinWindowError(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setSavingJoinWindow(false);
    }
  }

  async function handleSaveJoinWindowAfter() {
    const minutes = Math.max(0, Math.floor(Number(joinWindowAfterInput) || 0));
    setSavingJoinWindowAfter(true);
    setJoinWindowAfterError(null);
    setJoinWindowAfterSaved(false);
    try {
      await saveSetting("join_window_after_minutes", minutes);
      setJoinWindowAfterInput(String(minutes));
      setJoinWindowAfterSaved(true);
      router.refresh();
    } catch (e) {
      setJoinWindowAfterError(e instanceof Error ? e.message : "Could not save. Please try again.");
    } finally {
      setSavingJoinWindowAfter(false);
    }
  }

  async function handleRetry(appointmentId: string) {
    setRetryingId(appointmentId);
    setRetryErrors((prev) => {
      const next = { ...prev };
      delete next[appointmentId];
      return next;
    });
    try {
      const res = await fetch("/api/admin/retry-meet-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Retry failed. Please try again.");
      router.refresh();
    } catch (e) {
      setRetryErrors((prev) => ({
        ...prev,
        [appointmentId]: e instanceof Error ? e.message : "Retry failed. Please try again.",
      }));
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-lg text-slate-900">Account Security</h2>
        <p className="text-xs text-slate-500 mt-1">
          Reset your own admin password by email.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <AccountSecuritySection email={adminEmail} />
      </div>

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

      <div>
        <h2 className="font-bold text-lg text-slate-900">Google Meet / Calendar</h2>
        <p className="text-xs text-slate-500 mt-1">
          OAuth credentials and the target calendar are configured in server environment
          variables, not here — these are the operational controls only.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-800">Auto-Create Meet Links</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              When off, newly confirmed sessions won&apos;t get a Calendar event or Meet link.
              Existing links, reassignments/reschedules of already-confirmed sessions, and
              cancellations are unaffected — this only stops <em>new</em> events going forward.
            </p>
          </div>
          <button
            onClick={handleToggleMeetEnabled}
            disabled={savingMeetEnabled}
            className={`text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60 ${
              meetEnabled
                ? "bg-teal-700 hover:bg-teal-800 text-white"
                : "bg-slate-200 hover:bg-slate-300 text-slate-800"
            }`}
          >
            {savingMeetEnabled ? "Saving..." : meetEnabled ? "Enabled" : "Disabled"}
          </button>
        </div>
        {meetEnabledError && <p className="text-[11px] text-red-600 mt-2">{meetEnabledError}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800">Join Button Window</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md">
          Controls when the &quot;Tap to Join&quot; button is active for patients and
          therapists — admin&apos;s own button always stays active regardless of these
          settings.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <input
            type="number"
            min={0}
            step={1}
            value={joinWindowInput}
            onChange={(e) => {
              setJoinWindowInput(e.target.value);
              setJoinWindowSaved(false);
            }}
            className="w-24 text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
          <span className="text-xs text-slate-500">minutes before slot time</span>
          <button
            onClick={handleSaveJoinWindow}
            disabled={savingJoinWindow}
            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
          >
            {savingJoinWindow ? "Saving..." : "Save"}
          </button>
          {joinWindowSaved && <span className="text-[11px] text-teal-700 font-semibold">Saved.</span>}
        </div>
        {joinWindowError && <p className="text-[11px] text-red-600 mt-2">{joinWindowError}</p>}

        <div className="flex items-center gap-2 mt-3">
          <input
            type="number"
            min={0}
            step={1}
            value={joinWindowAfterInput}
            onChange={(e) => {
              setJoinWindowAfterInput(e.target.value);
              setJoinWindowAfterSaved(false);
            }}
            className="w-24 text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
          <span className="text-xs text-slate-500">minutes after slot time ends</span>
          <button
            onClick={handleSaveJoinWindowAfter}
            disabled={savingJoinWindowAfter}
            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
          >
            {savingJoinWindowAfter ? "Saving..." : "Save"}
          </button>
          {joinWindowAfterSaved && (
            <span className="text-[11px] text-teal-700 font-semibold">Saved.</span>
          )}
        </div>
        {joinWindowAfterError && (
          <p className="text-[11px] text-red-600 mt-2">{joinWindowAfterError}</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800">Sync Health</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md">
          Confirmed sessions that don&apos;t have a Meet link yet — either creation hasn&apos;t
          run, or it failed. Retry re-attempts event creation for that one session.
        </p>
        {syncIssues.length === 0 ? (
          <p className="text-xs text-slate-400 mt-4">
            No sync issues right now — every confirmed session has a Meet link.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {syncIssues.map((issue) => (
              <div
                key={issue.id}
                className="flex items-center justify-between flex-wrap gap-2 border border-slate-200 rounded-xl px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-800">
                    {issue.patientName}
                    {issue.therapistName ? ` → ${issue.therapistName}` : ""}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    <span className="font-mono text-slate-400">{issue.sessionCode ?? "—"}</span>
                    {" · "}
                    {issue.slotTime ? new Date(issue.slotTime).toLocaleString() : "Slot to be confirmed"}
                  </p>
                  {issue.error && (
                    <p className="text-[11px] text-red-600 mt-1 break-words">{issue.error}</p>
                  )}
                  {retryErrors[issue.id] && (
                    <p className="text-[11px] text-red-600 mt-1 break-words">{retryErrors[issue.id]}</p>
                  )}
                </div>
                <button
                  onClick={() => handleRetry(issue.id)}
                  disabled={retryingId === issue.id}
                  className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition shrink-0"
                >
                  {retryingId === issue.id ? "Retrying..." : "Retry"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
