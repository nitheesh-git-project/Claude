import {
  STEADI_BALANCE_STAGE,
  STEADI_GAIT_SPEED_MPS,
  STEADI_TUG_SECONDS,
  chairStandNorm,
  type Sex,
} from "@/lib/clinicalCalculators";
import type { SteadiTestReading } from "@/lib/geriatricRisk";
import type { MeasurementPoint } from "@/lib/outcomeSeries";
import { readingText, type Voice } from "@/lib/progressView";

// The four STEADI test cards on the Strength and balance care page (Health
// Profile redesign, phase 6b): each test's latest reading, a badge that says
// where it sits against its own line, and the reading before it. Pure.
//
// The badge is "In the safer range", "Close to it" (inside a short margin of
// the line, on the wrong side) or "Not yet", and "Not done yet" / "No age
// norm yet" where nothing can be judged. "Close" is this module's wording of
// a margin, not the handbook's: 15% of the TUG and walking-speed lines, one
// stand under the chair-stand norm, one stage short of the balance line. To
// be verified by a senior physiotherapist against its source.

export type SteadiBadge = "safer" | "close" | "not_yet" | "not_done" | "no_norm";

export type SteadiCard = {
  key: SteadiTestReading["key"];
  measureKey: string;
  /** The test's name for this reader. */
  name: string;
  badge: SteadiBadge;
  badgeText: string;
  /** "11.1 seconds", "Stage 3", or null when not done. */
  valueText: string | null;
  /** "Safer range: under 12 seconds". */
  lineText: string;
  /** "Was 14.2 seconds on 3 Aug 2026", or null with no earlier reading. */
  wasText: string | null;
  /** A second line: the arms rule, the age and sex norm. */
  note: string | null;
  /** 0-1 along a little bar whose far end is comfortably past the safer line
   *  (1 is the safer side); null when not done. */
  position: number | null;
  /** Where the safer line sits on that bar, 0-1. */
  linePosition: number;
  measuredAt: string | null;
};

const STAGE_WORDS: Record<number, string> = {
  0: "Could not hold stage 1",
  1: "Stage 1 (feet together)",
  2: "Stage 2 (semi-tandem)",
  3: "Stage 3 (heel to toe)",
  4: "Stage 4 (one leg)",
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function earlier(points: readonly MeasurementPoint[], measureKey: string, latestId: string | null): MeasurementPoint | null {
  const rows = points
    .filter((p) => p.measureKey === measureKey && p.id !== latestId)
    .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt) || (a.id < b.id ? 1 : -1));
  return rows[0] ?? null;
}

export function steadiCards(input: {
  tests: readonly SteadiTestReading[];
  points: readonly MeasurementPoint[];
  ageYears: number | null;
  sex: Sex | null;
  voice: Voice;
  formatDate: (iso: string) => string;
}): SteadiCard[] {
  const patient = input.voice === "patient";
  return input.tests.map((t): SteadiCard => {
    const before = earlier(input.points, t.measureKey, t.measurementId);
    const unitText = (v: number): string =>
      t.key === "tug" ? readingText(v, 1, "seconds") : t.key === "gait_speed" ? readingText(v, 2, "m/s") : t.key === "chair_stand" ? readingText(v, 0, "stands") : STAGE_WORDS[Math.round(v)] ?? `Stage ${v}`;
    const wasText = before ? `Was ${unitText(before.value)} on ${input.formatDate(before.measuredAt)}` : null;
    const name =
      t.key === "tug"
        ? patient ? "Get up, walk and sit back down" : "Timed Up and Go"
        : t.key === "chair_stand"
          ? patient ? "Standing up from a chair, 30 seconds" : "30-second chair stand"
          : t.key === "four_stage_balance"
            ? patient ? "Balance in four positions" : "4-stage balance"
            : patient ? "How fast you walk" : "Walking speed (4 metres)";

    let lineText = "";
    let linePosition = 0.5;
    let note: string | null = null;
    let position: number | null = null;
    let close = false;

    if (t.key === "tug") {
      lineText = `Safer range: under ${STEADI_TUG_SECONDS} seconds`;
      // Bar from 20 s (left, worse) to 6 s (right, better).
      linePosition = clamp01((20 - STEADI_TUG_SECONDS) / 14);
      if (t.value !== null) {
        position = clamp01((20 - t.value) / 14);
        close = t.higherRisk === true && t.value < STEADI_TUG_SECONDS * 1.15;
      }
    } else if (t.key === "gait_speed") {
      lineText = `Safer range: ${STEADI_GAIT_SPEED_MPS} m/s or faster`;
      linePosition = clamp01(STEADI_GAIT_SPEED_MPS / 1.4);
      if (t.value !== null) {
        position = clamp01(t.value / 1.4);
        close = t.higherRisk === true && t.value >= STEADI_GAIT_SPEED_MPS * 0.85;
      }
    } else if (t.key === "four_stage_balance") {
      lineText = `Safer range: holding stage ${STEADI_BALANCE_STAGE} (heel to toe) for 10 seconds`;
      linePosition = STEADI_BALANCE_STAGE / 4;
      if (t.value !== null) {
        position = clamp01(t.value / 4);
        close = t.higherRisk === true && t.value >= STEADI_BALANCE_STAGE - 1;
      }
    } else {
      const norm = input.ageYears !== null && input.sex ? chairStandNorm(input.ageYears, input.sex) : null;
      if (norm) {
        lineText = `Safer range: ${norm.belowAverageUnder} or more stands${patient ? "" : ` (${input.sex === "female" ? "women" : "men"} ${norm.ageBand})`}`;
        linePosition = clamp01(norm.belowAverageUnder / 20);
        if (t.value !== null) {
          const score = t.usedArms ? 0 : t.value;
          position = clamp01(score / 20);
          close = t.higherRisk === true && !t.usedArms && score >= norm.belowAverageUnder - 1;
        }
      } else {
        lineText = patient
          ? "There is no norm for your age and sex yet, so this one is recorded but not judged"
          : "No age-and-sex norm on file, so this is recorded but not judged";
        linePosition = 0.5;
        if (t.value !== null) position = clamp01((t.usedArms ? 0 : t.value) / 20);
      }
      if (t.usedArms) {
        note = patient ? "You used your arms to stand, so this scores 0." : "Used the arms: scored 0 (the CDC rule).";
      }
    }

    let badge: SteadiBadge;
    if (t.value === null) badge = "not_done";
    else if (t.noNorm) badge = "no_norm";
    else if (t.higherRisk === false) badge = "safer";
    else if (close) badge = "close";
    else badge = "not_yet";

    const badgeText = {
      safer: "In the safer range",
      close: "Close to the safer range",
      not_yet: "Not yet in the safer range",
      not_done: "Not done yet",
      no_norm: "Recorded, not judged",
    }[badge];

    return {
      key: t.key,
      measureKey: t.measureKey,
      name,
      badge,
      badgeText,
      valueText: t.value === null ? null : t.key === "chair_stand" && t.usedArms ? "0 stands (arms used)" : unitText(t.value),
      lineText,
      wasText,
      note,
      position,
      linePosition,
      measuredAt: t.measuredAt,
    };
  });
}
