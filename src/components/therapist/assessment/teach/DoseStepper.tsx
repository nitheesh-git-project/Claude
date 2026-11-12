"use client";

import { DOSE_FIELD_TEXT, canStep, stepDose, type DoseField } from "@/lib/teachTool";
import type { ExerciseDose } from "@/lib/exerciseLibrary";

/**
 * One number of a dose with a big minus and plus: two 48px buttons round a
 * large value, no typing. The value is a live output so a screen reader
 * hears the new number after each tap.
 */
export default function DoseStepper({
  field,
  dose,
  exerciseName,
  onChange,
}: {
  field: DoseField;
  dose: ExerciseDose;
  exerciseName: string;
  onChange: (next: ExerciseDose) => void;
}) {
  const text = DOSE_FIELD_TEXT[field];
  const value = dose[field];
  if (value === null) return null;
  const btn =
    "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-2xl font-bold text-slate-900 transition hover:border-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div role="group" aria-label={`${text.label} for ${exerciseName}`} className="flex min-w-0 flex-col gap-1" data-testid={`dose-${field}`}>
      <span className="text-[13px] font-semibold text-slate-800">{text.label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btn}
          aria-label={`Fewer: ${text.label.toLowerCase()}`}
          disabled={!canStep(dose, field, -1)}
          onClick={() => onChange(stepDose(dose, field, -1))}
        >
          <span aria-hidden="true">−</span>
        </button>
        <output className="min-w-[3.5rem] text-center" aria-live="polite">
          <span className="block font-display text-2xl font-extrabold leading-none text-slate-900" data-testid={`dose-${field}-value`}>
            {value}
          </span>
          <span className="block text-[11px] font-medium text-slate-700">{text.unit}</span>
        </output>
        <button
          type="button"
          className={btn}
          aria-label={`More: ${text.label.toLowerCase()}`}
          disabled={!canStep(dose, field, 1)}
          onClick={() => onChange(stepDose(dose, field, 1))}
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>
    </div>
  );
}
