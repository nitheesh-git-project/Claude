import { clinicDateKey } from "@/lib/clinicWeek";
import { HOME_SAFETY_ITEMS } from "@/lib/outcomeMeasures";
import { entriesAwaitingConfirmation, type DiaryEntry } from "@/lib/patientDiary";
import { fallsInWindow, newConfirmedFall, type FallsWindow } from "@/lib/neuroProfile";
import {
  ageInYears,
  geriatricFallRisk,
  latestKatz,
  orthostaticFlag,
  sexForNorms,
  type GeriatricFallRisk,
  type KatzView,
  type OrthostaticFlag,
} from "@/lib/geriatricRisk";
import { computeProfileStatus, type StatusInput, type StatusResult } from "@/lib/profileStatus";
import { keyTile, readingText, type KeyTile, type Voice } from "@/lib/progressView";
import { whereThingsStandView, type WhereThingsStandView } from "@/lib/whereThingsStand";
import type { ProfileSubject } from "@/lib/childVoice";
import type { ActiveOverride } from "@/lib/careStatus";
import type { CareGoal, MilestoneView } from "@/lib/careGoals";
import type { MeasureSeries, MeasureTableRow, MeasurementPoint } from "@/lib/outcomeSeries";
import {
  answerFirstGivenAt,
  mainMeasureInput,
  shapeMeasuredBase,
  type MeasuredProfileReads,
} from "@/lib/progressProfileBase";

// Everything the Strength and balance care Health Profile draws (Health
// Profile redesign, phase 6a ships the data; phase 6b draws it), shaped once
// so the patient's page, the therapist's chart and the admin's detail show
// the same figures. Plain data in, plain data out.
//
// What it decides:
//  - "Fall risk today" is the STEADI level WITH the rule that decided it
//    (geriatricRisk.ts) -- high for two falls or one injurious fall in 12
//    months whatever the tests show -- and "Tests in the safer range: n of
//    4" is a separate line, never folded into the level.
//  - The status pill follows the neurological rule for falls: a fall a
//    physiotherapist CONFIRMED (or a clinician entered) since the last
//    review is "Needs attention"; an unconfirmed patient report is shown as
//    patient reported and moves nothing. The main measure is walking speed,
//    then the Timed Up and Go, the chair stand and the balance stage.
//  - The record speaks to the patient ("self"); a carer named on the intake
//    gets a header line, not a voice of their own (childVoice.ts).
//  - No examination layer and no exam before Done (sessionCompletion.ts).

export const GERIATRIC_PROFILE_KIND = "geriatric" as const;
export const GERIATRIC_SUBJECT: ProfileSubject = "self";

/** The status rule's main-measure preference, most telling first. */
export const GERIATRIC_MAIN_PREFERENCE = ["gait_speed_4m", "tug", "chair_stand_30s", "four_stage_balance"] as const;

export type GeriatricReads = MeasuredProfileReads;

/** "Start the falls check": the four STEADI tests in the order the clinic
 *  runs them, each with the timer its own test gets in Record a test. */
export const FALLS_CHECK_STEPS: readonly { measureKey: string; title: string }[] = [
  { measureKey: "tug", title: "Timed Up and Go" },
  { measureKey: "chair_stand_30s", title: "30-second chair stand" },
  { measureKey: "four_stage_balance", title: "4-stage balance" },
  { measureKey: "gait_speed_4m", title: "4-metre walking speed" },
];

export type HomeSafetyItemView = { key: string; label: string; done: boolean; newlyDone: boolean };

/** The home safety check: the latest snapshot (n of N done, and which), with
 *  the one before it for "was 3 of 6". */
export type HomeSafetyView =
  | { status: "not_recorded" }
  | {
      status: "recorded";
      done: number;
      total: number;
      measuredAt: string;
      items: HomeSafetyItemView[];
      previous: { done: number; total: number; measuredAt: string } | null;
    };

function doneKeys(items: unknown): Set<string> | null {
  if (!items || typeof items !== "object" || Array.isArray(items)) return null;
  const r = items as Record<string, unknown>;
  return new Set(HOME_SAFETY_ITEMS.filter((i) => r[i.key] === 1).map((i) => i.key));
}

