import type { CareGoal, CareMilestone, MilestoneView } from "@/lib/careGoals";
import { shapeMilestones } from "@/lib/careGoals";
import { EMPTY_CARE_STATUS, shapeCareStatus, type ActiveOverride, type CareStatusEvent } from "@/lib/careStatus";
import { intakeTrendSeries, type IntakeTrendRow } from "@/lib/healthProfileSummary";
import { formatClinicTime } from "@/lib/formatDateTime";
import { parseNeuroAssessments, type NeuroAssessmentRow, type ParsedNeuroAssessment } from "@/lib/neuroExam";
import {
  affectedParts,
  fallsInWindow,
  freezingBars,
  freezingTriggers,
  graphSeries,
  neuroConditionLine,
  neuroKeyTiles,
  neuroLastReviewAt,
  neuroSeries,
  neuroStandSummary,
  neuroStatusInput,
  parkinsonStage,
  symptomProfile,
  testedInOnTimeChip,
  walkingLadder,
  walkingSpeedZones,
  type AffectedParts,
  type FallsWindow,
  type FreezingBar,
  type NeuroKind,
  type ParkinsonStage,
  type SpeedZones,
  type SymptomProfile,
  type WalkingLadder,
} from "@/lib/neuroProfile";
import { entriesAwaitingConfirmation, type DiaryEntry } from "@/lib/patientDiary";
import { isMeasureEnabled } from "@/lib/outcomeMeasures";
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
import { inferPhase, type KeyTile, type Voice } from "@/lib/progressView";
import { whereThingsStandView, type WhereThingsStandView } from "@/lib/whereThingsStand";

// Everything a neurological or Parkinson's Health Profile draws, shaped once
// from the raw reads so the patient's page, the therapist's chart and the
// admin's chart show the same figures (the orthopaedic page's
// orthoProfileView.ts, for the other condition type). Each read arrives as
// its own status - the page makes every one as a separate call - and
// degrades only the part of the page that needs it: an unreadable diary says
// so on the falls tile and the diary card and does not move the pill; an
// unreadable examination says so on the balance and walking tiles and the
// picture; unreadable measurements say so on the graph and the table.
// Plain data in, plain data out (it crosses the server/client boundary).

export type NeuroReads = {
  measurements: { status: "ok"; rows: OutcomeMeasurementRow[] } | { status: "unreadable" };
  goals:
    | { status: "ok"; activeGoal: CareGoal | null; goals: CareGoal[]; milestones: CareMilestone[] }
    | { status: "unreadable" };
  careStatus: { status: "ok"; events: CareStatusEvent[] } | { status: "unreadable" };
  diary: { status: "ok"; entries: DiaryEntry[] } | { status: "unreadable" };
  /** Approved intake submissions, for the independence answer over time. */
  intakeHistory: { status: "ok"; rows: IntakeTrendRow[] } | { status: "unreadable" };
  /** The licensed measures the clinic has switched on (Barthel is one). */
  licence: { status: "ok"; keys: string[] } | { status: "unreadable" };
  /** Examination rows (the page's own read; `failed` when it errored). */
  exams: NeuroAssessmentRow[];
  examsFailed: boolean;
  /** Who wrote the current "Where things stand" text (careStatusAuthor.ts). */
  summaryAuthorName?: string | null;
};

export type NeuroDiaryView =
  | {
      status: "ok";
      /** Newest first. */
      entries: DiaryEntry[];
      falls: FallsWindow;
      /** Entries the physiotherapist has not confirmed yet, oldest first. */
      awaiting: DiaryEntry[];
    }
  | { status: "unreadable" };

export type NeuroView = {
  kind: NeuroKind;
  series: MeasureSeries[];
  graphSeries: MeasureSeries[];
  /** Recorded measurements only: the record-a-test dialog's "last time". */
  recordedSeries: MeasureSeries[];
  points: MeasurementPoint[];
  tableRows: MeasureTableRow[];
  goal: CareGoal | null;
  views: MilestoneView[];
  computed: StatusResult;
  override: ActiveOverride | null;
  phase: string | null;
  phaseIsInferred: boolean;
  stand: WhereThingsStandView;
  lastReviewAt: string | null;
  keyTiles: KeyTile[];
  conditionLine: string | null;
  exams: ParsedNeuroAssessment[];
  affected: AffectedParts | null;
  affectedLabel: string | null;
  ladder: WalkingLadder | null;
  speed: SpeedZones | null;
  diary: NeuroDiaryView;
  parkinsons: null | {
    onTimeChip: string | null;
    symptoms: SymptomProfile | null;
    stage: ParkinsonStage | null;
    bars: FreezingBar[];
    triggers: { trigger: string; label: string; episodes: number }[];
  };
  subtype: string | null;
  measuresFailed: boolean;
  goalsFailed: boolean;
  statusFailed: boolean;
  examsFailed: boolean;
  intakeFailed: boolean;
};

