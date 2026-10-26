// What the "Record a test" dialog offers and sends, as functions.
//
// The dialog (src/components/profile/progress/RecordTestDialog.tsx) renders
// from the registry (outcomeMeasures.ts) and the server re-checks every byte
// with validateMeasurement(); this file is the part between them that is
// logic rather than layout - which measures can be chosen and why one cannot,
// which condition boxes a measure needs, how a form's text becomes the
// conditions the route will accept, and which timer fits which test - so it
// is tested without a browser.

import { extensionLag } from "@/lib/clinicalCalculators";
import { clinicDateKey } from "@/lib/clinicWeek";
import {
  measurementSource,
  measuresForProfileKind,
  isMeasureEnabled,
  needsMedicationState,
  trialsRequired,
  type MeasurementConditions,
  type OutcomeMeasure,
  type ProfileKind,
} from "@/lib/outcomeMeasures";
import type { MeasureSeries } from "@/lib/outcomeSeries";
import {
  averageOfTrials,
  limbSymmetryIndex,
  roundTo,
  scoreSheetTotal,
} from "@/lib/clinicalCalculators";
import { summariseTrials, type TrialKeep } from "@/lib/testTimers";

// --- Which measures can be picked --------------------------------------------------------

export type MeasureChoice = {
  measure: OutcomeMeasure;
  selectable: boolean;
  /** Why it cannot be picked, in words for the option's label. */
  reason: string | null;
};

/**
 * The measures this kind of patient is recorded with in
 * outcome_measurements. A measure the Pain Map or the neurological exam owns
 * for this kind is not offered at all (validateMeasurement would refuse it:
 * two sources for one line is a change that is only a change of table). A
 * licensed scale the clinic has not switched on is listed but cannot be
 * chosen, with the reason - "an option silently missing reads as data lost".
 * When the switch could not be read, a licensed scale says exactly that: we
 * could not check, which is not "it is off".
 */
export function recordableMeasures(
  kind: ProfileKind,
  opts: { enabledLicensed: ReadonlySet<string>; licenceUnreadable?: boolean }
): MeasureChoice[] {
  const out: MeasureChoice[] = [];
  for (const measure of measuresForProfileKind(kind)) {
    if (measurementSource(measure.key, kind) !== "outcome_measurements") continue;
    if (isMeasureEnabled(measure.key, opts.enabledLicensed)) {
      out.push({ measure, selectable: true, reason: null });
    } else if (opts.licenceUnreadable) {
      out.push({ measure, selectable: false, reason: "we couldn't check whether the clinic has switched this on" });
    } else {
      out.push({ measure, selectable: false, reason: "off until the clinic confirms its licence" });
    }
  }
  return out;
}

/** "Pain is recorded on the Pain Map; Berg balance... in the neurological
 *  examination." null when nothing for this kind lives elsewhere. */
export function ownedElsewhereNote(kind: ProfileKind): string | null {
  const painMap: string[] = [];
  const exam: string[] = [];
  const pedsExam: string[] = [];
  for (const m of measuresForProfileKind(kind)) {
    const source = measurementSource(m.key, kind);
    if (source === "pain_map") painMap.push(m.label);
    else if (source === "neuro_exam") exam.push(m.label);
    else if (source === "peds_exam") pedsExam.push(m.label);
  }
  const parts: string[] = [];
  if (painMap.length) parts.push(`${painMap.join(", ")} is recorded on the Pain Map`);
  if (exam.length) parts.push(`${exam.join(", ")} ${exam.length === 1 ? "is" : "are"} recorded in the neurological examination`);
  if (pedsExam.length) {
    parts.push(`${pedsExam.join(", ")} ${pedsExam.length === 1 ? "is" : "are"} recorded in the paediatric examination`);
  }
  return parts.length ? `${parts.join("; ")}.` : null;
}

// --- Conditions --------------------------------------------------------------------------------

export type ConditionFields = {
  /** Video is not allowed for this test. */
  videoRefused: boolean;
  /** Over video a helper must be standing beside the patient. */
  helperOverVideo: boolean;
  /** Over video the reading is marked as measured at home. */
  homeOverVideo: boolean;
  /** Over video the reading is an estimate (labelled on the graph). */
  estimateOverVideo: boolean;
  /** Over video a parent does it with the child. */
  parentOverVideo: boolean;
  walkingAid: boolean;
  footwear: boolean;
  medication: boolean;
  painBefore: boolean;
  oxygen: boolean;
  /** Seen in the session, or reported by the patient or family. */
  method: boolean;
};

