import { clinicDateKey } from "@/lib/clinicWeek";
import {
  activeMinutesWeeklySeries,
  entriesAwaitingConfirmation,
  type ActiveMinutesWeekPoint,
  type DiaryEntry,
} from "@/lib/patientDiary";
import {
  betaBlockerFromIntake,
  duringExerciseOxygenCheck,
  effortGuidance,
  mmrcGradeFromIntake,
  preExerciseCheck,
  resolveOxygenStopLimit,
  sixMinuteWalkPrediction,
  sternalPrecautions,
  type DuringExerciseCheck,
  type EffortGuidance,
  type OxygenStopLimit,
  type PreExerciseCheck,
  type SixMinuteWalkPrediction,
  type SternalPrecautions,
} from "@/lib/cardioSafety";
import { ageInYears, sexForNorms } from "@/lib/geriatricRisk";
import { computeProfileStatus, type StatusInput, type StatusResult } from "@/lib/profileStatus";
import { keyTile, readingText, type KeyTile, type Voice } from "@/lib/progressView";
import { whereThingsStandView, type WhereThingsStandView } from "@/lib/whereThingsStand";
import type { ProfileSubject } from "@/lib/childVoice";
import type { ActiveOverride } from "@/lib/careStatus";
import type { CareGoal, MilestoneView } from "@/lib/careGoals";
import type { MeasureSeries, MeasureTableRow, MeasurementPoint } from "@/lib/outcomeSeries";
import type { SixMinuteWalkEquationRead } from "@/lib/sixMinuteWalkEquation";
import { mainMeasureInput, shapeMeasuredBase, type MeasuredProfileReads } from "@/lib/progressProfileBase";

// Everything the Heart and lung rehabilitation Health Profile draws (Health
// Profile redesign, phase 6a ships the data; phase 6b draws it), shaped once
// for the patient's page, the therapist's chart and the admin's detail.
// Plain data in, plain data out.
//
// What it decides (the rules themselves are cardioSafety.ts):
//  - The oxygen line is the PATIENT'S stop limit, the doctor's or the
//    default for their condition, labelled as such -- never a fixed 90%.
//  - The latest vitals are checked against the pre-exercise red flags; a
//    flagged reading from the latest review is the status rule's red flag
//    ("Needs attention"), an older one is history.
//  - Effort is the talk test for anyone on a beta-blocker or not recorded as
//    off one; a heart-rate target needs an exercise-test maximum, which the
//    record does not hold yet, so in practice every patient is on the talk
//    test until it does.
//  - The six-minute walk's % of predicted follows the clinic's equation
//    setting ("formula not chosen yet" / "we couldn't check").
//  - Active minutes are a weekly diary series against the WHO's 150.

export const CARDIO_PROFILE_KIND = "cardiopulmonary" as const;
export const CARDIO_SUBJECT: ProfileSubject = "self";

/** The status rule's main-measure preference: stamina first. */
export const CARDIO_MAIN_PREFERENCE = ["six_minute_walk", "one_minute_sit_to_stand", "mmrc", "breathlessness_nrs"] as const;

export type CardioReads = MeasuredProfileReads & {
  /** The clinic's six-minute walk equation (site_settings). */
  equation: SixMinuteWalkEquationRead;
};

export type VitalReading = { value: number; measuredAt: string; measurementId: string };

export type CardioVitals = {
  restingHeartRate: VitalReading | null;
  /** The latest at-rest blood pressure, both numbers. */
  bloodPressureRest: (VitalReading & { systolic: number; diastolic: number | null }) | null;
  spo2Rest: VitalReading | null;
  spo2Lowest: VitalReading | null;
  breathlessnessRest: VitalReading | null;
  /** The latest talk-test grade (0 too easy, 1 just right, 2 too hard). */
  talkTest: VitalReading | null;
};

