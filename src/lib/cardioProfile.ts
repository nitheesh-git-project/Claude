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
  /** After the walk or exercise (the vitals strip's second row). */
  bloodPressureAfter: (VitalReading & { systolic: number; diastolic: number | null }) | null;
  breathlessnessAfter: VitalReading | null;
  /** The latest talk-test grade (0 too easy, 1 just right, 2 too hard). */
  talkTest: VitalReading | null;
};

/** The two ends of the starting heart-rate range, as a share of the heart
 *  rate reserve ("usually starting around 40-60% and building up", the
 *  handbook). To be verified by a senior physiotherapist against its source. */
export const HEART_RATE_RANGE_PERCENT = [40, 60] as const;

export type MaxHeartRate = VitalReading & {
  /** "From an exercise test" or "estimated": said beside any target. */
  provenance: "exercise_test" | "estimated" | "not_said";
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
  /** The low end of the heart-rate range, present only when `effort` is a
   *  heart-rate target (never for a beta-blocker). */
  effortLow: EffortGuidance | null;
  maxHeartRate: MaxHeartRate | null;
  onBetaBlocker: boolean | null;
  /** Height and weight, recorded by the physiotherapist (latest wins). */
  body: { height: VitalReading | null; weight: VitalReading | null };
  /** The clinic's six-minute walk equation, as read (the guide predicts by it). */
  equation: SixMinuteWalkEquationRead;
  /** What the predicted six-minute walk is waiting for, in words, naming
   *  exactly what is missing (empty when it can be shown or is unreadable). */
  predictionNeeds: string[];
  /** The patient facts the six-minute walk guide predicts from. */
  patientFacts: { sex: "female" | "male" | null; ageYears: number | null; heightCm: number | null; weightKg: number | null };
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
function bpReading(bp: MeasurementPoint | null): (VitalReading & { systolic: number; diastolic: number | null }) | null {
  if (!bp) return null;
  const items = bp.items && !Array.isArray(bp.items) ? (bp.items as Record<string, number>) : null;
  return {
    ...reading(bp)!,
    systolic: typeof items?.systolic === "number" ? items.systolic : bp.value,
    diastolic: typeof items?.diastolic === "number" ? items.diastolic : null,
  };
}

export function latestCardioVitals(points: readonly MeasurementPoint[]): CardioVitals {
  const bp = latest(points, "blood_pressure", "rest");
  const items = bp && bp.items && !Array.isArray(bp.items) ? (bp.items as Record<string, number>) : null;
  return {
    bloodPressureAfter: bpReading(latest(points, "blood_pressure", "after_exercise")),
    breathlessnessAfter: reading(latest(points, "breathlessness_nrs", "after_test")),
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
  return vitalsRedFlagAt(vitals, check, lastReviewAt) !== null;
}

/** When the latest such flagged reading was taken, or null when none is. A
 *  status override older than this does not hide the flag. */
export function vitalsRedFlagAt(vitals: CardioVitals, check: PreExerciseCheck, lastReviewAt: string | null): string | null {
  if (check.status !== "stop" || !lastReviewAt) return null;
  const day = clinicDateKey(lastReviewAt);
  const at = {
    resting_heart_rate_high: vitals.restingHeartRate?.measuredAt,
    blood_pressure_high: vitals.bloodPressureRest?.measuredAt,
    spo2_below_limit: vitals.spo2Rest?.measuredAt,
  };
  let best: string | null = null;
  for (const f of check.flags) {
    const when = at[f.code];
    if (typeof when === "string" && clinicDateKey(when) === day && (best === null || Date.parse(when) > Date.parse(best))) best = when;
  }
  return best;
}

/** "90% (default)" / "88% (set by your doctor)": the limit on one short
 *  line, for a tile or a chip; `limit.label` is the long form. */
export function limitShort(limit: OxygenStopLimit, voice: Voice): string {
  return `${limit.percent}% (${limit.source === "doctor" ? (voice === "patient" ? "set by your doctor" : "set by the doctor") : "default"})`;
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
  /** The predicted-distance line already worded for the reader
   *  (predictionLine); the walk tile shows it when it has one. */
  predictionText?: string | null;
  activeMinutes: CardioView["activeMinutes"];
  measuresFailed: boolean;
}): KeyTile[] {
  const { series, voice, vitals, limit } = input;
  const walkLine = series.find((s) => s.measureKey === "six_minute_walk" && s.points.length > 0);
  const walk: KeyTile = walkLine
    ? (() => {
        const t = keyTile(walkLine, input.milestones, CARDIO_PROFILE_KIND, voice, series);
        const p = input.prediction;
        const extra =
          p.status === "ok" ? (p.percent !== null ? `${p.percent}% of predicted` : null) : input.predictionText !== undefined ? input.predictionText : p.text;
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
          goalText: `${voice === "patient" ? "Your stop limit" : "Stop limit"}: ${limitShort(limit, voice)}`,
        }
      : input.measuresFailed
        ? placeholderTile("oxygen", "Oxygen", COULDNT_LOAD, "Unavailable")
        : { ...placeholderTile("oxygen", "Oxygen", "Not measured yet"), goalText: `${voice === "patient" ? "Your stop limit" : "Stop limit"}: ${limitShort(limit, voice)}` };
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

/**
 * What the six-minute walk's "% of predicted" is waiting for, exactly: the
 * clinic's formula, the patient's sex, age, height and weight. Empty when
 * nothing is missing, and also when a read failed (the screen then says "we
 * couldn't check", which is not "needs").
 */
export function predictionNeedsList(input: {
  equation: SixMinuteWalkEquationRead;
  sex: unknown;
  ageYears: number | null;
  heightKnown: boolean;
  weightKnown: boolean;
  measuresFailed: boolean;
  personFailed: boolean;
}): string[] {
  if (input.equation.status !== "ok" || input.measuresFailed || input.personFailed) return [];
  const out: string[] = [];
  if (!input.equation.chosen) out.push("the clinic's formula");
  if (!input.sex) out.push("sex");
  if (input.ageYears === null) out.push("age");
  if (!input.heightKnown) out.push("height");
  if (!input.weightKnown) out.push("weight");
  return out;
}

/** The predicted-distance line a screen shows under the walk, in the
 *  reader's words: the percentage and its equation, "we couldn't check", or
 *  "needs ..." naming exactly what is missing. Null when there is no walk. */
export function predictionLine(view: Pick<CardioView, "walk" | "predictionNeeds" | "measuresFailed" | "personFailed">, voice: Voice): string | null {
  if (!view.walk.latest) return null;
  const p = view.walk.prediction;
  if (p.status === "ok") return p.percent !== null ? `${p.percent}% of the distance expected (${p.equation}), ${p.predictedMetres} m` : null;
  if (p.status === "unreadable") return "We couldn't check which formula the clinic uses, so no expected distance is shown. It is not missing.";
  if (view.measuresFailed || view.personFailed) {
    return "We couldn't read the height, weight or age just now, so no expected distance is shown. It is not missing.";
  }
  if (view.predictionNeeds.length > 0) {
    return voice === "patient"
      ? `The expected distance for someone like you needs ${view.predictionNeeds.join(", ")}.`
      : `Predicted distance needs ${view.predictionNeeds.join(", ")}.`;
  }
  return p.text;
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
  const height = reading(latest(base.points, "height_cm"));
  const weight = reading(latest(base.points, "weight_kg"));
  const maxPoint = latest(base.points, "max_hr_bpm");
  const maxHeartRate: MaxHeartRate | null = maxPoint
    ? {
        ...reading(maxPoint)!,
        provenance: maxPoint.variant === "exercise_test" ? "exercise_test" : maxPoint.variant === "estimated" ? "estimated" : "not_said",
      }
    : null;
  const effortInput = { onBetaBlocker, restingBpm: vitals.restingHeartRate?.value ?? null, maximumBpm: maxHeartRate?.value ?? null };
  const effort = effortGuidance({ ...effortInput, intensityPercent: HEART_RATE_RANGE_PERCENT[1] });
  const effortLow = effort.mode === "heart_rate" ? effortGuidance({ ...effortInput, intensityPercent: HEART_RATE_RANGE_PERCENT[0] }) : null;
  const precautions = sternalPrecautions(intake, reads.todayIso);
  const latestWalk = reading(latest(base.points, "six_minute_walk"));
  const walk = {
    first: reading(earliest(base.points, "six_minute_walk")),
    latest: latestWalk,
    // Height and weight are not on the record yet, so the prediction says it
    // needs them once the clinic has chosen an equation.
    prediction: sixMinuteWalkPrediction({
      walkedMetres: latestWalk?.value ?? null,
      equation: reads.equation,
      person: { sex, ageYears, heightCm: height?.value ?? null, weightKg: weight?.value ?? null },
    }),
  };
  const predictionNeeds = predictionNeedsList({
    equation: reads.equation,
    sex,
    ageYears,
    heightKnown: !!height,
    weightKnown: !!weight,
    measuresFailed: base.measuresFailed,
    personFailed: base.personFailed,
  });
  const mmrcPoint = latest(base.points, "mmrc");
  const mmrcIntake = mmrcGradeFromIntake(intake);
  const statusInput: StatusInput = {
    main: mainMeasureInput(base.series, CARDIO_MAIN_PREFERENCE, CARDIO_PROFILE_KIND),
    redFlag: vitalsRedFlagAtLatestReview(vitals, vitalsCheck, base.lastReviewAt),
    redFlagAt: vitalsRedFlagAt(vitals, vitalsCheck, base.lastReviewAt),
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
      predictionText: predictionLine({ walk, predictionNeeds, measuresFailed: base.measuresFailed, personFailed: base.personFailed }, voice),
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
    effortLow,
    maxHeartRate,
    onBetaBlocker,
    body: { height, weight },
    equation: reads.equation,
    predictionNeeds,
    patientFacts: { sex, ageYears, heightCm: height?.value ?? null, weightKg: weight?.value ?? null },
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

/** "Aim for 95 to 108 beats a minute (from an exercise test, 172 at most)",
 *  or null when there is no heart-rate target (beta-blocker, no maximum). */
export function heartRateTargetText(view: Pick<CardioView, "effort" | "effortLow" | "maxHeartRate">): string | null {
  if (view.effort.mode !== "heart_rate") return null;
  const hi = view.effort.targetBpm;
  const lo = view.effortLow && view.effortLow.mode === "heart_rate" ? view.effortLow.targetBpm : null;
  const max = view.maxHeartRate;
  const from = max ? (max.provenance === "exercise_test" ? "from an exercise test" : max.provenance === "estimated" ? "estimated" : "maximum recorded") : "";
  return `Aim for ${lo !== null && lo !== hi ? `${lo} to ${hi}` : hi} beats a minute${max ? ` (${from}, ${max.value} at most)` : ""}.`;
}

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
        ? `Beta-blocker: no. ${heartRateTargetText(view) ?? "No exercise-test maximum on file, so paced by the talk test."}`
        : "Beta-blocker: not recorded. Paced by the talk test until it is."
  );
  if (view.body.height || view.body.weight) {
    lines.push(
      `Height and weight: ${[view.body.height ? `${view.body.height.value} cm` : "height not recorded", view.body.weight ? `${view.body.weight.value} kg` : "weight not recorded"].join(", ")}.`
    );
  }
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
        : ` ${predictionLine(view, "clinician") ?? pred.text}`;
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
