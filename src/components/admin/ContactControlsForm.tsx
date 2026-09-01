"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminSettings, ContactScanMode } from "@/lib/adminSettings";

async function saveSetting(key: string, value: string | boolean) {
  const res = await fetch("/api/admin/update-setting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Could not save. Please try again.");
}

const SCAN_MODE_COPY: Record<ContactScanMode, { label: string; help: string }> = {
  flag_and_block: {
    label: "Record everything, refuse payment details",
    help: "A UPI handle or a payment link in a message to a patient is refused, with a message explaining why. Phone numbers, emails and links are delivered and recorded for you to look at.",
  },
  flag_only: {
    label: "Record everything, refuse nothing",
    help: "Nothing is ever blocked. Use this if you want to see what the check would catch before it starts refusing anything.",
  },
  off: {
    label: "Off",
    help: "No messages are checked and nothing is recorded.",
  },
};

/**
 * The two controls that decide how hard the platform holds on to its own
 * conversations.
 *
 * Both exist as settings rather than constants because their right value is
 * a judgement about this clinic's people, not a fact about the software: a
 * small team who all know each other may want the scan recording only, and
 * a clinic whose therapists routinely call ahead may find masking more
 * friction than it is worth. Getting either wrong should cost a click, not
 * a deploy.
 */
export default function ContactControlsForm({ settings }: { settings: AdminSettings }) {
  const router = useRouter();

  const [optimisticMode, setOptimisticMode] = useOptimistic(settings.contactScanMode);
  const [optimisticMasking, setOptimisticMasking] = useOptimistic(settings.contactMaskingEnabled);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(key: string, value: string | boolean, apply: () => void) {
    setError(null);
    startTransition(async () => {
      apply();
      try {
        await saveSetting(key, value);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-display text-lg font-bold text-slate-800">
        Patient contact and messages
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Treatment is paid for through this platform, so a patient should never be asked to
        pay another way. These two controls make that hard to do by accident and visible
        when it is not.
      </p>

      <div className="mt-6 space-y-6">
        <div>
          <p className="text-sm font-bold text-slate-800">Checking what therapists write</p>
          <p className="mt-1 text-xs text-slate-500">
            Applies to recommendations, proposed times and exam notes — everything a
            patient reads. Clinical text with numbers in it (doses, repetitions, dates) is
            never affected.
          </p>
          <div className="mt-3 space-y-2">
            {(Object.keys(SCAN_MODE_COPY) as ContactScanMode[]).map((mode) => (
              <label
                key={mode}
                className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
                  optimisticMode === mode
                    ? "border-teal-300 bg-teal-50/60"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="contact_scan_mode"
                  className="mt-0.5"
                  checked={optimisticMode === mode}
                  disabled={isPending}
                  onChange={() =>
                    save("contact_scan_mode", mode, () => setOptimisticMode(mode))
                  }
                />
                <span>
                  <span className="block text-xs font-bold text-slate-800">
                    {SCAN_MODE_COPY[mode].label}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {SCAN_MODE_COPY[mode].help}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={optimisticMasking}
              disabled={isPending}
              onChange={() =>
                save("contact_masking_enabled", !optimisticMasking, () =>
                  setOptimisticMasking(!optimisticMasking)
                )
              }
            />
            <span>
              <span className="block text-sm font-bold text-slate-800">
                Hide patient numbers until a therapist asks
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                Session cards show the last three digits. A therapist can reveal the full
                number for a session they are running — around the time of a video call, or
                any time on the day of a home visit — and each reveal is recorded. Switch
                this off and every number is shown on every card, as it was before.
              </span>
            </span>
          </label>
        </div>
      </div>

      {error && <p className="mt-4 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
