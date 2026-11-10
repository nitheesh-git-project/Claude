// What the paediatric Health Profile's server side hands its screens (phase
// 5a; the screens are phase 5b): the reads, each with its own status, and
// the shaped examination part -- who told us, the child's age, the latest
// and first examinations, the milestone-window chart for each, and the
// change since the exam before.
//
// Pure (pedsProfileView.test.ts). Plain data in, plain data out: it crosses
// the server/client boundary. The date of birth itself never leaves the
// server: `PedsReads.birth` is for this shaper, and the view carries only
// the ages derived from it.
//
// Two owner decisions live here:
//   - The header names who told us, from the intake's caregiver pre-step
//     (`peds_caregiver_name`, `peds_caregiver_relationship`): "Told by Priya
//     Sharma, her mother". It is provenance -- whose account the intake is --
//     and is never presented as the physiotherapist's view.
//   - "Where things stand" keeps the physiotherapist's byline (the
//     therapist's name, careStatusAuthor.ts), not the caregiver's: the
//     caregiver told us the history; the physiotherapist wrote the summary.
//   - No paediatric diary (DIARY_KINDS_BY_PROFILE_KIND.pediatrics is empty),
//     so there is no diary read here.

import {
  buildMeasureSeries,
  measureTableRows,
  parseMeasurementRows,
  type MeasureSeries,
  type MeasureTableRow,
  type MeasurementPoint,
  type OutcomeMeasurementRow,
} from "@/lib/outcomeSeries";
import { shapeMilestones, type CareGoal, type CareMilestone, type MilestoneView } from "@/lib/careGoals";
import { EMPTY_CARE_STATUS, shapeCareStatus, type ActiveOverride, type CareStatusEvent } from "@/lib/careStatus";
import { computeProfileStatus, type StatusResult } from "@/lib/profileStatus";
import { inferPhase, type KeyTile, type Voice } from "@/lib/progressView";
import { whereThingsStandView, type WhereThingsStandView } from "@/lib/whereThingsStand";
import {
  intakeChecklist,
  pedsConditionLine,
  pedsKeyTiles,
  pedsLastReviewAt,
  pedsSeries,
  pedsStandSummary,
  pedsStatusInput,
  PEDS_PROFILE_KIND,
  type PedsSessions,
} from "@/lib/pedsProfile";
import {
  comparePedsExams,
  pedsExamTally,
  type ParsedPedsAssessment,
  type PedsChange,
  type PedsExamTally,
} from "@/lib/pedsExam";
import { parseWeeksAtBirth, pedsAgeLine, pedsAgeView, PEDS_WEEKS_AT_BIRTH_KEY, type PedsAgeView } from "@/lib/pedsAge";
import { pedsMilestoneWindows, type MilestoneWindowsView } from "@/lib/pedsMilestoneWindows";

export const PEDS_CAREGIVER_NAME_KEY = "peds_caregiver_name";
export const PEDS_CAREGIVER_RELATIONSHIP_KEY = "peds_caregiver_relationship";

/** The reads behind a paediatric profile, each its own call (a failed one
 *  degrades its own card; unreadable is never "none yet"). */
export type PedsReads = {
  exams: { status: "ok"; exams: ParsedPedsAssessment[] } | { status: "unreadable" };
  /** The child's date of birth and gender from `profiles`, read with the
   *  admin client. Server-side only: the shaper turns it into ages. */
  birth: { status: "ok"; birthDate: string | null; gender: string | null } | { status: "unreadable" };
  measurements: { status: "ok"; rows: OutcomeMeasurementRow[] } | { status: "unreadable" };
  goals:
    | { status: "ok"; activeGoal: CareGoal | null; goals: CareGoal[]; milestones: CareMilestone[] }
    | { status: "unreadable" };
  careStatus: { status: "ok"; events: CareStatusEvent[] } | { status: "unreadable" };
  licence: { status: "ok"; keys: string[] } | { status: "unreadable" };
  /** Sessions finished, and the next one booked. */
  sessions: ({ status: "ok" } & PedsSessions) | { status: "unreadable" };
  /** Who wrote the current "Where things stand" text: the therapist's name,
   *  null for the clinic's own text or a failed lookup. */
  summaryAuthorName: string | null;
  nowMs: number;
  /** The clinic's calendar day at `nowMs`. */
  todayIso: string;
};

// --- Who told us ----------------------------------------------------------------

