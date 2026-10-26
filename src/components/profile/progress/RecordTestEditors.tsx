"use client";

import { useId } from "react";
import { scoreSheetTotal, type ScoreSheet } from "@/lib/clinicalCalculators";
import { formatReading, unitSuffix } from "@/lib/progressChart";
import {
  validateMeasurementValue,
  type OutcomeMeasure,
} from "@/lib/outcomeMeasures";
import { needsThirdReading, summariseTrials } from "@/lib/testTimers";
import { parseNumberText } from "@/lib/recordTest";

// The input surfaces of the Record-a-test dialog, one per way a number is
// produced. Each is controlled: the dialog owns the state and
// `computeEntry()` (src/lib/recordTest.ts) turns it into the value, so these
// only lay out boxes and say what is wrong with what is typed.

const FIELD =
  "min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";

function rangeHint(m: OutcomeMeasure): string {
  if (m.grades) return `One of: ${m.grades.map((g) => g.value).join(", ")}.`;
  return `${m.min} to ${m.max}${unitSuffix(m.unit)}${m.step ? `, in steps of ${m.step}` : ""}.`;
}

/** A typed result, checked against the measure's range as it is typed. */
export function NumberBox({
  measure,
  label,
  text,
  onText,
}: {
  measure: OutcomeMeasure;
  label: string;
  text: string;
  onText: (next: string) => void;
}) {
  const id = useId();
  const parsed = parseNumberText(text);
  const checked = parsed === undefined ? null : validateMeasurementValue(measure.key, parsed);
  const problem = checked && !checked.ok ? checked.error : null;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-900">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        step="any"
        value={text}
        onChange={(e) => onText(e.target.value)}
        aria-describedby={`${id}-hint`}
        aria-invalid={problem ? true : undefined}
        className={`mt-1 max-w-xs ${FIELD}`}
      />
      <p id={`${id}-hint`} className={`mt-1 text-xs ${problem ? "font-semibold text-red-800" : "text-slate-600"}`}>
        {problem ?? rangeHint(measure)}
      </p>
    </div>
  );
}

/** A rating or grade chosen by tapping, never typed: the scale's own values
 *  are the only answers. */
export function ChoiceButtons({
  measure,
  label,
  value,
  onChange,
}: {
  measure: OutcomeMeasure;
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
}) {
  const options: { value: number; short: string; meaning?: string }[] = measure.grades
    ? measure.grades.map((g) => ({ value: g.value, short: String(g.value), meaning: g.label }))
    : Array.from({ length: Math.floor((measure.max - measure.min) / (measure.step ?? 1)) + 1 }, (_, i) => {
        const v = measure.min + i * (measure.step ?? 1);
        return { value: v, short: String(v) };
      });
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-slate-900">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(value === o.value ? null : o.value)}
            className={`min-h-[48px] min-w-[48px] rounded-xl border px-3 text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 ${
              value === o.value
                ? "border-teal-700 bg-teal-700 text-white"
                : "border-slate-300 bg-white text-slate-800 hover:border-teal-500"
            }`}
          >
            {o.short}
            {o.meaning && o.meaning !== o.short && <span className="ml-1.5 text-xs font-medium opacity-90">{o.meaning}</span>}
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-slate-600">{rangeHint(measure)}</p>
    </fieldset>
  );
}

function itemMaxAt(sheet: ScoreSheet, index: number): number {
  return typeof sheet.itemMax === "number" ? sheet.itemMax : sheet.itemMax[index];
}

function itemOptions(sheet: ScoreSheet, index: number): number[] {
  const out: number[] = [];
  for (let v = sheet.itemMin; v <= itemMaxAt(sheet, index) + 1e-9; v += sheet.itemStep) out.push(Math.round(v * 1000) / 1000);
  return out;
}

/**
 * A score sheet: one row per item, with the sub-total of each section and the
 * total as items are entered (`scoreSheetTotal`). A blank is a choice of its
 * own, because a few scales allow some; the line under the total says how
 * many are allowed and refuses a total built from too few answers. Each item
 * is tapped or picked from the scale's own values - a typed 7 on a 0-4 item
 * is not something this offers.
 */
