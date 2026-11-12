// The milestone-window chart's view model: for each WHO motor milestone,
// its window, where this child is, and what to say about it -- to a
// clinician, and to a parent.
//
// Pure and tested (pedsMilestoneWindows.test.ts). It reads one paediatric
// examination (pedsExam.ts) and the child's age basis (pedsAge.ts) and
// derives everything; nothing here is stored.
//
// The rules:
//   - An ACHIEVED milestone is placed by the child's age on the day it was
//     first seen -- corrected if the correction applied on that day -- so a
//     skill seen at 10 months corrected stays "within the window" however
//     old the child is now.
//   - A milestone NOT YET there (or still emerging) is placed by the child's
//     age today: before its window, within it, or past it.
//   - A milestone NOT ASSESSED is "not checked yet", never "not yet": the
//     neurological exam's "not tested is never normal".
//   - With no usable date of birth nothing is placed; the chart says the age
//     is not on file rather than drawing a dot at a guess.
//   - The referral prompt -- not walking alone by about 18 months corrected
//     -- is worded for clinicians only. The parent's wording is gentle and
//     never diagnostic: "later than most" is a fact about a window, never a
//     judgement on the child.
//
// Every window and the 18-month line are TO BE VERIFIED BY A SENIOR
// PHYSIOTHERAPIST against the WHO Motor Development Study before a patient
// reads them.

import { whoWindowPosition } from "@/lib/outcomeMeasures";
import {
  PEDS_MILESTONES,
  type PedsFindings,
  type PedsMilestoneKey,
  type PedsMilestoneStatus,
  type PedsObservationSource,
} from "@/lib/pedsExam";
import { formatAgeMonths, pedsAgeView, type PedsAgeView } from "@/lib/pedsAge";

/** Not walking alone by this corrected age is a reason for a doctor's
 *  review if one has not happened. To be verified by a senior
 *  physiotherapist. */
export const PEDS_WALKING_REFERRAL_MONTHS = 18;

export const PEDS_WINDOWS_VERIFICATION_NOTE =
  "WHO Motor Development Study windows (1st to 99th percentile); to be verified by a senior physiotherapist.";

export type MilestoneWindowBand =
  | "within_window"
  | "later_than_most"
  | "not_yet_past_window"
  | "not_yet_within_window"
  | "not_yet_before_window"
  | "not_assessed"
  | "age_unknown";

export type MilestoneWindowRow = {
  key: PedsMilestoneKey;
  label: string;
  reachedWhen: string;
  windowMonths: readonly [number, number];
  status: PedsMilestoneStatus | "not_assessed";
  source: PedsObservationSource | null;
  firstSeenOn: string | null;
  /** The family's rough recollection of the date ("about"). Only ever true
   *  for a parent's report; a date the physiotherapist saw is exact. */
  approximate: boolean;
  /** The child's age (corrected while it applied) on the day first seen,
   *  for an achieved milestone with a usable date of birth. The chart's dot. */
  achievedAgeMonths: number | null;
  achievedAgeBasis: "corrected" | "chronological" | null;
  band: MilestoneWindowBand;
  /** Achieved before the window opened. Still "within_window" for every
   *  purpose; a gentle extra the chart may show. */
  earlierThanMost: boolean;
  clinicianLabel: string;
  patientLabel: string;
  /** "Seen in a session" / "Parent reports", for an achieved or emerging
   *  milestone. */
  provenanceLabel: string | null;
};

export type MilestoneWindowsView = {
  age: PedsAgeView;
  rows: MilestoneWindowRow[];
  /** Clinicians only. Null when the prompt does not apply. */
  referral: { clinicianText: string } | null;
  /** Clinicians only: past 18 months (corrected) with walking alone never
   *  assessed. It is a gap in the record, not a referral prompt -- the
   *  prompt needs a finding that the child is not walking -- so it says
   *  "not assessed yet" and nothing more. Null when it does not apply. */
  walkingNotAssessed: { clinicianText: string } | null;
  verificationNote: string;
};

const CLINICIAN: Record<Exclude<MilestoneWindowBand, "not_assessed" | "age_unknown">, string> = {
  within_window: "Within the WHO window",
  later_than_most: "After the WHO window (later than most)",
  not_yet_past_window: "Not yet, past the WHO window",
  not_yet_within_window: "Not yet, within the WHO window",
  not_yet_before_window: "Not yet, window not reached",
};

const PATIENT: Record<MilestoneWindowBand, string> = {
  within_window: "Came at a usual age",
  later_than_most: "Came a little later than most children",
  not_yet_past_window: "Still working on this one",
  not_yet_within_window: "Many children are still learning this at this age",
  not_yet_before_window: "Most children learn this a little later",
  not_assessed: "Not checked yet",
  age_unknown: "We need the date of birth to show this",
};

