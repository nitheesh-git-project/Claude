import { clinicDateKey } from "@/lib/clinicWeek";
import {
  OUTCOME_MEASURES,
  changeDirection,
  isMeaningfulChange,
  outcomeMeasure,
  usualJointRange,
  type BetterDirection,
  type ChangeDirection,
  type CleanMeasurement,
  type MeasurementConditions,
  type MeasurementSetting,
  type MeasurementSide,
  type ProfileKind,
} from "@/lib/outcomeMeasures";
import type { MeasurementReading, MilestoneStatus } from "@/lib/milestones";

// The shared measurement layer, shaped for the screens: one stored row ->
// one point, points -> one line per measure / variant / side (and, on the
// Parkinson's sub-profile, per ON/OFF state), one point per review, and the
// measures table's first / now / goal.
//
// Pure and dependency-free (the reads are outcomeServer.ts), so the graph,
// the table and the milestone maths are tested without a database and every
// screen draws the same line from the same rows.
//
// Contract for phase 2b (the UI): loadMeasurements() hands back
// OutcomeMeasurementRow[]; parseMeasurementRows() turns them into
// MeasurementPoint[]; buildMeasureSeries() is the graph; measureTableRows()
// is the table. None of them reads a clock.

/** The columns every read of outcome_measurements selects. */
export const OUTCOME_MEASUREMENT_SELECT =
  "id, patient_id, appointment_id, measure_key, variant, side, value, items, conditions, recorded_by, recorded_by_role, measured_at, schema_version, created_at";

/** A row as PostgREST returns it. `value` is `numeric`, which arrives as a
 *  JSON number -- or as a string for a value numeric cannot fit in a double,
 *  which is why it is typed loosely and parsed. */
export type OutcomeMeasurementRow = {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  measure_key: string;
  variant: string | null;
  side: string | null;
  value: number | string;
  items: unknown;
  conditions: unknown;
  recorded_by: string;
  recorded_by_role: string;
  measured_at: string;
  schema_version: number;
  created_at: string;
};

