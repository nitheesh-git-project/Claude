import PainMapExplorer from "@/components/profile/PainMapExplorer";
import type { AreaPainEntry } from "@/lib/conditionIntake";
import { CONDITION_SPECIALTIES, type ConditionSpecialty } from "@/lib/conditionSpecialty";
import type { PainAssessmentRow, QuestionOverrideRow } from "@/lib/painMap";
import NeuroExamPanel from "@/components/profile/neuro/NeuroExamPanel";
import type { NeuroAssessmentRow } from "@/lib/neuroExam";

// The clinician's examination layer for a profile's specialty.
//
// Two arms are real. The Pain Map -- seventeen body regions, twenty exam
// questions, a 0-100 pain percentage per region -- is an ORTHOPAEDIC
// instrument and stays one. The neurological examination (tone, power,
// reflexes, sensation, coordination, balance and gait; src/lib/neuroExam.ts,
// neuro_assessments) is its own table and its own module, never a
// `specialty` column on pain_assessments, so neither reader branches on the
// other's data. A paediatric exam measures milestones and posture, fits
// neither, and is still deferred -- building it is one more arm here, the
// way the neurological one was.
//
// The pages never query a layer the specialty does not render: an
// orthopaedic page never reads neuro_assessments and a neurological one
// never reads pain_assessments, which is why each arm takes its own props
// rather than being handed an empty array.
export default function SpecialtyExamPanel({
  specialty,
  assessments,
  areaPain,
  record,
  neuro,
  voice = "patient",
}: {
  specialty: ConditionSpecialty;
  assessments: PainAssessmentRow[];
  areaPain: AreaPainEntry[];
  record?: {
    endpoint: string;
    patientId: string;
    overridesByRegion: Record<string, QuestionOverrideRow[]>;
  };
  /** The neurological arm's rows, read only on a neurological page. */
  neuro?: {
    assessments: NeuroAssessmentRow[];
    loadFailed: boolean;
    record?: { endpoint: string; patientId: string; patientName?: string };
  };
  /** Who is reading. Every sentence that addresses someone branches on it:
   *  "your therapist goes through these with you" is nonsense on the
   *  therapist's own screen. */
  voice?: "patient" | "clinician";
}) {
  switch (specialty) {
    case "ortho":
      return <PainMapExplorer assessments={assessments} areaPain={areaPain} record={record} />;
    case "neuro":
      return (
        <NeuroExamPanel
          assessments={neuro?.assessments ?? []}
          loadFailed={neuro?.loadFailed ?? false}
          voice={voice}
          record={neuro?.record}
        />
      );
    case "pediatrics":
      return <DeferredExamNotice specialty={specialty} voice={voice} />;
    default: {
      const exhaustive: never = specialty;
      return exhaustive;
    }
  }
}

function DeferredExamNotice({
  specialty,
  voice,
}: {
  specialty: "pediatrics";
  voice: "patient" | "clinician";
}) {
  const def = CONDITION_SPECIALTIES.find((s) => s.key === specialty);
  const clinician = voice === "clinician";
  const measures = clinician
    ? "posture, movement and milestone progress"
    : "posture, movement and the milestones your child is working towards";

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center">
      <i aria-hidden className={`fa-solid ${def?.icon ?? "fa-notes-medical"} text-xl text-slate-300`} />
      <p className="mt-3 font-display text-base font-bold text-slate-800">
        {clinician
          ? "Record these findings in your session notes for now"
          : "Your therapist goes through these with you"}
      </p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-600">
        The on-screen examination chart for{" "}
        {clinician
          ? (def?.label.toLowerCase() ?? "this condition type")
          : (def?.patientLabel.toLowerCase() ?? "this kind of care")}{" "}
        - {measures} - is still being built.{" "}
        {clinician
          ? "Until it lands, your session note is where these belong; the Pain Map is an orthopaedic instrument and does not fit this condition type."
          : "Until it lands there is nothing to show you here - your therapist talks you through what they found at the end of each session instead."}
      </p>
    </div>
  );
}
