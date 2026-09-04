"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { CONDITION_SPECIALTIES, type ConditionSpecialty } from "@/lib/conditionSpecialty";

// Which condition types the therapist's triage picker offers.
//
// Switching one off removes it from TRIAGE ONLY. An existing profile
// carrying that specialty keeps rendering exactly as before, and a
// therapist re-triaging such a patient is still offered it -- otherwise
// turning pediatrics off would blank live patient charts and strand the
// records already under it.
//
// Orthopaedic cannot be switched off: an admin who turned all three off
// would leave triage with nothing to pick and no way to onboard anybody.
// Enforced server-side too, in the update-setting route and in
// parseEnabledIntakeSpecialties -- this checkbox being disabled is the
// explanation, not the guard.
export default function IntakeSpecialtyToggles({
  enabled,
}: {
  enabled: ConditionSpecialty[];
}) {
  const router = useRouter();
  const [value, setValue] = useState<ConditionSpecialty[]>(enabled);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggle(key: ConditionSpecialty) {
    if (key === "ortho") return;
    const next = value.includes(key) ? value.filter((v) => v !== key) : [...value, key];
    const ordered = CONDITION_SPECIALTIES.map((s) => s.key).filter((k) => next.includes(k));
    const previous = value;
    setValue(ordered);
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/update-setting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "enabled_intake_specialties", value: ordered }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setValue(previous);
        setError(data.error ?? "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <h3 className="text-sm font-bold text-slate-700">Condition types offered at triage</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        What a therapist can pick when they onboard a patient. Switching one off hides it from that
        picker only — patients already recorded under it keep their profile exactly as it is.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {CONDITION_SPECIALTIES.map((s) => {
          const on = value.includes(s.key);
          const locked = s.key === "ortho";
          return (
            <label
              key={s.key}
              className={`flex items-start gap-2.5 rounded-xl border bg-white px-3.5 py-3 ${
                locked ? "cursor-default border-slate-200" : "cursor-pointer border-slate-200 hover:border-slate-300"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={locked || pending}
                onChange={() => toggle(s.key)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800">
                  <i aria-hidden className={`fa-solid ${s.icon} mr-1.5 text-[11px] text-slate-400`} />
                  {s.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500">
                  {locked ? "Always available — triage needs somewhere to land." : s.blurb}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
      {saved && !error && <p className="mt-2 text-xs font-semibold text-emerald-600">Saved.</p>}
    </div>
  );
}
