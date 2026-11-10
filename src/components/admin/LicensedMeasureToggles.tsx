"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useSaveSetting } from "@/lib/useSaveSetting";

export type LicensedMeasureOption = {
  key: string;
  /** The test's own name, as a clinician cites it. */
  label: string;
  /** What it measures, in a patient's words. */
  plainName: string;
  /** Which kinds of care use it ("Orthopaedic", "Parkinson's"...). */
  usedOn: string;
};

// Which licensed outcome measures the clinic has switched on.
//
// A licensed scale (Barthel, Oswestry, MDS-UPDRS III...) is in the
// measurement registry and ships switched off: recording it without the
// clinic holding a licence is a copyright problem, and rewording it to dodge
// the licence makes it no longer the validated scale (docs/rules/clinical.md).
// Ticking one here is the clinic saying it has the licence; the therapist's
// measurement dialog offers it from then on, and the routes accept it.
//
// Settings is Master Admin only (requireAdminScope("settings") on
// /api/admin/update-setting, and the screen never leaves the server for
// another scope), so this control renders only where its route will accept
// it. When the switch could not be read the list is not drawn at all --
// boxes all showing "off" would read as a fact rather than as "we couldn't
// check".
export default function LicensedMeasureToggles({
  options,
  enabled,
  readable,
}: {
  options: LicensedMeasureOption[];
  enabled: string[];
  readable: boolean;
}) {
  const saveSetting = useSaveSetting();
  const router = useRouter();
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    const next = optimistic.includes(key) ? optimistic.filter((k) => k !== key) : [...optimistic, key];
    const ordered = options.map((o) => o.key).filter((k) => next.includes(k));
    setError(null);
    setPendingKey(key);
    startTransition(async () => {
      setOptimistic(ordered);
      try {
        await saveSetting("enabled_licensed_measures", ordered);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      } finally {
        setPendingKey(null);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <h3 className="text-sm font-bold text-slate-700">Licensed outcome scales</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        These scales are copyrighted. Switch one on only once the clinic holds its licence - your
        therapists can then record it on a patient&apos;s Health Profile. Switching one off stops new
        recordings; scores already recorded stay on the patient&apos;s record.
      </p>
      {!readable ? (
        <p className="mt-3 text-xs font-semibold text-amber-700" role="status">
          We couldn&apos;t check which scales are switched on just now, so none can be recorded until
          this loads. Refresh to try again.
        </p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {options.map((o) => {
            const on = optimistic.includes(o.key);
            const saving = pendingKey === o.key;
            return (
              <label
                key={o.key}
                className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-3 hover:border-slate-300"
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={saving}
                  onChange={() => toggle(o.key)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">
                    {o.label}
                    {saving && <span className="ml-2 text-[11px] font-normal text-slate-500">Saving...</span>}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                    {o.plainName} · {o.usedOn}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