/** One stored measurement, in the app's own shape. */
export type MeasurementPoint = {
  id: string;
  patientId: string;
  appointmentId: string | null;
  measureKey: string;
  variant: string | null;
  side: MeasurementSide | null;
  value: number;
  items: CleanMeasurement["items"];
  /** As stored (validateMeasurementConditions shaped it on the way in);
   *  `{}`-like rows written by a future version read as `null` fields. */
  conditions: Partial<MeasurementConditions>;
  recordedBy: string;
  recordedByRole: "therapist" | "admin";
  measuredAt: string;
  createdAt: string;
  schemaVersion: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseItems(raw: unknown): CleanMeasurement["items"] {
  if (Array.isArray(raw)) {
    return raw.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
  }
  if (isObject(raw)) {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    return out;
  }
  return null;
}

/** null for a row that cannot be drawn honestly (no finite value, no
 *  readable time) -- dropped rather than plotted at zero or at 1970. */
export function parseMeasurementRow(row: unknown): MeasurementPoint | null {
  if (!isObject(row)) return null;
  const value = typeof row.value === "number" ? row.value : typeof row.value === "string" ? Number(row.value) : NaN;
  const measuredAt = typeof row.measured_at === "string" ? row.measured_at : "";
  if (!Number.isFinite(value) || !Number.isFinite(Date.parse(measuredAt))) return null;
  if (typeof row.id !== "string" || typeof row.measure_key !== "string" || typeof row.patient_id !== "string") return null;
  const side = row.side === "left" || row.side === "right" ? row.side : null;
  return {
    id: row.id,
    patientId: row.patient_id,
    appointmentId: typeof row.appointment_id === "string" ? row.appointment_id : null,
    measureKey: row.measure_key,
    variant: typeof row.variant === "string" ? row.variant : null,
    side,
    value,
    items: parseItems(row.items),
    conditions: isObject(row.conditions) ? (row.conditions as Partial<MeasurementConditions>) : {},
    recordedBy: typeof row.recorded_by === "string" ? row.recorded_by : "",
    recordedByRole: row.recorded_by_role === "admin" ? "admin" : "therapist",
    measuredAt,
    createdAt: typeof row.created_at === "string" ? row.created_at : measuredAt,
    schemaVersion: typeof row.schema_version === "number" ? row.schema_version : 1,
  };
}

export function parseMeasurementRows(rows: readonly unknown[]): MeasurementPoint[] {
  const out: MeasurementPoint[] = [];
  for (const row of rows) {
    const point = parseMeasurementRow(row);
    if (point) out.push(point);
  }
  return out;
}

/** The milestone maths' view of a point (milestones.ts). */
export function toMeasurementReading(point: MeasurementPoint): MeasurementReading {
  return {
    id: point.id,
    measureKey: point.measureKey,
    variant: point.variant,
    side: point.side,
    value: point.value,
    measuredAt: point.measuredAt,
  };
}

export type MedicationState = "on" | "off";

/** The Parkinson's graph only joins dots recorded in the same medication
 *  state (the registry's medicationStateRequired), so ON and OFF are two
 *  lines there. Everywhere else the state is not part of the line. */
export function seriesMedicationState(point: MeasurementPoint, profileKind: ProfileKind): MedicationState | null {
  const m = outcomeMeasure(point.measureKey);
  if (!m?.medicationStateRequired || profileKind !== "neuro_parkinsons") return null;
  const state = point.conditions.medicationState;
  return state === "on" || state === "off" ? state : null;
}

/** One line on one graph: measure, variant, side and (Parkinson's only)
 *  ON/OFF. Two variants never share a line -- active and passive range stay
 *  apart -- and a right knee is never compared with a left. */
export function seriesKeyFor(input: {
  measureKey: string;
  variant: string | null;
  side: MeasurementSide | null;
  medicationState?: MedicationState | null;
}): string {
  return [input.measureKey, input.variant ?? "", input.side ?? "", input.medicationState ?? ""].join("|");
}

/** A review is the session the measurement was linked to, or -- when it was
 *  not linked to one -- the clinic-zone calendar day it was taken on. */
export function reviewKeyFor(point: Pick<MeasurementPoint, "appointmentId" | "measuredAt">): string {
  return point.appointmentId ? `session:${point.appointmentId}` : `day:${clinicDateKey(point.measuredAt)}`;
}

export type SeriesPoint = {
  measurementId: string;
  value: number;
  measuredAt: string;
  reviewKey: string;
  appointmentId: string | null;
  setting: MeasurementSetting | null;
  recordedBy: string;
  /** The person who measured, when it was not the person recording. */
  testerName: string | null;
  /** How many readings of this line the review held; the point is the
   *  newest of them. Above 1 means it was re-tested within the review. */
  readingsInReview: number;
};

export type MeasureSeries = {
  key: string;
  measureKey: string;
  variant: string | null;
  side: MeasurementSide | null;
  medicationState: MedicationState | null;
  /** False for a key the registry no longer holds: still drawn, labelled by
   *  its key, with no direction or thresholds. */
  known: boolean;
  label: string;
  plainName: string;
  variantLabel: string | null;
  unit: string;
  decimals: number;
  better: BetterDirection | null;
  /** Oldest first, one per review. */
  points: SeriesPoint[];
};

function newerFirst(a: MeasurementPoint, b: MeasurementPoint): number {
  const byMeasured = Date.parse(b.measuredAt) - Date.parse(a.measuredAt);
  if (byMeasured !== 0) return byMeasured;
  const byCreated = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (Number.isFinite(byCreated) && byCreated !== 0) return byCreated;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

const MEASURE_ORDER = new Map(OUTCOME_MEASURES.map((m, i) => [m.key, i]));
const SIDE_ORDER: Record<string, number> = { "": 0, left: 1, right: 2 };
const STATE_ORDER: Record<string, number> = { on: 0, off: 1, "": 2 };

/**
 * The graph: every line on the patient's record, each with one point per
 * review (the newest reading of that review -- a re-test in the same
 * session replaces the first attempt rather than drawing a vertical
 * zig-zag), oldest point first. Lines are in registry order, then variant
 * order, then left before right, then ON before OFF.
 */
export function buildMeasureSeries(
  points: readonly MeasurementPoint[],
  opts: { profileKind: ProfileKind }
): MeasureSeries[] {
  const groups = new Map<string, MeasurementPoint[]>();
  const states = new Map<string, MedicationState | null>();
  for (const point of points) {
    const medicationState = seriesMedicationState(point, opts.profileKind);
    const key = seriesKeyFor({ ...point, medicationState });
    const list = groups.get(key);
    if (list) list.push(point);
    else groups.set(key, [point]);
    states.set(key, medicationState);
  }

  const series: MeasureSeries[] = [];
  for (const [key, list] of groups) {
    const sample = list[0];
    const m = outcomeMeasure(sample.measureKey);
    const byReview = new Map<string, MeasurementPoint[]>();
    for (const point of list) {
      const review = reviewKeyFor(point);
      const inReview = byReview.get(review);
      if (inReview) inReview.push(point);
      else byReview.set(review, [point]);
    }
    const seriesPoints: SeriesPoint[] = [];
    for (const [reviewKey, inReview] of byReview) {
      const newest = [...inReview].sort(newerFirst)[0];
      seriesPoints.push({
        measurementId: newest.id,
        value: newest.value,
        measuredAt: newest.measuredAt,
        reviewKey,
        appointmentId: newest.appointmentId,
        setting: newest.conditions.setting === "in_person" || newest.conditions.setting === "video" ? newest.conditions.setting : null,
        recordedBy: newest.recordedBy,
        testerName: typeof newest.conditions.testerName === "string" ? newest.conditions.testerName : null,
        readingsInReview: inReview.length,
      });
    }
    seriesPoints.sort((a, b) => Date.parse(a.measuredAt) - Date.parse(b.measuredAt) || (a.measurementId < b.measurementId ? -1 : 1));

    series.push({
      key,
      measureKey: sample.measureKey,
      variant: sample.variant,
      side: sample.side,
      medicationState: states.get(key) ?? null,
      known: !!m,
      label: m?.label ?? sample.measureKey,
      plainName: m?.plainName ?? sample.measureKey,
      variantLabel: m?.variants?.find((v) => v.key === sample.variant)?.label ?? null,
      unit: m?.unit ?? "",
      decimals: m?.decimals ?? 2,
      better: m?.better ?? null,
      points: seriesPoints,
    });
  }

  const variantIndex = (s: MeasureSeries) => {
    const m = outcomeMeasure(s.measureKey);
    const i = m?.variants?.findIndex((v) => v.key === s.variant) ?? -1;
    return i < 0 ? 0 : i;
  };
  return series.sort(
    (a, b) =>
      (MEASURE_ORDER.get(a.measureKey) ?? Number.MAX_SAFE_INTEGER) - (MEASURE_ORDER.get(b.measureKey) ?? Number.MAX_SAFE_INTEGER) ||
      a.measureKey.localeCompare(b.measureKey) ||
      variantIndex(a) - variantIndex(b) ||
      SIDE_ORDER[a.side ?? ""] - SIDE_ORDER[b.side ?? ""] ||
      STATE_ORDER[a.medicationState ?? ""] - STATE_ORDER[b.medicationState ?? ""]
  );
}

/** What the measures table needs of a milestone to show its goal column. */
export type MilestoneTarget = {
  id: string;
  linkedMeasureKey: string | null;
  linkedVariant: string | null;
  linkedSide: MeasurementSide | null;
  targetValue: number | null;
  sortOrder: number;
  status: MilestoneStatus;
  reachedAt: string | null;
};

export type MeasureTableRow = {
  seriesKey: string;
  measureKey: string;
  variant: string | null;
  side: MeasurementSide | null;
  medicationState: MedicationState | null;
  label: string;
  variantLabel: string | null;
  unit: string;
  decimals: number;
  first: SeriesPoint;
  now: SeriesPoint;
  /** Points on the line (reviews, not raw readings). */
  reviews: number;
  /** The nearest target not yet reached on this line (else the last one
   *  reached), or the registry's default; see goalForSeries. */
  goal: { value: number; milestoneId: string | null; reached: boolean; source: "milestone" | "default" } | null;
  /** First to now, honest about noise (changeDirection): null with only one
   *  review, or for a measure the registry no longer holds. */
  change: ChangeDirection | null;
  /** Whether first to now is at least the MCID; null where it is unknown. */
  meaningful: boolean | null;
};

/** Whether a milestone has been reached. */
function milestoneReached(ms: Pick<MilestoneTarget, "status" | "reachedAt">): boolean {
  return ms.reachedAt !== null || ms.status === "reached";
}

/** The registry's own fixed target for a measure (strength compared with
 *  the other side: 90%), or null where it defines none. */
export function registryDefaultGoal(measureKey: string): number | null {
  const norm = outcomeMeasure(measureKey)?.norm;
  return norm && norm.kind === "fixed" && norm.value !== undefined && Number.isFinite(norm.value) ? norm.value : null;
}

/**
 * The goal for one line, or null. From the plan's milestones linked to this
 * measure and variant (and this side, or no side): the nearest target not
 * yet reached -- lowest sort order -- else the last one reached. A milestone
 * naming this very side beats one naming none. With no milestone, the
 * registry's own fixed target where it has one (`source: "default"`).
 */
export function goalForSeries(
  series: Pick<MeasureSeries, "measureKey" | "variant" | "side">,
  milestones: readonly MilestoneTarget[]
): MeasureTableRow["goal"] {
  const linked = milestones.filter(
    (ms) =>
      ms.linkedMeasureKey === series.measureKey &&
      ms.targetValue !== null &&
      (ms.linkedVariant ?? null) === (series.variant ?? null) &&
      ((ms.linkedSide ?? null) === (series.side ?? null) || ms.linkedSide === null)
  );
  const exact = linked.filter((ms) => (ms.linkedSide ?? null) === (series.side ?? null));
  const pool = exact.length > 0 ? exact : linked;
  const byOrder = (a: MilestoneTarget, b: MilestoneTarget) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const open = pool.filter((ms) => !milestoneReached(ms)).sort(byOrder);
  const done = pool.filter(milestoneReached).sort(byOrder);
  const best = open[0] ?? done[done.length - 1] ?? null;
  if (best && best.targetValue !== null) {
    return { value: best.targetValue, milestoneId: best.id, reached: milestoneReached(best), source: "milestone" };
  }
  const fallback = registryDefaultGoal(series.measureKey);
  return fallback === null ? null : { value: fallback, milestoneId: null, reached: false, source: "default" };
}

/**
 * The measures table: one row per line, first reading, latest reading, the
 * goal, and whether the move between them is real. A different tester
 * between first and now widens the allowance where the handbook gives a
 * between-tester figure; a joint range is judged against its usual range.
 */
export function measureTableRows(
  series: readonly MeasureSeries[],
  milestones: readonly MilestoneTarget[],
  opts: { profileKind: ProfileKind }
): MeasureTableRow[] {
  const rows: MeasureTableRow[] = [];
  for (const s of series) {
    if (s.points.length === 0) continue;
    const first = s.points[0];
    const now = s.points[s.points.length - 1];
    const twoReviews = s.points.length > 1;
    const testerOf = (p: SeriesPoint) => p.testerName ?? p.recordedBy;
    const normal = s.variant ? usualJointRange(s.variant) ?? undefined : undefined;
    rows.push({
      seriesKey: s.key,
      measureKey: s.measureKey,
      variant: s.variant,
      side: s.side,
      medicationState: s.medicationState,
      label: s.label,
      variantLabel: s.variantLabel,
      unit: s.unit,
      decimals: s.decimals,
      first,
      now,
      reviews: s.points.length,
      goal: goalForSeries(s, milestones),
      change:
        twoReviews && s.known
          ? changeDirection(s.measureKey, first.value, now.value, {
              profileKind: opts.profileKind,
              normal,
              differentTester: testerOf(first) !== testerOf(now),
            })
          : null,
      meaningful: twoReviews && s.known ? isMeaningfulChange(s.measureKey, first.value, now.value, opts.profileKind) : null,
    });
  }
  return rows;
}
