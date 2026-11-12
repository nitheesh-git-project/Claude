// The goal-and-milestone planner's logic: what a milestone form holds, how it
// becomes the request the route validates, which measures a milestone may be
// linked to, and which readings can prove one. The component
// (GoalMilestonePlanner.tsx) renders it; the routes re-check everything with
// the same validators (careGoals.ts), so what is refused here is refused in
// the same words there.

import {
  measurementProvesMilestone,
  validateGoalFields,
  validateMilestoneFields,
  type CareGoal,
  type CareMilestone,
  type MilestoneInput,
} from "@/lib/careGoals";
import { draftMilestoneFromTemplate, milestoneTemplatesFor, type MilestoneTemplate } from "@/lib/milestoneTemplates";
import { latestReadingFor } from "@/lib/milestones";
import {
  isMeasureEnabled,
  measurementSource,
  measuresForProfileKind,
  outcomeMeasure,
  type MeasurementSide,
  type OutcomeMeasure,
  type ProfileKind,
} from "@/lib/outcomeMeasures";
import { toMeasurementReading, type MeasurementPoint } from "@/lib/outcomeSeries";
import { parseNumberText } from "@/lib/recordTest";

export type MilestoneDraft = {
  title: string;
  criterion: string;
  phase: string;
  status: "planned" | "working";
  linkedMeasureKey: string;
  linkedVariant: string;
  linkedSide: "" | MeasurementSide;
  targetText: string;
  baselineText: string;
  targetDate: string;
  templateKey: string;
  sortOrder: number;
};

export function emptyMilestoneDraft(sortOrder: number): MilestoneDraft {
  return {
    title: "",
    criterion: "",
    phase: "",
    status: "planned",
    linkedMeasureKey: "",
    linkedVariant: "",
    linkedSide: "",
    targetText: "",
    baselineText: "",
    targetDate: "",
    templateKey: "",
    sortOrder,
  };
}

const text = (n: number | null) => (n === null ? "" : String(n));

export function draftFromMilestone(m: CareMilestone): MilestoneDraft {
  return {
    title: m.title,
    criterion: m.criterion,
    phase: m.phase ?? "",
    status: m.status === "working" ? "working" : "planned",
    linkedMeasureKey: m.linkedMeasureKey ?? "",
    linkedVariant: m.linkedVariant ?? "",
    linkedSide: m.linkedSide ?? "",
    targetText: text(m.targetValue),
    baselineText: text(m.baselineValue),
    targetDate: m.targetDate ?? "",
    templateKey: m.templateKey ?? "",
    sortOrder: m.sortOrder,
  };
}

/** A template as a draft for the physiotherapist to edit: nothing is saved
 *  until they do, and the date and side are theirs to add. */
export function draftFromTemplate(template: MilestoneTemplate, sortOrder: number): MilestoneDraft {
  const d = draftMilestoneFromTemplate(template);
  return {
    ...emptyMilestoneDraft(sortOrder),
    title: d.title,
    criterion: d.criterion,
    phase: template.phase,
    linkedMeasureKey: d.linkedMeasureKey ?? "",
    linkedVariant: d.linkedVariant ?? "",
    targetText: d.targetValue === null ? "" : String(d.targetValue),
    templateKey: d.templateKey,
  };
}

/** Starter templates for the kind not already used in this plan. */
export function unusedTemplates(kind: ProfileKind, existing: readonly Pick<CareMilestone, "templateKey">[]): MilestoneTemplate[] {
  const used = new Set(existing.map((m) => m.templateKey).filter((k): k is string => !!k));
  return milestoneTemplatesFor(kind).filter((t) => !used.has(t.key));
}

/** The next position in the plan: after the last. */
export function nextSortOrder(existing: readonly Pick<CareMilestone, "sortOrder">[]): number {
  return existing.reduce((max, m) => Math.max(max, m.sortOrder), 0) + 1;
}

export type LinkableMeasure = {
  measure: OutcomeMeasure;
  /** Recorded on the Pain Map or in the neurological exam: the milestone is
   *  reached on the physiotherapist's judgement, with no measurement id. */
  heldElsewhere: boolean;
  selectable: boolean;
  reason: string | null;
};

/**
 * Measures a milestone can be linked to for this kind of patient: those with
 * a direction a target can be met in (higher, lower, or toward normal with a
 * starting point). A stage, a classification or an age reached has none and
 * is described in words. A licensed scale that is off is listed with its
 * reason, as in the Record-a-test picker.
 */
