import {
  PAIN_MAP_REGIONS,
  latestAssessmentByRegionSide,
  painBand,
  painTrend,
  type PainAssessmentRow,
  type PainBand,
  type PainTrend,
} from "@/lib/painMap";
import {
  countAnswered,
  countedQuestions,
  parseAreaPain,
  parseMultiSelect,
  type IntakeQuestion,
} from "@/lib/conditionIntake";

// The reading layer of the Health Profile: everything the patient's page
// shows at a glance is derived here rather than inside a component, same
// rule as pricing/adminMetrics (see AGENTS.md, "Business math lives in
// dependency-free src/lib modules"). Nothing in this file touches
// Supabase or React -- it takes rows in and gives numbers out.

export type RegionStanding = {
  key: string; // "region:side", the same key latestAssessmentByRegionSide uses
  label: string; // "Knee (left)"
  percent: number;
  band: PainBand;
  trend: PainTrend;
  assessedAt: string;
};

/** Latest clinical standing per assessed region, worst first -- the order
 *  a patient (and a therapist opening their chart) actually wants: what
 *  hurts most, not which body part sorts first alphabetically. */
export function regionStandings(assessments: PainAssessmentRow[]): RegionStanding[] {
  const latestByKey = latestAssessmentByRegionSide(assessments);
  const standings: RegionStanding[] = [];

  for (const [key, latest] of latestByKey) {
    const [regionKey, side] = key.split(":");
    const def = PAIN_MAP_REGIONS.find((r) => r.key === regionKey);
    const history = assessments
      .filter((a) => a.region === regionKey && a.side === side)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const previous = history[1] ?? null;
    standings.push({
      key,
      label: def ? `${def.label}${def.paired && side !== "na" ? ` (${side})` : ""}` : regionKey,
      percent: latest.pain_percent,
      band: painBand(latest.pain_percent),
      trend: painTrend(latest.pain_percent, previous?.pain_percent ?? null),
      assessedAt: latest.created_at,
    });
  }

  return standings.sort((a, b) => b.percent - a.percent);
}

export type PainTrendPoint = { date: string; percent: number; regions: number };

/** One point per day a therapist assessed anything, averaged across the
 *  regions examined that day. Averaging rather than plotting every region
 *  separately is deliberate: on a patient's own dashboard the question is
 *  "am I getting better?", which is one line, not seventeen. Per-region
 *  detail stays a tap away on the body map. */