export type CardioView = {
  kind: typeof CARDIO_PROFILE_KIND;
  subject: ProfileSubject;
  series: MeasureSeries[];
  graphSeries: MeasureSeries[];
  points: MeasurementPoint[];
  tableRows: MeasureTableRow[];
  goal: CareGoal | null;
  views: MilestoneView[];
  computed: StatusResult;
  statusInput: StatusInput;
  override: ActiveOverride | null;
  phase: string | null;
  phaseIsInferred: boolean;
  stand: WhereThingsStandView;
  lastReviewAt: string | null;
  /** Six-minute walk, oxygen, resting heart rate, active minutes. */
  keyTiles: KeyTile[];
  /** "Heart bypass or valve surgery (open-heart) · July 2026". */
  conditionLine: string | null;
  ageLine: string | null;
  limit: OxygenStopLimit;
  vitals: CardioVitals;
  /** The latest vitals against the pre-exercise red flags. */
  vitalsCheck: PreExerciseCheck;
  /** The latest lowest oxygen against the limit (and the heart default's
   *  4-point drop from rest). */
  oxygenCheck: DuringExerciseCheck;
  effort: EffortGuidance;
  onBetaBlocker: boolean | null;
  precautions: SternalPrecautions;
  walk: { first: VitalReading | null; latest: VitalReading | null; prediction: SixMinuteWalkPrediction };
  /** mMRC grade 0-4: the latest measurement, else the intake answer. */
  mmrc: { grade: number; source: "measurement" | "intake" } | null;
  homeOxygen: { uses: boolean | null; prescription: string | null };
  activeMinutes: { status: "ok"; goal: number; weeks: ActiveMinutesWeekPoint[] } | { status: "unreadable" };
  diary: { status: "ok"; entries: DiaryEntry[]; awaiting: DiaryEntry[] } | { status: "unreadable" };
  notes: string[];
  measuresFailed: boolean;
  goalsFailed: boolean;
  statusFailed: boolean;
  diaryFailed: boolean;
  intakeFailed: boolean;
  personFailed: boolean;
};

function latest(points: readonly MeasurementPoint[], key: string, variant?: string): MeasurementPoint | null {
  let best: MeasurementPoint | null = null;
  for (const p of points) {
    if (p.measureKey !== key) continue;
    if (variant !== undefined && p.variant !== variant) continue;
    if (!best || Date.parse(p.measuredAt) > Date.parse(best.measuredAt) || (p.measuredAt === best.measuredAt && p.id > best.id)) best = p;
  }
  return best;
}

function earliest(points: readonly MeasurementPoint[], key: string): MeasurementPoint | null {
  let best: MeasurementPoint | null = null;
  for (const p of points) {
    if (p.measureKey !== key) continue;
    if (!best || Date.parse(p.measuredAt) < Date.parse(best.measuredAt)) best = p;
  }
  return best;
}

const reading = (p: MeasurementPoint | null): VitalReading | null =>
  p ? { value: p.value, measuredAt: p.measuredAt, measurementId: p.id } : null;

/** The latest of each vital on the record. */
export function latestCardioVitals(points: readonly MeasurementPoint[]): CardioVitals {
  const bp = latest(points, "blood_pressure", "rest");
  const items = bp && bp.items && !Array.isArray(bp.items) ? (bp.items as Record<string, number>) : null;
  return {
    restingHeartRate: reading(latest(points, "resting_heart_rate")),
    bloodPressureRest: bp
      ? {
          ...reading(bp)!,
          systolic: typeof items?.systolic === "number" ? items.systolic : bp.value,
          diastolic: typeof items?.diastolic === "number" ? items.diastolic : null,
        }
      : null,
    spo2Rest: reading(latest(points, "resting_spo2")),
    spo2Lowest: reading(latest(points, "lowest_spo2")),
    breathlessnessRest: reading(latest(points, "breathlessness_nrs", "rest")),
    talkTest: reading(latest(points, "talk_test")),
  };
}

/** Whether a flagged pre-exercise reading belongs to the latest review (its
 *  clinic day): only then is it the status rule's red flag. */
