// The SAMPLE records behind the public health-profile showcase: five
// fictional patients, one per condition type (and a Parkinson's example
// beside the neurological one), written as the raw rows the product itself
// reads and then shaped by the product's own view functions
// (shapeOrthoView, shapeNeuroView, shapePedsView, shapeGeriatricView,
// shapeCardioView). So a figure on the public page is never typed in twice:
// the graph, the milestone cards and the picture are all derived from the
// same rows by the same code a patient's dashboard runs, and the unit test
// holds the headline figures to what comes out.
//
// Every date is fixed (the first review is 5 January 2026, the latest 16
// February 2026, "today" is 20 February 2026) so the server and the browser
// draw the same output and nothing here depends on the clock. The names are
// invented. Milestones are copied from the starter templates
// (milestoneTemplates.ts), so their wording and their bars are the
// product's; the measures are all free ones from the registry, none
// licensed. Dependency-free apart from the product's own pure modules.

import type { CareGoal, CareMilestone } from "@/lib/careGoals";
import { serializeMultiSelect } from "@/lib/conditionIntake";
import { PEDS_INTAKE_QUESTIONS } from "@/lib/intakePediatrics";
import { shapeCardioView, type CardioView } from "@/lib/cardioProfile";
import { shapeGeriatricView, type GeriatricView } from "@/lib/geriatricProfile";
import { shapeNeuroView, type NeuroView } from "@/lib/neuroProfileView";
import { shapeOrthoView, type OrthoView } from "@/lib/orthoProfileView";
import { shapePedsView, type PedsView } from "@/lib/pedsProfileView";
import { CARDIO_CONDITION_OPEN_HEART } from "@/lib/intakeCardio";
import { GERI_FALLS_TWO_PLUS } from "@/lib/intakeGeriatric";
import { NEURO_SUBTYPE_KEY, NEURO_SUBTYPE_PARKINSONS } from "@/lib/profileKind";
import { MILESTONE_TEMPLATES } from "@/lib/milestoneTemplates";
import type { NeuroAssessmentRow } from "@/lib/neuroExam";
import type { OutcomeMeasurementRow } from "@/lib/outcomeSeries";
import type { PainAssessmentRow } from "@/lib/painMap";
import type { ParsedPedsAssessment, PedsFindings } from "@/lib/pedsExam";
import type { DiaryEntry } from "@/lib/patientDiary";
import type { IntakeTrendRow } from "@/lib/healthProfileSummary";
import type { ProfileKind } from "@/lib/outcomeMeasures";
import type { MeasuredProfileReads } from "@/lib/progressProfileBase";
import type { MilestoneStatus } from "@/lib/milestones";

/** The first review, the three after it, and the day the sample is "read". */
export const SAMPLE_REVIEW_DAYS = ["2026-01-05", "2026-01-19", "2026-02-02", "2026-02-16"] as const;
export const SAMPLE_TODAY = "2026-02-20";
export const SAMPLE_NOW_MS = Date.parse(`${SAMPLE_TODAY}T06:30:00.000Z`);

const at = (day: string, time = "05:30:00.000Z") => `${day}T${time}`;
const PATIENT_ID = "sample-patient";
const THERAPIST_ID = "sample-therapist";

// ---- Row builders ----------------------------------------------------------

type RowExtra = Partial<Pick<OutcomeMeasurementRow, "variant" | "side" | "items">> & { conditions?: Record<string, unknown> };

/** A closure so each sample numbers its rows from 1 and the ids never move. */
function rowMaker(prefix: string) {
  let n = 0;
  return (measure_key: string, value: number, day: string, extra: RowExtra = {}): OutcomeMeasurementRow => {
    n += 1;
    return {
      id: `${prefix}-m${String(n).padStart(3, "0")}`,
      patient_id: PATIENT_ID,
      appointment_id: null,
      measure_key,
      variant: extra.variant ?? null,
      side: extra.side ?? null,
      value,
      items: extra.items ?? null,
      conditions: { setting: "in_person", ...(extra.conditions ?? {}) },
      recorded_by: THERAPIST_ID,
      recorded_by_role: "therapist",
      measured_at: at(day),
      schema_version: 1,
      created_at: at(day),
    };
  };
}

