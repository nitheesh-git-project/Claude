import OrthoSummaryCard from "@/components/profile/OrthoSummaryCard";
import NeuroSummaryCard from "@/components/profile/NeuroSummaryCard";
import PediatricsSummaryCard from "@/components/profile/PediatricsSummaryCard";
import type { IntakeQuestion } from "@/lib/conditionIntake";
import type { ConditionSpecialty } from "@/lib/conditionSpecialty";

// Picks the summary card for a profile's specialty.
//
// A `switch` with a `never` default rather than a
// Record<ConditionSpecialty, Component> map, deliberately: the switch is
// exhaustiveness-checked, so adding a fourth specialty makes the compiler
// point at this file and at every other site that has to choose, instead
// of a map silently returning undefined.
export default function SpecialtySummary({
  specialty,
  questions,
  data,
}: {
  specialty: ConditionSpecialty;
  questions: IntakeQuestion[];
  data: Record<string, string>;
}) {
  switch (specialty) {
    case "ortho":
      return <OrthoSummaryCard questions={questions} data={data} />;
    case "neuro":
      return <NeuroSummaryCard questions={questions} data={data} />;
    case "pediatrics":
      return <PediatricsSummaryCard questions={questions} data={data} />;
    default: {
      const exhaustive: never = specialty;
      return exhaustive;
    }
  }
}
