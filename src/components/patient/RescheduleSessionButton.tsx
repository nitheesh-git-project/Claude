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
}: {
  appointmentId: string;
  categoryId: string | null;
  leadTimeHours: number;
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
  const { isOpen } = useOpenSlots(open ? nowMs : null, categoryId);
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
        className="min-h-11 px-1 text-teal-700 hover:underline text-sm font-semibold"
      >
        Change time
      </button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-900">Pick a new time</p>
      <p className="text-sm text-slate-600">
        You can move a session once. The clinic confirms the new time and who will see you, as it did for
        your booking.
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
        />
      )}
      {dateKey && (
        <SelectableChipGroup
          idPrefix={`reschedule-hour-${appointmentId}`}
          label="New time"
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
          disabled={saving || !dateKey || hour === ""}
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