const MOBILITY_KEYS: ReadonlySet<string> = new Set([
  "tug",
  "ten_metre_walk",
  "gait_speed_4m",
  "five_sit_to_stand",
  "chair_stand_30s",
  "one_minute_sit_to_stand",
  "four_stage_balance",
  "six_minute_walk",
  "peds_standing_seconds",
  "peds_independent_steps",
  "mini_bestest",
  "fac",
]);

const EXERTION_KEYS: ReadonlySet<string> = new Set(["six_minute_walk", "one_minute_sit_to_stand", "lowest_spo2", "breathlessness_nrs"]);

export function conditionFieldsFor(m: OutcomeMeasure, kind: ProfileKind): ConditionFields {
  const mobility = MOBILITY_KEYS.has(m.key);
  return {
    videoRefused: m.videoUse === "no",
    helperOverVideo: m.videoUse === "with_helper",
    homeOverVideo: m.videoUse === "home_measured" || m.videoUse === "home_device",
    estimateOverVideo: m.videoUse === "estimate",
    parentOverVideo: m.videoUse === "with_parent",
    walkingAid: mobility,
    footwear: mobility,
    medication: needsMedicationState(m.key, kind) || (kind === "neuro_parkinsons" && m.medicationStateRequired === true),
    painBefore: m.key === "six_minute_walk" || m.key === "tug" || m.key === "ten_metre_walk",
    oxygen: EXERTION_KEYS.has(m.key),
    method: m.capture === "diary" || m.capture === "rating" || m.key === "who_motor_milestone",
  };
}

export type ConditionDraft = {
  setting: "" | "in_person" | "video";
  walkingAid: string;
  footwear: string;
  testerName: string;
  medicationState: "" | "on" | "off";
  /** HH:MM, the clinic's clock, today (or yesterday if that is later than now). */
  lastDoseTime: string;
  helperPresent: boolean;
  homeMeasured: boolean;
  method: "" | "observed" | "reported";
  /** Joint range only: the value came from "Measure from an image". */
  estimatedFromImage: boolean;
  painBefore: string;
  oxygenLpm: string;
};

export const EMPTY_CONDITION_DRAFT: ConditionDraft = {
  setting: "",
  walkingAid: "",
  footwear: "",
  testerName: "",
  medicationState: "",
  lastDoseTime: "",
  helperPresent: false,
  homeMeasured: false,
  method: "",
  estimatedFromImage: false,
  painBefore: "",
  oxygenLpm: "",
};

const CLINIC_UTC_OFFSET = "+05:30";

/**
 * "08:30" -> the ISO instant of the last dose: that time on the clinic's
 * clock today, or on the day before if that would be after `nowMs` (a dose is
 * never in the future). The clinic is on India Standard Time all year, a fixed
 * +05:30. null for text that is not a time.
 */
export function doseTimeToIso(time: string, nowMs: number): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match || !Number.isFinite(nowMs)) return null;
  const at = (dayKey: string) => Date.parse(`${dayKey}T${match[1]}:${match[2]}:00${CLINIC_UTC_OFFSET}`);
  let ms = at(clinicDateKey(nowMs));
  if (ms > nowMs) ms = at(clinicDateKey(nowMs - 86_400_000));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** A conditions object holding only what this measure asks for: hidden
 *  fields are dropped (a walking aid typed and then a different test picked
 *  must not travel), blanks are left out, and the route's own validation has
 *  the last word. */
export function buildConditions(
  m: OutcomeMeasure,
  kind: ProfileKind,
  draft: ConditionDraft,
  nowMs: number,
  /** The chair stand's "used arms" tick, from the timer (Entry.usedArms). */
  usedArms?: boolean
): MeasurementConditions {
  const fields = conditionFieldsFor(m, kind);
  const out: MeasurementConditions = { setting: draft.setting === "video" ? "video" : "in_person" };
  const text = (s: string) => s.trim();
  if (fields.walkingAid && text(draft.walkingAid)) out.walkingAid = text(draft.walkingAid);
  if (fields.footwear && text(draft.footwear)) out.footwear = text(draft.footwear);
  if (text(draft.testerName)) out.testerName = text(draft.testerName);
  if (fields.medication) {
    if (draft.medicationState) out.medicationState = draft.medicationState;
    const dose = doseTimeToIso(draft.lastDoseTime, nowMs);
    if (dose) out.lastDoseAt = dose;
  }
  if (out.setting === "video") {
    if (fields.helperOverVideo) out.helperPresent = draft.helperPresent;
    if (fields.homeOverVideo) out.homeMeasured = draft.homeMeasured;
    if (fields.estimateOverVideo && draft.estimatedFromImage) out.estimatedFromImage = true;
  }
  if (fields.method && draft.method) out.method = draft.method;
  if (fields.painBefore && draft.painBefore.trim() !== "") out.painBefore = Number(draft.painBefore);
  if (fields.oxygen && draft.oxygenLpm.trim() !== "") out.supplementalOxygenLpm = Number(draft.oxygenLpm);
  if (m.usedArmsScoresZero && usedArms !== undefined) out.usedArms = usedArms;
  return out;
}