export function vitalsRedFlagAtLatestReview(vitals: CardioVitals, check: PreExerciseCheck, lastReviewAt: string | null): boolean {
  if (check.status !== "stop" || !lastReviewAt) return false;
  const day = clinicDateKey(lastReviewAt);
  const at = {
    resting_heart_rate_high: vitals.restingHeartRate?.measuredAt,
    blood_pressure_high: vitals.bloodPressureRest?.measuredAt,
    spo2_below_limit: vitals.spo2Rest?.measuredAt,
  };
  return check.flags.some((f) => {
    const when = at[f.code];
    return typeof when === "string" && clinicDateKey(when) === day;
  });
}

function placeholderTile(key: string, label: string, deltaText: string, valueText = "Not yet"): KeyTile {
  return { key, label, fullLabel: label, valueText, sparkPath: null, deltaText, deltaTone: "neutral", goalText: null };
}

const COULDNT_LOAD = "We couldn't load this just now. It is not missing.";

export function cardioKeyTiles(input: {
  series: readonly MeasureSeries[];
  milestones: Parameters<typeof keyTile>[1];
  voice: Voice;
  vitals: CardioVitals;
  limit: OxygenStopLimit;
  prediction: SixMinuteWalkPrediction;
  activeMinutes: CardioView["activeMinutes"];
  measuresFailed: boolean;
}): KeyTile[] {
  const { series, voice, vitals, limit } = input;
  const walkLine = series.find((s) => s.measureKey === "six_minute_walk" && s.points.length > 0);
  const walk: KeyTile = walkLine
    ? (() => {
        const t = keyTile(walkLine, input.milestones, CARDIO_PROFILE_KIND, voice, series);
        const p = input.prediction;
        const extra = p.status === "ok" && p.percent !== null ? `${p.percent}% of predicted` : p.status === "ok" ? null : p.text;
        return { ...t, label: "Six-minute walk", goalText: t.goalText ?? extra };
      })()
    : input.measuresFailed
      ? placeholderTile("six_minute_walk", "Six-minute walk", COULDNT_LOAD, "Unavailable")
      : placeholderTile("six_minute_walk", "Six-minute walk", "Not walked yet");
  const oxygen: KeyTile =
    vitals.spo2Rest || vitals.spo2Lowest
      ? {
          key: "oxygen",
          label: "Oxygen",
          fullLabel: "Oxygen level at rest and lowest on exercise",
          valueText: vitals.spo2Rest ? `${vitals.spo2Rest.value}% at rest` : `${vitals.spo2Lowest!.value}% lowest`,
          sparkPath: null,
          deltaText: vitals.spo2Rest && vitals.spo2Lowest ? `${vitals.spo2Lowest.value}% lowest on exercise` : "",
          deltaTone: "neutral",
          goalText: `${voice === "patient" ? "Your stop limit" : "Stop limit"}: ${limit.label}`,
        }
      : input.measuresFailed
        ? placeholderTile("oxygen", "Oxygen", COULDNT_LOAD, "Unavailable")
        : { ...placeholderTile("oxygen", "Oxygen", "Not measured yet"), goalText: `${voice === "patient" ? "Your stop limit" : "Stop limit"}: ${limit.label}` };
  const hrLine = series.find((s) => s.measureKey === "resting_heart_rate" && s.points.length > 0);
  const hr: KeyTile = hrLine
    ? { ...keyTile(hrLine, input.milestones, CARDIO_PROFILE_KIND, voice, series), label: "Resting heart rate" }
    : input.measuresFailed
      ? placeholderTile("resting_heart_rate", "Resting heart rate", COULDNT_LOAD, "Unavailable")
      : placeholderTile("resting_heart_rate", "Resting heart rate", "Not measured yet");
  let active: KeyTile;
  if (input.activeMinutes.status !== "ok") {
    active = placeholderTile("active_minutes", "Active minutes a week", COULDNT_LOAD, "Unavailable");
  } else {
    // The last complete week: the one in progress would read as a fall
    // before it is over.
    const done = input.activeMinutes.weeks.filter((w) => !w.inProgress);
    const last = done[done.length - 1];
    active =
      last && last.written
        ? {
            key: "active_minutes",
            label: "Active minutes a week",
            fullLabel: "Active minutes last week (patient reported)",
            valueText: readingText(last.minutes, 0, "min"),
            sparkPath: null,
            deltaText: voice === "patient" ? "Written in your diary" : "Patient reported",
            deltaTone: "neutral",
            goalText: `Goal: ${input.activeMinutes.goal} (WHO)${last.metGoal ? " (reached)" : ""}`,
          }
        : { ...placeholderTile("active_minutes", "Active minutes a week", "Nothing written down last week"), goalText: `Goal: ${input.activeMinutes.goal} (WHO)` };
  }
  return [walk, oxygen, hr, active];
}

