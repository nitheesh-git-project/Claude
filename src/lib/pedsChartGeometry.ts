// The geometry and words of the milestone-window chart, kept out of the
// component so they can be tested without rendering (the "business maths
// lives in src/lib" rule).
//
// One bar per WHO milestone spans the age range in which most children reach
// it; one marker per milestone says where THIS child is:
//
//   - a dot at the age the skill came (the corrected age on the day first
//     seen, from pedsMilestoneWindows): SOLID when the physiotherapist saw
//     it, HOLLOW when the family told us, and a DASHED ring when that date
//     is the family's rough recollection ("about");
//   - a diamond at the child's age today for a skill that has not come
//     (hollow: not yet, half-filled: emerging) -- where "today" sits against
//     the bar is the whole question;
//   - nothing for a skill nobody has checked: "not checked yet" is a gap in
//     the record, never drawn as a place on the axis.
//
// Colour never carries the meaning alone: shape (dot / diamond), fill and the
// dashed ring are each in the legend and in the row's words, and every row
// has a plain-text sentence, so the chart has a complete text alternative.
// Nothing is placed without a usable date of birth (the view says so).

import { formatClinicDate } from "@/lib/formatDateTime";
import { formatAgeMonths, type PedsAgeView } from "@/lib/pedsAge";
import { achievedAgeLabel, type MilestoneWindowRow, type MilestoneWindowsView } from "@/lib/pedsMilestoneWindows";
import type { Voice } from "@/lib/progressView";

export const PEDS_CHART_MIN_MONTHS = 24;
export const PEDS_CHART_MAX_MONTHS = 48;

export type ChartTick = { months: number; xPct: number; label: string };

export type ChartMarker = {
  shape: "dot" | "diamond";
  /** dot: solid (seen) / hollow (told). diamond: hollow (not yet) / half (emerging). */
  fill: "solid" | "hollow" | "half";
  /** A dashed ring: the date is the family's rough recollection. */
  dashed: boolean;
  xPct: number;
};

export type ChartRow = {
  key: string;
  label: string;
  /** The definition the physiotherapist records against. */
  reachedWhen: string;
  barLeftPct: number;
  barWidthPct: number;
  marker: ChartMarker | null;
  /** The whole row as one sentence, for the accessible name. */
  summary: string;
  /** The parts, for the text table and the row's detail. */
  windowText: string;
  statusText: string;
  whenText: string;
  whoText: string;
  positionText: string;
};

export type ChartGeometry = {
  placed: boolean;
  axisMax: number;
  ticks: ChartTick[];
  todayPct: number | null;
  /** The child is older than the axis: the line sits at the right edge. */
  todayOffAxis: boolean;
  todayLabel: string | null;
  rows: ChartRow[];
};

export const PEDS_CHART_LEGEND: readonly { id: string; label: string; marker: ChartMarker | "bar" | "today" }[] = [
  { id: "bar", label: "Age range in which most children reach it", marker: "bar" },
  { id: "seen", label: "Reached - seen by the physiotherapist", marker: { shape: "dot", fill: "solid", dashed: false, xPct: 0 } },
  { id: "told", label: "Reached - told by parents", marker: { shape: "dot", fill: "hollow", dashed: false, xPct: 0 } },
  { id: "about", label: "Dashed ring - the date is approximate", marker: { shape: "dot", fill: "hollow", dashed: true, xPct: 0 } },
  { id: "emerging", label: "Starting to come (shown at today's age)", marker: { shape: "diamond", fill: "half", dashed: false, xPct: 0 } },
  { id: "not_yet", label: "Not yet (shown at today's age)", marker: { shape: "diamond", fill: "hollow", dashed: false, xPct: 0 } },
  { id: "today", label: "Today", marker: "today" },
];

const clampPct = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;

/** The axis length: 24 months, or the next 6 above anything on it, to 48. */
export function chartAxisMax(view: MilestoneWindowsView): number {
  let extent = 0;
  for (const r of view.rows) {
    extent = Math.max(extent, r.windowMonths[1], r.achievedAgeMonths ?? 0);
  }
  if (view.age.status === "ok") extent = Math.max(extent, view.age.windowAgeMonths);
  const rounded = Math.ceil((extent + 1) / 6) * 6;
  return Math.min(PEDS_CHART_MAX_MONTHS, Math.max(PEDS_CHART_MIN_MONTHS, rounded));
}

export function chartTicks(axisMax: number): ChartTick[] {
  const step = axisMax <= 24 ? 3 : 6;
  const out: ChartTick[] = [];
  for (let m = 0; m <= axisMax + 1e-9; m += step) out.push({ months: m, xPct: clampPct((m / axisMax) * 100), label: String(m) });
  return out;
}