// --- The previous reading ------------------------------------------------------------------------

export type LineSelection = {
  measureKey: string;
  variant: string | null;
  side: "left" | "right" | null;
  medicationState: "on" | "off" | null;
};

/** The latest reading of exactly the line being recorded (same measure,
 *  variant, side and - for Parkinson's - ON/OFF state), to show beside the
 *  new one. A right-knee reading is never compared with the left. */
export function previousReading(
  series: readonly MeasureSeries[],
  sel: LineSelection
): { value: number; measuredAt: string; decimals: number; unit: string } | null {
  const line = series.find(
    (s) =>
      s.measureKey === sel.measureKey &&
      (s.variant ?? null) === (sel.variant ?? null) &&
      (s.side ?? null) === (sel.side ?? null) &&
      (s.medicationState ?? null) === (sel.medicationState ?? null)
  );
  const last = line?.points[line.points.length - 1];
  return line && last ? { value: last.value, measuredAt: last.measuredAt, decimals: line.decimals, unit: line.unit } : null;
}

/** The other side's latest reading of the same measure and variant, shown beside the entry for a sided
 *  test: the patient's own other side is the best normal for a joint. Null until a side is chosen
 *  (or when the test is not sided), and null when the other side has never been recorded. */
export function otherSideReading(
  series: readonly MeasureSeries[],
  sel: LineSelection
): { side: "left" | "right"; value: number; measuredAt: string; decimals: number; unit: string } | null {
  if (!sel.side) return null;
  const side = sel.side === "left" ? "right" : "left";
  const found = previousReading(series, { ...sel, side });
  return found ? { side, ...found } : null;
}

/**
 * While a straightening reading is being typed: the extension lag it makes
 * with the latest reading of its partner line on the same side (active
 * against passive; extensionLag in clinicalCalculators). Null unless the
 * entry is one of the two knee-straightening variants, a side is chosen, a
 * value is typed and the partner line has a reading.
 */
export function pendingExtensionLag(
  series: readonly MeasureSeries[],
  sel: { measureKey: string; variant: string | null; side: "left" | "right" | null },
  typed: number | null
): { lag: number; partner: "active" | "passive"; partnerValue: number; working: string } | null {
  if (sel.measureKey !== "joint_range" || !sel.side || typed === null || !Number.isFinite(typed)) return null;
  const isActive = sel.variant === "knee_extension_active";
  if (!isActive && sel.variant !== "knee_extension_passive") return null;
  const partner = previousReading(series, {
    measureKey: "joint_range",
    variant: isActive ? "knee_extension_passive" : "knee_extension_active",
    side: sel.side,
    medicationState: null,
  });
  if (!partner) return null;
  const result = extensionLag(isActive ? partner.value : typed, isActive ? typed : partner.value);
  if (!result.ok) return null;
  return {
    lag: result.value,
    partner: isActive ? "passive" : "active",
    partnerValue: partner.value,
    working: result.working,
  };
}

// --- Which tool a test gets --------------------------------------------------------------------------

export type TimerKind =
  | { kind: "tap"; count: number; maxTrials: number; keep: TrialKeep; practice: number; distanceMetres?: number }
  | {
      kind: "countdown";
      seconds: number;
      max: number;
      title: string;
      description: string;
      /** Offer the "used arms" tick (the CDC chair-stand rule). */
      armsRule: boolean;
    }
  | { kind: "balance" }
  | { kind: "six_minute_walk" };

const TAP_DISTANCE: Record<string, number | undefined> = { ten_metre_walk: 10, gait_speed_4m: 4 };
const TAP_KEYS: ReadonlySet<string> = new Set(["tug", "ten_metre_walk", "gait_speed_4m", "five_sit_to_stand", "peds_standing_seconds"]);

