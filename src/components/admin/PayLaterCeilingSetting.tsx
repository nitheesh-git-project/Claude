"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "@/lib/useRouter";
import { useSaveSetting } from "@/lib/useSaveSetting";

// The most any one trusted patient may owe at once.
//
// **The default is no ceiling, and that is the original design rather than an
// oversight.** The population on pay-later terms is tiny and hand-picked, and
// refusing a long-standing patient at the counter is a real product decision
// rather than a safety rail -- so the two figures on this screen, the total
// and the age of the oldest unsettled session, are the intended early
// warning.
//
// This exists because a clinic that wants a limit should not have to choose
// between having one and having the feature at all, and because the honest
// way to hold an opinion the clinic may not share is a setting rather than a
// constant.
//
// Three rules follow from that:
//
// 1. **Blank is the default and the undo.** Clearing the box means no
//    ceiling, exactly as before it existed. There is deliberately no zero:
//    somebody who types 0 has almost certainly cleared the box, and reading
//    it as "refuse every booking" would switch the feature off by accident
//    through a field that says nothing about switching it off. Off is the
//    master switch above.
// 2. **Reaching it never strands anybody.** A patient at the ceiling is
//    offered the ordinary payment screen and books exactly as anyone else
//    does -- paying now is never taken away, which is the rule the whole
//    feature was built on.
// 3. **It sits here rather than in Settings**, beside the figures it acts on,
//    the same placement `promo_codes_enabled` has on Money -> Costs. Somebody
//    who has just set a limit wants to see what it would catch, not navigate
//    to another section and take the result on trust.

const MAX_CEILING_INR = 1_000_000;

/** The sentence every reader of this screen gets, whoever they are. */
function ruleSentence(ceilingPaise: number | null) {
  return ceilingPaise === null
    ? "There is no limit on what a trusted patient may owe."
    : `A patient is asked to pay now once they would owe more than ₹${(
        ceilingPaise / 100
      ).toLocaleString("en-IN")}.`;
}

/**
 * What a scope that cannot change this reads instead -- the same shape, and
 * the same reasoning, as `PayLaterAgeNote` beside it: a control that is
 * simply absent reads as a half-built screen, where one line naming the rule
 * and who owns it reads as a permission.
 */
export function PayLaterCeilingNote({
  ceilingPaise,
  managerLabel,
}: {
  ceilingPaise: number | null;
  managerLabel: string;
}) {
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <p className="text-xs text-slate-600">
        {ruleSentence(ceilingPaise)}{" "}
        <span className="text-slate-500">Only {managerLabel} can change this.</span>
      </p>
    </div>
  );
}

export default function PayLaterCeilingSetting({
  ceilingPaise,
  owedPaiseByPatient,
}: {
  ceilingPaise: number | null;
  /** Every current balance, so the effect can be shown before it is saved. */
  owedPaiseByPatient: number[];
}) {
  const fieldId = useId();
  const router = useRouter();
  const saveSetting = useSaveSetting();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(
    ceilingPaise === null ? "" : String(Math.round(ceilingPaise / 100))
  );

  const trimmed = value.trim();
  const clearing = trimmed === "";
  const parsedInr = Number(trimmed);
  const inputUsable =
    clearing ||
    (Number.isFinite(parsedInr) &&
      Number.isInteger(parsedInr) &&
      parsedInr >= 1 &&
      parsedInr <= MAX_CEILING_INR);

  // What the number in the box would do right now, computed from the same
  // balances the list below renders -- so what it promises and what happens
  // cannot disagree, the same rule the ageing preview follows.
  const wouldBeAsked =
    !clearing && inputUsable
      ? owedPaiseByPatient.filter((owed) => owed >= parsedInr * 100).length
      : null;

  function handleSave() {
    setError(null);
    if (!inputUsable) {
      setError(
        `Enter a whole number of rupees between 1 and ${MAX_CEILING_INR.toLocaleString("en-IN")}, or leave it blank for no limit.`
      );
      return;
    }
    startTransition(async () => {
      try {
        await saveSetting("pay_later_max_owed_paise", clearing ? null : parsedInr * 100);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
      <div>
        <label htmlFor={fieldId} className="block text-xs font-semibold text-slate-800">
          Most one patient may owe at once
        </label>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Leave this blank for no limit, which is how the clinic runs unless you
          set one. With a figure here, a patient who would go past it is asked to
          pay for that session now - they can still book it, and everything they
          already owe stays exactly as it is.
        </p>
        {wouldBeAsked !== null && owedPaiseByPatient.length > 0 && (
          <p className="mt-1 text-[11px] text-slate-600">
            {wouldBeAsked} of {owedPaiseByPatient.length} patient
            {owedPaiseByPatient.length === 1 ? "" : "s"} would be asked to pay now
            on their next session.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">₹</span>
        <input
          id={fieldId}
          type="number"
          min={1}
          max={MAX_CEILING_INR}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="No limit"
          className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-xs"
        />
        <button
          onClick={handleSave}
          disabled={isPending}
          className="rounded-lg bg-teal-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
