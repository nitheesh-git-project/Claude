import StatStrip, { StripProgress, type StatCell } from "@/components/dashboard/StatStrip";
import type { PediatricsSnapshot } from "@/lib/healthProfileSummary";

// The PAEDIATRIC four figures. Milestones stand where the orthopaedic
// pain score stands -- they are what this specialty measures progress by.
//
// As with the neurological strip, there is no clinical column: the Pain
// Map is an orthopaedic layer and the paediatric exam layer is not built.
// The fourth cell names who is speaking for the child instead, which a
// second clinician reading this chart needs and no other specialty has.

export default function PediatricsSnapshotStrip({
  snapshot,
  showProgress = true,
}: {
  snapshot: PediatricsSnapshot;
  showProgress?: boolean;
}) {
  const {
    milestonesReached,
    milestonesTotal,
    birthHistory,
    diagnosis,
    caregiver,
    answered,
    totalQuestions,
    completionPercent,
  } = snapshot;

  const cells: StatCell[] = [
    {
      label: "Milestones reached",
      value: String(milestonesReached),
      unit: milestonesTotal > 0 ? `of ${milestonesTotal}` : undefined,
      note:
        milestonesReached === 0
          ? "Fills in once these are ticked"
          : "What your child can do on their own — more is better",
      accent: "bg-emerald-500",
    },
    {
      label: "Born",
      value: birthHistory ?? "—",
      note: birthHistory ? "From your first session" : "Not answered yet",
      accent: "bg-amber-500",
    },
    {
      label: "Diagnosis",
      value: diagnosis ?? "None recorded",
      note: diagnosis ? "What a doctor has said" : "Nothing on file — that is common",
      accent: "bg-blue-500",
      valueClass: diagnosis ? "text-slate-800" : "text-slate-500",
    },
    {
      label: "Answered by",
      value: caregiver?.name ?? "—",
      note: caregiver?.relationship
        ? `Your child's ${caregiver.relationship.toLowerCase()}`
        : "Not answered yet",
      accent: "bg-slate-400",
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