export function ScoreSheetEditor({
  measure,
  sheet,
  answers,
  onChange,
}: {
  measure: OutcomeMeasure;
  sheet: ScoreSheet;
  answers: (number | null)[];
  onChange: (next: (number | null)[]) => void;
}) {
  const id = useId();
  const result = scoreSheetTotal(sheet, answers);
  const answered = answers.filter((a) => a !== null).length;
  const sections = sheet.sections ?? [{ key: "all", label: "Items", itemCount: sheet.itemCount }];
  const groups = sections.map((section, i) => ({
    section,
    start: sections.slice(0, i).reduce((sum, s) => sum + s.itemCount, 0),
  }));

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600">
        Enter the score for each item from the completed sheet.{" "}
        {sheet.maxBlanks > 0
          ? `Up to ${sheet.maxBlanks} ${sheet.maxBlanks === 1 ? "item" : "items"} may be left blank (ask it aloud first); with more missing the total is not valid.`
          : "Every item must be answered for the total to be valid."}
      </p>

      {groups.map(({ section, start }) => (
        <fieldset key={section.key} className="rounded-xl border border-slate-200 p-3">
          {sheet.sections && (
            <legend className="px-1 text-sm font-semibold text-slate-900">
              {section.label}
              {result.ok && result.subtotals[section.key] !== undefined && (
                <span className="ml-2 text-xs font-medium text-slate-600">
                  {result.subtotals[section.key] === null ? "sub-total: has a blank" : `sub-total ${result.subtotals[section.key]}`}
                </span>
              )}
            </legend>
          )}
          <ul className="divide-y divide-slate-100">
            {Array.from({ length: section.itemCount }, (_, k) => start + k).map((index) => {
              const options = itemOptions(sheet, index);
              const name = sheet.itemLabels?.[index] ?? `Item ${index + 1}`;
              const value = answers[index] ?? null;
              const set = (next: number | null) => onChange(answers.map((a, i) => (i === index ? next : a)));
              return (
                <li key={index} className="py-2">
                  <p className="text-sm text-slate-800" id={`${id}-${index}`}>
                    {name}
                  </p>
                  {options.length <= 6 ? (
                    <div role="group" aria-labelledby={`${id}-${index}`} className="mt-1.5 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        aria-pressed={value === null}
                        aria-label={`${name}: blank`}
                        onClick={() => set(null)}
                        className={`min-h-[44px] min-w-[44px] rounded-lg border px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                          value === null ? "border-slate-600 bg-slate-200 text-slate-900" : "border-slate-300 bg-white text-slate-600"
                        }`}
                      >
                        {"–"}
                      </button>
                      {options.map((o) => (
                        <button
                          key={o}
                          type="button"
                          aria-pressed={value === o}
                          aria-label={`${name}: ${o}`}
                          onClick={() => set(o)}
                          className={`min-h-[44px] min-w-[44px] rounded-lg border px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 ${
                            value === o ? "border-teal-700 bg-teal-700 text-white" : "border-slate-300 bg-white text-slate-800 hover:border-teal-500"
                          }`}
                        >
                          {o}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <select
                      aria-labelledby={`${id}-${index}`}
                      value={value === null ? "" : String(value)}
                      onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))}
                      className={`mt-1.5 max-w-[10rem] ${FIELD}`}
                    >
                      <option value="">Blank</option>
                      {options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}

      <p role="status" className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">
        {result.ok ? (
          <>
            <span className="font-semibold">Total {formatReading(result.total, measure.decimals, measure.unit)}</span>
            {!result.complete && ` (${result.blanks} blank, ${result.answered} answered)`}
          </>
        ) : answered === 0 ? (
          "Nothing entered yet."
        ) : (
          <span className="text-red-800">{result.error}</span>
        )}
      </p>
    </div>
  );
}

/**
 * Hand-entered trials for a test with no embedded timer (goniometry: two
 * readings, a third if they differ by more than 5 degrees, the middle one
 * kept). The kept value is worked out beside the boxes by the measure's own
 * rule.
 */
export function TrialsEditor({
  measure,
  texts,
  onTexts,
  maxTrials,
}: {
  measure: OutcomeMeasure;
  texts: string[];
  onTexts: (next: string[]) => void;
  maxTrials: number;
}) {
  const id = useId();
  const rule = measure.trials!;
  const slots = Array.from({ length: maxTrials }, (_, i) => texts[i] ?? "");
  const values = slots.map(parseNumberText).filter((v): v is number => v !== undefined && Number.isFinite(v));
  const summary = values.length ? summariseTrials(values, { keep: rule.keep }, measure.better, measure.decimals) : null;
  const third = rule.keep === "median" && needsThirdReading(values.slice(0, 2));
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-slate-900">Readings</legend>
      {rule.note && <p className="mt-0.5 text-xs text-slate-600">{rule.note}</p>}
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {slots.map((text, i) => (
          <div key={i}>
            <label htmlFor={`${id}-${i}`} className="block text-xs font-semibold text-slate-800">
              {i + 1 > rule.count ? `Extra reading ${i + 1}` : `Reading ${i + 1}`} {unitSuffix(measure.unit) ? `(${unitSuffix(measure.unit).trim()})` : ""}
            </label>
            <input
              id={`${id}-${i}`}
              type="number"
              inputMode="decimal"
              step="any"
              value={text}
              onChange={(e) => onTexts(slots.map((t, j) => (j === i ? e.target.value : t)))}
              className={`mt-1 ${FIELD}`}
            />
          </div>
        ))}
      </div>
      {third && (
        <p role="status" className="mt-2 text-xs font-semibold text-amber-900">
          The first two differ by more than 5 degrees. Take a third reading and the middle one is kept.
        </p>
      )}
      {summary && summary.kept !== null && (
        <p className="mt-2 text-sm text-slate-800">
          Kept ({rule.keep === "median" ? "middle" : rule.keep}):{" "}
          <span className="font-semibold">{formatReading(summary.kept, measure.decimals, measure.unit)}</span>
        </p>
      )}
    </fieldset>
  );
}

/** Three maximal pushes each side with the dynamometer: the averages and the
 *  symmetry index are worked out by the dialog; this lays out the boxes. */
export function StrengthEditor({
  injured,
  healthy,
  onInjured,
  onHealthy,
  note,
}: {
  injured: string[];
  healthy: string[];
  onInjured: (next: string[]) => void;
  onHealthy: (next: string[]) => void;
  note?: string;
}) {
  const id = useId();
  const column = (title: string, texts: string[], set: (next: string[]) => void, prefix: string) => (
    <fieldset>
      <legend className="text-sm font-semibold text-slate-900">{title}</legend>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i}>
            <label htmlFor={`${id}-${prefix}-${i}`} className="block text-xs font-semibold text-slate-800">
              Push {i + 1}
            </label>
            <input
              id={`${id}-${prefix}-${i}`}
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={texts[i] ?? ""}
              onChange={(e) => set([0, 1, 2].map((j) => (j === i ? e.target.value : texts[j] ?? "")))}
              className={`mt-1 ${FIELD}`}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="space-y-4">
      {note && <p className="text-xs text-slate-600">{note} Use the same units on both sides.</p>}
      {column("Injured side", injured, onInjured, "inj")}
      {column("Healthy side", healthy, onHealthy, "hea")}
    </div>
  );
}

const READING_LABEL: Record<string, string> = {
  lying_systolic: "Lying, top number",
  lying_diastolic: "Lying, bottom number",
  standing_1min_systolic: "Standing 1 minute, top",
  standing_1min_diastolic: "Standing 1 minute, bottom",
  standing_3min_systolic: "Standing 3 minutes, top",
  standing_3min_diastolic: "Standing 3 minutes, bottom",
  systolic: "Top number",
  diastolic: "Bottom number",
};

/** Blood pressure readings: lying and standing (the orthostatic drop) or a
 *  single seated pair (`blood_pressure`) -- the registry's own named
 *  readings, from which the value is derived and re-checked. */
export function ReadingsEditor({
  keys,
  texts,
  onTexts,
}: {
  keys: readonly string[];
  texts: Record<string, string>;
  onTexts: (next: Record<string, string>) => void;
}) {
  const id = useId();
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-slate-900">Blood pressure readings (mmHg)</legend>
      <p className="mt-0.5 text-xs text-slate-600">
        {keys.includes("lying_systolic")
          ? "Lie down for 5 minutes and measure. Stand, and measure at 1 minute and at 3 minutes. A fall of 20 or more in the top number, or 10 or more in the bottom, is positive."
          : "Seated, same arm each time. Over 180/100 at rest means no exercise today: tell the patient's doctor."}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {keys.map((key) => (
          <div key={key}>
            <label htmlFor={`${id}-${key}`} className="block text-xs font-semibold text-slate-800">
              {READING_LABEL[key] ?? key}
            </label>
            <input
              id={`${id}-${key}`}
              type="number"
              inputMode="numeric"
              step={1}
              value={texts[key] ?? ""}
              onChange={(e) => onTexts({ ...texts, [key]: e.target.value })}
              className={`mt-1 ${FIELD}`}
            />
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * A yes/no checklist (the home safety check): each item is answered "Done"
 * or "Not yet", never left blank, so an unticked item is a statement. The
 * answers are stored as 1 / 0 in the same readings map the blood-pressure
 * boxes use (computeEntry reads them).
 */
export function ChecklistEditor({
  items,
  texts,
  onTexts,
}: {
  items: readonly { key: string; label: string }[];
  texts: Record<string, string>;
  onTexts: (next: Record<string, string>) => void;
}) {
  const id = useId();
  const done = items.filter((i) => texts[i.key] === "1").length;
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-slate-900">What is already in place at home</legend>
      <p className="mt-0.5 text-xs text-slate-600">Answer every line. {done} of {items.length} done so far.</p>
      <ul className="mt-2 space-y-2">
        {items.map((item) => (
          <li key={item.key} className="rounded-xl border border-slate-200 p-2">
            <p id={`${id}-${item.key}`} className="text-sm font-semibold text-slate-900">
              {item.label}
            </p>
            <div role="radiogroup" aria-labelledby={`${id}-${item.key}`} className="mt-1 flex gap-2">
              {([["1", "Done"], ["0", "Not yet"]] as const).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex min-h-[44px] flex-1 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-semibold focus-within:ring-2 focus-within:ring-teal-600 ${
                    texts[item.key] === value ? "border-teal-700 bg-teal-50 text-teal-900" : "border-slate-300 bg-white text-slate-800"
                  }`}
                >
                  <input
                    type="radio"
                    name={`${id}-${item.key}`}
                    value={value}
                    checked={texts[item.key] === value}
                    onChange={() => onTexts({ ...texts, [item.key]: value })}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
