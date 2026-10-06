"use client";

import { useState } from "react";
import {
  coursePricePaise,
  MAX_COURSE_SESSIONS,
  MIN_COURSE_SESSIONS,
  offerKindFor,
  type RecommendableRate,
} from "@/lib/carePlans";

/** One condition at one delivery mode's per-session price. Loaded on the
 *  server (`loadRecommendableRates`) so every number here is the catalog's. */
export type RecommendableOption = RecommendableRate;

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

export type CarePlanDraft = {
  categoryId: string;
  sessionCount: number;
  /** Also the delivery mode: hands-on is home visits, otherwise video
   *  (`offerKindFor`). There is no second switch to disagree with it. */
  handsOnRequired: boolean;
  frequencyPerWeek: number | null;
  clinicalRationale: string;
  instructions: string;
};

const MAX_RATIONALE = 800;
const MAX_INSTRUCTIONS = 800;
const DEFAULT_SESSIONS = 6;

function formatInr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

/**
 * What a therapist recommends: a condition, how many sessions, whether it
 * needs hands-on treatment, how often, and why.
 *
 * The price is never typed. It is the condition's own per-session price --
 * the online consultation price, or the home-visit price when hands-on is
 * ticked -- times the number, shown live so the clinician sees what the
 * patient will be asked to pay. The server re-derives it from the catalog.
 *
 * Collapsed by default. A therapist finishing a note usually has nothing to
 * recommend, so this stays out of the way until asked for.
 */
