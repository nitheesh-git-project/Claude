import { PAIN_BAND_LABEL } from "@/lib/painMap";
import type { HealthSnapshot } from "@/lib/healthProfileSummary";

const SELF_SEVERITY_WORD = (value: number) => (value <= 3 ? "Mild" : value <= 6 ? "Moderate" : "Severe");

const TREND_NOTE: Record<string, string> = {
  down: "Improving since last exam",
  up: "Worse than last exam",
  flat: "Unchanged since last exam",
  new: "First exam on record",
};

const BAND_TEXT: Record<string, string> = {
  low: "text-emerald-600",
  mid: "text-amber-600",
  high: "text-red-600",
};

function Cell({
  label,
  value,
  unit,
  note,
  accent = "bg-slate-300",
  valueClass = "text-slate-800",
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  accent?: string;
  valueClass?: string;
}) {
  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="flex items-center gap-1.5">
        <span aria-hidden className={`h-2.5 w-1 rounded-full ${accent}`} />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      </div>
      <p className="mt-1 flex items-baseline gap-1">
        <span className={`font-display text-2xl font-bold leading-none ${valueClass}`}>{value}</span>
        {unit && <span className="text-xs font-semibold text-slate-400">{unit}</span>}
      </p>
      {note && <p className="mt-1 text-[11px] leading-snug text-slate-500">{note}</p>}
    </div>
  );
}

/**
 * The one-line answer to "how am I doing?", above everything else on the
 * Health Profile: what the patient said, what the last exam found, and
 * how much of the profile is filled in. Everything below the strip is
 * the detail behind these four numbers.
 *
 * Deliberately mixes the two datasets in one row even though they're
 * separate layers (self-report 0-10 vs clinical 0-100%): a patient
 * thinks of it as one condition, and keeping the units and the labels
 * distinct is what stops them being read as the same measurement.
 */
export default function HealthSnapshotStrip({ snapshot }: { snapshot: HealthSnapshot }) {
  const {
    selfSeverity,
    selfAreas,
    clinicalPercent,
    clinicalBand,
    clinicalTrend,
    regionsAssessed,
    lastAssessedAt,
    answered,
    totalQuestions,
    completionPercent,
  } = snapshot;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-4 sm:divide-y-0">
        <Cell
          label="How you rate it"
          value={selfSeverity === null ? "—" : String(selfSeverity)}
          unit={selfSeverity === null ? undefined : "/ 10"}
          note={selfSeverity === null ? "You haven't answered this yet" : `${SELF_SEVERITY_WORD(selfSeverity)} — in your words`}
          accent="bg-teal-500"
        />
        <Cell
          label="Areas you marked"
          value={String(selfAreas)}
          unit={selfAreas === 1 ? "area" : "areas"}
          note={selfAreas === 0 ? "Nothing marked on the body map yet" : "Where you said it hurts"}
          accent="bg-blue-500"
        />
        <Cell
          label="Last exam found"
          value={clinicalPercent === null ? "—" : `${clinicalPercent}%`}
          note={
            clinicalPercent === null
              ? "Fills in after your therapist examines you"
              : `${PAIN_BAND_LABEL[clinicalBand!]} · ${TREND_NOTE[clinicalTrend ?? "new"]}`
          }
          accent={clinicalBand === "high" ? "bg-red-500" : clinicalBand === "mid" ? "bg-amber-500" : "bg-emerald-500"}
          valueClass={clinicalBand ? BAND_TEXT[clinicalBand] : "text-slate-800"}
        />
        <Cell
          label="Areas examined"
          value={String(regionsAssessed)}
          unit={regionsAssessed === 1 ? "area" : "areas"}
          note={
            lastAssessedAt
              ? `Last checked ${new Date(lastAssessedAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })}`
              : "No exam on record yet"
          }
          accent="bg-slate-400"
        />
      </div>

      <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-teal-600 transition-all duration-500"
            style={{ width: `${completionPercent}%` }}
          />
        </div>
        <p className="shrink-0 text-[11px] font-semibold text-slate-500">
          {answered} of {totalQuestions} questions answered
        </p>
      </div>
    </div>
  );
}