function goalFor(kind: ProfileKind, goalText: string, targetDate: string): CareGoal {
  return {
    id: `sample-goal-${kind}`,
    patientId: PATIENT_ID,
    profileKind: kind,
    goalText,
    targetDate,
    status: "active",
    authoredBy: THERAPIST_ID,
    authoredByRole: "therapist",
    createdAt: at(SAMPLE_REVIEW_DAYS[0]),
    updatedAt: at(SAMPLE_REVIEW_DAYS[3]),
  };
}

type MilestoneSpec = {
  template: string;
  status: MilestoneStatus;
  targetDate: string;
  /** The day it was reached (status "reached" only), and the reading that showed it. */
  reachedOn?: string;
  reachedBy?: string;
  side?: "left" | "right";
  baseline?: number;
};

/** Milestones copied from the starter templates: the title, the bar, the
 *  linked measure and the target are the product's own. */
function milestonesFor(kind: ProfileKind, goal: CareGoal, specs: MilestoneSpec[]): CareMilestone[] {
  return specs.map((spec, i) => {
    const t = MILESTONE_TEMPLATES.find((x) => x.key === spec.template);
    if (!t) throw new Error(`No milestone template ${spec.template}`);
    return {
      id: `sample-ms-${kind}-${i + 1}`,
      goalId: goal.id,
      patientId: PATIENT_ID,
      title: t.title,
      criterion: t.criterion,
      phase: t.phase,
      status: spec.status,
      reachedAt: spec.status === "reached" && spec.reachedOn ? at(spec.reachedOn) : null,
      reachedMeasurementId: spec.reachedBy ?? null,
      targetDate: spec.targetDate,
      sortOrder: i + 1,
      linkedMeasureKey: t.linkedMeasureKey ?? null,
      linkedVariant: t.linkedVariant ?? null,
      linkedSide: t.linkedMeasureKey ? (spec.side ?? null) : null,
      targetValue: t.targetValue ?? null,
      baselineValue: spec.baseline ?? null,
      templateKey: t.key,
      authoredBy: THERAPIST_ID,
      createdAt: at(SAMPLE_REVIEW_DAYS[0]),
      updatedAt: at(SAMPLE_REVIEW_DAYS[3]),
    };
  });
}

function goalsRead(goal: CareGoal, milestones: CareMilestone[]) {
  return { status: "ok" as const, activeGoal: goal, goals: [goal], milestones };
}

const measuredReads = (
  rows: OutcomeMeasurementRow[],
  goal: CareGoal,
  milestones: CareMilestone[],
  over: Partial<MeasuredProfileReads> = {}
): MeasuredProfileReads => ({
  measurements: { status: "ok", rows },
  goals: goalsRead(goal, milestones),
  careStatus: { status: "ok", events: [] },
  diary: { status: "ok", entries: [] },
  intakeHistory: { status: "ok", rows: [] },
  licence: { status: "ok", keys: [] },
  person: { status: "ok", birthDate: null, gender: null },
  summaryAuthorName: null,
  nowMs: SAMPLE_NOW_MS,
  todayIso: SAMPLE_TODAY,
  ...over,
});

const answered = (data: Record<string, string>, day: string): IntakeTrendRow => ({
  proposed_data: data,
  reviewed_at: at(day),
  created_at: at(day),
  status: "approved",
});

// ---- Orthopaedic: Riya, a sore right knee ------------------------------------

/** A sore right knee easing and a lower back that settles. The Pain Map
 *  scores (0-100 per area) average to 7.0, 6.0, 4.5 and 3.0 out of 10 over
 *  the four exams: the 7/10 to 3/10 the showcase quotes. */
