// The pain scale as eleven buttons, 0 to 10 (B4). One pain scale on screen,
// whatever the column says (clinical.md): a Pain Map reading is stored as a
// percentage (`pain_assessments.pain_percent`, 0-100) and shown out of ten
// through `formatPainOutOfTen`. The buttons pick a whole number out of ten
// and store it times ten, exactly what the old slider stored at its stops;
// an older reading between stops (34) is still read and shown as 3.4/10.
// Dependency-free, so the screen and its tests share it.

import type { AreaPainEntry } from "@/lib/conditionIntake";

export const PAIN_SCORES: readonly number[] = Array.from({ length: 11 }, (_, i) => i);

/** 0-10 to the stored 0-100. Refuses anything that is not a whole 0-10. */
export function painPercentFromScore(score: number): number | null {
  if (!Number.isInteger(score) || score < 0 || score > 10) return null;
  return score * 10;
}

/** The button a stored reading lands on, or null when it sits between two
 *  (an older slider reading) - it is then shown, never rounded into a tap. */
export function painScoreFromPercent(percent: number): number | null {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100 || percent % 10 !== 0) return null;
  return percent / 10;
}

/** "Same as last time", "Down 2 from last time", "Up 1.5 from last time":
 *  the change said on the out-of-ten scale the screen shows. */
export function painChangeWords(previousPercent: number, nowPercent: number): string {
  const diff = (nowPercent - previousPercent) / 10;
  if (diff === 0) return "Same as last time";
  const size = Math.abs(diff);
  const text = Number.isInteger(size) ? String(size) : size.toFixed(1);
  return `${diff < 0 ? "Down" : "Up"} ${text} from last time`;
}

export type PainArea = { region: string; side: "left" | "right" | "na" };

/**
 * The area a guided assessment's pain step starts on, so the physiotherapist
 * is not asked what the record already says: the area of the latest Pain Map
 * exam, else the worst area the patient marked in their intake, else the
 * protocol's own joint (the knee assessment's knee). Always changeable.
 */
export function painStepStartArea(input: {
  exams: readonly { region: string; side: string | null; created_at: string }[];
  intakeAreas: readonly AreaPainEntry[];
  fallbackRegion?: string | null;
  knownRegions: ReadonlySet<string>;
}): PainArea | null {
  const side = (s: string | null | undefined): PainArea["side"] => (s === "left" || s === "right" ? s : "na");
  const latest = [...input.exams]
    .filter((e) => input.knownRegions.has(e.region))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  if (latest) return { region: latest.region, side: side(latest.side) };
  const worst = [...input.intakeAreas].filter((a) => input.knownRegions.has(a.region)).sort((a, b) => b.pain - a.pain)[0];
  if (worst) return { region: worst.region, side: side(worst.side) };
  if (input.fallbackRegion && input.knownRegions.has(input.fallbackRegion)) return { region: input.fallbackRegion, side: "na" };
  return null;
}