export function painTrendSeries(assessments: PainAssessmentRow[]): PainTrendPoint[] {
  const byDay = new Map<string, number[]>();
  for (const a of assessments) {
    const day = a.created_at.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(a.pain_percent);
    byDay.set(day, list);
  }
  return [...byDay.entries()]
    .map(([date, values]) => ({
      date,
      percent: Math.round(values.reduce((sum, v) => sum + v, 0) / values.length),
      regions: values.length,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Completion, the one figure every specialty's snapshot strip needs and
 *  the only part of this module that is specialty-agnostic. */
export type IntakeCompletion = {
  answered: number;
  totalQuestions: number;
  /** 0-100, for the completeness ring. */
  completionPercent: number;
};

export function intakeCompletion({
  questions,
  data,
}: {
  questions: IntakeQuestion[];
  data: Record<string, string>;
}): IntakeCompletion {
  const total = countedQuestions(questions).length;
  const answered = countAnswered(questions, data);
  return {
    answered,
    totalQuestions: total,
    completionPercent: total === 0 ? 0 : Math.round((answered / total) * 100),
  };
}

// The ORTHOPAEDIC snapshot. It mixes the patient's own 0-10 self-report
// with the therapist's clinical Pain Map percentages, which is why it is
// the only one of the three that reads `assessments` at all -- the Pain
// Map is an ortho-only layer, and the neuro and paediatric snapshots
// below are built from the intake alone.
export type OrthoSnapshot = IntakeCompletion & {
  /** The patient's own 0-10 answer from the intake, or null if unanswered. */
  selfSeverity: number | null;
  /** How many areas the patient marked as painful themselves. */
  selfAreas: number;
  /** Average of the latest clinical percentage across every assessed
   *  region, or null before the first exam. */
  clinicalPercent: number | null;
  clinicalBand: PainBand | null;
  /** Direction of that average against the previous assessment day. */
  clinicalTrend: PainTrend | null;
  regionsAssessed: number;
  lastAssessedAt: string | null;
};

export function orthoSnapshot({
  questions,
  data,
  assessments,
}: {
  questions: IntakeQuestion[];
  data: Record<string, string>;
  assessments: PainAssessmentRow[];
}): OrthoSnapshot {
  const standings = regionStandings(assessments);
  const trend = painTrendSeries(assessments);
  // Newest assessment by date, which is not standings[0] -- those are
  // ordered worst-pain-first, and the worst region may be the one that
  // was examined weeks ago.
  const lastAssessedAt = assessments.reduce<string | null>(
    (newest, a) => (!newest || a.created_at > newest ? a.created_at : newest),
    null
  );
  const latestPoint = trend[trend.length - 1] ?? null;
  const previousPoint = trend[trend.length - 2] ?? null;
  const severityRaw = Number.parseInt(data.severity ?? "", 10);

  return {
    ...intakeCompletion({ questions, data }),
    selfSeverity: Number.isFinite(severityRaw) ? severityRaw : null,
    selfAreas: parseAreaPain(data.area_pain).length,
    clinicalPercent: latestPoint?.percent ?? null,
    clinicalBand: latestPoint ? painBand(latestPoint.percent) : null,
    clinicalTrend: latestPoint ? painTrend(latestPoint.percent, previousPoint?.percent ?? null) : null,
    regionsAssessed: standings.length,
    lastAssessedAt,
  };
}

// --- Neurological ---------------------------------------------------------

export type NeuroSnapshot = IntakeCompletion & {
  /** The patient's own 0-10 independence answer -- this specialty's
   *  trended figure, standing where the ortho pain score stands. */
  independence: number | null;
  /** How they get around indoors, verbatim from the answer. */
  mobility: string | null;
  /** How many of the symptom checklist are ticked. */
  symptomCount: number;
  /** The falls answer, verbatim, or null if unanswered. */
  falls: string | null;
  affectedSide: string | null;
};

export function neuroSnapshot({
  questions,
  data,
}: {
  questions: IntakeQuestion[];
  data: Record<string, string>;
}): NeuroSnapshot {
  const independenceRaw = Number.parseInt(data.neuro_independence ?? "", 10);
  const text = (key: string) => {
    const value = (data[key] ?? "").trim();
    return value || null;
  };
  return {
    ...intakeCompletion({ questions, data }),
    independence: Number.isFinite(independenceRaw) ? independenceRaw : null,
    mobility: text("neuro_mobility"),
    symptomCount: parseMultiSelect(data.neuro_symptoms).length,
    falls: text("neuro_falls"),
    affectedSide: text("neuro_affected_side"),
  };
}

// --- Paediatric -----------------------------------------------------------

export type PediatricsSnapshot = IntakeCompletion & {
  /** Milestones ticked and how many there are to tick -- this specialty's
   *  trended figure, standing where the ortho pain score stands. */
  milestonesReached: number;
  milestonesTotal: number;
  birthHistory: string | null;
  diagnosis: string | null;
  /** Who answered, for the "speaking for" line. Null when the caregiver
   *  pre-step has not been filled. */
  caregiver: { name: string; relationship: string } | null;
};

export function pediatricsSnapshot({
  questions,
  data,
}: {
  questions: IntakeQuestion[];
  data: Record<string, string>;
}): PediatricsSnapshot {
  const text = (key: string) => {
    const value = (data[key] ?? "").trim();
    return value || null;
  };
  const milestoneQuestion = questions.find((q) => q.key === "peds_milestones");
  const caregiverName = text("peds_caregiver_name");
  return {
    ...intakeCompletion({ questions, data }),
    milestonesReached: parseMultiSelect(data.peds_milestones).length,
    milestonesTotal: milestoneQuestion?.options?.length ?? 0,
    birthHistory: text("peds_birth_history"),
    diagnosis: text("peds_diagnosis"),
    caregiver: caregiverName
      ? { name: caregiverName, relationship: text("peds_caregiver_relationship") ?? "" }
      : null,
  };
}

// --- The progress line for the two specialties with no exam layer --------
//
// Ortho gets its trend from the Pain Map (painTrendSeries above). Neuro
// and paediatrics have no exam layer yet, so without this their charts
// would be a summary card and nothing that moves.
//
// The series comes free from data already on file: every approved
// submission is a dated row in condition_change_requests, so the figure
// each specialty already treats as its headline can be read back out of
// them in order. No new table, no cron -- and this is the seam a real
// neuro/paediatric exam layer plugs into later.
export type IntakeTrendRow = {
  proposed_data: Record<string, string> | null;
  reviewed_at: string | null;
  created_at: string;
  status: string;
};

export type IntakeTrendPoint = {
  date: string;
  /** 0-10 for neuro (independence), 0-N for paediatrics (milestones). */
  value: number;
};

export function intakeTrendSeries(
  rows: IntakeTrendRow[],
  specialty: "neuro" | "pediatrics"
): IntakeTrendPoint[] {
  const points: IntakeTrendPoint[] = [];
  for (const row of rows) {
    if (row.status !== "approved" || !row.proposed_data) continue;
    const at = row.reviewed_at ?? row.created_at;
    if (!at) continue;
    const value =
      specialty === "neuro"
        ? Number.parseInt(row.proposed_data.neuro_independence ?? "", 10)
        : parseMultiSelect(row.proposed_data.peds_milestones).length;
    // A submission that did not answer the headline question tells us
    // nothing about the trend, so it is skipped rather than plotted as a
    // zero -- which would read as a collapse.
    if (!Number.isFinite(value)) continue;
    if (specialty === "pediatrics" && !row.proposed_data.peds_milestones) continue;
    points.push({ date: at.slice(0, 10), value });
  }
  // One point per day, last submission of that day wins.
  const byDate = new Map<string, number>();
  for (const p of points) byDate.set(p.date, p.value);
  return Array.from(byDate.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
