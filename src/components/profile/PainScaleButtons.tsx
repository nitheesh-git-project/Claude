"use client";

import { PAIN_SCORES } from "@/lib/painScale";

/**
 * The pain scale as eleven buttons, 0 to 10, each at least 44px: one tap,
 * the number the patient says. Six then five on a narrow screen, one row of
 * eleven from `sm` up. The caller stores the pick times ten
 * (`painPercentFromScore`, painScale.ts); this only picks. Used by the
 * guided assessment's pain step and by the Pain Map exam dialog, so the two
 * never show two different scales.
 */
export default function PainScaleButtons({
  value,
  onChange,
  labelledBy,
  disabled = false,
  large = false,
}: {
  /** The picked score 0-10, or null for none yet. */
  value: number | null;
  onChange: (score: number) => void;
  /** The id of the visible label this group answers. */
  labelledBy: string;
  disabled?: boolean;
  /** The cockpit's size: larger digits for a quick glance beside Meet. */
  large?: boolean;
}) {
  return (
    <div role="group" aria-labelledby={labelledBy} data-testid="pain-scale-buttons" className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
      {PAIN_SCORES.map((n) => {
        const on = value === n;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            aria-label={`${n} out of 10`}
            data-testid={`pain-score-${n}`}
            onClick={() => onChange(n)}
            className={`min-h-[44px] min-w-[44px] rounded-xl border font-bold tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 disabled:opacity-60 ${
              large ? "text-lg" : "text-base"
            } ${on ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-900 hover:border-teal-500"}`}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