const windowText = (w: readonly [number, number]) => `${w[0]} to ${w[1]} months`;

function statusWords(row: MilestoneWindowRow, voice: Voice): string {
  const clinician = voice === "clinician";
  switch (row.status) {
    case "achieved": {
      const age = achievedAgeLabel(row);
      return age ? `Reached at ${row.approximate ? "about " : ""}${age}` : "Reached";
    }
    case "emerging":
      return clinician ? "Emerging" : "Starting to come";
    case "not_yet":
      return clinician ? "Not yet" : "Not yet";
    default:
      return clinician ? "Not assessed" : "Not checked yet";
  }
}

function whenWords(row: MilestoneWindowRow): string {
  if (!row.firstSeenOn) return "";
  return `${row.approximate ? "About " : ""}${formatClinicDate(row.firstSeenOn)}`;
}

function whoWords(row: MilestoneWindowRow, voice: Voice): string {
  if (row.status === "not_assessed" || row.status === "not_yet" || !row.source) return "";
  if (voice === "patient") return row.source === "seen" ? "Seen in a session" : "You told us";
  return row.source === "seen" ? "Seen by the physiotherapist" : "Parent reports";
}

/**
 * Everything the chart draws and says for one examination's windows view.
 * `placed` is false without a usable age (no date of birth, or one that is
 * implausible): the bars and ticks are still computed, but no marker is
 * placed and the component says why instead of drawing a guess.
 */
export function pedsChartGeometry(view: MilestoneWindowsView, voice: Voice): ChartGeometry {
  const axisMax = chartAxisMax(view);
  const x = (months: number) => clampPct((months / axisMax) * 100);
  const age = view.age;
  const ageOk = age.status === "ok";
  const todayMonths = ageOk ? age.windowAgeMonths : null;
  const todayPct = todayMonths !== null ? x(todayMonths) : null;

  const rows: ChartRow[] = view.rows.map((r) => {
    let marker: ChartMarker | null = null;
    if (r.status === "achieved" && r.achievedAgeMonths !== null) {
      marker = { shape: "dot", fill: r.source === "seen" ? "solid" : "hollow", dashed: r.approximate, xPct: x(r.achievedAgeMonths) };
    } else if ((r.status === "emerging" || r.status === "not_yet") && todayPct !== null) {
      marker = { shape: "diamond", fill: r.status === "emerging" ? "half" : "hollow", dashed: false, xPct: todayPct };
    }
    const position = voice === "clinician" ? r.clinicianLabel : r.patientLabel;
    const when = whenWords(r);
    const who = whoWords(r, voice);
    const status = statusWords(r, voice);
    const bits = [`${r.label}.`, `${status}.`];
    if (when) bits.push(`${r.approximate ? "Date approximate: " : "First seen "}${when.replace(/^About /, "about ")}.`);
    if (who) bits.push(`${who}.`);
    if (r.status !== "not_assessed") bits.push(`${position}.`);
    bits.push(`Most children: ${windowText(r.windowMonths)}.`);
    return {
      key: r.key,
      label: r.label,
      reachedWhen: r.reachedWhen,
      barLeftPct: x(r.windowMonths[0]),
      barWidthPct: Math.max(1, Math.round((x(r.windowMonths[1]) - x(r.windowMonths[0])) * 100) / 100),
      marker,
      summary: bits.join(" "),
      windowText: windowText(r.windowMonths),
      statusText: status,
      whenText: when,
      whoText: who,
      positionText: r.status === "not_assessed" ? "" : position,
    };
  });

  return {
    placed: ageOk,
    axisMax,
    ticks: chartTicks(axisMax),
    todayPct,
    todayOffAxis: todayMonths !== null && todayMonths > axisMax,
    todayLabel: ageOk ? `Today, ${formatAgeMonths(age.windowAgeMonths)}${age.basis === "corrected" ? " corrected" : ""}` : null,
    rows,
  };
}

/** Why nothing is placed, worded for who is reading; null when it is. */
export function pedsChartUnplacedReason(age: PedsAgeView, voice: Voice): string | null {
  if (age.status === "ok") return null;
  if (age.status === "no_birth_date") {
    return voice === "clinician"
      ? "No date of birth is on file for this child, so the milestones cannot be placed against the WHO windows. The findings are listed below."
      : "We need your child's date of birth to show where each milestone sits. Your physiotherapist can add it.";
  }
  return voice === "clinician"
    ? "The date of birth on file is not plausible for a child, so nothing is charted."
    : "We're checking your child's date of birth, so the chart is not shown yet.";
}