/** The embedded timer for a test, or null where there is none (a score
 *  sheet, a rating, a hand-held reading). */
export function timerFor(m: OutcomeMeasure): TimerKind | null {
  if (TAP_KEYS.has(m.key) && m.trials) {
    return {
      kind: "tap",
      count: m.trials.count,
      maxTrials: m.trials.keep === "median" ? m.trials.count + 1 : m.trials.count,
      keep: m.trials.keep,
      practice: m.trials.practice ?? 0,
      distanceMetres: TAP_DISTANCE[m.key],
    };
  }
  if (m.key === "chair_stand_30s") {
    return {
      kind: "countdown",
      seconds: 30,
      max: m.max,
      title: "30-second chair stand",
      armsRule: m.usedArmsScoresZero === true,
      description:
        "Chair without arms, seat about 43 cm, against a wall. Feet flat, arms crossed on the chest. Say “Go” and count each full stand. If they are more than halfway up when time ends, count it.",
    };
  }
  if (m.key === "one_minute_sit_to_stand") {
    return {
      kind: "countdown",
      seconds: 60,
      max: m.max,
      title: "1-minute sit-to-stand",
      armsRule: false,
      description:
        "Standard chair, arms crossed on the chest. Say “Go” and count how many full stands they can do in one minute. They may rest, and the clock keeps running.",
    };
  }
  if (m.key === "four_stage_balance") return { kind: "balance" };
  if (m.key === "six_minute_walk") return { kind: "six_minute_walk" };
  return null;
}

/** Whether the record insists on every trial for this test and patient, so
 *  the dialog must not offer typing in just the result. */
export function mustUseTrials(m: OutcomeMeasure, kind: ProfileKind): boolean {
  return trialsRequired(m.key, kind);
}

// --- Numbers typed into boxes ---------------------------------------------------------------------------

/** A number box's text: undefined when blank, NaN when it is not a number
 *  (so the validator can say what was wrong rather than treating it as
 *  blank). */
export function parseNumberText(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  return Number(trimmed);
}

// --- The number a form produces ---------------------------------------------------------------------------

export type EditorState = {
  /** The typed result, for a single reading or when a timer is bypassed. */
  numberText: string;
  /** A rating or grade chosen by tapping. */
  choice: number | null;
  /** Score-sheet answers, null = blank. */
  answers: (number | null)[];
  /** Hand-entered trials. */
  trialTexts: string[];
  /** Strength: three pushes each side. */
  injuredTexts: string[];
  healthyTexts: string[];
  /** Blood pressure readings by key (orthostatic, or a seated pair). */
  readingTexts: Record<string, string>;
  /** What an embedded timer produced. `usedArms` is the chair stand's
   *  tick (the score is then 0 and `items` holds the stands with arms). */
  timer: { value: number; items: number[] | Record<string, number> | null; usedArms?: boolean } | null;
};

export function emptyEditorState(m: OutcomeMeasure | null): EditorState {
  return {
    numberText: "",
    choice: null,
    answers: m?.scoreSheet ? Array.from({ length: m.scoreSheet.itemCount }, () => null) : [],
    trialTexts: [],
    injuredTexts: ["", "", ""],
    healthyTexts: ["", "", ""],
    readingTexts: {},
    timer: null,
  };
}

export type Entry = {
  value: number | null;
  items: (number | null)[] | Record<string, number> | null;
  /** Something wrong with what is typed, in a sentence; null when fine or
   *  merely unfinished. */
  problem: string | null;
  /** The working, for the line under the result (a symmetry index, a total). */
  working: string | null;
  /** The chair stand's "used arms" tick, when the timer recorded one. */
  usedArms?: boolean;
};

const NOTHING: Entry = { value: null, items: null, problem: null, working: null };

function numbers(texts: readonly string[]): { values: number[]; bad: boolean } {
  const values: number[] = [];
  let bad = false;
  for (const text of texts) {
    const n = parseNumberText(text);
    if (n === undefined) continue;
    if (!Number.isFinite(n)) bad = true;
    else values.push(n);
  }
  return { values, bad };
}

/**
 * The value and `items` a form's state adds up to for a measure - the same
 * arithmetic the route re-derives with validateMeasurement, so what the screen
 * shows is what will be checked. `useTimer` false means the result is typed
 * (for a test that has a timer but where the clinician timed it elsewhere),
 * which is refused where the record needs every trial.
 */
