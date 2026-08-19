"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminSettings } from "@/lib/adminSettings";
import AccountSecuritySection from "@/components/profile/AccountSecuritySection";
import BookingLanguagesSection from "@/components/admin/BookingLanguagesSection";

async function saveSetting(key: string, value: boolean | number | string[]) {
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
  // How many times the automatic sweep (src/lib/retryDueMeetSyncs.ts) has
  // already tried this one, and whether it has hit its cap and stopped.
  autoRetryAttempts: number;
  autoRetryExhausted: boolean;
};

export default function AdminFeatureControlTab({
  settings,
  syncIssues,
  adminEmail,
  view,
}: {
  settings: AdminSettings;
  syncIssues: GoogleMeetSyncIssue[];
  adminEmail: string;
  // Which slice of this component to render. It used to be one "Feature
  // Control" tab holding three unrelated jobs at once: the rules that govern
  // booking, the health of the Calendar sync, and the admin's own password.
  // Splitting the render (rather than the file) keeps the save handlers and
  // their optimistic/error state in one place.
  view: "booking" | "health" | "security";
}) {
  const router = useRouter();

  const [timeoutInput, setTimeoutInput] = useState(String(settings.sessionTimeoutMinutes));
  const [isTimeoutPending, startTimeoutTransition] = useTransition();
  const [timeoutError, setTimeoutError] = useState<string | null>(null);
  const [timeoutSaved, setTimeoutSaved] = useState(false);

  const [optimisticMeetEnabled, setOptimisticMeetEnabled] = useOptimistic(
    settings.googleMeetEnabled
  );
  const [isMeetEnabledPending, startMeetEnabledTransition] = useTransition();
  const [meetEnabledError, setMeetEnabledError] = useState<string | null>(null);

  const [joinWindowInput, setJoinWindowInput] = useState(String(settings.joinWindowMinutes));
  const [isJoinWindowPending, startJoinWindowTransition] = useTransition();
  const [joinWindowError, setJoinWindowError] = useState<string | null>(null);
  const [joinWindowSaved, setJoinWindowSaved] = useState(false);

  const [joinWindowAfterInput, setJoinWindowAfterInput] = useState(
    String(settings.joinWindowAfterMinutes)
  );
  const [isJoinWindowAfterPending, startJoinWindowAfterTransition] = useTransition();
  const [joinWindowAfterError, setJoinWindowAfterError] = useState<string | null>(null);
  const [joinWindowAfterSaved, setJoinWindowAfterSaved] = useState(false);

  // The online twins of the two home-visit rules that were already settings.
  // Both used to be constants in bookingSlots.ts / pricing.ts, so changing
  // the online refund window needed a deploy while the home-visit one was a
  // text box.
  const [leadTimeInput, setLeadTimeInput] = useState(
    String(settings.onlineBookingLeadTimeHours)
  );
  const [isLeadTimePending, startLeadTimeTransition] = useTransition();
  const [leadTimeError, setLeadTimeError] = useState<string | null>(null);
  const [leadTimeSaved, setLeadTimeSaved] = useState(false);

  const [refundHoursInput, setRefundHoursInput] = useState(
    String(settings.onlineCancellationRefundHours)
  );
  const [isRefundHoursPending, startRefundHoursTransition] = useTransition();
  const [refundHoursError, setRefundHoursError] = useState<string | null>(null);
  const [refundHoursSaved, setRefundHoursSaved] = useState(false);

  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryErrors, setRetryErrors] = useState<Record<string, string>>({});

  function handleSaveTimeout() {
    const minutes = Math.max(0, Math.floor(Number(timeoutInput) || 0));
    setTimeoutError(null);
    setTimeoutSaved(false);
    startTimeoutTransition(async () => {
      try {
        await saveSetting("session_timeout_minutes", minutes);
        setTimeoutInput(String(minutes));
        setTimeoutSaved(true);
        router.refresh();
      } catch (e) {
        setTimeoutError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  function handleSaveLeadTime() {
    const hours = Math.max(0, Math.floor(Number(leadTimeInput) || 0));
    setLeadTimeError(null);
    setLeadTimeSaved(false);
    startLeadTimeTransition(async () => {
      try {
        await saveSetting("online_booking_lead_time_hours", hours);
        setLeadTimeInput(String(hours));
        setLeadTimeSaved(true);
        router.refresh();
      } catch (e) {
        setLeadTimeError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  function handleSaveRefundHours() {
    const hours = Math.max(0, Math.floor(Number(refundHoursInput) || 0));
    setRefundHoursError(null);
    setRefundHoursSaved(false);
    startRefundHoursTransition(async () => {
      try {
        await saveSetting("online_cancellation_refund_hours", hours);
        setRefundHoursInput(String(hours));
        setRefundHoursSaved(true);
        router.refresh();
      } catch (e) {
        setRefundHoursError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  function handleToggleMeetEnabled() {
    const next = !optimisticMeetEnabled;
    setMeetEnabledError(null);
    startMeetEnabledTransition(async () => {
      setOptimisticMeetEnabled(next);
      try {
        await saveSetting("google_meet_enabled", next);
        router.refresh();
      } catch (e) {
        setMeetEnabledError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  function handleSaveJoinWindow() {
    const minutes = Math.max(0, Math.floor(Number(joinWindowInput) || 0));
    setJoinWindowError(null);
    setJoinWindowSaved(false);
    startJoinWindowTransition(async () => {
      try {
        await saveSetting("join_window_minutes", minutes);
        setJoinWindowInput(String(minutes));
        setJoinWindowSaved(true);
        router.refresh();
      } catch (e) {
        setJoinWindowError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  function handleSaveJoinWindowAfter() {
    const minutes = Math.max(0, Math.floor(Number(joinWindowAfterInput) || 0));
    setJoinWindowAfterError(null);
    setJoinWindowAfterSaved(false);
    startJoinWindowAfterTransition(async () => {
      try {
        await saveSetting("join_window_after_minutes", minutes);
        setJoinWindowAfterInput(String(minutes));
        setJoinWindowAfterSaved(true);
        router.refresh();
      } catch (e) {
        setJoinWindowAfterError(
          e instanceof Error ? e.message : "Could not save. Please try again."
        );
      }
    });
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

  if (view === "security") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-bold text-lg text-slate-900">Account Security</h2>
          <p className="text-xs text-slate-500 mt-1">Reset your own admin password by email.</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <AccountSecuritySection email={adminEmail} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {view === "booking" && (
      <>
      <div>
        <h2 className="font-bold text-lg text-slate-900">Platform Rules</h2>
        <p className="text-xs text-slate-500 mt-1">
          Applied everywhere immediately.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800">Online Booking Lead Time</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md">
          How far ahead an online session must be booked. The booking picker and the
          server-side check both read this one value, so they can&apos;t disagree. Home visits
          have their own, longer lead time below — a therapist has to physically travel.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <input
            type="number"
            min={0}
            step={1}
            value={leadTimeInput}
            onChange={(e) => {
              setLeadTimeInput(e.target.value);
              setLeadTimeSaved(false);
            }}
            className="w-24 text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
          <span className="text-xs text-slate-500">hours</span>
          <button
            onClick={handleSaveLeadTime}
            disabled={isLeadTimePending}
            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
          >
            {isLeadTimePending ? "Saving..." : "Save"}
          </button>
          {leadTimeSaved && <span className="text-[11px] text-teal-700 font-semibold">Saved.</span>}
        </div>
        {leadTimeError && <p className="text-[11px] text-red-600 mt-2">{leadTimeError}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800">Online Cancellation Refund Window</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md">
          Cancel an online session more than this many hours before it starts and the patient is
          refunded in full; inside the window, nothing is refunded. Set to 0 to refund nothing
          ever. An admin can still return any amount case by case from a session&apos;s own
          record.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <input
            type="number"
            min={0}
            step={1}
            value={refundHoursInput}
            onChange={(e) => {
              setRefundHoursInput(e.target.value);
              setRefundHoursSaved(false);
            }}
            className="w-24 text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
          <span className="text-xs text-slate-500">hours</span>
          <button
            onClick={handleSaveRefundHours}
            disabled={isRefundHoursPending}
            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
          >
            {isRefundHoursPending ? "Saving..." : "Save"}
          </button>
          {refundHoursSaved && (
            <span className="text-[11px] text-teal-700 font-semibold">Saved.</span>
          )}
        </div>
        {refundHoursError && <p className="text-[11px] text-red-600 mt-2">{refundHoursError}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800">Session Timeout of Inactivity</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md">
          Automatically sign out any patient, therapist or hospital after this many minutes
          of no activity (mouse, keyboard, or touch). They&apos;re shown a notice explaining
          what happened, with a link back to their own login page. Set to 0 to disable.
        </p>
        <p className="text-xs text-slate-400 mt-1 max-w-md">
          Admin sessions are exempt — this dashboard stays open however long you leave it.
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
            disabled={isTimeoutPending}
            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
          >
            {isTimeoutPending ? "Saving..." : "Save"}
          </button>
          {timeoutSaved && <span className="text-[11px] text-teal-700 font-semibold">Saved.</span>}
        </div>
        {timeoutError && <p className="text-[11px] text-red-600 mt-2">{timeoutError}</p>}
      </div>

      <BookingLanguagesSection
        languages={settings.bookingLanguages}
        onSave={(languages) => saveSetting("booking_languages", languages)}
      />

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
            disabled={isMeetEnabledPending}
            className={`text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60 ${
              optimisticMeetEnabled
                ? "bg-teal-700 hover:bg-teal-800 text-white"
                : "bg-slate-200 hover:bg-slate-300 text-slate-800"
            }`}
          >
            {optimisticMeetEnabled ? "Enabled" : "Disabled"}
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
            disabled={isJoinWindowPending}
            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
          >
            {isJoinWindowPending ? "Saving..." : "Save"}
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
            disabled={isJoinWindowAfterPending}
            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
          >
            {isJoinWindowAfterPending ? "Saving..." : "Save"}
          </button>
          {joinWindowAfterSaved && (
            <span className="text-[11px] text-teal-700 font-semibold">Saved.</span>
          )}
        </div>
        {joinWindowAfterError && (
          <p className="text-[11px] text-red-600 mt-2">{joinWindowAfterError}</p>
        )}
      </div>

      </>
      )}

      {view === "health" && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800">Sync Health</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md">
          Confirmed sessions that don&apos;t have a Meet link yet — either creation hasn&apos;t
          run, or it failed. These are retried automatically a few times in the background;
          anything marked <span className="font-semibold">Needs attention</span> has used up
          those attempts and won&apos;t be retried again on its own. Retry re-attempts event
          creation for that one session and re-arms the automatic attempts.
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
                  {issue.autoRetryExhausted ? (
                    <p className="text-[11px] font-semibold text-amber-700 mt-1">
                      Needs attention — {issue.autoRetryAttempts} automatic attempts used, no more
                      will run
                    </p>
                  ) : issue.autoRetryAttempts > 0 ? (
                    <p className="text-[11px] text-slate-500 mt-1">
                      {issue.autoRetryAttempts} automatic{" "}
                      {issue.autoRetryAttempts === 1 ? "attempt" : "attempts"} so far — still
                      retrying
                    </p>
                  ) : null}
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
      )}
    </div>
  );
}
