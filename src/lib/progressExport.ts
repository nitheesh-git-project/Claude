// The goal, steps and measures of a patient's record as plain strings for the
// PDF export (healthProfilePdf.ts). Shaped here so the PDF module draws text
// and never learns the registry, and so the wording is tested without
// building a document. Every date goes through formatDateTime.ts (the
// clinic's zone).

import { shapeMilestones, type CareGoal, type CareMilestone } from "@/lib/careGoals";
import { formatClinicDate } from "@/lib/formatDateTime";
import { MILESTONE_STATUS_LABEL } from "@/lib/milestones";
import { outcomeMeasure, type ProfileKind } from "@/lib/outcomeMeasures";
import { buildMeasureSeries, measureTableRows, type MeasurementPoint } from "@/lib/outcomeSeries";
import { formatReading } from "@/lib/progressChart";
import { linkSummary } from "@/lib/milestonePlanner";
import { seriesName } from "@/lib/progressView";

export type ProgressExport = {
  goal: { text: string; targetDate: string | null; status: string } | null;
  milestones: { title: string; criterion: string; status: string; when: string; measure: string | null }[];
  measures: { name: string; first: string; now: string; goal: string; change: string; reviews: number }[];
};

const CHANGE_WORD = {
  better: "Better",
  worse: "Worse",
  no_change: "No real change",
  changed: "Changed",
} as const;

const GOAL_STATUS: Record<CareGoal["status"], string> = { active: "In progress", achieved: "Achieved", closed: "Closed" };

/**
 * What the export prints. The goal is the active one, else the most recently
 * written (a patient whose goal was achieved still hands over what it was).
 * Steps are that goal's, in the profile's own order. Measures are the
 * measures table: first, latest and goal for every line on the record, with
 * the registry's own judgement of the change (a move inside the measurement
 * error reads "No real change").
 */
export function buildProgressExport(input: {
  profileKind: ProfileKind;
  points: readonly MeasurementPoint[];
  goals: readonly CareGoal[];
  milestones: readonly CareMilestone[];
  nowMs: number;
}): ProgressExport {
  const goal = input.goals.find((g) => g.status === "active") ?? [...input.goals].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
  const steps = goal ? input.milestones.filter((m) => m.goalId === goal.id) : [];

  const milestones = shapeMilestones(steps, input.points, input.nowMs).map(({ milestone, derived, overdue }) => {
    const reached = derived.status === "reached";
    const when = reached
      ? milestone.reachedAt
        ? `Reached ${formatClinicDate(milestone.reachedAt)}`
        : "Reached"
      : milestone.targetDate
        ? `Target ${formatClinicDate(milestone.targetDate)}${overdue ? " (past its date)" : ""}`
        : "";
    return {
      title: milestone.title,
      criterion: milestone.criterion,
      status: MILESTONE_STATUS_LABEL[derived.status],
      when,
      measure: linkSummary(milestone),
    };
  });

  const series = buildMeasureSeries(input.points, { profileKind: input.profileKind });
  const rows = measureTableRows(series, input.milestones, { profileKind: input.profileKind });
  const measures = rows.map((row) => {
    const m = outcomeMeasure(row.measureKey);
    const reading = (v: number) => formatReading(v, row.decimals, row.unit);
    const when = (iso: string) => formatClinicDate(iso);
    return {
      name: seriesName(
        { label: row.label, plainName: row.label, variantLabel: row.variantLabel, side: row.side, medicationState: row.medicationState },
        "clinician"
      ),
      first: `${reading(row.first.value)} (${when(row.first.measuredAt)})`,
      now: row.reviews > 1 ? `${reading(row.now.value)} (${when(row.now.measuredAt)})` : "First reading",
      goal: row.goal ? `${reading(row.goal.value)}${row.goal.reached ? " (reached)" : ""}` : "Not set",
      change: row.change === null ? (m ? "First reading" : "Not judged") : CHANGE_WORD[row.change],
      reviews: row.reviews,
    };
  });

  return {
    goal: goal ? { text: goal.goalText, targetDate: goal.targetDate ? formatClinicDate(goal.targetDate) : null, status: GOAL_STATUS[goal.status] } : null,
    milestones,
    measures,
  };
}
