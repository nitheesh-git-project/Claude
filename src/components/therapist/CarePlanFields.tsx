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
  /** The condition's own name, and which of the three condition types it
   *  belongs to. Both may be null in a database where an admin has not
   *  tagged the category; the picker then falls back to one ungrouped list,
   *  which is exactly how it read before. */
  categoryTitle: string | null;
  specialty: "ortho" | "neuro" | "pediatrics" | null;
};

/** Clinician-facing names for the three condition types. Kept here rather
 *  than imported from conditionSpecialty.ts because that module is the
 *  health-profile vocabulary and this is a catalogue picker -- they happen
 *  to agree today, and coupling them would make a change to one a change to
 *  the other. */
const SPECIALTY_LABELS: Record<string, string> = {
  ortho: "Orthopaedic",
  neuro: "Neurological",
  pediatrics: "Paediatric",
};

const UNATTACHED = "__unattached__";

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
  needsApproval = true,
  awaitingClinic = false,
}: {
  options: RecommendableOption[];
  value: CarePlanDraft | null;
  onChange: (next: CarePlanDraft | null) => void;
  /**
   * Whether the clinic reviews this before the patient sees it.
   *
   * Only copy depends on it, and that is the whole reason it is here:
   * telling a clinician "they see it on their dashboard" while it in fact
   * goes to a queue is the same class of mistake as telling a patient they
   * left a draft half-finished when a therapist did. Defaults to the safer
   * sentence, which is the one that promises less.
   */
  needsApproval?: boolean;
  /**
   * This patient already has a recommendation sitting in the clinic's
   * queue.
   *
   * Writing another is allowed — it lands as a new version on the same
   * thread, which is right when a clinician has genuinely changed their
   * mind — but doing it without being told is how the same plan gets
   * submitted twice by someone who assumed the first one had failed.
   */
  awaitingClinic?: boolean;
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
            {awaitingClinic ? (
              <p className="mt-1 max-w-md text-xs text-slate-500">
                You have already recommended a programme for this patient and the clinic
                has not decided yet — nothing has gone wrong, and your patient has not
                been asked for anything. Writing another replaces it.
              </p>
            ) : (
              <p className="mt-1 max-w-md text-xs text-slate-500">
                Optional. Propose a programme for this patient.{" "}
                {needsApproval
                  ? "The clinic checks it, then your patient decides whether to go ahead."
                  : "They see it on their dashboard and decide whether to go ahead."}{" "}
                Nothing is booked or charged until they do.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={start}
            className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-300"
          >
            {awaitingClinic ? "Replace it" : "Add a recommendation"}
          </button>
        </div>
      </div>
    );
  }

  // Everything below is derived from `options` and the current selection --
  // no second piece of state, so the condition, the delivery mode and the
  // count cannot disagree about which programme is selected.
  const conditionKey = selected?.categoryId ?? UNATTACHED;

  const conditionMeta = new Map<
    string,
    { key: string; label: string; specialty: string | null }
  >();
  for (const o of options) {
    const key = o.categoryId ?? UNATTACHED;
    if (conditionMeta.has(key)) continue;
    conditionMeta.set(key, {
      key,
      label: o.categoryTitle ?? (o.categoryId ? o.title : "Any condition"),
      specialty: o.specialty,
    });
  }

  // Grouped by condition type where an admin has tagged them, and under one
  // unnamed heading where they have not -- a database mid-migration reads as
  // one flat list rather than as an empty picker.
  const groupedConditions = (() => {
    const order = ["ortho", "neuro", "pediatrics", null];
    const groups: { label: string; conditions: { key: string; label: string }[] }[] = [];
    for (const specialty of order) {
      const conditions = [...conditionMeta.values()]
        .filter((c) => c.specialty === specialty)
        .sort((a, b) => a.label.localeCompare(b.label));
      if (conditions.length === 0) continue;
      groups.push({
        label: specialty ? SPECIALTY_LABELS[specialty] : "Other",
        conditions,
      });
    }
    return groups;
  })();

  const forCondition = options.filter(
    (o) => (o.categoryId ?? UNATTACHED) === conditionKey
  );
  const kindsForCondition = [...new Set(forCondition.map((o) => o.kind))];
  const countChoices = forCondition
    .filter((o) => o.kind === (value?.offerKind ?? kindsForCondition[0]))
    .sort((a, b) => a.snapshot.sessionCount - b.snapshot.sessionCount);

  /** Moving condition or delivery mode lands on a real programme rather than
   *  on nothing: a picker that can sit in a state with no package selected
   *  is a Save button that fails for a reason nobody can see. */
  function selectCondition(key: string) {
    const first = options.find((o) => (o.categoryId ?? UNATTACHED) === key);
    if (!first) return;
    patch({ packageId: first.id, offerKind: first.kind, frequencyPerWeek: null });
  }

  function selectKind(kind: CarePlanOfferKind) {
    const first = forCondition
      .filter((o) => o.kind === kind)
      .sort((a, b) => a.snapshot.sessionCount - b.snapshot.sessionCount)[0];
    if (!first) return;
    patch({ packageId: first.id, offerKind: first.kind, frequencyPerWeek: null });
  }

  const cap = Math.min(7, selected?.snapshot.maxPerWeek ?? 7);

  return (
    <div className="space-y-4 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Recommend treatment</p>
          {needsApproval && (
            <p className="mt-0.5 text-[11px] text-slate-500">
              Goes to the clinic first. Your patient sees it once it is approved.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={cancel}
          className="text-xs font-semibold text-slate-500 transition hover:text-slate-800"
        >
          Remove
        </button>
      </div>

      {/* Two questions, in the order a clinician thinks in: what kind of
          patient is this, and how much treatment do they need. The
          programme's name never appears, because it is not a decision --
          the condition and the number of sessions pick exactly one
          admin-configured row, and every number on it comes from that row.
          A single list of programme titles asked the clinician to translate
          their judgement into somebody's product name first, which is how
          the wrong one gets picked. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="care-plan-condition" className="block text-xs font-semibold text-slate-700">
            Condition
          </label>
          <select
            id="care-plan-condition"
            value={conditionKey}
            onChange={(e) => selectCondition(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-teal-500 focus:outline-none"
          >
            {groupedConditions.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.conditions.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Only where the clinic sells both against this condition. A toggle
            with one option is a decision the clinician does not have. */}
        {kindsForCondition.length > 1 && (
          <div>
            <span className="block text-xs font-semibold text-slate-700">Delivered as</span>
            <div className="mt-1.5 flex gap-2">
              {kindsForCondition.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => selectKind(k)}
                  className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    value?.offerKind === k
                      ? "border-teal-600 bg-teal-700 text-white"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {k === "home_visit_package" ? "Home visits" : "Video sessions"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <span className="block text-xs font-semibold text-slate-700">
          How many {value?.offerKind === "home_visit_package" ? "visits" : "sessions"}
        </span>
        <p className="mb-1.5 mt-0.5 text-[11px] text-slate-500">
          Price, validity and the scheduling rules come with the number — they are set by
          the clinic, not here.
        </p>
        {countChoices.length === 0 ? (
          <p className="rounded-lg bg-white p-3 text-[11px] text-slate-500">
            The clinic has nothing configured for this condition yet. An admin adds the
            programmes on Catalog → Packages.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {countChoices.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() =>
                  patch({ packageId: o.id, offerKind: o.kind, frequencyPerWeek: null })
                }
                className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                  value?.packageId === o.id
                    ? "border-teal-600 bg-teal-700 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="block font-bold">
                  {o.snapshot.sessionCount}{" "}
                  {o.kind === "home_visit_package"
                    ? o.snapshot.sessionCount === 1
                      ? "visit"
                      : "visits"
                    : o.snapshot.sessionCount === 1
                      ? "session"
                      : "sessions"}
                </span>
                <span
                  className={
                    value?.packageId === o.id ? "text-teal-100" : "text-slate-500"
                  }
                >
                  {formatInr(o.snapshot.pricePaise)}
                </span>
              </button>
            ))}
          </div>
        )}
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
