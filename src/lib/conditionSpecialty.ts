import type { IntakeQuestion } from "@/lib/conditionIntake";

// Which kind of patient a condition profile is a record of. The Patient
// Care Intake used to be one fixed set of seven questions whose every
// derived figure -- severity gauge, pain-area chips, Pain Map comparison,
// trend line -- was a *pain* measure. That fits an orthopaedic patient and
// nobody else: a stroke patient's recovery is measured by independence and
// gait, a child's by milestones reached.
//
// This module is deliberately the smallest one in the family. adminSettings,
// dashboardFeed and the nav all need the vocabulary; none of them should
// pull twenty long helpText strings into their graph to get it, so the
// question sets live in intakeOrtho/intakeNeuro/intakePediatrics and are
// assembled in conditionIntake.ts.
export type ConditionSpecialty = "ortho" | "neuro" | "pediatrics";

export const DEFAULT_CONDITION_SPECIALTY: ConditionSpecialty = "ortho";

export type ConditionSpecialtyDef = {
  key: ConditionSpecialty;
  /** What a clinician and an admin call it. */
  label: string;
  /** What the patient is shown. We name the care, not the category -- a
   *  caregiver answering for a child is never shown the word "pediatrics"
   *  about their own child. */
  patientLabel: string;
  /** One line for the triage picker: who this set is for. */
  blurb: string;
  icon: string;
  /** Tailwind classes for the specialty chip, so the colour of a specialty
   *  is decided once rather than per surface. */
  chipClass: string;
  accent: string;
};

// The one place a specialty's name and colour live -- the adminNav.ts /
// marketingNav.ts pattern. Order is the order the triage picker shows them.
export const CONDITION_SPECIALTIES: ConditionSpecialtyDef[] = [
  {
    key: "ortho",
    label: "Orthopaedic",
    patientLabel: "Orthopaedic care",
    blurb: "Pain, injury, joints, muscles, post-surgical recovery.",
    icon: "fa-bone",
    chipClass: "border-teal-200 bg-teal-50 text-teal-700",
    accent: "bg-teal-500",
  },
  {
    key: "neuro",
    label: "Neurological",
    patientLabel: "Neurological care",
    blurb: "Stroke, spinal or brain injury, Parkinson's, MS, neuropathy.",
    icon: "fa-brain",
    chipClass: "border-violet-200 bg-violet-50 text-violet-700",
    accent: "bg-violet-500",
  },
  {
    key: "pediatrics",
    label: "Paediatric",
    // The owner's word, chosen deliberately over "Children's
    // physiotherapy": the clinic calls this paediatric on its own catalogue,
    // and one name across the catalogue, the picker and this panel beats a
    // warmer word that makes a parent wonder whether the two are the same
    // service. Spelled the British way to match "Orthopaedic" beside it.
    patientLabel: "Paediatric physiotherapy",
    blurb: "Children: delayed milestones, conditions from birth or childhood.",
    icon: "fa-child-reaching",
    chipClass: "border-amber-200 bg-amber-50 text-amber-700",
    accent: "bg-amber-500",
  },
];

const BY_KEY = new Map(CONDITION_SPECIALTIES.map((s) => [s.key, s]));

export function isConditionSpecialty(value: unknown): value is ConditionSpecialty {
  return typeof value === "string" && BY_KEY.has(value as ConditionSpecialty);
}

/** Never throws: an unknown or missing value reads as ortho, which is what
 *  every row written before specialties existed actually is. */
export function parseConditionSpecialty(value: unknown): ConditionSpecialty {
  return isConditionSpecialty(value) ? value : DEFAULT_CONDITION_SPECIALTY;
}

export function specialtyDef(specialty: ConditionSpecialty): ConditionSpecialtyDef {
  return BY_KEY.get(specialty) ?? CONDITION_SPECIALTIES[0];
}

export const specialtyLabel = (s: ConditionSpecialty) => specialtyDef(s).label;
export const specialtyPatientLabel = (s: ConditionSpecialty) => specialtyDef(s).patientLabel;

// --- Triage ---------------------------------------------------------------
//
// Four questions the therapist asks at first contact. Their only job is to
// route -- they are not part of any specialty's set, are stored apart from
// the patient's own answers (patient_condition_profiles.triage_data), and
// are never rendered to the patient as their record.

