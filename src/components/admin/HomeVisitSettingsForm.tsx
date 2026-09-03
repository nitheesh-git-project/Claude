"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import type { AdminSettings } from "@/lib/adminSettings";

// Same helper every other settings surface uses (see
// AdminFeatureControlTab.tsx / PackageSettingsForm.tsx) -- one generalized
// route rather than a dedicated endpoint per toggle.
async function saveSetting(key: string, value: boolean | number | string) {
  const res = await fetch("/api/admin/update-setting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not save. Please try again.");
}

function Toggle({
  label,
  hint,
  value,
  settingKey,
}: {
  label: string;
  hint: string;
  value: boolean;
  settingKey: string;
}) {
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleToggle() {
    const next = !optimistic;
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      try {
        await saveSetting(settingKey, next);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="text-xs font-semibold text-slate-800">{label}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>
        {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
      </div>
      <button
        onClick={handleToggle}
        disabled={isPending}
        className={`shrink-0 w-11 h-6 rounded-full transition relative disabled:opacity-60 ${
          optimistic ? "bg-teal-600" : "bg-slate-300"
        }`}
        aria-pressed={optimistic}
        aria-label={label}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
            optimistic ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function NumberSetting({
  label,
  hint,
  value,
  settingKey,
  min = 0,
  unit,
}: {
  label: string;
  hint: string;
  value: number;
  settingKey: string;
  min?: number;
  unit: string;
}) {
  const [input, setInput] = useState(String(value));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  function handleSave() {
    const n = Math.max(min, Math.floor(Number(input) || 0));
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await saveSetting(settingKey, n);
        setInput(String(n));
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="text-xs font-semibold text-slate-800">{label}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>
        {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
        {saved && !error && <p className="text-[11px] text-teal-700 mt-1">Saved.</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number"
          min={min}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setSaved(false);
          }}
          className="w-20 p-2 rounded-lg border border-slate-300 text-xs"
        />
        <span className="text-[11px] text-slate-500 w-12">{unit}</span>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-60"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function TextSetting({
  label,
  hint,
  value,
  settingKey,
  rows = 1,
}: {
  label: string;
  hint: string;
  value: string;
  settingKey: string;
  rows?: number;
}) {
  const [input, setInput] = useState(value);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await saveSetting(settingKey, input);
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="py-3">
      <p className="text-xs font-semibold text-slate-800">{label}</p>
      <p className="text-[11px] text-slate-500 mt-0.5 mb-2">{hint}</p>
      {rows > 1 ? (
        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setSaved(false);
          }}
          rows={rows}
          className="w-full p-2 rounded-lg border border-slate-300 text-xs"
        />
      ) : (
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setSaved(false);
          }}
          className="w-full p-2 rounded-lg border border-slate-300 text-xs"
        />
      )}
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-60"
        >
          Save
        </button>
        {error && <span className="text-[11px] text-red-600">{error}</span>}
        {saved && !error && <span className="text-[11px] text-teal-700">Saved.</span>}
      </div>
    </div>
  );
}

export default function HomeVisitSettingsForm({
  settings,
  areaCount,
  packageCount,
}: {
  settings: AdminSettings;
  areaCount: number;
  packageCount: number;
}) {
  const notReady = areaCount === 0 || packageCount === 0;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800 mb-1">Home Visit</h3>
        <p className="text-xs text-slate-500 mb-2">
          The master switch. While this is off, the Home Visit page returns Not Found, the nav link
          is hidden, and nothing home-visit-related appears to patients — existing bookings still
          render everywhere for staff.
        </p>
        {notReady && (
          <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg p-2 mb-2">
            {areaCount === 0 && packageCount === 0
              ? "No service areas and no packages yet — turning this on would advertise a service nothing can be booked against."
              : areaCount === 0
                ? "No service areas yet — every booking attempt would be turned away."
                : "No packages yet — the Home Visit page would have nothing to sell."}
          </p>
        )}
        <div className="divide-y divide-slate-100">
          <Toggle
            label="Home Visit enabled"
            hint="Turns the public page, the nav link and the booking wizard on."
            value={settings.homeVisitEnabled}
            settingKey="home_visit_enabled"
          />
          <Toggle
            label="Allow cash on visit"
            hint="Lets a patient choose to pay the therapist at the door instead of prepaying. The therapist then holds company money until it is remitted — the Cash Ledger tracks that."
            value={settings.homeVisitCashEnabled}
            settingKey="home_visit_cash_enabled"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800 mb-1">Booking rules</h3>
        <div className="divide-y divide-slate-100">
          <NumberSetting
            label="Booking lead time"
            hint="How far ahead a home visit must be booked. Longer than the 12 hours online sessions use, because a therapist has to physically reach the address."
            value={settings.homeVisitLeadTimeHours}
            settingKey="home_visit_lead_time_hours"
            min={1}
            unit="hours"
          />
          <NumberSetting
            label="Travel buffer"
            hint="Padding added either side of a home visit when checking a therapist's calendar, so two visits across town can't be booked back to back. Zero disables it."
            value={settings.homeVisitTravelBufferMinutes}
            settingKey="home_visit_travel_buffer_minutes"
            unit="minutes"
          />
          <NumberSetting
            label="Full-refund window"
            hint="Cancel at least this long before the visit for a full refund. Inside it, none."
            value={settings.homeVisitCancellationRefundHours}
            settingKey="home_visit_cancellation_refund_hours"
            unit="hours"
          />
          <NumberSetting
            label="Default package validity"
            hint="Used when a package doesn't set its own validity."
            value={settings.homeVisitDefaultValidityDays}
            settingKey="home_visit_default_validity_days"
            min={1}
            unit="days"
          />
          <NumberSetting
            label="Bulk scheduling limit"
            hint="Most visits a patient can schedule in one go from their dashboard."
            value={settings.homeVisitBulkScheduleMax}
            settingKey="home_visit_bulk_schedule_max"
            min={1}
            unit="visits"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="font-bold text-sm text-slate-800 mb-1">Page copy</h3>
        <p className="text-xs text-slate-500 mb-2">
          The headline and supporting line at the top of the public Home Visit page. Leave blank to
          use the built-in defaults.
        </p>
        <div className="divide-y divide-slate-100">
          <TextSetting
            label="Heading"
            hint="Max 120 characters."
            value={settings.homeVisitPageHeading}
            settingKey="home_visit_page_heading"
          />
          <TextSetting
            label="Subheading"
            hint="Max 300 characters."
            value={settings.homeVisitPageSubheading}
            settingKey="home_visit_page_subheading"
            rows={3}
          />
        </div>
      </div>
    </div>
  );
}
