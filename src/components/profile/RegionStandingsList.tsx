import { PAIN_BAND_LABEL, formatPainOutOfTen } from "@/lib/painMap";
import { regionStandings } from "@/lib/healthProfileSummary";
import type { PainAssessmentRow } from "@/lib/painMap";

const BAR: Record<string, string> = {
  low: "bg-emerald-500",
  mid: "bg-amber-500",
  high: "bg-red-500",
};

const TEXT: Record<string, string> = {
  low: "text-emerald-700",
  mid: "text-amber-700",
  high: "text-red-700",
};

const TREND_LABEL: Record<string, string> = {
  down: "Better than last time",
  up: "Worse than last time",
  flat: "Same as last time",
  new: "First reading",
};

const TREND_ICON: Record<string, string> = {
  down: "fa-arrow-down",
  up: "fa-arrow-up",
  flat: "fa-minus",
  new: "fa-star",
};

const TREND_TONE: Record<string, string> = {
  down: "text-emerald-600",
  up: "text-red-600",
  flat: "text-slate-400",
  new: "text-slate-400",
};

/**
 * The exam results as a ranked list — worst area first, each with a bar
 * you can compare across rows at a glance and a plain-English trend.
 * The body map answers "where"; this answers "how bad, and is it moving",
 * which is the question a patient actually asks of their own chart.
 */
export default function RegionStandingsList({ assessments }: { assessments: PainAssessmentRow[] }) {
  const standings = regionStandings(assessments);

  if (standings.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Your therapist hasn&apos;t recorded an exam yet — this fills in on its own after your first session.
      </p>
    );
  }

  return (
    <ul className="space-y-2.5">
      {standings.map((s) => (
        <li key={s.key}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-slate-700">{s.label}</p>
            <p className={`shrink-0 text-xs font-bold ${TEXT[s.band]}`}>
              {formatPainOutOfTen(s.percent)} · {PAIN_BAND_LABEL[s.band]}
            </p>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${BAR[s.band]}`} style={{ width: `${s.percent}%` }} />
          </div>
          <p className={`mt-1 flex items-center gap-1.5 text-[11px] ${TREND_TONE[s.trend]}`}>
            <i aria-hidden className={`fa-solid ${TREND_ICON[s.trend]} text-[9px]`} />
            {TREND_LABEL[s.trend]}
            <span className="text-slate-400">
              · checked{" "}
              {new Date(s.assessedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
            </span>
          </p>
        </li>
      ))}
    </ul>
  );
}