/** A few plain sentences from the numbers alone, for "Where things stand"
 *  when nobody has written one. */
export function cardioStandSummary(input: {
  walk: CardioView["walk"];
  vitals: CardioVitals;
  effort: EffortGuidance;
  precautions: SternalPrecautions;
  voice: Voice;
}): string | null {
  const you = input.voice === "patient";
  const out: string[] = [];
  const { first, latest: now } = input.walk;
  if (now) {
    out.push(
      first && first.measurementId !== now.measurementId
        ? `${you ? "You walk" : "Walks"} ${now.value} metres in six minutes, ${now.value >= first.value ? "up" : "down"} from ${first.value}.`
        : `${you ? "You walked" : "Walked"} ${now.value} metres in six minutes at the first test.`
    );
  }
  if (input.vitals.restingHeartRate) out.push(`Resting heart rate ${input.vitals.restingHeartRate.value}.`);
  if (input.effort.mode === "talk_test" && input.effort.reason === "beta_blocker") {
    out.push(you ? "Exercise is paced by the talk test, because of your heart medicine." : "Paced by the talk test (beta-blocker).");
  }
  if (input.precautions.status === "active") {
    out.push(you ? "Your surgeon's precautions still apply." : "Sternal precautions are in force.");
  }
  return out.length > 0 ? out.join(" ") : null;
}

