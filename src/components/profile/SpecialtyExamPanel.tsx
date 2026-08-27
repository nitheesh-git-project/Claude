import PainMapExplorer from "@/components/profile/PainMapExplorer";
import type { AreaPainEntry } from "@/lib/conditionIntake";
import { CONDITION_SPECIALTIES, type ConditionSpecialty } from "@/lib/conditionSpecialty";
import type { PainAssessmentRow, QuestionOverrideRow } from "@/lib/painMap";

// The clinician's examination layer for a profile's specialty.
//
// Today exactly one arm is real. The Pain Map -- seventeen body regions,
// twenty exam questions, a 0-100 pain percentage per region -- is an
// ORTHOPAEDIC instrument and stays one. A neurological exam measures tone,
// power, reflexes, balance and gait; a paediatric one measures milestones
// and posture. Neither fits a body map with a pain score on it, so neither
// gets one.
//
// This component exists now, with two placeholder arms, precisely so that
// building those layers later is one more arm here rather than a rewrite
// of both health-profile pages. When that happens:
//
//   - it is a NEW table (neuro_assessments), never a `specialty` column on
//     pain_assessments -- the two record different measurements and
//     sharing a table would mean every reader branching on specialty;
//   - a new question module in src/lib/, a new *Snapshot function beside
//     the others in healthProfileSummary.ts, and one more case below.
//
// Note the pages do not merely hide the Pain Map for non-ortho: they never
// query pain_assessments at all, which is why this takes no assessment
// props on those paths rather than being handed an empty array.
export default function SpecialtyExamPanel({
  specialty,
  assessments,
  areaPain,
  record,
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
  /** Who is reading. The placeholder below is the one piece of copy here
   *  that addresses someone directly, and "your therapist keeps these in
   *  their session notes" is nonsense on the therapist's own screen. */
  voice?: "patient" | "clinician";
}) {
  switch (specialty) {
    case "ortho":
      return <PainMapExplorer assessments={assessments} areaPain={areaPain} record={record} />;
    case "neuro":
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
  specialty: "neuro" | "pediatrics";
  voice: "patient" | "clinician";
}) {
  const def = CONDITION_SPECIALTIES.find((s) => s.key === specialty);
  const clinician = voice === "clinician";
  const measures = clinician
    ? specialty === "neuro"
      ? "tone, power, balance and gait"
      : "posture, movement and milestone progress"
    : specialty === "neuro"
      ? "muscle tone, power, balance and how you walk"
      : "posture, movement and the milestones your child is working towards";

  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-6 text-center">
      <i aria-hidden className={`fa-solid ${def?.icon ?? "fa-notes-medical"} text-xl text-slate-300`} />
      <p className="mt-3 font-display text-base font-bold text-slate-800">
        {clinician
          ? "Record these findings in your session notes for now"
          : "Examination findings are recorded in your notes for now"}
      </p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-600">
        The on-screen examination chart for{" "}
        {def?.patientLabel.toLowerCase() ?? "this kind of care"} — {measures} — is still being
        built.{" "}
        {clinician
          ? "Until it lands, your session note is where these belong; the Pain Map is an orthopaedic instrument and does not fit this case."
          : "Until it lands, your therapist keeps these findings in their session notes and goes through them with you."}
      </p>
    </div>
  );
}
