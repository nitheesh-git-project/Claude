import { clinicDateKey } from "@/lib/clinicWeek";
import { outcomeMeasure } from "@/lib/outcomeMeasures";

// The milestone maths: what status a milestone shows, how far along a
// "working on it" milestone is, and whether the measurement it is linked to
// has met its bar.
//
// Dependency-free on purpose (the "business maths lives in src/lib" rule).
// The records are `care_goals` and `care_milestones` (schema.sql): the
// patient's own goal at the top, then small steps, each with a measurable
// criterion ("walk 10 m with a stick, no one holding on") so that "reached"
// is a fact rather than an opinion.
//
// Three rules:
//
//   1. **Reached is sticky.** A milestone with a `reached_at` is reached,
//      whatever the latest reading says -- the day it was reached is a fact
//      about the past, and a bad day later does not un-reach it (the table's
//      trigger refuses to move or clear `reached_at` once set). A regression
//      is a new milestone, not an edit to an old one.
//   2. **A met criterion is a suggestion, never a write.** When the linked
//      measurement crosses the target, `deriveMilestone` says the
//      physiotherapist CAN mark it reached and names the reading that proved
//      it; only the physiotherapist marks it. Planned -> working is likewise
//      their call: a reading that happens to be partway to a planned target
//      does not start it.
//   3. **Progress is measured from where the patient started.** For "higher
//      is better" the start defaults to 0 (the mockups' "3 of 5 stairs" is
//      60%); for "lower is better" there is no honest default, so without a
//      baseline there is no percentage rather than a made-up one.

export type MilestoneStatus = "planned" | "working" | "reached";

export const MILESTONE_STATUSES: readonly MilestoneStatus[] = ["reached", "working", "planned"];

/** One word per status, the same to all three roles. */
export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  reached: "Reached",
  working: "Working on it",
  planned: "Planned",
};

export function isMilestoneStatus(value: unknown): value is MilestoneStatus {
  return value === "planned" || value === "working" || value === "reached";
}

export type CriterionDirection = "higher" | "lower";

/**
 * Which way a linked measure has to move to meet its target. "higher" and
 * "lower" come straight from the registry. A "toward normal" measure (joint
 * range) moves whichever way the target lies from where it started, so it
 * needs the baseline; a stage or an age reached has no direction to meet.
 */
export function criterionDirection(
  measureKey: string,
  targetValue: number,
  baselineValue?: number | null
): CriterionDirection | null {
  const m = outcomeMeasure(measureKey);
  if (!m || !Number.isFinite(targetValue)) return null;
  if (m.better === "higher" || m.better === "lower") return m.better;
  if (m.better === "toward_normal") {
    if (baselineValue === null || baselineValue === undefined || !Number.isFinite(baselineValue)) return null;
    if (targetValue === baselineValue) return null;
    return targetValue > baselineValue ? "higher" : "lower";
  }
  return null;
}

export function isCriterionMet(direction: CriterionDirection, current: number, target: number): boolean {
  return direction === "higher" ? current >= target : current <= target;
}

/**
 * Whole-number percentage from the start to the target, 0-100. Never 100
 * unless the criterion is met (rounding 99.6 up would draw a full bar on a
 * milestone that is not reached). null when there is no honest figure: a
 * "lower is better" target with no baseline, or a baseline already past
 * the target.
 */
export function milestoneProgressPercent(input: {
  direction: CriterionDirection;
  target: number;
  current: number;
  baseline?: number | null;
}): number | null {
  const { direction, target, current } = input;
  if (!Number.isFinite(target) || !Number.isFinite(current)) return null;
  const met = isCriterionMet(direction, current, target);
  let start: number;
  if (input.baseline === null || input.baseline === undefined) {
    if (direction === "lower") return null;
    start = 0;
  } else {
    if (!Number.isFinite(input.baseline)) return null;
    start = input.baseline;
  }
  const span = direction === "higher" ? target - start : start - target;
  if (span <= 0) return met ? 100 : null;
  const gained = direction === "higher" ? current - start : start - current;
  const percent = Math.round((gained / span) * 100);
  if (met) return 100;
  return Math.min(99, Math.max(0, percent));
}

export type MilestoneRecord = {
  id?: string;
  status: MilestoneStatus;
  reachedAt: string | null;
  targetDate: string | null;
  sortOrder: number;
  linkedMeasureKey: string | null;
  linkedVariant: string | null;
  linkedSide: "left" | "right" | null;
  targetValue: number | null;
  baselineValue: number | null;
};

export type MeasurementReading = {
  id: string;
  measureKey: string;
  variant: string | null;
  side: "left" | "right" | null;
  value: number;
  measuredAt: string;
};

/** The newest reading of exactly the measure, variant and side a milestone
 *  is linked to. A right-knee milestone is never met by the left knee. */