export function shapeCardioView(reads: CardioReads, ctx: { intake: Readonly<Record<string, string>>; voice: Voice }): CardioView {
  const { voice, intake } = ctx;
  const base = shapeMeasuredBase(reads, CARDIO_PROFILE_KIND);
  const person = reads.person.status === "ok" ? reads.person : null;
  const ageYears = person ? ageInYears(person.birthDate, reads.todayIso) : null;
  const sex = person ? sexForNorms(person.gender) : null;
  const limit = resolveOxygenStopLimit(intake);
  const vitals = latestCardioVitals(base.points);
  const vitalsCheck = preExerciseCheck(
    {
      restingHeartRate: vitals.restingHeartRate?.value ?? null,
      systolic: vitals.bloodPressureRest?.systolic ?? null,
      diastolic: vitals.bloodPressureRest?.diastolic ?? null,
      spo2Rest: vitals.spo2Rest?.value ?? null,
    },
    limit
  );
  const oxygenCheck = duringExerciseOxygenCheck({ spo2Lowest: vitals.spo2Lowest?.value ?? null, spo2Rest: vitals.spo2Rest?.value ?? null, limit });
  const onBetaBlocker = betaBlockerFromIntake(intake);
  const effort = effortGuidance({ onBetaBlocker, restingBpm: vitals.restingHeartRate?.value ?? null });
  const precautions = sternalPrecautions(intake, reads.todayIso);
  const latestWalk = reading(latest(base.points, "six_minute_walk"));
  const walk = {
    first: reading(earliest(base.points, "six_minute_walk")),
    latest: latestWalk,
    // Height and weight are not on the record yet, so the prediction says it
    // needs them once the clinic has chosen an equation.
    prediction: sixMinuteWalkPrediction({ walkedMetres: latestWalk?.value ?? null, equation: reads.equation, person: { sex, ageYears } }),
  };
  const mmrcPoint = latest(base.points, "mmrc");
  const mmrcIntake = mmrcGradeFromIntake(intake);
  const statusInput: StatusInput = {
    main: mainMeasureInput(base.series, CARDIO_MAIN_PREFERENCE, CARDIO_PROFILE_KIND),
    redFlag: vitalsRedFlagAtLatestReview(vitals, vitalsCheck, base.lastReviewAt),
  };
  const activeMinutes: CardioView["activeMinutes"] = base.diaryEntries
    ? { status: "ok", ...activeMinutesWeeklySeries(base.diaryEntries, { nowMs: reads.nowMs }) }
    : { status: "unreadable" };
  const notes: string[] = [];
  if (base.diaryFailed) notes.push(voice === "patient" ? "We couldn't read your activity diary just now." : "The diary could not be read: active minutes are missing, not zero.");
  const homeOxygenAnswer = (intake.cardio_home_oxygen ?? "").trim();
  const condition = (intake.cardio_condition ?? "").trim();
  const when = (intake.cardio_condition_date ?? "").trim();
  const standInput = { walk, vitals, effort, precautions };
  return {
    kind: CARDIO_PROFILE_KIND,
    subject: CARDIO_SUBJECT,
    series: base.series,
    graphSeries: base.graphSeries,
    points: base.points,
    tableRows: base.tableRows,
    goal: base.goal,
    views: base.views,
    computed: computeProfileStatus(statusInput),
    statusInput,
    override: base.override,
    phase: base.phase,
    phaseIsInferred: base.phaseIsInferred,
    stand: whereThingsStandView({
      written: base.careState.summary,
      authorName: reads.summaryAuthorName ?? null,
      generated: cardioStandSummary({ ...standInput, voice }),
      draft: cardioStandSummary({ ...standInput, voice: "patient" }),
    }),
    lastReviewAt: base.lastReviewAt,
    keyTiles: cardioKeyTiles({
      series: base.series,
      milestones: base.milestones,
      voice,
      vitals,
      limit,
      prediction: walk.prediction,
      activeMinutes,
      measuresFailed: base.measuresFailed,
    }),
    conditionLine: [condition, when].filter(Boolean).join(" · ") || null,
    ageLine: ageYears !== null ? `${ageYears} years` : null,
    limit,
    vitals,
    vitalsCheck,
    oxygenCheck,
    effort,
    onBetaBlocker,
    precautions,
    walk,
    mmrc: mmrcPoint ? { grade: mmrcPoint.value, source: "measurement" } : mmrcIntake !== null ? { grade: mmrcIntake, source: "intake" } : null,
    homeOxygen: {
      uses: homeOxygenAnswer === "Yes" ? true : homeOxygenAnswer === "No" ? false : null,
      prescription: homeOxygenAnswer === "Yes" ? (intake.cardio_oxygen_prescription ?? "").trim() || null : null,
    },
    activeMinutes,
    diary: base.diaryEntries
      ? {
          status: "ok",
          entries: [...base.diaryEntries].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || (a.id < b.id ? 1 : -1)),
          awaiting: entriesAwaitingConfirmation(base.diaryEntries),
        }
      : { status: "unreadable" },
    notes,
    measuresFailed: base.measuresFailed,
    goalsFailed: base.goalsFailed,
    statusFailed: base.statusFailed,
    diaryFailed: base.diaryFailed,
    intakeFailed: base.intakeFailed,
    personFailed: base.personFailed,
  };
}

// --- The PDF export ---------------------------------------------------------------------

/** The PDF's "Safety limits and vitals" section, as lines. `formatDate` is
 *  the clinic-zone formatter (formatDateTime.ts), passed in so this module
 *  stays dependency-free. */