export function homeSafetyView(points: readonly MeasurementPoint[]): HomeSafetyView {
  const checks = points
    .filter((p) => p.measureKey === "home_safety_check")
    .sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt) || (a.id < b.id ? 1 : -1));
  const latest = checks[0];
  if (!latest) return { status: "not_recorded" };
  const total = HOME_SAFETY_ITEMS.length;
  const now = doneKeys(latest.items);
  const before = checks[1] ?? null;
  const was = before ? doneKeys(before.items) : null;
  return {
    status: "recorded",
    done: now ? now.size : latest.value,
    total,
    measuredAt: latest.measuredAt,
    items: HOME_SAFETY_ITEMS.map((i) => ({
      key: i.key,
      label: i.label,
      done: now ? now.has(i.key) : false,
      newlyDone: !!now && !!was && now.has(i.key) && !was.has(i.key),
    })),
    previous: before ? { done: was ? was.size : before.value, total, measuredAt: before.measuredAt } : null,
  };
}

export type GeriatricDiaryView =
  | { status: "ok"; entries: DiaryEntry[]; falls: FallsWindow; awaiting: DiaryEntry[] }
  | { status: "unreadable" };

export type GeriatricView = {
  kind: typeof GERIATRIC_PROFILE_KIND;
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
  /** The four tiles: fall risk, tests in the safer range, daily living,
   *  walking speed. */
  keyTiles: KeyTile[];
  conditionLine: string | null;
  /** "79 years", or null with no date of birth on file. */
  ageLine: string | null;
  /** What the chair-stand norm is judged by (null when not on file). */
  person: { ageYears: number | null; sex: "female" | "male" | null };
  /** "Ramesh, your son, helps at home" -- the optional carer pre-step. */
  carerLine: string | null;
  fallRisk: GeriatricFallRisk;
  /** The dial's words for the reader: "High because of 3 falls in the last
   *  12 months". */
  fallRiskText: string;
  katz: KatzView | null;
  orthostatic: OrthostaticFlag;
  homeSafety: HomeSafetyView;
  walkingAid: string | null;
  diary: GeriatricDiaryView;
  /** Lines saying a read behind the status could not be made. */
  notes: string[];
  measuresFailed: boolean;
  goalsFailed: boolean;
  statusFailed: boolean;
  diaryFailed: boolean;
  intakeFailed: boolean;
  personFailed: boolean;
};

const COULDNT_LOAD = "We couldn't load this just now. It is not missing.";

function placeholderTile(key: string, label: string, deltaText: string, valueText = "Not yet"): KeyTile {
  return { key, label, fullLabel: label, valueText, sparkPath: null, deltaText, deltaTone: "neutral", goalText: null };
}

const LEVEL_WORD = { low: "Low", moderate: "Moderate", high: "High" } as const;

/** The dial's sentence: the level and the rule, in the reader's words. */
export function fallRiskSentence(risk: GeriatricFallRisk, voice: Voice): string {
  if (risk.level === null) {
    return voice === "patient"
      ? "Not known yet: your physiotherapist does four short tests of balance, strength and walking to work it out."
      : risk.rule;
  }
  if (risk.decidedBy === "fall_history") {
    const why = risk.injuriousFallInPastYear
      ? "a fall with an injury in the last 12 months"
      : `${risk.fallsInPastYear} falls in the last 12 months`;
    return voice === "patient"
      ? `High because of ${why}. It stays high until those falls are more than a year old, however well the tests go.`
      : `High because of ${why} (STEADI: whatever the tests show, until the falls are over a year old).`;
  }
  if (risk.decidedBy === "screen_negative") {
    return voice === "patient" ? "Low: no falls, not unsteady and not worried about falling." : risk.rule;
  }
  return voice === "patient" ? `${LEVEL_WORD[risk.level]}, from your balance, strength and walking tests.` : risk.rule;
}

/** The same sentence cut to its first clause, for a tile ("High because of 3
 *  falls in the last 12 months"): the dial carries the rest. */
