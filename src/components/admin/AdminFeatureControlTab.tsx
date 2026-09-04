"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
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
  waitingRoomIssues,
  webhookSecretConfigured = true,
  adminEmail,
  view,
}: {
  settings: AdminSettings;
  syncIssues: GoogleMeetSyncIssue[];
  /** Confirmed sessions whose Meet space is still holding both parties in a
   *  waiting room. Same row shape as a sync issue -- deliberately, since the
   *  two panels say the same things about a session -- but a different fix
   *  (see /api/admin/open-meet-access). */
  waitingRoomIssues: GoogleMeetSyncIssue[];
  /** Whether RAZORPAY_WEBHOOK_SECRET is set in the server environment. */
  webhookSecretConfigured?: boolean;
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

  const [farewellInput, setFarewellInput] = useState(String(settings.farewellBannerSeconds));
  const [isFarewellPending, startFarewellTransition] = useTransition();
  const [farewellError, setFarewellError] = useState<string | null>(null);
  const [farewellSaved, setFarewellSaved] = useState(false);
  const [completedAfterInput, setCompletedAfterInput] = useState(
    String(settings.sessionCompletedAfterMinutes)
  );
  const [isCompletedAfterPending, startCompletedAfterTransition] = useTransition();
  const [completedAfterError, setCompletedAfterError] = useState<string | null>(null);
  const [completedAfterSaved, setCompletedAfterSaved] = useState(false);

  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryErrors, setRetryErrors] = useState<Record<string, string>>({});

  const [optimisticOpenAccess, setOptimisticOpenAccess] = useOptimistic(
    settings.meetOpenAccessEnabled
  );
  const [isOpenAccessPending, startOpenAccessTransition] = useTransition();
  const [openAccessError, setOpenAccessError] = useState<string | null>(null);

  const [fixingId, setFixingId] = useState<string | null>(null);
  const [fixErrors, setFixErrors] = useState<Record<string, string>>({});

  function handleToggleOpenAccess() {
    const next = !optimisticOpenAccess;
    setOpenAccessError(null);
    startOpenAccessTransition(async () => {
      setOptimisticOpenAccess(next);
      try {
        await saveSetting("meet_open_access_enabled", next);
        router.refresh();
      } catch (e) {
        setOpenAccessError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  async function handleOpenAccess(appointmentId: string) {
    setFixingId(appointmentId);
    setFixErrors((prev) => {
      const next = { ...prev };
      delete next[appointmentId];
      return next;
    });
    try {
      const res = await fetch("/api/admin/open-meet-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not open the meeting.");
      router.refresh();
    } catch (e) {
      setFixErrors((prev) => ({
        ...prev,
        [appointmentId]: e instanceof Error ? e.message : "Could not open the meeting.",
      }));
    } finally {
      setFixingId(null);
    }
  }

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

  function handleSaveFarewell() {
    const seconds = Math.max(0, Math.min(300, Math.floor(Number(farewellInput) || 0)));
    setFarewellError(null);
    setFarewellSaved(false);
    startFarewellTransition(async () => {
      try {
        await saveSetting("farewell_banner_seconds", seconds);
        setFarewellInput(String(seconds));
        setFarewellSaved(true);
        router.refresh();
      } catch (e) {
        setFarewellError(e instanceof Error ? e.message : "Could not save. Please try again.");
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

  function handleSaveCompletedAfter() {
    // Floored at 1, not 0: zero would mark a session finished the moment it
    // was due to start. The route enforces the same bound.
    const minutes = Math.max(1, Math.floor(Number(completedAfterInput) || 0));
    setCompletedAfterError(null);
    setCompletedAfterSaved(false);
    startCompletedAfterTransition(async () => {
      try {
        await saveSetting("session_completed_after_minutes", minutes);
        setCompletedAfterInput(String(minutes));
        setCompletedAfterSaved(true);
        router.refresh();
      } catch (e) {
        setCompletedAfterError(
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

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800">Sign-out message</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md">
          After someone signs out, a banner across the top of the public site tells them the
          sign-out worked. This is how long it stays before clearing itself. Set to 0 to leave
          it up until they close it — on a shared machine that means the next person reads the
          last person&apos;s goodbye.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <input
            type="number"
            min={0}
            max={300}
            step={1}
            value={farewellInput}
            onChange={(e) => {
              setFarewellInput(e.target.value);
              setFarewellSaved(false);
            }}
            className="w-24 text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
          <span className="text-xs text-slate-500">seconds</span>
          <button
            onClick={handleSaveFarewell}
            disabled={isFarewellPending}
            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
          >
            {isFarewellPending ? "Saving..." : "Save"}
          </button>
          {farewellSaved && <span className="text-[11px] text-teal-700 font-semibold">Saved.</span>}
        </div>
        {farewellError && <p className="text-[11px] text-red-600 mt-2">{farewellError}</p>}
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
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-800">Join Without Approval</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              Meet holds anyone it doesn&apos;t recognise in a waiting room until the meeting&apos;s
              owner admits them — and patients sign in with whatever Google account they have,
              so that is nearly everyone. On, each new session&apos;s meeting is opened so the
              patient and the therapist walk straight in.{" "}
              <span className="font-semibold">Only turn this off</span> if the Google account
              behind the calendar can&apos;t grant Meet permission; the sessions it couldn&apos;t
              open are listed under System Health.
            </p>
          </div>
          <button
            onClick={handleToggleOpenAccess}
            disabled={isOpenAccessPending}
            className={`text-xs font-semibold px-4 py-2 rounded-lg transition disabled:opacity-60 ${
              optimisticOpenAccess
                ? "bg-teal-700 hover:bg-teal-800 text-white"
                : "bg-slate-200 hover:bg-slate-300 text-slate-800"
            }`}
          >
            {optimisticOpenAccess ? "Enabled" : "Disabled"}
          </button>
        </div>
        {openAccessError && <p className="text-[11px] text-red-600 mt-2">{openAccessError}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800">Join Button Window</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md">
          Controls when the &quot;Tap to Join&quot; button is active for patients and
          therapists — admin&apos;s own button always stays active regardless of these
          settings, up to the completed cutoff below, which applies everywhere.
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

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800">Session Completed Cutoff</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md">
          How long after a session&apos;s scheduled start the &quot;Tap to Join&quot; button
          reads <span className="font-semibold">Session Completed</span> instead, on every
          screen a session appears on — patients, therapists, hospitals and this dashboard
          alike. Separate from the window above: that one decides how late someone may still
          join, this one decides when the session stops being offered at all.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <input
            type="number"
            min={1}
            step={1}
            value={completedAfterInput}
            onChange={(e) => {
              setCompletedAfterInput(e.target.value);
              setCompletedAfterSaved(false);
            }}
            className="w-24 text-xs px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
          <span className="text-xs text-slate-500">minutes after slot time</span>
          <button
            onClick={handleSaveCompletedAfter}
            disabled={isCompletedAfterPending}
            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
          >
            {isCompletedAfterPending ? "Saving..." : "Save"}
          </button>
          {completedAfterSaved && (
            <span className="text-[11px] text-teal-700 font-semibold">Saved.</span>
          )}
        </div>
        {completedAfterError && (
          <p className="text-[11px] text-red-600 mt-2">{completedAfterError}</p>
        )}
      </div>

      </>
      )}

      {view === "health" && (
      <>
      {/* The only configuration whose absence silently loses money.
          Without the webhook secret /api/razorpay/webhook answers 503, so a
          patient who pays and closes the tab before the browser callback
          lands leaves a paid Razorpay order sitting against an unpaid
          booking -- and nothing anywhere says so. It is a one-line check,
          on the screen that already exists to say what is quietly wrong. */}
      <div
        className={`rounded-2xl border p-6 shadow-sm ${
          webhookSecretConfigured
            ? "border-slate-200 bg-white"
            : "border-red-300 bg-red-50"
        }`}
      >
        <h3 className="font-bold text-sm text-slate-800">Payment Confirmations</h3>
        {webhookSecretConfigured ? (
          <p className="mt-1 max-w-md text-xs text-slate-500">
            The Razorpay webhook is configured. A payment is confirmed by whichever arrives
            first — the patient&apos;s browser or Razorpay&apos;s own server call — so a patient
            who pays and closes the tab is still confirmed.
          </p>
        ) : (
          <p className="mt-1 max-w-md text-xs text-red-800">
            <span className="font-bold">The Razorpay webhook is not configured.</span> Payments
            are being confirmed by the patient&apos;s browser alone. A patient who pays and
            closes the tab before the page finishes will leave a{" "}
            <span className="font-semibold">paid order against an unpaid booking</span>, and
            nothing will flag it. Set <code className="font-mono">RAZORPAY_WEBHOOK_SECRET</code>{" "}
            in the server environment and add the matching endpoint in the Razorpay dashboard.
          </p>
        )}
      </div>

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

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800">Waiting Room</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md">
          Confirmed sessions whose meeting could not be opened, so the patient and the
          therapist will have to be admitted by hand. The link and the invite are fine —
          only the door is. These are retried automatically a couple of times; anything
          marked <span className="font-semibold">Needs attention</span> has used those up.
          The usual cause is the Google account&apos;s saved permission predating this
          feature, fixed once by re-running{" "}
          <code className="font-mono">scripts/get-google-refresh-token.mjs</code> and then
          clicking Open here.
        </p>
        {waitingRoomIssues.length === 0 ? (
          <p className="text-xs text-slate-400 mt-4">
            No sessions are holding anyone in a waiting room.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {waitingRoomIssues.map((issue) => (
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
                  {fixErrors[issue.id] && (
                    <p className="text-[11px] text-red-600 mt-1 break-words">{fixErrors[issue.id]}</p>
                  )}
                </div>
                <button
                  onClick={() => handleOpenAccess(issue.id)}
                  disabled={fixingId === issue.id}
                  className="bg-teal-700 hover:bg-teal-800 disabled:opacity-60 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition shrink-0"
                >
                  {fixingId === issue.id ? "Opening..." : "Open"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}