export const TRIAGE_AGE_UNDER_18 = "Under 18";
export const TRIAGE_NEURO_NONE = "None of these";
export const TRIAGE_PROBLEM_DEVELOPMENT = "Delayed development or a condition present from birth or childhood";
export const TRIAGE_PROBLEM_STROKE = "After a stroke, brain or spinal injury";
export const TRIAGE_PROBLEM_LONGTERM_NEURO = "A long-term neurological condition (Parkinson's, MS, neuropathy)";

export const TRIAGE_QUESTIONS: IntakeQuestion[] = [
  {
    key: "age_band",
    label: "How old is the patient?",
    shortLabel: "Age",
    helpText:
      "Age on its own does not decide the answer, but it changes what the rest of these questions mean.",
    inputType: "select",
    options: [TRIAGE_AGE_UNDER_18, "18 to 64", "65 or older"],
    required: true,
  },
  {
    key: "presenting_problem",
    label: "What brought them in?",
    shortLabel: "Presenting problem",
    helpText: "The single best description of why they are here. Pick the closest one.",
    inputType: "select",
    options: [
      "Injury, strain or overuse",
      "After surgery or a fracture",
      TRIAGE_PROBLEM_STROKE,
      TRIAGE_PROBLEM_LONGTERM_NEURO,
      TRIAGE_PROBLEM_DEVELOPMENT,
      "A long-standing ache with no clear cause",
    ],
    required: true,
  },
  {
    key: "neuro_signs",
    label: "Any of these present?",
    shortLabel: "Neurological signs",
    helpText:
      "Tick everything you can see or the patient reports. Neurological problems show up in clusters, and the cluster is what separates them from a musculoskeletal complaint.",
    inputType: "multi_select",
    options: [
      "Weakness on one side",
      "Numbness or altered sensation",
      "Difficulty with balance or walking",
      "Tremor, stiffness or spasticity",
      "Difficulty speaking or swallowing",
      TRIAGE_NEURO_NONE,
    ],
    required: false,
  },
  {
    key: "development_concern",
    label:
      "Any concern about milestones — sitting, standing, walking, speech — or a condition diagnosed at or since birth?",
    shortLabel: "Development concern",
    helpText:
      "Only asked for a child. This is what separates a paediatric case from a child with an ordinary sprain: under 18 on its own is not a paediatric referral.",
    inputType: "select",
    options: ["Yes", "No", "Not sure"],
    required: false,
    /** Only shown when age_band is Under 18 -- see TRIAGE_QUESTIONS' own
     *  consumer, ConditionTriageDialog. */
    showWhen: { key: "age_band", equals: TRIAGE_AGE_UNDER_18 },
  },
];

export type SpecialtySuggestion = {
  suggested: ConditionSpecialty;
  /** Why, in one sentence, shown beside the suggestion. A suggestion whose
   *  reasoning a clinician cannot see is one they ignore. */
  because: string;
};

/** Suggests a specialty from the triage answers. A suggestion only -- the
 *  therapist always confirms and can always override, so this deliberately
 *  has no notion of confidence and never picks on the patient's behalf. */
export function suggestSpecialtyFromTriage(
  answers: Record<string, string>
): SpecialtySuggestion {
  const age = (answers.age_band ?? "").trim();
  const problem = (answers.presenting_problem ?? "").trim();
  const development = (answers.development_concern ?? "").trim();
  const signs = (answers.neuro_signs ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && s !== TRIAGE_NEURO_NONE);

  const isChild = age === TRIAGE_AGE_UNDER_18;

  if (isChild && (development === "Yes" || problem === TRIAGE_PROBLEM_DEVELOPMENT)) {
    return {
      suggested: "pediatrics",
      because:
        development === "Yes"
          ? "A child with a concern about milestones or a condition present from birth."
          : "A child referred for delayed development.",
    };
  }

  if (problem === TRIAGE_PROBLEM_STROKE || problem === TRIAGE_PROBLEM_LONGTERM_NEURO) {
    return { suggested: "neuro", because: `Referred for ${problem.toLowerCase()}.` };
  }

  if (signs.length > 0) {
    return {
      suggested: "neuro",
      because: `Neurological signs present: ${signs.join(", ").toLowerCase()}.`,
    };
  }

  return {
    suggested: "ortho",
    because: isChild
      ? "A child with a musculoskeletal complaint and no developmental concern — under 18 on its own is not a paediatric case."
      : "A musculoskeletal complaint with no neurological signs.",
  };
}
