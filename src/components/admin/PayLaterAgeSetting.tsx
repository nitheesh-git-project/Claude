"use client";

import { useId, useOptimistic, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useSaveSetting } from "@/lib/useSaveSetting";
import {
  MIN_PAY_LATER_AGED_AFTER_DAYS,
  MAX_PAY_LATER_AGED_AFTER_DAYS,
  isAgedBalance,
  type AgedAfterDays,
} from "@/lib/patientBalances";

// How long a trusted patient's balance may sit before the clinic calls it
// worth chasing -- and whether it wants to be warned at all.
//
// It renders here, on Money -> Owed by Patients, rather than in Settings --
// beside the figure it colours, for the same reason promo_codes_enabled sits
// on Money -> Costs beside the campaigns it governs. Somebody who has just
// changed this number wants to watch the amber move on the list below it, not
// navigate to a different section and take the result on trust.
//
// The control is gated on the SETTINGS scope by its caller, not Money: Finance
// manages Money but holds settings at "none", so /api/admin/update-setting
// would refuse them. A control a scope cannot call must not render -- but its
// absence is explained rather than left as a gap, which is what
// PayLaterAgeNote beside it is for.

/** The sentence every reader of this screen gets, whoever they are. */
function ruleSentence(days: number, enabled: boolean) {
  return enabled
    ? `Balances turn amber after ${days} day${days === 1 ? "" : "s"}.`
    : "Nothing turns amber -- ageing warnings are off.";
}

/**
 * What a scope that cannot change this reads instead.
 *
 * Finance is the whole audience: only `full` holds settings at "manage", and
 * only `full` and `finance` can open Money at all. A control that simply is
 * not there reads as a half-built screen; one line naming the rule and who
 * owns it reads as a permission, which is what it is.
 */
export function PayLaterAgeNote({
  days,
  enabled,
  managerLabel,
}: {
  days: number;
  enabled: boolean;
  managerLabel: string;
}) {
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <p className="text-xs text-slate-600">
        {ruleSentence(days, enabled)}{" "}
        <span className="text-slate-500">Only {managerLabel} can change this.</span>
      </p>
    </div>
  );
}

/**
 * The clinic-wide switch, beside the figures it governs.
 *
 * Off is not a stop on money already owed: those sessions stay listed and
 * stay settleable. It gates who may be put on terms from here on, which is
 * why the wording is about new patients rather than about the feature.
 */