export const SAMPLE_PAIN_ASSESSMENTS: PainAssessmentRow[] = [
  [75, 65],
  [65, 55],
  [50, 40],
  [35, 25],
].flatMap(([knee, back], i) => [
  { region: "knee", side: "right", pain_percent: knee, created_at: at(SAMPLE_REVIEW_DAYS[i]), submitted_by_role: "therapist" },
  { region: "lower_back", side: "na", pain_percent: back, created_at: at(SAMPLE_REVIEW_DAYS[i]), submitted_by_role: "therapist" },
]);

export type SamplePerson = { name: string; conditionLine: string };

export function sampleOrtho(): { person: SamplePerson; view: OrthoView } {
  const row = rowMaker("ortho");
  const days = SAMPLE_REVIEW_DAYS;
  const bend = [88, 98, 106, 114].map((v, i) => row("joint_range", v, days[i], { variant: "knee_flexion_active", side: "right" }));
  const straighten = [-8, -5, -2, 0].map((v, i) => row("joint_range", v, days[i], { variant: "knee_extension_active", side: "right" }));
  const strength = [58, 66, 72, 78].map((v, i) => row("strength_symmetry", v, days[i], { variant: "quadriceps", side: "right" }));
  const goal = goalFor("ortho", "Climb the stairs at home and walk to the market without pain", "2026-04-30");
  const milestones = milestonesFor("ortho", goal, [
    { template: "ortho_knee_straightens_fully", status: "reached", targetDate: "2026-02-28", reachedOn: days[3], reachedBy: straighten[3].id, side: "right", baseline: -8 },
    { template: "ortho_knee_bends_125", status: "working", targetDate: "2026-03-31", side: "right", baseline: 88 },
    { template: "ortho_strength_90", status: "planned", targetDate: "2026-04-30", side: "right", baseline: 58 },
    { template: "ortho_stairs_step_over_step", status: "planned", targetDate: "2026-04-30" },
  ]);
  const view = shapeOrthoView(
    {
      measurements: { status: "ok", rows: [...bend, ...straighten, ...strength] },
      goals: goalsRead(goal, milestones),
      careStatus: { status: "ok", events: [] },
      assessments: SAMPLE_PAIN_ASSESSMENTS,
    },
    "patient",
    SAMPLE_NOW_MS
  );
  return { person: { name: "Riya", conditionLine: "Right knee pain, lower back" }, view };
}

// ---- Neurological: Arun after a stroke; Sunil with Parkinson's ------------------

const neuroExam = (id: string, day: string, bergTotal: number, tenMetreWalkSeconds: number, tugSeconds: number): NeuroAssessmentRow => ({
  id,
  created_at: at(day),
  submitted_by_role: "therapist",
  schema_version: 1,
  findings: {
    bilateral: {
      power_knee_extension: { left: bergTotal >= 40 ? "4" : "3", right: "5" },
      power_ankle_dorsiflexion: { left: bergTotal >= 40 ? "3" : "2", right: "5" },
      tone_knee_extensors: { left: "1", right: "0" },
    },
    balance: { sitting: "normal", standing: bergTotal >= 40 ? "good" : "fair", bergTotal },
    gait: { patterns: ["hemiplegic"], aids: ["stick"], tenMetreWalkSeconds, tugSeconds },
  },
});

export type SampleNeuro = {
  person: SamplePerson;
  view: NeuroView;
  assessments: NeuroAssessmentRow[];
};

