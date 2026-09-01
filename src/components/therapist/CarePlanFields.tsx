"use client";

import { useState } from "react";
import type { CarePlanOfferKind, CarePlanOfferSnapshot } from "@/lib/carePlans";

export type RecommendableOption = {
  id: string;
  kind: CarePlanOfferKind;
  title: string;
  snapshot: CarePlanOfferSnapshot;
  /** The condition this package treats, or null for one an admin left
   *  unattached. */
  categoryId: string | null;
};

export type CarePlanDraft = {
  offerKind: CarePlanOfferKind;
  packageId: string;
  handsOnRequired: boolean;
  frequencyPerWeek: number | null;
  clinicalRationale: string;
  instructions: string;
};

const MAX_RATIONALE = 800;
const MAX_INSTRUCTIONS = 800;

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

/**
 * What a therapist may recommend, and only what they may recommend.
 *
 * There is no price field here, no session-count field and no discount
 * field, and that is the whole design rather than an oversight: everything
 * financial comes from the admin-configured programme the clinician picks.
 * The four things below are clinical judgement, which is theirs.
 *
 * Collapsed by default. A therapist finishing a note usually has nothing to
 * recommend — most sessions are somewhere in the middle of a plan, not at
 * the point of proposing one — so this stays out of the way until asked
 * for, rather than being another required-looking section between them and
 * the Save button.
 */
export default function CarePlanFields({
  options,
  value,
  onChange,
}: {
  options: RecommendableOption[];
  value: CarePlanDraft | null;
  onChange: (next: CarePlanDraft | null) => void;
}) {
  const [open, setOpen] = useState(value !== null);

  const selected = value ? options.find((o) => o.id === value.packageId) ?? null : null;

  function start() {
    setOpen(true);
    const first = options[0];
    if (!first) return;
    onChange({
      offerKind: first.kind,
      packageId: first.id,
      handsOnRequired: false,
      frequencyPerWeek: null,
      clinicalRationale: "",
      instructions: "",
    });
  }

  function cancel() {
    setOpen(false);
    onChange(null);
  }

  function patch(next: Partial<CarePlanDraft>) {
    if (!value) return;
    onChange({ ...value, ...next });
  }

  if (!open) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Recommend treatment</p>
            <p className="mt-1 max-w-md text-xs text-slate-500">
              Optional. Propose a programme for this patient — they see it on their dashboard
              and decide whether to go ahead. Nothing is booked or charged until they do.
            </p>
          </div>
          <button
            type="button"
            onClick={start}
            className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-300"
          >
            Add a recommendation
          </button>
        </div>
      </div>
    );
  }

  const cap = Math.min(7, selected?.snapshot.maxPerWeek ?? 7);

  return (
    <div className="space-y-4 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-800">Recommend treatment</p>
        <button
          type="button"
          onClick={cancel}
          className="text-xs font-semibold text-slate-500 transition hover:text-slate-800"
        >
          Remove
        </button>
      </div>

      <div>
        <label
          htmlFor="care-plan-package"
          className="block text-xs font-semibold text-slate-700"
        >
          Programme
        </label>
        <p className="mb-1.5 mt-0.5 text-[11px] text-slate-500">
          Sessions, price and validity come with the programme — they are set by the clinic,
          not here.
        </p>
        <select
          id="care-plan-package"
          value={value?.packageId ?? ""}
          onChange={(e) => {
            const option = options.find((o) => o.id === e.target.value);
            if (!option) return;
            patch({ packageId: option.id, offerKind: option.kind, frequencyPerWeek: null });
          }}
          className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-teal-500 focus:outline-none"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title} — {o.snapshot.sessionCount} session
              {o.snapshot.sessionCount === 1 ? "" : "s"}, {formatInr(o.snapshot.pricePaise)}
              {o.kind === "home_visit_package" ? " (home visits)" : ""}
            </option>
          ))}
        </select>
      </div>

      {selected && (
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-white p-3 text-[11px] sm:grid-cols-4">
          <div>
            <dt className="text-slate-400">Sessions</dt>
            <dd className="font-semibold text-slate-800">{selected.snapshot.sessionCount}</dd>
          </div>
          <div>
            <dt className="text-slate-400">Price</dt>
            <dd className="font-semibold text-slate-800">
              {formatInr(selected.snapshot.pricePaise)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Valid for</dt>
            <dd className="font-semibold text-slate-800">
              {selected.snapshot.validityDays ? `${selected.snapshot.validityDays} days` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-400">Each session</dt>
            <dd className="font-semibold text-slate-800">
              {selected.snapshot.sessionDurationMinutes
                ? `${selected.snapshot.sessionDurationMinutes} min`
                : "—"}
            </dd>
          </div>
        </dl>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-slate-700">
            How often, per week
          </label>
          <select
            value={value?.frequencyPerWeek ?? ""}
            onChange={(e) =>
              patch({ frequencyPerWeek: e.target.value ? Number(e.target.value) : null })
            }
            className="mt-1.5 w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-teal-500 focus:outline-none"
          >
            <option value="">Leave open</option>
            {Array.from({ length: cap }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} a week
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={value?.handsOnRequired ?? false}
              onChange={(e) => patch({ handsOnRequired: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
            />
            Needs hands-on treatment
          </label>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700">
          Why this, for this patient
        </label>
        <p className="mb-1.5 mt-0.5 text-[11px] text-slate-500">
          The patient reads this. Write it to them, not about them.
        </p>
        <textarea
          value={value?.clinicalRationale ?? ""}
          maxLength={MAX_RATIONALE}
          rows={3}
          onChange={(e) => patch({ clinicalRationale: e.target.value })}
          placeholder="e.g. Your range has improved but the pain returns after a day at your desk. A structured block will hold the gains."
          className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-teal-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700">
          Anything they should do or know
        </label>
        <textarea
          value={value?.instructions ?? ""}
          maxLength={MAX_INSTRUCTIONS}
          rows={2}
          onChange={(e) => patch({ instructions: e.target.value })}
          placeholder="e.g. Keep up the walking between sessions. Book the first one within a fortnight if you can."
          className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-teal-500 focus:outline-none"
        />
      </div>

      <p className="text-[11px] text-slate-500">
        This goes to the patient as it is written. They accept and pay from their own
        dashboard — you are not booking or charging anything here.
      </p>
    </div>
  );
}
