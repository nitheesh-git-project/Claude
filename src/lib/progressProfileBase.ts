import { shapeMilestones, type CareGoal, type CareMilestone, type MilestoneView } from "@/lib/careGoals";
import { EMPTY_CARE_STATUS, shapeCareStatus, type ActiveOverride, type CareStatusEvent, type CareStatusState } from "@/lib/careStatus";
import type { DiaryEntry } from "@/lib/patientDiary";
import { outcomeMeasure, type ProfileKind } from "@/lib/outcomeMeasures";
import {
  buildMeasureSeries,
  measureTableRows,
  parseMeasurementRows,
  type MeasureSeries,
  type MeasureTableRow,
  type MeasurementPoint,
  type OutcomeMeasurementRow,
  type SeriesPoint,
} from "@/lib/outcomeSeries";
import type { StatusInput } from "@/lib/profileStatus";
import { inferPhase } from "@/lib/progressView";
import type { IntakeTrendRow } from "@/lib/healthProfileSummary";

// The part of a Health Profile view every measurement-led profile shares
// (phase 6a: Strength and balance care and Heart and lung rehabilitation,
// which have no exam layer -- every line is a recorded measurement). The
// orthopaedic, neurological and paediatric shapers predate it and keep their
// own; this is the same arithmetic in one place for the two new ones.
// Dependency-free; plain data in, plain data out.

/** The reads both new loaders make, each its own call (ok or unreadable). */
export type MeasuredProfileReads = {
  measurements: { status: "ok"; rows: OutcomeMeasurementRow[] } | { status: "unreadable" };
  goals:
    | { status: "ok"; activeGoal: CareGoal | null; goals: CareGoal[]; milestones: CareMilestone[] }
    | { status: "unreadable" };
  careStatus: { status: "ok"; events: CareStatusEvent[] } | { status: "unreadable" };
  diary: { status: "ok"; entries: DiaryEntry[] } | { status: "unreadable" };
  intakeHistory: { status: "ok"; rows: IntakeTrendRow[] } | { status: "unreadable" };
  licence: { status: "ok"; keys: string[] } | { status: "unreadable" };
  /** Date of birth and gender (profiles), read with the admin client. */
  person: { status: "ok"; birthDate: string | null; gender: string | null } | { status: "unreadable" };
  summaryAuthorName?: string | null;
  nowMs: number;
  /** The clinic's today, YYYY-MM-DD. */
  todayIso: string;
};

export type MeasuredProfileBase = {
  points: MeasurementPoint[];
  series: MeasureSeries[];
  /** Lines the graph draws as tabs (a classification is a card, not a line). */
  graphSeries: MeasureSeries[];
  tableRows: MeasureTableRow[];
  goal: CareGoal | null;
  milestones: CareMilestone[];
  views: MilestoneView[];
  careState: CareStatusState;
  override: ActiveOverride | null;
  phase: string | null;
  phaseIsInferred: boolean;
  lastReviewAt: string | null;
  diaryEntries: DiaryEntry[] | null;
  measuresFailed: boolean;
  goalsFailed: boolean;
  statusFailed: boolean;
  diaryFailed: boolean;
  intakeFailed: boolean;
  personFailed: boolean;
};

/** The newest recorded measurement: the "last review". Diary entries are
 *  never a review. */
export function lastMeasuredAt(series: readonly MeasureSeries[]): string | null {
  let best: string | null = null;
  for (const s of series) for (const p of s.points) if (best === null || Date.parse(p.measuredAt) > Date.parse(best)) best = p.measuredAt;
  return best;
}

export function shapeMeasuredBase(reads: MeasuredProfileReads, kind: ProfileKind): MeasuredProfileBase {
  const measuresFailed = reads.measurements.status !== "ok";
  const points = reads.measurements.status === "ok" ? parseMeasurementRows(reads.measurements.rows) : [];
  const series = buildMeasureSeries(points, { profileKind: kind });
  const goalsFailed = reads.goals.status !== "ok";
  const goal = reads.goals.status === "ok" ? reads.goals.activeGoal : null;
  const milestones = reads.goals.status === "ok" && goal ? reads.goals.milestones.filter((m) => m.goalId === goal.id) : [];
  const views = shapeMilestones(milestones, points, reads.nowMs);
  const lastReviewAt = lastMeasuredAt(series);
  const statusFailed = reads.careStatus.status !== "ok";
  const careState =
    reads.careStatus.status === "ok"
      ? shapeCareStatus(reads.careStatus.events, { profileKind: kind, latestReviewAt: lastReviewAt })
      : EMPTY_CARE_STATUS;
  const inferred = careState.phase ? null : inferPhase(milestones, kind);
  return {
    points,
    series,
    graphSeries: series.filter((s) => !outcomeMeasure(s.measureKey)?.classification),
    tableRows: measureTableRows(series, milestones, { profileKind: kind }),
    goal,
    milestones,
    views,
    careState,
    override: careState.override,
    phase: careState.phase?.phase ?? inferred,
    phaseIsInferred: !careState.phase && inferred !== null,
    lastReviewAt,
    diaryEntries: reads.diary.status === "ok" ? reads.diary.entries : null,
    measuresFailed,
    goalsFailed,
    statusFailed,
    diaryFailed: reads.diary.status !== "ok",
    intakeFailed: reads.intakeHistory.status !== "ok",
    personFailed: reads.person.status !== "ok",
  };
}

/**
 * The status rule's main measure: the first line of `preference` with two or
 * more comparable points, else the first with any reading. Lines with no
 * direction ("hold") are never a main measure.
 */
export function mainMeasureInput(
  series: readonly MeasureSeries[],
  preference: readonly string[],
  kind: ProfileKind
): StatusInput["main"] {
  const lines = preference
    .map((key) => series.find((s) => s.measureKey === key && s.points.length > 0 && s.joinPoints && s.known) ?? null)
    .filter((s): s is MeasureSeries => s !== null);
  const main = lines.find((s) => s.points.length >= 2) ?? lines[0] ?? null;
  if (!main) return null;
  const tester = (p: SeriesPoint) => p.testerName ?? p.recordedBy;
  return {
    measureKey: main.measureKey,
    values: main.points.map((p) => p.value),
    profileKind: kind,
    differentTester: tester(main.points[0]) !== tester(main.points[main.points.length - 1]),
  };
}

/**
 * When the current answer to `key` was first given: the earliest approved
 * submission after which every later one carries the same answer. An answer
 * re-sent with an unrelated edit keeps its first date, so a fall history is
 * aged from when it was told, not from the latest save. Null when no
 * submission on file carries it.
 */
export function answerFirstGivenAt(rows: readonly IntakeTrendRow[], key: string, current: string | undefined): string | null {
  const value = (current ?? "").trim();
  if (!value) return null;
  const approved = rows
    .filter((r) => r.status === "approved" && r.proposed_data && typeof r.proposed_data[key] === "string")
    .map((r) => ({ at: r.reviewed_at ?? r.created_at, value: (r.proposed_data![key] ?? "").trim() }))
    .filter((r) => Number.isFinite(Date.parse(r.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let since: string | null = null;
  for (const r of approved) {
    if (r.value === value) since = since ?? r.at;
    else since = null;
  }
  return since;
}