export function sampleNeuroStroke(): SampleNeuro {
  const row = rowMaker("neuro");
  const days = SAMPLE_REVIEW_DAYS;
  const fac = [2, 2, 3, 4].map((v, i) => row("fac", v, days[i]));
  const goal = goalFor("neuro", "Walk to the gate and back with my stick, on my own", "2026-05-31");
  const milestones = milestonesFor("neuro", goal, [
    { template: "neuro_walk_10m_stick", status: "reached", targetDate: "2026-02-15", reachedOn: days[2], reachedBy: fac[2].id },
    { template: "neuro_walk_to_gate", status: "working", targetDate: "2026-03-31" },
    { template: "neuro_walk_speed_short_trips", status: "planned", targetDate: "2026-04-30" },
    { template: "neuro_climb_5_stairs", status: "planned", targetDate: "2026-05-31" },
  ]);
  const assessments = [
    neuroExam("exam-1", days[0], 28, 50, 29),
    neuroExam("exam-2", days[1], 33, 40, 25),
    neuroExam("exam-3", days[2], 38, 33, 21),
    neuroExam("exam-4", days[3], 42, 28, 18.5),
  ];
  const independence = [3, 4, 6, 7].map((v, i) => answered({ neuro_independence: String(v) }, days[i]));
  const view = shapeNeuroView(
    {
      measurements: { status: "ok", rows: fac },
      goals: goalsRead(goal, milestones),
      careStatus: { status: "ok", events: [] },
      diary: { status: "ok", entries: [] },
      intakeHistory: { status: "ok", rows: independence },
      licence: { status: "ok", keys: [] },
      exams: assessments,
      examsFailed: false,
    },
    {
      kind: "neuro",
      intake: {
        neuro_diagnosis: "Stroke affecting the right side of the brain, December 2025",
        neuro_affected_side: "Left side",
        neuro_falls: "None",
        neuro_independence: "7",
      },
      voice: "patient",
      nowMs: SAMPLE_NOW_MS,
    }
  );
  return { person: { name: "Arun", conditionLine: "Recovery after stroke, left side" }, view, assessments };
}

export function sampleNeuroParkinsons(): SampleNeuro {
  const row = rowMaker("pd");
  const days = SAMPLE_REVIEW_DAYS;
  // Every timed test is taken in ON time, 90 minutes after the morning dose,
  // so the dots on a line are comparable (outcomeSeries.pointsAreComparable).
  const on = (day: string) => ({ conditions: { medicationState: "on", lastDoseAt: at(day, "04:00:00.000Z") } });
  const tug = [14.6, 13.9, 13.1, 12.4].map((v, i) => row("tug", v, days[i], on(days[i])));
  const mini = [16, 18, 20, 22].map((v, i) => row("mini_bestest", v, days[i], on(days[i])));
  const walk = [0.72, 0.76, 0.8, 0.86].map((v, i) => row("ten_metre_walk", v, days[i], on(days[i])));
  const rating = (items: number[], day: string) =>
    row("pd_symptom_rating", items.reduce((a, b) => a + b, 0), day, { items, ...on(day) });
  const ratings = [rating([2, 2, 3, 3, 2, 2], days[0]), rating([1, 2, 2, 2, 2, 1], days[3])];
  const stage = row("hoehn_yahr", 2, days[0], on(days[0]));
  const goal = goalFor("neuro_parkinsons", "Walk to the market and back with a bag, without stopping", "2026-05-31");
  const milestones = milestonesFor("neuro_parkinsons", goal, [
    { template: "pd_restart_with_beat", status: "reached", targetDate: "2026-02-15", reachedOn: days[2] },
    { template: "pd_tug_under_11_5", status: "working", targetDate: "2026-03-31", baseline: 14.6 },
    { template: "pd_three_months_no_fall", status: "planned", targetDate: "2026-04-30" },
    { template: "pd_walk_30_minutes", status: "planned", targetDate: "2026-05-31" },
  ]);
  const view = shapeNeuroView(
    {
      measurements: { status: "ok", rows: [...tug, ...mini, ...walk, ...ratings, stage] },
      goals: goalsRead(goal, milestones),
      careStatus: { status: "ok", events: [] },
      diary: { status: "ok", entries: [] as DiaryEntry[] },
      intakeHistory: { status: "ok", rows: [] },
      licence: { status: "ok", keys: [] },
      exams: [],
      examsFailed: false,
    },
    {
      kind: "neuro_parkinsons",
      intake: {
        neuro_diagnosis: "Parkinson's disease, diagnosed in 2022",
        [NEURO_SUBTYPE_KEY]: NEURO_SUBTYPE_PARKINSONS,
        neuro_affected_side: "Both sides",
        neuro_falls: "None",
      },
      voice: "patient",
      nowMs: SAMPLE_NOW_MS,
    }
  );
  return { person: { name: "Sunil", conditionLine: "Parkinson's disease, tested in ON time" }, view, assessments: [] };
}

