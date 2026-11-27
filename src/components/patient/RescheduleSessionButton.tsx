"use client";

import { useState } from "react";
import { useRouter } from "@/lib/useRouter";
import { useToast } from "@/lib/toast";
import { useUnloadWarning } from "@/lib/useUnloadWarning";
import BookingCalendar from "@/components/booking/BookingCalendar";
import SelectableChipGroup from "@/components/booking/SelectableChipGroup";
import Spinner from "@/components/system/Spinner";
import {
  bookableHoursForDate,
  earliestBookableDateKey,
  leadTimeMsFromHours,
  slotStartMs,
} from "@/lib/bookingSlots";
import { formatHourRange } from "@/lib/therapistAvailability";
import { useOpenSlots } from "@/lib/useOpenSlots";
import { debugNow, debugNowHeaders } from "@/lib/debugNow";

/**
 * "Change time" on a patient's upcoming session (owner's decisions: up to the
 * clinic's cut-off before it, once per booking, any hour a therapist can
 * take). The card renders this only when `patientRescheduleBlock` allows it;
 * the route re-checks every rule.
 *
 * The times are the patient's own wall clock, like the booking wizard, and
 * only open hours are offered (useOpenSlots). The patient is told plainly
 * that the clinic confirms the new time again, because it does: the session
 * goes back to Requested with nobody on it.
 */
export default function RescheduleSessionButton({
  appointmentId,
  categoryId,
  leadTimeHours,
  visitMode = "online",
  rescue = false,
}: {
  appointmentId: string;
  categoryId: string | null;
  leadTimeHours: number;
  /** A home visit's hours keep the travel time either side free. */
  visitMode?: "online" | "home_visit";
  /** Offered because nobody was confirmed in time: it does not count as the
   *  patient's one move, and it is open for home visits too. */
  rescue?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // The clock is read when the picker opens, never during render, so the
  // server HTML and the hydrated card agree.
  const [nowMs, setNowMs] = useState<number | null>(null);
  const [dateKey, setDateKey] = useState("");
  const [hour, setHour] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { show } = useToast();
  // Its own place on the roster must not block the hour it already has
  // neighbours of -- the session is the one being moved.
  const { isOpen, checked, loading } = useOpenSlots(open ? nowMs : null, categoryId, {
    excludeAppointmentId: appointmentId,
    visitMode,
  });
  useUnloadWarning(saving);

  const leadTimeMs = leadTimeMsFromHours(leadTimeHours);
  const hours = nowMs !== null && dateKey ? bookableHoursForDate(dateKey, nowMs, leadTimeMs, isOpen) : [];

  function openPicker() {
    const now = debugNow();
    setNowMs(now);
    setDateKey(earliestBookableDateKey(now, leadTimeMs) ?? "");
    setHour("");
    setError(null);
    setOpen(true);
  }

  async function save() {
    if (!dateKey || hour === "") return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/appointments/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...debugNowHeaders() },
      body: JSON.stringify({
        appointmentId,
        slotTime: new Date(slotStartMs(dateKey, hour)).toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Could not move the session. Please try again.");
      if (res.status === 409) router.refresh();
      return;
    }
    show("Session moved. The clinic will confirm your new time.");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openPicker}
        data-testid={rescue ? "rescue-pick-new-time" : undefined}
        className={
          rescue
            ? "min-h-11 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
            : "min-h-11 px-1 text-teal-700 hover:underline text-sm font-semibold"
        }
      >
        {rescue ? "Pick a new time" : "Change time"}
      </button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-900">Pick a new time</p>
      <p className="text-sm text-slate-600">
        {rescue
          ? "This doesn't count as your one change. The clinic confirms who will see you at the new time and lets you know."
          : "You can move a session once. The clinic confirms the new time and who will see you, as it did for your booking."}
      </p>
      {nowMs !== null && (
        <BookingCalendar
          compact
          selectedDateKey={dateKey}
          onSelect={(next) => {
            setDateKey(next);
            setHour("");
          }}
          nowMs={nowMs}
          leadTimeMs={leadTimeMs}
          isSlotOpen={isOpen}
          autoSelected={false}
          loading={loading}
        />
      )}
      {dateKey && !loading && (
        <SelectableChipGroup
          idPrefix={`reschedule-hour-${appointmentId}`}
          label={checked ? "Available times" : "New time"}
          options={hours.map((h) => ({ value: String(h), label: formatHourRange(h) }))}
          value={hour === "" ? "" : String(hour)}
          onChange={(next) => setHour(Number(next))}
          emptyMessage="No times left on this date - please pick another day."
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || loading || !dateKey || hour === ""}
          className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {saving ? (
            <span className="inline-flex items-center gap-1.5">
              <Spinner /> Moving…
            </span>
          ) : (
            "Move my session"
          )}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={saving}
          className="text-sm font-semibold text-slate-600 hover:underline"
        >
          Keep the current time
        </button>
      </div>
    </div>
  );
}
