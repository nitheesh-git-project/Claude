"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useSaveSetting } from "@/lib/useSaveSetting";
import {
  MIN_PAY_LATER_AGED_AFTER_DAYS,
  MAX_PAY_LATER_AGED_AFTER_DAYS,
} from "@/lib/patientBalances";

// How long a trusted patient's balance may sit before the clinic calls it
// worth chasing.
//
// It renders here, on Money -> Owed by Patients, rather than in Settings --
// beside the figure it colours, for the same reason promo_codes_enabled sits
// on Money -> Costs beside the campaigns it governs. Somebody who has just
// changed this number wants to watch the amber move on the list below it, not
// navigate to a different section and take the result on trust.
//
// The control is gated on the SETTINGS scope by its caller, not Money: Finance
// manages Money but holds settings at "none", so /api/admin/update-setting
// would refuse them. A control a scope cannot call must not render.
export default function PayLaterAgeSetting({ value }: { value: number }) {
  const saveSetting = useSaveSetting();
  const fieldId = useId();
  const [input, setInput] = useState(String(value));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSave() {
    const parsed = Number(input);
    setError(null);
    // Checked here so a typo is answered instantly, and again in the route and
    // again by the column's own CHECK -- this one only saves a round trip.
    if (
      !Number.isFinite(parsed) ||
      !Number.isInteger(parsed) ||
      parsed < MIN_PAY_LATER_AGED_AFTER_DAYS ||
      parsed > MAX_PAY_LATER_AGED_AFTER_DAYS
    ) {
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
    <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 pt-4">
      <div>
        <label htmlFor={fieldId} className="block text-xs font-semibold text-slate-800">
          Call a balance worth chasing after
        </label>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Patients who settle weekly want this low; patients who settle quarterly want it
          high. Anything past it turns amber here and on your Today screen.
        </p>
        {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <input
          id={fieldId}
          type="number"
          min={MIN_PAY_LATER_AGED_AFTER_DAYS}
          max={MAX_PAY_LATER_AGED_AFTER_DAYS}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="w-20 rounded-lg border border-slate-300 p-2 text-xs"
        />
        <span className="w-10 text-[11px] text-slate-500">days</span>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60"
        >
          Save
        </button>
      </div>
    </div>
  );
}