// ---- Paediatric: Meera, born early ----------------------------------------------

/** Born at 30 weeks, so ten weeks early: on 20 February 2026 she is 14.6
 *  months old and 12.3 months by corrected age, and every milestone she has
 *  not reached is still inside its WHO window. */
export const SAMPLE_PEDS_BIRTH_DATE = "2024-12-01";
export const SAMPLE_PEDS_WEEKS_AT_BIRTH = 30;

const pedsExam = (id: string, day: string, milestones: PedsFindings["milestones"]): ParsedPedsAssessment => ({
  id,
  createdAt: at(day),
  submittedBy: THERAPIST_ID,
  submittedByRole: "therapist",
  findings: { milestones },
});

/** The "what they do on their own" list the paediatric intake asks. */
const INTAKE_PEDS_MILESTONE_OPTIONS: string[] = PEDS_INTAKE_QUESTIONS.find((q) => q.key === "peds_milestones")?.options ?? [];

export type SamplePeds = { person: SamplePerson; view: PedsView };

export function samplePeds(): SamplePeds {
  const row = rowMaker("peds");
  const days = SAMPLE_REVIEW_DAYS;
  // Newest first, as the product's parser returns them.
  const exams: ParsedPedsAssessment[] = [
    pedsExam("pexam-4", days[3], {
      sitting_without_support: { status: "achieved", firstSeenOn: "2025-10-10", source: "reported", approximate: true },
      hands_knees_crawling: { status: "achieved", firstSeenOn: "2026-01-15", source: "seen" },
      standing_with_help: { status: "achieved", firstSeenOn: "2026-01-30", source: "seen" },
      walking_with_help: { status: "achieved", firstSeenOn: "2026-02-12", source: "seen" },
      standing_alone: { status: "emerging", firstSeenOn: "2026-02-14", source: "seen" },
      walking_alone: { status: "not_yet" },
    }),
    pedsExam("pexam-3", days[2], {
      sitting_without_support: { status: "achieved", firstSeenOn: "2025-10-10", source: "reported", approximate: true },
      hands_knees_crawling: { status: "achieved", firstSeenOn: "2026-01-15", source: "seen" },
      standing_with_help: { status: "achieved", firstSeenOn: "2026-01-30", source: "seen" },
      walking_with_help: { status: "emerging", source: "seen" },
      standing_alone: { status: "not_yet" },
    }),
    pedsExam("pexam-2", days[1], {
      sitting_without_support: { status: "achieved", firstSeenOn: "2025-10-10", source: "reported", approximate: true },
      hands_knees_crawling: { status: "achieved", firstSeenOn: "2026-01-15", source: "seen" },
      standing_with_help: { status: "emerging", source: "seen" },
      walking_with_help: { status: "not_yet" },
    }),
    pedsExam("pexam-1", days[0], {
      sitting_without_support: { status: "achieved", firstSeenOn: "2025-10-10", source: "reported", approximate: true },
      hands_knees_crawling: { status: "emerging", source: "seen" },
      standing_with_help: { status: "not_yet" },
    }),
  ];
  const standing = [0, 2, 4, 6].map((v, i) => row("peds_standing_seconds", v, days[i]));
  const goal = goalFor("pediatrics", "Walk across the room to her family", "2026-06-30");
  const milestones = milestonesFor("pediatrics", goal, [
    { template: "peds_stand_5_seconds", status: "reached", targetDate: "2026-02-28", reachedOn: days[3], reachedBy: standing[3].id, baseline: 0 },
    { template: "peds_stand_10_seconds", status: "working", targetDate: "2026-03-31", baseline: 0 },
    { template: "peds_first_steps", status: "planned", targetDate: "2026-04-30" },
    { template: "peds_5_steps", status: "planned", targetDate: "2026-06-30" },
  ]);
  const intake = {
    peds_caregiver_name: "Priya",
    peds_caregiver_relationship: "Mother",
    peds_weeks_at_birth: `${SAMPLE_PEDS_WEEKS_AT_BIRTH} weeks`,
    peds_concern: "Slow to stand and walk",
    peds_milestones: serializeMultiSelect(INTAKE_PEDS_MILESTONE_OPTIONS.slice(0, 5)),
  };
  const view = shapePedsView(
    {
      exams: { status: "ok", exams },
      birth: { status: "ok", birthDate: SAMPLE_PEDS_BIRTH_DATE, gender: "Female" },
      measurements: { status: "ok", rows: standing },
      goals: goalsRead(goal, milestones),
      careStatus: { status: "ok", events: [] },
      licence: { status: "ok", keys: [] },
      sessions: { status: "ok", done: 4, next: null },
      summaryAuthorName: null,
      nowMs: SAMPLE_NOW_MS,
      todayIso: SAMPLE_TODAY,
    },
    { intake, voice: "patient", milestoneOptions: INTAKE_PEDS_MILESTONE_OPTIONS }
  );
  return { person: { name: "Meera", conditionLine: "Slow to stand and walk" }, view };
}