export function shapeNeuroView(
  reads: NeuroReads,
  ctx: { kind: NeuroKind; intake: Readonly<Record<string, string>>; voice: Voice; nowMs: number }
): NeuroView {
  const { kind, voice, nowMs } = ctx;
  const measuresFailed = reads.measurements.status !== "ok";
  const points = reads.measurements.status === "ok" ? parseMeasurementRows(reads.measurements.rows) : [];
  const recordedSeries = buildMeasureSeries(points, { profileKind: kind });
  const exams = reads.examsFailed ? [] : parseNeuroAssessments(reads.exams);
  const diaryEntries = reads.diary.status === "ok" ? reads.diary.entries : null;
  const series = neuroSeries({ recorded: recordedSeries, exams, kind, diary: diaryEntries, nowMs });

  const goalsFailed = reads.goals.status !== "ok";
  const goal = reads.goals.status === "ok" ? reads.goals.activeGoal : null;
  const planMilestones = reads.goals.status === "ok" && goal ? reads.goals.milestones.filter((m) => m.goalId === goal.id) : [];
  const views = shapeMilestones(planMilestones, points, nowMs);

  const lastReviewAt = neuroLastReviewAt(series);
  const statusFailed = reads.careStatus.status !== "ok";
  const careState =
    reads.careStatus.status === "ok" ? shapeCareStatus(reads.careStatus.events, { profileKind: kind, latestReviewAt: lastReviewAt }) : EMPTY_CARE_STATUS;

  // The licence switch: an unreadable one is "we couldn't check", so a Barthel
  // line that is on the record is used rather than hidden.
  const barthelOn =
    reads.licence.status === "ok"
      ? isMeasureEnabled("barthel", new Set(reads.licence.keys))
      : series.some((s) => s.measureKey === "barthel");

  const computed = computeProfileStatus(
    neuroStatusInput({ series, kind, barthelEnabled: barthelOn, diary: diaryEntries, lastReviewAt })
  );
  const inferred = careState.phase ? null : inferPhase(planMilestones, kind);

  const intakeFailed = reads.intakeHistory.status !== "ok";
  const intakeIndependence = reads.intakeHistory.status === "ok" ? intakeTrendSeries(reads.intakeHistory.rows, "neuro") : [];
  const baselineFalls = (ctx.intake.neuro_falls ?? "").trim();
  const unavailable = new Set<string>();
  if (measuresFailed) for (const k of ["barthel", "fac", "mini_bestest", "five_sit_to_stand", "tug", "ten_metre_walk", "berg_balance", "freezing_episodes"]) unavailable.add(k);
  if (reads.examsFailed && kind === "neuro") for (const k of ["berg_balance", "ten_metre_walk", "tug"]) unavailable.add(k);
  if (reads.diary.status !== "ok") unavailable.add("freezing_episodes");
  if (intakeFailed) unavailable.add("independence-intake");

  const keyTiles = neuroKeyTiles({
    series,
    kind,
    milestones: planMilestones,
    voice,
    barthelEnabled: barthelOn,
    intakeIndependence,
    diary: diaryEntries,
    nowMs,
    baselineFalls,
    unavailable,
  });

  const standInput = { series, kind, barthelEnabled: barthelOn, intakeIndependence, diary: diaryEntries, nowMs };
  const stand = whereThingsStandView({
    written: careState.summary,
    authorName: reads.summaryAuthorName ?? null,
    generated: neuroStandSummary({ ...standInput, voice }),
    // The draft is for the patient to read, whoever is typing it.
    draft: neuroStandSummary({ ...standInput, voice: "patient" }),
  });

  const diary: NeuroDiaryView =
    diaryEntries === null
      ? { status: "unreadable" }
      : {
          status: "ok",
          entries: [...diaryEntries].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || (a.id < b.id ? 1 : -1)),
          falls: fallsInWindow(diaryEntries, nowMs),
          awaiting: entriesAwaitingConfirmation(diaryEntries),
        };

  const subtype = (ctx.intake.neuro_subtype ?? "").trim() || null;
  return {
    kind,
    series,
    graphSeries: graphSeries(series),
    recordedSeries,
    points,
    tableRows: measureTableRows(series, planMilestones, { profileKind: kind }),
    goal,
    views,
    computed,
    override: careState.override,
    phase: careState.phase?.phase ?? inferred,
    phaseIsInferred: !careState.phase && inferred !== null,
    stand,
    lastReviewAt,
    keyTiles,
    conditionLine: neuroConditionLine(ctx.intake),
    exams,
    affected: affectedParts(ctx.intake.neuro_affected_side),
    affectedLabel: (ctx.intake.neuro_affected_side ?? "").trim() || null,
    ladder: walkingLadder(series),
    speed: walkingSpeedZones(series),
    diary,
    parkinsons:
      kind === "neuro_parkinsons"
        ? {
            onTimeChip: testedInOnTimeChip(series, points, (iso) => formatClinicTime(iso)),
            symptoms: symptomProfile(points),
            stage: parkinsonStage(points),
            bars: diaryEntries ? freezingBars(diaryEntries, nowMs) : [],
            triggers: diaryEntries ? freezingTriggers(diaryEntries, nowMs) : [],
          }
        : null,
    subtype,
    measuresFailed,
    goalsFailed,
    statusFailed,
    examsFailed: reads.examsFailed,
    intakeFailed,
  };
}