export function PayLaterMasterSwitch({ enabled }: { enabled: boolean }) {
  const saveSetting = useSaveSetting();
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleToggle() {
    const next = !optimistic;
    setError(null);
    startTransition(async () => {
      setOptimistic(next);
      try {
        await saveSetting("pay_later_enabled", next);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="flex items-start justify-between gap-4 border-t border-slate-100 pt-4">
      <div>
        <p className="text-xs font-semibold text-slate-800">
          Let trusted patients pay after their treatment
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          {optimistic
            ? "You can now allow a patient to pay later from their own profile."
            : "Nobody new can be put on pay later. Anything already owed is still owed, and can still be settled."}
        </p>
        {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      </div>
      <button
        onClick={handleToggle}
        disabled={isPending}
        className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${
          optimistic ? "bg-teal-600" : "bg-slate-300"
        }`}
        aria-pressed={optimistic}
        aria-label="Let trusted patients pay after their treatment"
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            optimistic ? "left-[22px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export default function PayLaterAgeSetting({
  setting,
  enabled,
  /** Every owing patient's age in days, so the effect of a number can be seen
   *  before it is saved. Already computed for the list below; nothing is
   *  fetched to answer it. */
  ageDays,
}: {
  setting: AgedAfterDays;
  enabled: boolean;
  ageDays: number[];
}) {
  const saveSetting = useSaveSetting();
  const fieldId = useId();
  const [input, setInput] = useState(String(setting.days));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [optimisticEnabled, setOptimisticEnabled] = useOptimistic(enabled);
  const router = useRouter();

  const parsed = Number(input);
  const inputUsable =
    Number.isFinite(parsed) &&
    Number.isInteger(parsed) &&
    parsed >= MIN_PAY_LATER_AGED_AFTER_DAYS &&
    parsed <= MAX_PAY_LATER_AGED_AFTER_DAYS;

  // The preview. It runs the same judgement the screen renders with, over the
  // same ages, so what it promises and what appears cannot disagree -- and an
  // owner trying 30, then 45, then 60 watches the count move instead of saving
  // three times and reading the list back after each one.
  const previewCount = inputUsable
    ? ageDays.filter((d) => isAgedBalance(d, { days: parsed, enabled: true })).length
    : null;

  function handleToggle() {
    const next = !optimisticEnabled;
    setError(null);
    startTransition(async () => {
      setOptimisticEnabled(next);
      try {
        await saveSetting("pay_later_age_warning_enabled", next);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  function handleSave() {
    setError(null);
    // Checked here so a typo is answered instantly, and again in the route and
    // again by the column's own CHECK -- this one only saves a round trip.
    if (!inputUsable) {
      setError(
        `Enter a whole number of days between ${MIN_PAY_LATER_AGED_AFTER_DAYS} and ${MAX_PAY_LATER_AGED_AFTER_DAYS}.`
      );
      return;
    }
    startTransition(async () => {
      try {
        await saveSetting("pay_later_aged_after_days", parsed);
        // The confirmation is the toast, and the amber moving on the list
        // below -- there is no "Saved." line here because unlike the settings
        // screens this control can point at what it changed.
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-800">
            Warn me when a balance gets old
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {optimisticEnabled
              ? "Anything past the number below turns amber here and on your Today screen."
              : "Off. You still see what every patient owes - nothing is flagged."}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={isPending}
          className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${
            optimisticEnabled ? "bg-teal-600" : "bg-slate-300"
          }`}
          aria-pressed={optimisticEnabled}
          aria-label="Warn me when a balance gets old"
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
              optimisticEnabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <label htmlFor={fieldId} className="block text-xs font-semibold text-slate-800">
            Call a balance worth chasing after
          </label>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Patients who settle weekly want this low; patients who settle quarterly want it
            high.
          </p>
          {/* The effect, before it is saved. */}
          {optimisticEnabled && previewCount !== null && (
            <p className="mt-1 text-[11px] text-slate-600">
              <span className="font-semibold">
                {previewCount} of {ageDays.length}
              </span>{" "}
              {ageDays.length === 1 ? "patient" : "patients"} would show as worth chasing.
            </p>
          )}
          {/* A stored number that could not be used. Said out loud, or the
              screen shows one figure while the database holds another and
              nothing on the page reconciles them. */}
          {setting.ignoredValue !== null && (
            <p className="mt-1 text-[11px] text-amber-700">
              {setting.ignoredValue} is saved but cannot be used, so the built-in{" "}
              {setting.days} days is in force. Save a number between{" "}
              {MIN_PAY_LATER_AGED_AFTER_DAYS} and {MAX_PAY_LATER_AGED_AFTER_DAYS} to replace
              it.
            </p>
          )}
          {setting.ignoredValue === null && (
            <p className="mt-1 text-[11px] text-slate-500">
              {setting.source === "clinic" ? "Set by you." : "Built-in default."}
            </p>
          )}
          {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            id={fieldId}
            type="number"
            min={MIN_PAY_LATER_AGED_AFTER_DAYS}
            max={MAX_PAY_LATER_AGED_AFTER_DAYS}
            value={input}
            // Disabled rather than hidden while the warning is off, and the
            // value is kept, so switching back on restores what the clinic
            // chose rather than the default.
            disabled={!optimisticEnabled}
            onChange={(e) => setInput(e.target.value)}
            className="w-20 rounded-lg border border-slate-300 p-2 text-xs disabled:bg-slate-100 disabled:text-slate-500"
          />
          <span className="w-10 text-[11px] text-slate-500">days</span>
          <button
            onClick={handleSave}
            disabled={isPending || !optimisticEnabled}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
