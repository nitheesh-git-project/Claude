import { PAIN_BAND_LABEL, formatPainOutOfTen } from "@/lib/painMap";
import StatStrip, { StripProgress, type StatCell } from "@/components/dashboard/StatStrip";
import type { OrthoSnapshot } from "@/lib/healthProfileSummary";

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

/**
 * The ORTHOPAEDIC four figures, in the shared dashboard strip (StatStrip)
 * so they line up with the therapist's, hospital's and admin's. One of
 * three, picked by SpecialtySnapshotStrip.
 *
 * Deliberately mixes the two datasets in one row even though they're
 * separate layers (self-report 0-10 vs clinical 0-100%): a patient thinks
 * of it as one condition, and keeping the units and the labels distinct is
 * what stops them being read as the same measurement.
 */
export default function OrthoSnapshotStrip({ snapshot }: { snapshot: OrthoSnapshot }) {
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

  const cells: StatCell[] = [
    {
      label: "How you rate it",
      value: selfSeverity === null ? "—" : String(selfSeverity),
      unit: selfSeverity === null ? undefined : "/ 10",
      note:
        selfSeverity === null
          ? "You haven't answered this yet"
          : `${SELF_SEVERITY_WORD(selfSeverity)} — in your words`,
      accent: "bg-teal-500",
    },
    {
      label: "Areas you marked",
      value: String(selfAreas),
      unit: selfAreas === 1 ? "area" : "areas",
      note: selfAreas === 0 ? "Nothing marked on the body map yet" : "Where you said it hurts",
      accent: "bg-blue-500",
    },
    {
      label: "Last exam found",
      value: clinicalPercent === null ? "—" : formatPainOutOfTen(clinicalPercent),
      note:
        clinicalPercent === null
          ? "Fills in after your therapist examines you"
          : `${PAIN_BAND_LABEL[clinicalBand!]} · ${TREND_NOTE[clinicalTrend ?? "new"]}`,
      accent:
        clinicalBand === "high" ? "bg-red-500" : clinicalBand === "mid" ? "bg-amber-500" : "bg-emerald-500",
      valueClass: clinicalBand ? BAND_TEXT[clinicalBand] : "text-slate-800",
    },
    {
      label: "Areas examined",
      value: String(regionsAssessed),
      unit: regionsAssessed === 1 ? "area" : "areas",
      note: lastAssessedAt
        ? `Last checked ${new Date(lastAssessedAt).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          })}`
        : "No exam on record yet",
      accent: "bg-slate-400",
    },
  ];

  return (
    <StatStrip
      cells={cells}
      footer={
        <StripProgress
          percent={completionPercent}
          caption={`${answered} of ${totalQuestions} questions answered`}
        />
      }
    />
  );
}