export default function CarePlanFields({
  options,
  defaultCategoryId = null,
  value,
  onChange,
  needsApproval = true,
  awaitingClinic = false,
}: {
  options: RecommendableOption[];
  /** The session's own condition, picked first. Any condition can still be
   *  chosen -- a clinician may well recommend for a different one. */
  defaultCategoryId?: string | null;
  value: CarePlanDraft | null;
  onChange: (next: CarePlanDraft | null) => void;
  /** Whether the clinic reviews this before the patient sees it. Only copy
   *  depends on it; defaults to the sentence that promises less. */
  needsApproval?: boolean;
  /** This patient already has a recommendation sitting in the clinic's
   *  queue; writing another replaces it, and they should know that. */
  awaitingClinic?: boolean;
}) {
  const [open, setOpen] = useState(value !== null);
  // Kept as text so the field can be cleared while typing; the draft holds
  // the last whole number.
  const [countText, setCountText] = useState(String(value?.sessionCount ?? DEFAULT_SESSIONS));

  // The condition list is the online one: every active condition has a video
  // price, and the same conditions are what home visits are recommended for.
  const conditions = options.filter((o) => o.kind === "session_package");

  function start() {
    setOpen(true);
    const first =
      conditions.find((o) => o.categoryId === defaultCategoryId) ?? conditions[0];
    if (!first) return;
    setCountText(String(DEFAULT_SESSIONS));
    onChange({
      categoryId: first.categoryId,
      sessionCount: DEFAULT_SESSIONS,
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
                You have already recommended treatment for this patient and the clinic
                has not decided yet - nothing has gone wrong, and your patient has not
                been asked for anything. Writing another replaces it.
              </p>
            ) : (
              <p className="mt-1 max-w-md text-xs text-slate-500">
                Optional. Propose a course of sessions for this patient.{" "}
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
            disabled={conditions.length === 0}
            className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-300 disabled:opacity-60"
          >
            {awaitingClinic ? "Replace it" : "Add a recommendation"}
          </button>
        </div>
        {conditions.length === 0 && (
          <p className="mt-2 text-[11px] text-slate-500">
            No condition has a price set yet, so there is nothing to recommend. An admin
            sets them on Catalog → Conditions.
          </p>
        )}
      </div>
    );
  }

  const handsOn = value?.handsOnRequired ?? false;
  const kind = offerKindFor(handsOn);
  const condition = conditions.find((o) => o.categoryId === value?.categoryId) ?? null;
  const homeRate = options.find(
    (o) => o.kind === "home_visit_package" && o.categoryId === value?.categoryId
  );
  const rate = handsOn ? homeRate ?? null : condition;
  const unit = handsOn ? "visit" : "session";
  const units = handsOn ? "visits" : "sessions";
  const count = value?.sessionCount ?? 0;
  const countValid =
    Number.isInteger(count) && count >= MIN_COURSE_SESSIONS && count <= MAX_COURSE_SESSIONS;
  const total = rate && countValid ? coursePricePaise(rate.perSessionPaise, count) : null;

  // Grouped by condition type where an admin has tagged them, and under
  // **General** where they have not.
  const groups = (() => {
    const order = ["ortho", "neuro", "pediatrics", null] as const;
    const out: { label: string; items: RecommendableOption[] }[] = [];
    for (const specialty of order) {
      const items = conditions
        .filter((c) => c.specialty === specialty)
        .sort((a, b) => a.categoryTitle.localeCompare(b.categoryTitle));
      if (items.length) out.push({ label: specialty ? SPECIALTY_LABELS[specialty] : "General", items });
    }
    return out;
  })();

  function setCount(text: string) {
    setCountText(text);
    const n = Number(text);
    patch({ sessionCount: text.trim() === "" ? 0 : n });
  }

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

      <div className="flex gap-3">
        {condition?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={condition.imageUrl}
            alt=""
            className="hidden h-16 w-16 shrink-0 rounded-lg object-cover sm:block"
          />
        )}
        <div className="flex-1">
          <label htmlFor="care-plan-condition" className="block text-xs font-semibold text-slate-700">
            Condition
          </label>
          <select
            id="care-plan-condition"
            value={value?.categoryId ?? ""}
            onChange={(e) => {
              const nextHome = options.some(
                (o) => o.kind === "home_visit_package" && o.categoryId === e.target.value
              );
              patch({
                categoryId: e.target.value,
                // A condition with no home-visit price cannot stay hands-on.
                handsOnRequired: handsOn && nextHome,
              });
            }}
            className="mt-1.5 w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-teal-500 focus:outline-none"
          >
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map((c) => (
                  <option key={c.categoryId} value={c.categoryId}>
                    {c.categoryTitle}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={handsOn}
            disabled={!homeRate}
            onChange={(e) => patch({ handsOnRequired: e.target.checked, frequencyPerWeek: null })}
            className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
          />
          Needs hands-on treatment
        </label>
        <p className="mt-1 pl-6 text-[11px] text-slate-500">
          {homeRate
            ? handsOn
              ? "Delivered as home visits - your therapist goes to the patient."
              : "Leave unticked for video sessions. Tick it and the course becomes home visits."
            : "Home visits aren't offered right now, so this is a course of video sessions."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="block text-xs font-semibold text-slate-700">How many {units}</span>
          <input
            type="number"
            inputMode="numeric"
            min={MIN_COURSE_SESSIONS}
            max={MAX_COURSE_SESSIONS}
            step={1}
            value={countText}
            onChange={(e) => setCount(e.target.value)}
            aria-label={`How many ${units}`}
            className="mt-1.5 w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-teal-500 focus:outline-none"
          />
          {!countValid && (
            <span className="mt-1 block text-[11px] text-red-600">
              Choose between {MIN_COURSE_SESSIONS} and {MAX_COURSE_SESSIONS}.
            </span>
          )}
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-slate-700">How often, per week</span>
          <select
            value={value?.frequencyPerWeek ?? ""}
            onChange={(e) =>
              patch({ frequencyPerWeek: e.target.value ? Number(e.target.value) : null })
            }
            className="mt-1.5 w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-teal-500 focus:outline-none"
          >
            <option value="">Leave open</option>
            {Array.from({ length: 7 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} a week
              </option>
            ))}
          </select>
        </label>
      </div>

      {rate && (
        <div className="rounded-lg bg-white p-3 text-xs" data-testid="care-plan-total">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-slate-500">
              {countValid ? count : "-"} {countValid && count === 1 ? unit : units} ×{" "}
              {formatInr(rate.perSessionPaise)}
            </span>
            <span className="text-base font-bold text-slate-900">
              {total !== null ? formatInr(total) : "-"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {kind === "home_visit_package"
              ? rate.travelFeeIncluded
                ? "Travel is included. "
                : "Plus travel for the patient's area, shown to them before they pay. "
              : ""}
            {rate.sessionDurationMinutes ? `${rate.sessionDurationMinutes} min each. ` : ""}
            {rate.validityDays ? `Valid ${rate.validityDays} days from payment.` : ""}
          </p>
        </div>
      )}

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

      <label className="block">
        <span className="block text-xs font-semibold text-slate-700">
          Anything they should do or know
        </span>
        <textarea
          value={value?.instructions ?? ""}
          maxLength={MAX_INSTRUCTIONS}
          rows={2}
          onChange={(e) => patch({ instructions: e.target.value })}
          placeholder="e.g. Keep up the walking between sessions. Book the first one within a fortnight if you can."
          className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm focus:border-teal-500 focus:outline-none"
        />
      </label>

      <p className="text-[11px] text-slate-500">
        This goes to the patient as it is written. They accept and pay from their own
        dashboard - you are not booking or charging anything here.
      </p>
    </div>
  );
}