// ---- Strength and balance care: Lakshmi, three falls -----------------------------

export const SAMPLE_GERIATRIC_INTAKE = {
  geri_concern: "Three falls this year, arthritis in both knees",
  geri_falls_12m: GERI_FALLS_TWO_PLUS,
  geri_unsteady: "Yes",
  geri_fall_worry: "Yes",
  geri_walking_aid: "A walking stick",
  geri_daily_help: serializeMultiSelect(["Bathing or washing"]),
};

export type SampleGeriatric = { person: SamplePerson; view: GeriatricView };

export function sampleGeriatric(): SampleGeriatric {
  const row = rowMaker("geri");
  const days = SAMPLE_REVIEW_DAYS;
  const tug = [15.6, 14.2, 12.9, 11.6].map((v, i) => row("tug", v, days[i]));
  const chair = [7, 8, 10, 11].map((v, i) => row("chair_stand_30s", v, days[i]));
  const balance = [2, 2, 3, 3].map((v, i) => row("four_stage_balance", v, days[i]));
  const gait = [0.58, 0.63, 0.69, 0.74].map((v, i) => row("gait_speed_4m", v, days[i]));
  const goal = goalFor("geriatric", "Walk to the kitchen and to the gate without the frame", "2026-05-31");
  const milestones = milestonesFor("geriatric", goal, [
    { template: "geri_tug_under_12", status: "reached", targetDate: "2026-02-28", reachedOn: days[3], reachedBy: tug[3].id, baseline: 15.6 },
    { template: "geri_heel_to_toe", status: "reached", targetDate: "2026-02-15", reachedOn: days[2], reachedBy: balance[2].id, baseline: 2 },
    { template: "geri_kitchen_without_frame", status: "working", targetDate: "2026-03-31" },
    { template: "geri_walk_to_gate", status: "planned", targetDate: "2026-04-30" },
    { template: "geri_floor_with_chair", status: "planned", targetDate: "2026-05-31" },
  ]);
  // Two falls in the year before the first visit, said at intake, and a
  // third on 27 January that her physiotherapist confirmed: the level stays
  // High however well the tests go, and the dial says so.
  const fall: DiaryEntry = {
    id: "sample-fall-1",
    patientId: PATIENT_ID,
    kind: "fall",
    occurredAt: at("2026-01-27", "08:00:00.000Z"),
    details: { injured: false },
    note: null,
    enteredBy: PATIENT_ID,
    enteredByRole: "patient",
    confirmedBy: THERAPIST_ID,
    confirmedByRole: "therapist",
    confirmedAt: at("2026-02-02"),
    createdAt: at("2026-01-27", "08:05:00.000Z"),
  };
  const view = shapeGeriatricView(
    measuredReads([...tug, ...chair, ...balance, ...gait], goal, milestones, {
      diary: { status: "ok", entries: [fall] },
      intakeHistory: { status: "ok", rows: [answered(SAMPLE_GERIATRIC_INTAKE, days[0])] },
      person: { status: "ok", birthDate: "1947-11-02", gender: "Female" },
    }),
    { intake: SAMPLE_GERIATRIC_INTAKE, voice: "patient" }
  );
  return { person: { name: "Lakshmi", conditionLine: "Three falls this year, arthritis in both knees" }, view };
}

