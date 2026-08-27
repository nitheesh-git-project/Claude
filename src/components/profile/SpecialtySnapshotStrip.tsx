import OrthoSnapshotStrip from "@/components/profile/OrthoSnapshotStrip";
import NeuroSnapshotStrip from "@/components/profile/NeuroSnapshotStrip";
import PediatricsSnapshotStrip from "@/components/profile/PediatricsSnapshotStrip";
import {
  neuroSnapshot,
  orthoSnapshot,
  pediatricsSnapshot,
} from "@/lib/healthProfileSummary";
import type { IntakeQuestion } from "@/lib/conditionIntake";
import type { ConditionSpecialty } from "@/lib/conditionSpecialty";
import type { PainAssessmentRow } from "@/lib/painMap";

// Picks the four-figure strip for a profile's specialty, and builds its
// figures from the matching *Snapshot function -- never inside the strip
// component, per the "business math lives in dependency-free src/lib
// modules" rule.
//
// `assessments` is only ever non-empty for ortho: the Pain Map is an
// orthopaedic layer, and the pages do not even query it for the other two.
// Same exhaustiveness-checked switch as SpecialtySummary.
export default function SpecialtySnapshotStrip({
  specialty,
  questions,
  data,
  assessments,
  showProgress = true,
}: {
  specialty: ConditionSpecialty;
  questions: IntakeQuestion[];
  data: Record<string, string>;
  assessments: PainAssessmentRow[];
  /** False where the panel below already prints the count. Two statements
   *  of one figure, in different words, on one screen is the redundancy
   *  this page keeps collecting. */
  showProgress?: boolean;
}) {
  switch (specialty) {
    case "ortho":
      return <OrthoSnapshotStrip showProgress={showProgress} snapshot={orthoSnapshot({ questions, data, assessments })} />;
    case "neuro":
      return <NeuroSnapshotStrip showProgress={showProgress} snapshot={neuroSnapshot({ questions, data })} />;
    case "pediatrics":
      return <PediatricsSnapshotStrip showProgress={showProgress} snapshot={pediatricsSnapshot({ questions, data })} />;
    default: {
      const exhaustive: never = specialty;
      return exhaustive;
    }
  }
}
