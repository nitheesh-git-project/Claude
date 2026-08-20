import {
  PAIN_MAP_REGIONS,
  latestAssessmentByRegionSide,
  painBand,
  painTrend,
  type PainAssessmentRow,
  type PainBand,
  type PainTrend,
} from "@/lib/painMap";
import { countAnswered, parseAreaPain, type IntakeQuestion } from "@/lib/conditionIntake";

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

export type HealthSnapshot = {
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
  answered: number;
  totalQuestions: number;
  /** 0-100, for the completeness ring. */
  completionPercent: number;
};

export function healthSnapshot({
  questions,
  data,
  assessments,
}: {
  questions: IntakeQuestion[];
  data: Record<string, string>;
  assessments: PainAssessmentRow[];
}): HealthSnapshot {
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
  const answered = countAnswered(questions, data);

  return {
    selfSeverity: Number.isFinite(severityRaw) ? severityRaw : null,
    selfAreas: parseAreaPain(data.area_pain).length,
    clinicalPercent: latestPoint?.percent ?? null,
    clinicalBand: latestPoint ? painBand(latestPoint.percent) : null,
    clinicalTrend: latestPoint ? painTrend(latestPoint.percent, previousPoint?.percent ?? null) : null,
    regionsAssessed: standings.length,
    lastAssessedAt,
    answered,
    totalQuestions: questions.length,
    completionPercent: questions.length === 0 ? 0 : Math.round((answered / questions.length) * 100),
  };
}