// ---- Heart and lung rehabilitation: Dinesh, after bypass surgery -----------------

export const SAMPLE_CARDIO_INTAKE = {
  cardio_condition: CARDIO_CONDITION_OPEN_HEART,
  cardio_condition_date: "November 2025",
  cardio_beta_blocker: "No",
  cardio_home_oxygen: "No",
  // The patient's own limit, set by their doctor: shown as theirs, never as
  // a fixed line.
  cardio_spo2_limit: "92%",
};

export type SampleCardio = { person: SamplePerson; view: CardioView };

export function sampleCardio(): SampleCardio {
  const row = rowMaker("cardio");
  const days = SAMPLE_REVIEW_DAYS;
  const walk = [285, 318, 346, 372].map((v, i) => row("six_minute_walk", v, days[i]));
  const breath = [6, 5, 4, 3].map((v, i) => row("breathlessness_nrs", v, days[i], { variant: "after_test" }));
  const heart = [84, 80, 77, 74].map((v, i) => row("resting_heart_rate", v, days[i]));
  const vitals = [
    row("resting_spo2", 97, days[3]),
    row("lowest_spo2", 95, days[3]),
    row("blood_pressure", 122, days[3], { variant: "rest", items: { systolic: 122, diastolic: 76 } }),
  ];
  const goal = goalFor("cardiopulmonary", "Walk to the temple and back, and climb two flights of stairs", "2026-05-31");
  const milestones = milestonesFor("cardiopulmonary", goal, [
    { template: "cardio_walk_10_minutes", status: "reached", targetDate: "2026-02-15", reachedOn: days[2] },
    { template: "cardio_6mwt_400", status: "working", targetDate: "2026-03-31", baseline: 285 },
    { template: "cardio_two_flights", status: "planned", targetDate: "2026-04-30" },
    { template: "cardio_150_active_minutes", status: "planned", targetDate: "2026-05-31" },
  ]);
  const raw = shapeCardioView(
    {
      ...measuredReads([...walk, ...breath, ...heart, ...vitals], goal, milestones, {
        person: { status: "ok", birthDate: "1963-08-14", gender: "Male" },
      }),
      equation: { status: "ok", key: "indian_adult_tbd", chosen: false },
    },
    { intake: SAMPLE_CARDIO_INTAKE, voice: "patient" }
  );
  // The expected distance comes from a formula the clinic chooses, so the
  // showcase draws the walk without one rather than a line saying it is unset.
  const view: CardioView = { ...raw, predictionNeeds: [], walk: { ...raw.walk, prediction: { status: "not_chosen", text: "" } } };
  return { person: { name: "Dinesh", conditionLine: `${CARDIO_CONDITION_OPEN_HEART} · November 2025` }, view };
}