export function cardioExportSection(
  view: CardioView,
  formatDate: (iso: string) => string
): { heading: string; lines: string[]; note: string } {
  const lines: string[] = [];
  lines.push(`Oxygen stop limit: ${view.limit.label}.`);
  lines.push(
    view.onBetaBlocker === true
      ? "Beta-blocker: yes. Exercise is paced by the talk test, not heart rate."
      : view.onBetaBlocker === false
        ? `Beta-blocker: no. ${view.effort.mode === "heart_rate" ? `Training heart rate ${view.effort.targetBpm} bpm (${view.effort.working}).` : "No exercise-test maximum on file, so paced by the talk test."}`
        : "Beta-blocker: not recorded. Paced by the talk test until it is."
  );
  const p = view.precautions;
  if (p.status === "active") lines.push(`Surgeon's precautions, until ${formatDate(p.until)}: ${p.text ?? "as the surgeon set them"}.`);
  else if (p.status === "ended") lines.push(`Surgeon's precautions ended on ${formatDate(p.until)}${p.text ? ` (${p.text})` : ""}. Check with the surgeon before lifting them.`);
  else if (p.status === "end_date_unknown") lines.push(`Surgeon's precautions: ${p.text ?? "recorded"}; end date not in a form we can read${p.rawUntil ? ` ("${p.rawUntil}")` : ""}.`);
  const v = view.vitals;
  const rest = [
    v.restingHeartRate ? `heart rate ${v.restingHeartRate.value} (${formatDate(v.restingHeartRate.measuredAt)})` : null,
    v.bloodPressureRest
      ? `blood pressure ${v.bloodPressureRest.systolic}${v.bloodPressureRest.diastolic !== null ? `/${v.bloodPressureRest.diastolic}` : ""} (${formatDate(v.bloodPressureRest.measuredAt)})`
      : null,
    v.spo2Rest ? `oxygen ${v.spo2Rest.value}% (${formatDate(v.spo2Rest.measuredAt)})` : null,
  ].filter(Boolean);
  lines.push(rest.length > 0 ? `Latest at rest: ${rest.join(", ")}.` : "No resting vitals recorded yet.");
  for (const flag of view.vitalsCheck.flags) lines.push(`Red flag: ${flag.clinicianText}`);
  if (v.spo2Lowest) {
    lines.push(`Lowest oxygen on exercise: ${v.spo2Lowest.value}% (${formatDate(v.spo2Lowest.measuredAt)}).`);
    if (view.oxygenCheck.reason) lines.push(view.oxygenCheck.reason.clinician);
  }
  if (view.mmrc) lines.push(`Breathlessness in daily life (mMRC): grade ${view.mmrc.grade} (${view.mmrc.source === "intake" ? "intake answer" : "measured"}).`);
  if (view.homeOxygen.uses === true) lines.push(`Home oxygen: yes${view.homeOxygen.prescription ? `, ${view.homeOxygen.prescription}` : ""}.`);
  else if (view.homeOxygen.uses === false) lines.push("Home oxygen: no.");
  if (view.walk.latest) {
    const first = view.walk.first && view.walk.first.measurementId !== view.walk.latest.measurementId ? `, first ${view.walk.first.value} m` : "";
    const pred = view.walk.prediction;
    const predicted =
      pred.status === "ok"
        ? ` Predicted ${pred.predictedMetres} m${pred.percent !== null ? ` (${pred.percent}%)` : ""} by ${pred.equation}.`
        : ` ${pred.text}`;
    lines.push(`Six-minute walk: ${view.walk.latest.value} m (${formatDate(view.walk.latest.measuredAt)})${first}.${predicted}`);
  }
  if (view.activeMinutes.status === "ok") {
    const done = view.activeMinutes.weeks.filter((w) => !w.inProgress && w.written);
    const last = done[done.length - 1];
    if (last) lines.push(`Active minutes, week of ${formatDate(last.weekStart)}: ${last.minutes} (goal ${view.activeMinutes.goal}, WHO; patient reported).`);
  }
  return {
    heading: "Safety limits and vitals",
    lines,
    note: "Limits and red flags are from the clinic's assessment handbook and are to be verified by a senior physiotherapist. A default limit stands only until the patient's doctor sets one.",
  };
}
