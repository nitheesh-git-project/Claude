"use client";

import { useMemo, useState } from "react";
import ConditionTriageDialog from "@/components/profile/ConditionTriageDialog";
import ConditionIntakeWizard from "@/components/profile/ConditionIntakeWizard";
import {
  mergeIntakeQuestionOverrides,
  questionsForSpecialty,
  type IntakeQuestionOverrideRow,
} from "@/lib/conditionIntake";
import {
  CONDITION_SPECIALTIES,
  type ConditionSpecialty,
} from "@/lib/conditionSpecialty";

// Patient onboarding, and later re-triage, on the therapist's own view of
// a patient's chart.
//
// Deliberately not a new sidebar entry. The onboarding queue is the same
// rows My Patients already lists, filtered -- "a different way of looking
// at the same rows is a view switch, not a sidebar entry". It is found
// from the feed item and the directory chip, and done here, on the page a
// therapist already opens to prepare for a session.
//
// The two steps are one continuous pop-up: triage, then straight into that
// specialty's questions, never "close this, now click that". The second
// step reuses ConditionIntakeWizard unchanged -- its plain-language help
// text is exactly what a clinician wants to read aloud to the patient --
// and carries the specialty through `extraPayload` so the wizard itself
// stays ignorant of specialties.
export default function PatientOnboardingCard({
  patientId,
  patientName,
  currentSpecialty,
  enabledSpecialties,
  overrideRows,
  initialTriage,
  initialAnswers,
  draftSpecialty,
}: {
  patientId: string;
  patientName: string;
  /** Null until a therapist has onboarded this patient. */
  currentSpecialty: ConditionSpecialty | null;
  enabledSpecialties: ConditionSpecialty[];
  overrideRows: IntakeQuestionOverrideRow[];
  initialTriage?: Record<string, string>;
  /** An abandoned fill, so re-opening resumes rather than restarts. */
  initialAnswers?: Record<string, string>;
  draftSpecialty?: ConditionSpecialty | null;
}) {
  const [step, setStep] = useState<"idle" | "triage" | "questions">("idle");
  const [chosen, setChosen] = useState<ConditionSpecialty | null>(null);
  const [triageData, setTriageData] = useState<Record<string, string>>(initialTriage ?? {});

  const isRetriage = !!currentSpecialty;

  const questions = useMemo(
    () =>
      chosen
        ? mergeIntakeQuestionOverrides(questionsForSpecialty(chosen), overrideRows, chosen)
        : [],
    [chosen, overrideRows]
  );

  // Only resume a draft that was for the specialty just picked. An
  // abandoned neuro fill must not prefill an ortho form -- the keys are
  // disjoint, so it would silently submit nothing.
  const resumeAnswers = chosen && draftSpecialty === chosen ? initialAnswers : undefined;

  function close() {
    setStep("idle");
    setChosen(null);
  }

  return (
    <div>
      {isRetriage ? (
        <RetriagePrompt
          specialty={currentSpecialty}
          onStart={() => setStep("triage")}
        />
      ) : (
        <FirstFillPrompt patientName={patientName} onStart={() => setStep("triage")} />
      )}

      {step === "triage" && (
        <ConditionTriageDialog
          currentSpecialty={currentSpecialty}
          enabledSpecialties={enabledSpecialties}
          initialTriage={triageData}
          onCancel={close}
          onConfirm={(specialty, answers) => {
            setChosen(specialty);
            setTriageData(answers);
            setStep("questions");
          }}
        />
      )}

      {step === "questions" && chosen && (
        <ConditionIntakeWizard
          questions={questions}
          endpoint="/api/therapist/condition-profile/onboard"
          draftEndpoint="/api/therapist/condition-profile/save-draft"
          patientId={patientId}
          extraPayload={{ specialty: chosen, triageData }}
          voice="clinician"
          initialData={resumeAnswers ?? {}}
          onClose={close}
        />
      )}
    </div>
  );
}

function FirstFillPrompt({
  patientName,
  onStart,
}: {
  patientName: string;
  onStart: () => void;
}) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
      <div className="flex items-start gap-3">
        <i aria-hidden className="fa-solid fa-clipboard-question mt-0.5 text-sm text-amber-600" />
        <div className="min-w-0">
          <p className="font-display text-base font-bold text-slate-800">
            {patientName.split(" ")[0]} needs onboarding
          </p>
          <p className="mt-1 max-w-md text-sm text-slate-600">
            Four questions to decide the condition type — orthopaedic, neurological or paediatric
            — then that type&apos;s own short set of seven. Go through it with them in the first
            session: it goes on their record straight away, and it is what opens their Health
            Profile to them. You can change the condition type later if the case turns out to be
            something else.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onStart}
        className="mt-4 rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-800"
      >
        Start onboarding
      </button>
    </div>
  );
}

function RetriagePrompt({
  specialty,
  onStart,
}: {
  specialty: ConditionSpecialty;
  onStart: () => void;
}) {
  const def = CONDITION_SPECIALTIES.find((s) => s.key === specialty);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3">
      <p className="text-xs text-slate-600">
        Recorded as{" "}
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${def?.chipClass ?? ""}`}>
          {def?.label}
        </span>{" "}
        — change it if the case turned out to be something else.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="shrink-0 rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white"
      >
        Change condition type
      </button>
    </div>
  );
}