export function computeEntry(m: OutcomeMeasure, st: EditorState, useTimer: boolean): Entry {
  if (m.scoreSheet) {
    if (st.answers.every((a) => a === null)) return NOTHING;
    const total = scoreSheetTotal(m.scoreSheet, st.answers);
    if (!total.ok) return { ...NOTHING, items: st.answers, problem: total.error };
    const value = roundTo(total.total, m.decimals);
    return {
      value,
      items: st.answers,
      problem: null,
      working: total.complete ? null : `${total.blanks} left blank (${m.scoreSheet.maxBlanks} allowed). The total is worked out from the answered items.`,
    };
  }

  if (m.readings && m.checklist) {
    // A yes/no checklist (the home safety check): every item is answered, 1
    // for done and 0 for not yet, so an unticked item is a statement and
    // not a blank.
    const readings: Record<string, number> = {};
    let answered = 0;
    for (const key of m.readings.keys) {
      const text = (st.readingTexts[key] ?? "").trim();
      if (text === "1" || text === "0") {
        readings[key] = Number(text);
        answered += 1;
      }
    }
    if (answered === 0) return NOTHING;
    if (answered < m.readings.keys.length) {
      const left = m.readings.keys.length - answered;
      return { ...NOTHING, items: readings, problem: `Answer every item: ${left} ${left === 1 ? "is" : "are"} left.` };
    }
    const derived = m.readings.derive(readings);
    if (derived === null) return { ...NOTHING, items: readings, problem: "These answers do not give a result." };
    return { value: roundTo(derived, m.decimals), items: readings, problem: null, working: `${derived} of ${m.readings.keys.length} done` };
  }

  if (m.readings) {
    const readings: Record<string, number> = {};
    for (const key of m.readings.keys) {
      const n = parseNumberText(st.readingTexts[key] ?? "");
      if (n === undefined) continue;
      if (!Number.isFinite(n)) return { ...NOTHING, problem: "Every reading must be a number." };
      readings[key] = n;
    }
    if (Object.keys(readings).length === 0) return NOTHING;
    const derived = m.readings.derive(readings);
    if (derived === null) {
      const problem = m.readings.keys.includes("lying_systolic")
        ? "Enter the lying reading and at least one standing reading (top number above the bottom)."
        : "Enter both numbers, the top one above the bottom one.";
      return { ...NOTHING, items: readings, problem };
    }
    const value = roundTo(derived, m.decimals);
    return { value, items: readings, problem: null, working: null };
  }

  if (m.key === "strength_symmetry") {
    const injured = numbers(st.injuredTexts);
    const healthy = numbers(st.healthyTexts);
    if (injured.bad || healthy.bad) return { ...NOTHING, problem: "Each push must be a number." };
    if (injured.values.length === 0 || healthy.values.length === 0) return NOTHING;
    const lsi = limbSymmetryIndex(averageOfTrials(injured.values)!, averageOfTrials(healthy.values)!);
    if (!lsi.ok) return { ...NOTHING, problem: lsi.error };
    return { value: roundTo(lsi.value, m.decimals), items: null, problem: null, working: lsi.working };
  }

  const timed = timerFor(m);
  if (timed && useTimer) {
    if (!st.timer) return NOTHING;
    return {
      value: st.timer.value,
      items: st.timer.items,
      problem: null,
      working: null,
      ...(m.usedArmsScoresZero && st.timer.usedArms !== undefined ? { usedArms: st.timer.usedArms } : {}),
    };
  }

  if (m.capture === "trials" && m.trials && (!timed || !useTimer) && st.trialTexts.some((t) => t.trim() !== "")) {
    const { values, bad } = numbers(st.trialTexts);
    if (bad) return { ...NOTHING, problem: "Each reading must be a number." };
    const better = m.better;
    const summary = summariseTrials(values, { keep: m.trials.keep }, better, m.decimals);
    if (summary.kept === null) return { ...NOTHING, problem: "These readings do not give a result." };
    return { value: summary.kept, items: values.map((v) => roundTo(v, m.decimals)), problem: null, working: null };
  }

  if (m.grades || m.capture === "rating") {
    return st.choice === null ? NOTHING : { value: st.choice, items: null, problem: null, working: null };
  }

  const n = parseNumberText(st.numberText);
  if (n === undefined) return NOTHING;
  if (!Number.isFinite(n)) return { ...NOTHING, problem: "Enter a number." };
  return { value: n, items: null, problem: null, working: null };
}