function bandForNotYet(windowMonths: readonly [number, number], ageNow: number): MilestoneWindowBand {
  if (ageNow > windowMonths[1]) return "not_yet_past_window";
  if (ageNow >= windowMonths[0]) return "not_yet_within_window";
  return "not_yet_before_window";
}

/**
 * The chart for one examination (or none: every milestone "not checked
 * yet"). `todayIso` is the clinic's day (`pedsTodayIso`).
 */
export function pedsMilestoneWindows(input: {
  findings: PedsFindings | null;
  birthDate: string | null | undefined;
  weeksAtBirth: number | null | undefined;
  todayIso: string;
}): MilestoneWindowsView {
  const age = pedsAgeView({ birthDate: input.birthDate, weeksAtBirth: input.weeksAtBirth, onDate: input.todayIso });
  const rows: MilestoneWindowRow[] = PEDS_MILESTONES.map((m) => {
    const finding = input.findings?.milestones[m.key] ?? null;
    const common = {
      key: m.key,
      label: m.label,
      reachedWhen: m.reachedWhen,
      windowMonths: m.windowMonths,
    };
    if (!finding) {
      return {
        ...common,
        status: "not_assessed" as const,
        source: null,
        firstSeenOn: null,
        approximate: false,
        achievedAgeMonths: null,
        achievedAgeBasis: null,
        band: "not_assessed" as const,
        earlierThanMost: false,
        clinicianLabel: "Not assessed",
        patientLabel: PATIENT.not_assessed,
        provenanceLabel: null,
      };
    }
    const provenanceLabel =
      finding.status === "not_yet" || !finding.source ? null : finding.source === "seen" ? "Seen in a session" : "Parent reports";
    let band: MilestoneWindowBand = "age_unknown";
    let achievedAgeMonths: number | null = null;
    let achievedAgeBasis: "corrected" | "chronological" | null = null;
    let earlierThanMost = false;

    if (finding.status === "achieved") {
      const at = finding.firstSeenOn
        ? pedsAgeView({ birthDate: input.birthDate, weeksAtBirth: input.weeksAtBirth, onDate: finding.firstSeenOn })
        : null;
      if (at && at.status === "ok") {
        achievedAgeMonths = at.windowAgeMonths;
        achievedAgeBasis = at.basis;
        const position = whoWindowPosition(m.key, at.windowAgeMonths);
        band = position === "after" ? "later_than_most" : "within_window";
        earlierThanMost = position === "before";
      }
    } else if (age.status === "ok") {
      band = bandForNotYet(m.windowMonths, age.windowAgeMonths);
    }

    const statusPrefix = finding.status === "emerging" ? "Emerging. " : "";
    const clinicianLabel =
      band === "age_unknown"
        ? `${statusPrefix}${finding.status === "achieved" ? "Achieved" : "Not yet"}; age not on file`
        : band === "not_assessed"
          ? "Not assessed"
          : finding.status === "achieved" && earlierThanMost
            ? "Before the WHO window (earlier than most)"
            : `${statusPrefix}${CLINICIAN[band]}`;
    const patientLabel =
      finding.status === "emerging" && band !== "age_unknown" ? `Starting to come. ${PATIENT[band]}` : PATIENT[band];

    return {
      ...common,
      status: finding.status,
      source: finding.source ?? null,
      firstSeenOn: finding.firstSeenOn ?? null,
      approximate: finding.approximate === true,
      achievedAgeMonths,
      achievedAgeBasis,
      band,
      earlierThanMost,
      clinicianLabel,
      patientLabel,
      provenanceLabel,
    };
  });

  const walking = rows.find((r) => r.key === "walking_alone");
  const referral =
    walking &&
    (walking.status === "not_yet" || walking.status === "emerging") &&
    age.status === "ok" &&
    age.windowAgeMonths >= PEDS_WALKING_REFERRAL_MONTHS
      ? {
          clinicianText: `Not walking alone at ${formatAgeMonths(age.windowAgeMonths)}${
            age.basis === "corrected" ? " corrected" : ""
          } (prompt from ${PEDS_WALKING_REFERRAL_MONTHS} months corrected): consider a doctor's review if one has not already happened. Threshold to be verified by a senior physiotherapist.`,
        }
      : null;

  const walkingNotAssessed =
    walking &&
    walking.status === "not_assessed" &&
    age.status === "ok" &&
    age.windowAgeMonths >= PEDS_WALKING_REFERRAL_MONTHS
      ? { clinicianText: "Walking alone not assessed yet." }
      : null;

  return { age, rows, referral, walkingNotAssessed, verificationNote: PEDS_WINDOWS_VERIFICATION_NOTE };
}

/** The age a milestone came at, worded for the PDF: "10.2 months corrected". */
export function achievedAgeLabel(row: MilestoneWindowRow): string | null {
  if (row.achievedAgeMonths === null) return null;
  return `${formatAgeMonths(row.achievedAgeMonths)}${row.achievedAgeBasis === "corrected" ? " corrected" : ""}`;
}
