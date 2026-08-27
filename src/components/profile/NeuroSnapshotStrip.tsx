import StatStrip, { StripProgress, type StatCell } from "@/components/dashboard/StatStrip";
import type { NeuroSnapshot } from "@/lib/healthProfileSummary";

// The NEUROLOGICAL four figures. Same StatStrip, same four-cell contract
// as every other dashboard strip -- different figures, because a stroke
// patient's recovery is not measured in pain.
//
// There is no clinical column here yet: the Pain Map is an orthopaedic
// layer and the neurological exam layer is not built. Rather than print an
// empty "Last exam found —", the fourth cell reports what the record does
// know (falls), and the deferred exam is stated once, in
// SpecialtyExamPanel, where the exam would be.

const INDEPENDENCE_WORD = (value: number) =>
  value <= 3 ? "Needs a lot of help" : value <= 6 ? "Partly independent" : "Mostly independent";

// Higher is better, so the colours run the opposite way to a pain score.
const INDEPENDENCE_TEXT = (value: number) =>
  value <= 3 ? "text-red-600" : value <= 6 ? "text-amber-600" : "text-emerald-600";

const INDEPENDENCE_ACCENT = (value: number) =>
  value <= 3 ? "bg-red-500" : value <= 6 ? "bg-amber-500" : "bg-emerald-500";

export default function NeuroSnapshotStrip({ snapshot, showProgress = true }: { snapshot: NeuroSnapshot; showProgress?: boolean }) {
  const { independence, mobility, symptomCount, falls, answered, totalQuestions, completionPercent } =
    snapshot;

  const fallsAreConcerning = !!falls && (falls.startsWith("Two") || falls.startsWith("More"));

  const cells: StatCell[] = [
    {
      label: "Independence",
      value: independence === null ? "—" : String(independence),
      unit: independence === null ? undefined : "/ 10",
      note:
        independence === null
          ? "Your therapist records this with you"
          : `${INDEPENDENCE_WORD(independence)} — day to day`,
      accent: independence === null ? "bg-slate-400" : INDEPENDENCE_ACCENT(independence),
      valueClass: independence === null ? "text-slate-800" : INDEPENDENCE_TEXT(independence),
    },
    {
      label: "Getting around",
      value: mobility ?? "—",
      note: mobility ? "Indoors, right now" : "Not answered yet",
      accent: "bg-violet-500",
    },
    {
      label: "Symptoms present",
      value: String(symptomCount),
      unit: symptomCount === 1 ? "symptom" : "symptoms",
      note: symptomCount === 0 ? "Nothing ticked yet" : "Fewer is better",
      accent: "bg-blue-500",
    },
    {
      label: "Falls",
      value: falls ?? "—",
      note: falls ? "In the last three months" : "Not answered yet",
      accent: fallsAreConcerning ? "bg-red-500" : "bg-slate-400",
      valueClass: fallsAreConcerning ? "text-red-600" : "text-slate-800",
    },
  ];

  return (
    <StatStrip
      cells={cells}
      footer={
        showProgress ? (
          <StripProgress
            percent={completionPercent}
            caption={`${answered} of ${totalQuestions} questions answered`}
          />
        ) : undefined
      }
    />
  );
}