const KNOWN_RELATIONS = new Set([
  "mother",
  "father",
  "parent",
  "grandmother",
  "grandfather",
  "grandparent",
  "aunt",
  "uncle",
  "sister",
  "brother",
  "guardian",
  "legal guardian",
  "foster mother",
  "foster father",
  "foster parent",
  "stepmother",
  "stepfather",
  "carer",
  "caregiver",
  "nanny",
]);

function possessive(gender: string | null | undefined): string {
  const g = (gender ?? "").trim().toLowerCase();
  if (g === "female") return "her";
  if (g === "male") return "his";
  return "their";
}

/**
 * "Told by Priya Sharma, her mother" -- the header's provenance line, from
 * the caregiver pre-step and the child's recorded gender ("their" when the
 * gender is not Female or Male). A relationship the list does not know is
 * kept in the caregiver's own words ("Told by Asha, the child's aunt by
 * marriage" reads worse than "Told by Asha (Aunt by marriage)"), and with no
 * name there is no line: a relationship alone tells a reader nothing.
 */
export function caregiverProvenance(input: {
  name: string | null | undefined;
  relationship: string | null | undefined;
  childGender?: string | null;
}): string | null {
  const name = (input.name ?? "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  const relationship = (input.relationship ?? "").replace(/\s+/g, " ").trim();
  if (!relationship) return `Told by ${name}`;
  const lower = relationship.toLowerCase();
  // Already phrased from the child's side ("Her aunt"). "My daughter" is
  // phrased from the caregiver's, so it is kept in their words below rather
  // than turned into "her daughter", which would say the opposite.
  if (/^(her|his|their|the child's)\b/.test(lower)) return `Told by ${name}, ${lower}`;
  if (KNOWN_RELATIONS.has(lower)) return `Told by ${name}, ${possessive(input.childGender)} ${lower}`;
  return `Told by ${name} (${relationship})`;
}

// --- The examination part ------------------------------------------------------------

export type PedsExamView = {
  provenance: string | null;
  age: PedsAgeView;
  /** "14 months (11.7 months corrected, born at 30 weeks)", or null. */
  ageLine: string | null;
  /** True when the date of birth could not be read (not "not on file"). */
  birthFailed: boolean;
  examsFailed: boolean;
  /** Newest first. */
  exams: ParsedPedsAssessment[];
  latest: ParsedPedsAssessment | null;
  first: ParsedPedsAssessment | null;
  /** The chart for the latest exam (every milestone "not checked yet" with
   *  none) and for the first, for a First exam / Latest switch. */
  windows: MilestoneWindowsView;
  firstWindows: MilestoneWindowsView | null;
  tally: PedsExamTally | null;
  /** Latest against the one before it; empty with fewer than two. */
  changes: PedsChange[];
  /** Clinicians only: null in the patient's voice, whatever the chart says. */
  referral: { clinicianText: string } | null;
  /** Clinicians only: "Walking alone not assessed yet" past 18 months
   *  corrected, a gap to close and not a referral prompt. */
  walkingNotAssessed: { clinicianText: string } | null;
};

export function shapePedsExamView(
  reads: Pick<PedsReads, "exams" | "birth" | "todayIso">,
  ctx: { intake: Readonly<Record<string, unknown>>; voice: Voice }
): PedsExamView {
  const text = (key: string) => (typeof ctx.intake[key] === "string" ? (ctx.intake[key] as string) : "");
  const birthDate = reads.birth.status === "ok" ? reads.birth.birthDate : null;
  const gender = reads.birth.status === "ok" ? reads.birth.gender : null;
  const weeksAtBirth = parseWeeksAtBirth(ctx.intake[PEDS_WEEKS_AT_BIRTH_KEY]);
  const exams = reads.exams.status === "ok" ? reads.exams.exams : [];
  const latest = exams[0] ?? null;
  const first = exams.length > 1 ? exams[exams.length - 1] : null;
  const age = pedsAgeView({ birthDate, weeksAtBirth, onDate: reads.todayIso });
  const windows = pedsMilestoneWindows({ findings: latest?.findings ?? null, birthDate, weeksAtBirth, todayIso: reads.todayIso });
  const firstWindows = first
    ? pedsMilestoneWindows({ findings: first.findings, birthDate, weeksAtBirth, todayIso: reads.todayIso })
    : null;
  return {
    provenance: caregiverProvenance({
      name: text(PEDS_CAREGIVER_NAME_KEY),
      relationship: text(PEDS_CAREGIVER_RELATIONSHIP_KEY),
      childGender: gender,
    }),
    age,
    ageLine: pedsAgeLine(age),
    birthFailed: reads.birth.status === "unreadable",
    examsFailed: reads.exams.status === "unreadable",
    exams,
    latest,
    first,
    windows,
    firstWindows,
    tally: latest ? pedsExamTally(latest.findings) : null,
    changes: exams.length > 1 ? comparePedsExams(exams[0].findings, exams[1].findings) : [],
    referral: ctx.voice === "clinician" ? windows.referral : null,
    walkingNotAssessed: ctx.voice === "clinician" ? windows.walkingNotAssessed : null,
  };
}

// --- The whole page --------------------------------------------------------------

export type PedsChecklistItem = { label: string; done: boolean };

/** Everything a paediatric Health Profile draws, shaped once so the parent's
 *  page, the therapist's chart and the admin's chart show the same figures. */
export type PedsView = {
  exam: PedsExamView;
  series: MeasureSeries[];
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
  /** The intake's "what they do on their own" list with ticks. */
  checklist: PedsChecklistItem[];
  /** The date of birth is on file but not plausible for a child: the chart
   *  is not drawn and a card asks for it to be checked. */
  dobImplausible: null | "future" | "adult";
  measuresFailed: boolean;
  goalsFailed: boolean;
  statusFailed: boolean;
  examsFailed: boolean;
  birthFailed: boolean;
};

export function shapePedsView(
  reads: PedsReads,
  ctx: { intake: Readonly<Record<string, string>>; voice: Voice; milestoneOptions: readonly string[] }
): PedsView {
  const { voice } = ctx;
  const exam = shapePedsExamView(reads, { intake: ctx.intake, voice });
  const measuresFailed = reads.measurements.status !== "ok";
  const points = reads.measurements.status === "ok" ? parseMeasurementRows(reads.measurements.rows) : [];
  const recordedSeries = buildMeasureSeries(points, { profileKind: PEDS_PROFILE_KIND });
  const series = pedsSeries({ recorded: recordedSeries, exams: exam.exams });

  const goalsFailed = reads.goals.status !== "ok";
  const goal = reads.goals.status === "ok" ? reads.goals.activeGoal : null;
  const planMilestones = reads.goals.status === "ok" && goal ? reads.goals.milestones.filter((m) => m.goalId === goal.id) : [];
  const views = shapeMilestones(planMilestones, points, reads.nowMs);

  const lastReviewAt = pedsLastReviewAt(series, exam.exams);
  const statusFailed = reads.careStatus.status !== "ok";
  const careState =
    reads.careStatus.status === "ok"
      ? shapeCareStatus(reads.careStatus.events, { profileKind: PEDS_PROFILE_KIND, latestReviewAt: lastReviewAt })
      : EMPTY_CARE_STATUS;
  const computed = computeProfileStatus(pedsStatusInput(series));
  const inferred = careState.phase ? null : inferPhase(planMilestones, PEDS_PROFILE_KIND);

  const checklist = intakeChecklist(ctx.milestoneOptions, ctx.intake.peds_milestones);
  const keyTiles = pedsKeyTiles({
    series,
    exams: exam.exams,
    examsFailed: exam.examsFailed,
    measuresFailed,
    milestones: planMilestones,
    voice,
    checklist,
    sessions: reads.sessions.status === "ok" ? { done: reads.sessions.done, next: reads.sessions.next } : null,
  });
  const stand = whereThingsStandView({
    written: careState.summary,
    authorName: reads.summaryAuthorName ?? null,
    generated: pedsStandSummary({ series, voice }),
    // The draft is for the parent to read, whoever is typing it.
    draft: pedsStandSummary({ series, voice: "patient" }),
  });

  return {
    exam,
    series,
    recordedSeries,
    points,
    tableRows: measureTableRows(series, planMilestones, { profileKind: PEDS_PROFILE_KIND }),
    goal,
    views,
    computed,
    override: careState.override,
    phase: careState.phase?.phase ?? inferred,
    phaseIsInferred: !careState.phase && inferred !== null,
    stand,
    lastReviewAt,
    keyTiles,
    conditionLine: pedsConditionLine(ctx.intake),
    checklist,
    dobImplausible: exam.age.status === "implausible" ? exam.age.reason : null,
    measuresFailed,
    goalsFailed,
    statusFailed,
    examsFailed: exam.examsFailed,
    birthFailed: exam.birthFailed,
  };
}