export function latestReadingFor(
  milestone: Pick<MilestoneRecord, "linkedMeasureKey" | "linkedVariant" | "linkedSide">,
  readings: readonly MeasurementReading[]
): MeasurementReading | null {
  if (!milestone.linkedMeasureKey) return null;
  let latest: MeasurementReading | null = null;
  let latestMs = -Infinity;
  for (const r of readings) {
    if (r.measureKey !== milestone.linkedMeasureKey) continue;
    if ((r.variant ?? null) !== (milestone.linkedVariant ?? null)) continue;
    if ((r.side ?? null) !== (milestone.linkedSide ?? null)) continue;
    const ms = Date.parse(r.measuredAt);
    if (Number.isFinite(ms) && ms > latestMs) {
      latest = r;
      latestMs = ms;
    }
  }
  return latest;
}

export type DerivedMilestone = {
  status: MilestoneStatus;
  /** Shown on a "working on it" milestone; null where there is no honest
   *  figure, or nothing linked. A reached milestone is 100. */
  percent: number | null;
  /** null when nothing is linked or no reading exists yet. */
  criterionMet: boolean | null;
  /** The physiotherapist may mark it reached, linked to `provedBy`. */
  canMarkReached: boolean;
  provedBy: MeasurementReading | null;
  latest: MeasurementReading | null;
};

/** What a milestone shows, from its stored record and the readings on file. */
export function deriveMilestone(
  milestone: MilestoneRecord,
  readings: readonly MeasurementReading[] = []
): DerivedMilestone {
  const reached = milestone.reachedAt !== null || milestone.status === "reached";
  const latest = latestReadingFor(milestone, readings);
  const direction =
    milestone.linkedMeasureKey && milestone.targetValue !== null
      ? criterionDirection(milestone.linkedMeasureKey, milestone.targetValue, milestone.baselineValue)
      : null;
  const criterionMet = direction && latest && milestone.targetValue !== null
    ? isCriterionMet(direction, latest.value, milestone.targetValue)
    : null;
  const percent = reached
    ? 100
    : direction && latest && milestone.targetValue !== null
      ? milestoneProgressPercent({
          direction,
          target: milestone.targetValue,
          current: latest.value,
          baseline: milestone.baselineValue,
        })
      : null;
  return {
    status: reached ? "reached" : milestone.status,
    percent,
    criterionMet,
    canMarkReached: !reached && criterionMet === true,
    provedBy: !reached && criterionMet === true ? latest : null,
    latest,
  };
}

/** A milestone past its target date and not reached. The target is a
 *  calendar day in the clinic's zone (`care_milestones.target_date` is a
 *  `date`), so it is due at the end of that clinic day -- judged through
 *  clinicDateKey(), never the server's UTC day, which would mark a 2 Nov
 *  milestone overdue at 5:30 am IST on the 2nd. `nowMs` is required so the
 *  debug bar's simulated clock reaches it. */
export function isMilestoneOverdue(milestone: Pick<MilestoneRecord, "status" | "reachedAt" | "targetDate">, nowMs: number): boolean {
  if (milestone.reachedAt !== null || milestone.status === "reached" || !milestone.targetDate) return false;
  const target = /^\d{4}-\d{2}-\d{2}$/.test(milestone.targetDate)
    ? milestone.targetDate
    : Number.isFinite(Date.parse(milestone.targetDate))
      ? clinicDateKey(milestone.targetDate)
      : null;
  if (!target || !Number.isFinite(nowMs)) return false;
  return clinicDateKey(nowMs) > target;
}

export function milestoneCounts(milestones: readonly Pick<MilestoneRecord, "status" | "reachedAt">[]): Record<MilestoneStatus, number> {
  const counts: Record<MilestoneStatus, number> = { reached: 0, working: 0, planned: 0 };
  for (const m of milestones) counts[m.reachedAt !== null || m.status === "reached" ? "reached" : m.status] += 1;
  return counts;
}

const STATUS_RANK: Record<MilestoneStatus, number> = { reached: 0, working: 1, planned: 2 };

function dateOrInfinity(value: string | null): number {
  if (!value) return Infinity;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Infinity;
}

/** Earlier first; a missing or unreadable date sorts last. */
function compareDates(a: string | null, b: string | null): number {
  const da = dateOrInfinity(a);
  const db = dateOrInfinity(b);
  if (da === db) return 0;
  return da < db ? -1 : 1;
}

/** The order the mockups read in: reached (oldest first, so the list is a
 *  story), then working, then planned, each by the physiotherapist's own
 *  order and then target date. Returns a new array. */
export function sortMilestones<T extends MilestoneRecord>(milestones: readonly T[]): T[] {
  const statusOf = (m: T): MilestoneStatus => (m.reachedAt !== null || m.status === "reached" ? "reached" : m.status);
  return [...milestones].sort((a, b) => {
    const sa = statusOf(a);
    const sb = statusOf(b);
    if (sa !== sb) return STATUS_RANK[sa] - STATUS_RANK[sb];
    if (sa === "reached") {
      const byReached = compareDates(a.reachedAt, b.reachedAt);
      if (byReached !== 0) return byReached;
    }
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return compareDates(a.targetDate, b.targetDate);
  });
}
