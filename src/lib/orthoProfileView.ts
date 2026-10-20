import type { PainAssessmentRow } from "@/lib/painMap";
import type { CareGoal, CareMilestone, MilestoneView } from "@/lib/careGoals";
import { shapeMilestones } from "@/lib/careGoals";
import { EMPTY_CARE_STATUS, shapeCareStatus, type ActiveOverride, type CareStatusEvent } from "@/lib/careStatus";
import { whereThingsStandView, type WhereThingsStandView } from "@/lib/whereThingsStand";
import {
  buildMeasureSeries,
  measureTableRows,
  parseMeasurementRows,
  type MeasureSeries,
  type MeasureTableRow,
  type MeasurementPoint,
  type OutcomeMeasurementRow,
} from "@/lib/outcomeSeries";
import { computeProfileStatus, type StatusResult } from "@/lib/profileStatus";
import { inferPhase, type Voice } from "@/lib/progressView";
import {
  areaProgress,
  kneeStraightening,
  latestReviewAt,
  orthoSeries,
  orthoStatusInput,
  pickKneeBend,
  pickLegStrength,
  standSummary,
  type AreaProgress,
  type KneeBend,
  type KneeStraightening,
  type LegStrength,
} from "@/lib/orthoProfile";

// Everything an orthopaedic Health Profile draws, shaped once from the raw
// reads so the patient's page, the therapist's chart and the admin's chart
// show the same figures. Each read arrives as its own status (the page makes
// every one as a separate call) and degrades only the part of the page that
// needs it: a measurement read that failed says so on the graph, the table
// and the dials but leaves the Pain Map, the milestones and the pill alone.
// Plain data in, plain data out (it crosses the server/client boundary).

export type OrthoReads = {
  measurements: { status: "ok"; rows: OutcomeMeasurementRow[] } | { status: "unreadable" };
  goals:
    | { status: "ok"; activeGoal: CareGoal | null; goals: CareGoal[]; milestones: CareMilestone[] }
    | { status: "unreadable" };
  careStatus: { status: "ok"; events: CareStatusEvent[] } | { status: "unreadable" };
  /** The Pain Map rows (read for an orthopaedic page only). */
  assessments: PainAssessmentRow[];
};

export type OrthoView = {
  series: MeasureSeries[];
  /** Recorded measurements only (no Pain Map line): the dialog's "last time". */
  recordedSeries: MeasureSeries[];
  points: MeasurementPoint[];
  tableRows: MeasureTableRow[];
  goal: CareGoal | null;
  /** The active goal's milestones, in the order the cards draw them. */
  views: MilestoneView[];
  computed: StatusResult;
  override: ActiveOverride | null;
  /** The stored phase, else the one the plan implies. */
  phase: string | null;
  phaseIsInferred: boolean;
  /** "Where things stand": the physiotherapist's written summary, else the
   *  generated wording labelled as such (whereThingsStand.ts). When the
   *  status read failed the written one could not be checked, so the card
   *  shows the generated wording and the page says it could not load. */
  stand: WhereThingsStandView;
  lastReviewAt: string | null;
  kneeBend: KneeBend | null;
  legStrength: LegStrength | null;
  straightening: KneeStraightening | null;
  areas: AreaProgress[];
  /** Per-card degradation: said apart from "nothing recorded yet". */
  measuresFailed: boolean;
  goalsFailed: boolean;
  statusFailed: boolean;
};

export function shapeOrthoView(reads: OrthoReads, voice: Voice, nowMs: number): OrthoView {
  const measuresFailed = reads.measurements.status !== "ok";
  const points = reads.measurements.status === "ok" ? parseMeasurementRows(reads.measurements.rows) : [];
  const recordedSeries = buildMeasureSeries(points, { profileKind: "ortho" });
  const series = orthoSeries(recordedSeries, reads.assessments);

  const goalsFailed = reads.goals.status !== "ok";
  const goal = reads.goals.status === "ok" ? reads.goals.activeGoal : null;
  const planMilestones =
    reads.goals.status === "ok" && goal ? reads.goals.milestones.filter((m) => m.goalId === goal.id) : [];
  const views = shapeMilestones(planMilestones, points, nowMs);

  const reviewAt = latestReviewAt(series);
  const statusFailed = reads.careStatus.status !== "ok";
  const careState = reads.careStatus.status === "ok"
    ? shapeCareStatus(reads.careStatus.events, { profileKind: "ortho", latestReviewAt: reviewAt })
    : EMPTY_CARE_STATUS;

  // The status rule is computed from the main measure whether or not the
  // override read worked: when it did not, the screen says it could not
  // check for an override rather than showing the computed pill as final.
  const computed = computeProfileStatus(orthoStatusInput(series));
  const inferred = careState.phase ? null : inferPhase(planMilestones, "ortho");

  return {
    series,
    recordedSeries,
    points,
    tableRows: measureTableRows(series, planMilestones, { profileKind: "ortho" }),
    goal,
    views,
    computed,
    override: careState.override,
    phase: careState.phase?.phase ?? inferred,
    phaseIsInferred: !careState.phase && inferred !== null,
    stand: whereThingsStandView({
      written: careState.summary,
      generated: standSummary(series, planMilestones, voice),
      // The draft is for the patient to read, whoever is typing it.
      draft: standSummary(series, planMilestones, "patient"),
    }),
    lastReviewAt: reviewAt,
    kneeBend: pickKneeBend(series, planMilestones),
    legStrength: pickLegStrength(series, planMilestones),
    straightening: (() => {
      const knee = pickKneeBend(series, planMilestones);
      return knee ? kneeStraightening(series, knee.side) : null;
    })(),
    areas: areaProgress(reads.assessments),
    measuresFailed,
    goalsFailed,
    statusFailed,
  };
}