export function fallRiskShort(risk: GeriatricFallRisk, voice: Voice): string {
  return fallRiskSentence(risk, voice).split(/\.\s|\s\(STEADI/)[0].replace(/\.$/, "");
}

/** "Ramesh, your son, helps at home" (patient) / "Her son, Ramesh, helps at
 *  home" (clinician). A relationship written from the patient's side ("My
 *  son") loses the "my"; with no name there is no line. */
export function geriatricCarerLine(
  intake: Readonly<Record<string, string | undefined>>,
  voice: Voice,
  gender?: string | null
): string | null {
  const name = (intake.geri_carer_name ?? "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  const relationship = (intake.geri_carer_relationship ?? "").replace(/\s+/g, " ").trim().replace(/^(my|her|his|their)\s+/i, "");
  if (!relationship) return `${name} helps at home`;
  const rel = relationship.toLowerCase();
  if (voice === "patient") return `${name}, your ${rel}, helps at home`;
  const g = (gender ?? "").trim().toLowerCase();
  const pronoun = g === "female" ? "Her" : g === "male" ? "His" : "Their";
  return `${pronoun} ${rel}, ${name}, helps at home`;
}

function lineTile(series: readonly MeasureSeries[], key: string, label: string, voice: Voice, failed: boolean, milestones: GeriatricViewMilestones): KeyTile {
  const line = series.find((s) => s.measureKey === key && s.points.length > 0);
  if (!line) return failed ? placeholderTile(key, label, COULDNT_LOAD, "Unavailable") : placeholderTile(key, label, "Not measured yet");
  return { ...keyTile(line, milestones, GERIATRIC_PROFILE_KIND, voice, series), label };
}

type GeriatricViewMilestones = Parameters<typeof keyTile>[1];

export function geriatricKeyTiles(input: {
  risk: GeriatricFallRisk;
  katz: KatzView | null;
  series: readonly MeasureSeries[];
  milestones: GeriatricViewMilestones;
  voice: Voice;
  measuresFailed: boolean;
}): KeyTile[] {
  const { risk, katz, voice } = input;
  const riskTile: KeyTile = {
    key: "steadi-level",
    label: "Fall risk",
    fullLabel: "Fall risk today (CDC STEADI)",
    valueText: risk.level ? LEVEL_WORD[risk.level] : "Not known yet",
    sparkPath: null,
    deltaText: fallRiskShort(risk, voice),
    deltaTone: "neutral",
    goalText: null,
  };
  const testsTile: KeyTile =
    risk.testsInSaferRange.done > 0
      ? {
          key: "steadi-tests",
          label: "Tests in the safer range",
          fullLabel: "STEADI tests in the safer range",
          valueText: `${risk.testsInSaferRange.safer} of ${risk.testsInSaferRange.done}`,
          sparkPath: null,
          deltaText: risk.testsInSaferRange.done < 4 ? `${4 - risk.testsInSaferRange.done} of the four not done yet` : "All four tests done",
          deltaTone: "neutral",
          goalText: null,
        }
      : input.measuresFailed
        ? placeholderTile("steadi-tests", "Tests in the safer range", COULDNT_LOAD, "Unavailable")
        : placeholderTile("steadi-tests", "Tests in the safer range", "None of the four tests recorded yet");
  const katzTile: KeyTile = katz
    ? {
        key: "katz",
        label: "Daily living",
        fullLabel: "Everyday activities done without help (Katz)",
        valueText: `${katz.score} of 6`,
        sparkPath: null,
        deltaText:
          katz.needsHelpWith.length > 0
            ? `${voice === "patient" ? "Help with" : "Needs help with"}: ${katz.needsHelpWith.join(", ").toLowerCase()}`
            : katz.score === 6
              ? voice === "patient"
                ? "Managing all six on your own"
                : "Independent in all six"
              : katz.source === "intake"
                ? "From the intake"
                : "From the latest score sheet",
        deltaTone: "neutral",
        goalText: null,
      }
    : placeholderTile("katz", "Daily living", "Not asked yet");
  return [
    riskTile,
    testsTile,
    katzTile,
    lineTile(input.series, "gait_speed_4m", "Walking speed", voice, input.measuresFailed, input.milestones),
  ];
}

/** A few plain sentences from the numbers alone, for "Where things stand"
 *  when nobody has written one (labelled as worked out automatically). */
export function geriatricStandSummary(input: { risk: GeriatricFallRisk; katz: KatzView | null; voice: Voice; falls: FallsWindow | null }): string | null {
  const you = input.voice === "patient";
  const out: string[] = [];
  if (input.risk.level) out.push(`${you ? "Your fall risk" : "STEADI fall risk"} is ${input.risk.level}.`);
  if (input.risk.decidedBy === "fall_history") {
    out.push(you ? "It stays high until your earlier falls are more than a year old." : "It stays high on fall history until those falls are over a year old.");
  }
  if (input.risk.saferRangeLine) out.push(`${input.risk.saferRangeLine}.`);
  if (input.katz) out.push(`${you ? "You manage" : "Manages"} ${input.katz.score} of 6 everyday activities without help.`);
  if (input.falls) {
    out.push(
      input.falls.falls === 0
        ? "No falls are written down for the last three months."
        : `${input.falls.falls} ${input.falls.falls === 1 ? "fall is" : "falls are"} written down for the last three months${input.falls.patientReported > 0 ? ` (${input.falls.patientReported} not yet confirmed)` : ""}.`
    );
  }
  return out.length > 0 ? out.join(" ") : null;
}

export function shapeGeriatricView(
  reads: GeriatricReads,
  ctx: { intake: Readonly<Record<string, string>>; voice: Voice }
): GeriatricView {
  const { voice, intake } = ctx;
  const base = shapeMeasuredBase(reads, GERIATRIC_PROFILE_KIND);
  const person = reads.person.status === "ok" ? reads.person : null;
  const ageYears = person ? ageInYears(person.birthDate, reads.todayIso) : null;
  const sex = person ? sexForNorms(person.gender) : null;
  // When the falls answer was first given. An unreadable history is dated
  // today -- the conservative reading: the falls keep counting for a full
  // year rather than dropping out early.
  const answeredAt =
    reads.intakeHistory.status === "ok"
      ? answerFirstGivenAt(reads.intakeHistory.rows, "geri_falls_12m", intake.geri_falls_12m)
      : new Date(reads.nowMs).toISOString();
  const fallRisk = geriatricFallRisk({
    intake,
    intakeAnsweredAt: answeredAt,
    points: base.points,
    diary: base.diaryEntries,
    ageYears,
    sex,
    onDate: reads.todayIso,
    clinicDate: clinicDateKey,
  });
  const katz = latestKatz(base.points, intake);
  const statusInput: StatusInput = {
    main: mainMeasureInput(base.series, GERIATRIC_MAIN_PREFERENCE, GERIATRIC_PROFILE_KIND),
    newFall: base.diaryEntries ? newConfirmedFall(base.diaryEntries, base.lastReviewAt) : false,
  };
  const computed = computeProfileStatus(statusInput);
  const falls = base.diaryEntries ? fallsInWindow(base.diaryEntries, reads.nowMs) : null;
  const notes: string[] = [];
  if (base.diaryFailed) {
    notes.push(
      voice === "patient"
        ? "We couldn't read your diary just now, so a fall written there may not be counted yet."
        : "The diary could not be read: the status and the fall risk are worked out without it."
    );
  }
  if (base.personFailed) {
    notes.push(voice === "patient" ? "We couldn't check your age just now, so the chair test is not compared with others your age." : "The date of birth could not be read: the chair stand has no age norm.");
  }
  const standInput = { risk: fallRisk, katz, falls };
  return {
    kind: GERIATRIC_PROFILE_KIND,
    subject: GERIATRIC_SUBJECT,
    series: base.series,
    graphSeries: base.graphSeries,
    points: base.points,
    tableRows: base.tableRows,
    goal: base.goal,
    views: base.views,
    computed,
    statusInput,
    override: base.override,
    phase: base.phase,
    phaseIsInferred: base.phaseIsInferred,
    stand: whereThingsStandView({
      written: base.careState.summary,
      authorName: reads.summaryAuthorName ?? null,
      generated: geriatricStandSummary({ ...standInput, voice }),
      draft: geriatricStandSummary({ ...standInput, voice: "patient" }),
    }),
    lastReviewAt: base.lastReviewAt,
    keyTiles: geriatricKeyTiles({ risk: fallRisk, katz, series: base.series, milestones: base.milestones, voice, measuresFailed: base.measuresFailed }),
    conditionLine: (intake.geri_concern ?? "").split("\n")[0].trim() || null,
    ageLine: ageYears !== null ? `${ageYears} years` : null,
    person: { ageYears, sex },
    carerLine: geriatricCarerLine(intake, voice, person?.gender ?? null),
    fallRisk,
    fallRiskText: fallRiskSentence(fallRisk, voice),
    katz,
    orthostatic: orthostaticFlag(base.points),
    homeSafety: homeSafetyView(base.points),
    walkingAid: (intake.geri_walking_aid ?? "").trim() || null,
    diary: base.diaryEntries
      ? {
          status: "ok",
          entries: [...base.diaryEntries].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || (a.id < b.id ? 1 : -1)),
          falls: falls!,
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

const TEST_UNITS: Record<string, { unit: string; decimals: number }> = {
  tug: { unit: "seconds", decimals: 1 },
  chair_stand_30s: { unit: "stands", decimals: 0 },
  four_stage_balance: { unit: "stage held", decimals: 0 },
  gait_speed_4m: { unit: "m/s", decimals: 2 },
};

/**
 * The PDF's "Fall risk and daily living" section, as lines (the export
 * route's "complete or refused" reads feed the view). `formatDate` is the
 * clinic-zone formatter (formatDateTime.ts), passed in so this module stays
 * dependency-free.
 */
export function geriatricExportSection(
  view: GeriatricView,
  formatDate: (iso: string) => string
): { heading: string; lines: string[]; note: string } {
  const risk = view.fallRisk;
  const lines: string[] = [];
  lines.push(`Fall risk (CDC STEADI): ${risk.level ? LEVEL_WORD[risk.level] : "Not known yet"}. ${fallRiskSentence(risk, "clinician")}`);
  if (risk.saferRangeLine) lines.push(`${risk.saferRangeLine}.`);
  for (const t of risk.tests) {
    if (t.value === null) {
      lines.push(`${t.label}: not recorded.`);
      continue;
    }
    const u = TEST_UNITS[t.measureKey] ?? { unit: "", decimals: 0 };
    const judged = t.noNorm
      ? "no age and sex norm on file"
      : t.higherRisk === true
        ? "outside the safer range"
        : t.higherRisk === false
          ? "in the safer range"
          : "not judged";
    const arms = t.usedArms ? ", used the arms so scored 0" : "";
    lines.push(`${t.label}: ${readingText(t.value, u.decimals, u.unit)} (${judged}${arms}), ${formatDate(t.measuredAt!)}.`);
  }
  const counted = [
    risk.fallsFrom.intake > 0 ? `${risk.fallsFrom.intake} from the intake answer` : null,
    risk.fallsFrom.diary > 0 ? `${risk.fallsFrom.diary} confirmed in the diary` : null,
  ].filter(Boolean);
  if (counted.length > 0) lines.push(`Falls counted in the last 12 months: ${counted.join(", ")}.`);
  if (risk.unconfirmedDiaryFalls > 0) {
    lines.push(`${risk.unconfirmedDiaryFalls} more ${risk.unconfirmedDiaryFalls === 1 ? "fall" : "falls"} reported by the patient, not yet confirmed (not counted).`);
  }
  if (view.katz) {
    const help = view.katz.needsHelpWith.length > 0 ? `; needs help with ${view.katz.needsHelpWith.join(", ").toLowerCase()}` : "";
    const from = view.katz.source === "measurement" && view.katz.measuredAt ? `score sheet, ${formatDate(view.katz.measuredAt)}` : "intake answer";
    lines.push(`Daily living (Katz): ${view.katz.score} of 6 without help${help} (${from}).`);
  }
  const o = view.orthostatic;
  if (o.status !== "not_recorded") {
    const drops = `top number fell ${o.systolicDrop}${o.diastolicDrop !== null ? `, bottom ${o.diastolicDrop}` : ""}`;
    lines.push(
      o.status === "positive"
        ? `Standing blood pressure: positive (${drops}), ${formatDate(o.measuredAt)}. For the patient's doctor to review.`
        : `Standing blood pressure: negative (${drops}), ${formatDate(o.measuredAt)}.`
    );
  }
  const h = view.homeSafety;
  if (h.status === "recorded") {
    const was = h.previous ? ` (${h.previous.done} of ${h.previous.total} on ${formatDate(h.previous.measuredAt)})` : "";
    const open = h.items.filter((i) => !i.done).map((i) => i.label.toLowerCase());
    lines.push(`Home safety check, ${formatDate(h.measuredAt)}: ${h.done} of ${h.total} done${was}.${open.length > 0 ? ` Not yet: ${open.join(", ")}.` : ""}`);
  }
  if (view.walkingAid) lines.push(`Walking aid: ${view.walkingAid}.`);
  return {
    heading: "Fall risk and daily living",
    lines,
    note: "Thresholds are from the clinic's assessment handbook and are to be verified by a senior physiotherapist. A risk level means higher risk, never a diagnosis.",
  };
}
