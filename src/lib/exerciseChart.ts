import { exerciseByKey } from "@/lib/exerciseLibrary";
import {
  TEACHING_OUTCOME_LABELS,
  COACHING_CUES,
  NOT_ATTEMPTED_REASONS,
  doseText,
  orderTeachingEvents,
  type ExercisePlan,
  type TeachingEvent,
} from "@/lib/exercisePlan";

// What the clinician's chart shows of Home exercises (phase 7d-2): the
// current plan, and every earlier version read-only, each exercise with its
// dose and the marks made while it was taught -- who, and when. Pure; the
// chart page only draws it. The marks are append-only history: the LATEST
// mark per exercise per version is the headline, and every one is listed.

export type ChartMark = { at: string; by: string; text: string; helper: boolean };
export type ChartItem = { key: string; name: string; picture: string; dose: string; note: string | null; marks: ChartMark[]; latest: ChartMark | null };
export type ChartVersion = {
  planId: string;
  version: number;
  status: ExercisePlan["status"];
  publishedAt: string;
  replacedAt: string | null;
  authoredBy: string;
  items: ChartItem[];
};

/** The clinician's wording for a mark: the label, then the cue or the reason. */
export function chartMarkText(e: Pick<TeachingEvent, "outcome" | "cueKey" | "reasonKey">): string {
  const label = TEACHING_OUTCOME_LABELS[e.outcome];
  if (e.outcome === "needs_practice" && e.cueKey) return `${label}: ${COACHING_CUES[e.cueKey]}`;
  if (e.outcome === "not_attempted" && e.reasonKey) return `${label}: ${NOT_ATTEMPTED_REASONS[e.reasonKey]}`;
  return label;
}

/** Newest version first (as loaded), the active one flagged by its status. */
export function exerciseChartView(plans: readonly ExercisePlan[], events: readonly TeachingEvent[], names: ReadonlyMap<string, string>): ChartVersion[] {
  const ordered = orderTeachingEvents(events);
  return [...plans]
    .sort((a, b) => b.version - a.version)
    .map((plan) => ({
      planId: plan.id,
      version: plan.version,
      status: plan.status,
      publishedAt: plan.createdAt,
      replacedAt: plan.replacedAt,
      authoredBy: names.get(plan.authoredBy) ?? "A physiotherapist",
      items: plan.items.flatMap((item): ChartItem[] => {
        const ex = exerciseByKey(item.exerciseKey);
        if (!ex) return [];
        const marks = ordered
          .filter((e) => e.planId === plan.id && e.exerciseKey === item.exerciseKey)
          .map((e) => ({ at: e.createdAt, by: names.get(e.actor) ?? "A physiotherapist", text: chartMarkText(e), helper: e.helperPresent }));
        return [{ key: ex.key, name: ex.name, picture: ex.picture, dose: doseText(item.dose), note: item.dose.note, marks, latest: marks[marks.length - 1] ?? null }];
      }),
    }));
}

export type ChartRead = { status: "ok"; versions: ChartVersion[] } | { status: "not_migrated" } | { status: "unreadable" };
type LoadState = { status: "ok" } | { status: "not_migrated" } | { status: "unreadable" };

/** The two loads (plans, marks) as ONE answer for the chart: not set up if either says so, couldn't
 *  read if either failed, and only then the shaped versions. Never "none yet" for a read that failed. */
export function chartReadFrom(
  history: LoadState & { plans?: ExercisePlan[] },
  marks: LoadState & { events?: TeachingEvent[] },
  names: ReadonlyMap<string, string>
): ChartRead {
  if (history.status === "not_migrated" || marks.status === "not_migrated") return { status: "not_migrated" };
  if (history.status !== "ok" || marks.status !== "ok") return { status: "unreadable" };
  return { status: "ok", versions: exerciseChartView(history.plans ?? [], marks.events ?? [], names) };
}