export function linkableMeasures(
  kind: ProfileKind,
  opts: { enabledLicensed: ReadonlySet<string>; licenceUnreadable?: boolean }
): LinkableMeasure[] {
  const out: LinkableMeasure[] = [];
  for (const measure of measuresForProfileKind(kind)) {
    if (measure.better !== "higher" && measure.better !== "lower" && measure.better !== "toward_normal") continue;
    const heldElsewhere = measurementSource(measure.key, kind) !== "outcome_measurements";
    if (isMeasureEnabled(measure.key, opts.enabledLicensed)) {
      out.push({ measure, heldElsewhere, selectable: true, reason: null });
    } else {
      out.push({
        measure,
        heldElsewhere,
        selectable: false,
        reason: opts.licenceUnreadable ? "we couldn't check whether the clinic has switched this on" : "off until the clinic confirms its licence",
      });
    }
  }
  return out;
}

/** The newest recorded reading of exactly the linked line, offered as the
 *  starting point; null when there is none or no line is chosen. */
export function suggestedBaseline(
  points: readonly MeasurementPoint[],
  link: { measureKey: string; variant: string; side: "" | MeasurementSide }
): number | null {
  if (!link.measureKey) return null;
  const reading = latestReadingFor(
    { linkedMeasureKey: link.measureKey, linkedVariant: link.variant || null, linkedSide: link.side || null },
    points.map(toMeasurementReading)
  );
  return reading ? reading.value : null;
}

/** The `milestone` the save route takes: every key sent, so an edit that
 *  clears a field clears it (null) rather than keeping the old one. */
export function milestoneInputFromDraft(d: MilestoneDraft): MilestoneInput {
  const target = parseNumberText(d.targetText);
  const baseline = parseNumberText(d.baselineText);
  return {
    title: d.title.trim(),
    criterion: d.criterion.trim(),
    phase: d.phase || null,
    linkedMeasureKey: d.linkedMeasureKey || null,
    linkedVariant: d.linkedMeasureKey && d.linkedVariant ? d.linkedVariant : null,
    linkedSide: d.linkedMeasureKey && d.linkedSide ? d.linkedSide : null,
    // NaN travels on purpose: the validator names "not a number" rather than
    // the box being silently treated as blank.
    targetValue: d.linkedMeasureKey ? (target === undefined ? null : target) : null,
    baselineValue: d.linkedMeasureKey ? (baseline === undefined ? null : baseline) : null,
    targetDate: d.targetDate || null,
    sortOrder: d.sortOrder,
    templateKey: d.templateKey || null,
    status: d.status,
  };
}

/** The route's own check of a milestone form, run before the round trip. */
export function checkMilestoneDraft(
  d: MilestoneDraft,
  ctx: { profileKind: ProfileKind; existing: CareMilestone | null; enabledLicensed: ReadonlySet<string> }
): { ok: true; input: MilestoneInput } | { ok: false; error: string } {
  const input = milestoneInputFromDraft(d);
  const checked = validateMilestoneFields(input, ctx);
  return checked.ok ? { ok: true, input } : { ok: false, error: checked.error };
}

/** The route's own check of the goal form. */
export function checkGoalDraft(
  d: { goalText: string; targetDate: string },
  existing: CareGoal | null
): { ok: true; goal: { goalText: string; targetDate: string | null } } | { ok: false; error: string } {
  const goal = { goalText: d.goalText.trim(), targetDate: d.targetDate || null };
  const checked = validateGoalFields(goal, existing);
  return checked.ok ? { ok: true, goal } : { ok: false, error: checked.error };
}

// --- Marking reached ---------------------------------------------------------------------------

/** Whether reaching this milestone needs a proving measurement: it has a
 *  target, on a measure stored in outcome_measurements for this kind. The
 *  route decides the same way; one described in words, or linked to a
 *  measure the Pain Map or exam holds, is reached on clinical judgement. */
export function needsProof(
  m: Pick<CareMilestone, "linkedMeasureKey" | "targetValue">,
  kind: ProfileKind
): boolean {
  return m.linkedMeasureKey !== null && m.targetValue !== null && measurementSource(m.linkedMeasureKey, kind) === "outcome_measurements";
}

/** Readings that prove a milestone (exactly the line, meeting the target),
 *  newest first. */
export function proofCandidates(
  m: Pick<CareMilestone, "linkedMeasureKey" | "linkedVariant" | "linkedSide" | "targetValue" | "baselineValue">,
  points: readonly MeasurementPoint[]
): MeasurementPoint[] {
  return points
    .filter((p) => measurementProvesMilestone(m, p).ok)
    .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt));
}

/** A sentence for a milestone's measurable bar: "Knee bend to 125 degrees". */
export function linkSummary(m: Pick<CareMilestone, "linkedMeasureKey" | "linkedVariant" | "linkedSide" | "targetValue">): string | null {
  if (!m.linkedMeasureKey) return null;
  const measure = outcomeMeasure(m.linkedMeasureKey);
  if (!measure) return m.linkedMeasureKey;
  const variant = measure.variants?.find((v) => v.key === m.linkedVariant)?.label;
  const parts = [variant ? `${measure.label} - ${variant}` : measure.label];
  if (m.linkedSide) parts.push(m.linkedSide);
  return parts.join(", ");
}
