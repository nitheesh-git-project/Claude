import { describe, expect, it } from "vitest";
import { serializeMultiSelect } from "./conditionIntake";
import {
  CONDITION_SPECIALTY_KEYS,
  DEFAULT_ENABLED_INTAKE_SPECIALTIES,
  TRIAGE_AGE_65_PLUS,
  TRIAGE_AGE_UNDER_18,
  TRIAGE_PROBLEM_FALLS,
  TRIAGE_PROBLEM_HEART_LUNG,
  TRIAGE_PROBLEM_STROKE,
  TRIAGE_QUESTIONS,
  TRIAGE_SIGN_BALANCE,
  specialtyDef,
  suggestSpecialtyFromTriage,
} from "./conditionSpecialty";

// Phase 6a: triage can suggest Strength and balance care and Heart and lung
// rehabilitation -- with its reason, never on the patient's behalf, and only
// a type the dialog is offering.

const ADULT = "18 to 64";
const all = CONDITION_SPECIALTY_KEYS;
const defaults = DEFAULT_ENABLED_INTAKE_SPECIALTIES;

describe("the two new condition types", () => {
  it("are named in the clinician's words and the patient's, never a category word to the patient", () => {
    expect(specialtyDef("geriatric")).toMatchObject({ label: "Geriatric", patientLabel: "Strength and balance care" });
    expect(specialtyDef("cardiopulmonary")).toMatchObject({ label: "Cardiopulmonary", patientLabel: "Heart and lung rehabilitation" });
    for (const key of all) expect(specialtyDef(key).patientLabel.toLowerCase()).not.toMatch(/geriatric|cardiopulmonary|pediatric/);
  });

  it("are off by default: the setting's default is the three original types", () => {
    expect(defaults).toEqual(["ortho", "neuro", "pediatrics"]);
  });

  it("offers the new presenting problems in triage", () => {
    const problem = TRIAGE_QUESTIONS.find((q) => q.key === "presenting_problem")!;
    expect(problem.options).toContain(TRIAGE_PROBLEM_FALLS);
    expect(problem.options).toContain(TRIAGE_PROBLEM_HEART_LUNG);
    expect(TRIAGE_QUESTIONS.find((q) => q.key === "age_band")!.options).toContain(TRIAGE_AGE_65_PLUS);
    expect(TRIAGE_QUESTIONS.find((q) => q.key === "neuro_signs")!.options).toContain(TRIAGE_SIGN_BALANCE);
  });
});

describe("suggestSpecialtyFromTriage, phase 6a", () => {
  it("suggests Geriatric for an older patient referred for falls, with the reason", () => {
    const s = suggestSpecialtyFromTriage({ age_band: TRIAGE_AGE_65_PLUS, presenting_problem: TRIAGE_PROBLEM_FALLS }, { offered: all });
    expect(s.suggested).toBe("geriatric");
    expect(s.because).toMatch(/65 or older/);
  });

  it("suggests Geriatric for 65 or older whose only sign is balance or walking", () => {
    const s = suggestSpecialtyFromTriage(
      { age_band: TRIAGE_AGE_65_PLUS, presenting_problem: "A long-standing ache with no clear cause", neuro_signs: TRIAGE_SIGN_BALANCE },
      { offered: all }
    );
    expect(s.suggested).toBe("geriatric");
    expect(s.because).toMatch(/balance or walking/);
  });

  it("keeps a cluster of neurological signs neurological, even at 65 or older", () => {
    const s = suggestSpecialtyFromTriage(
      {
        age_band: TRIAGE_AGE_65_PLUS,
        presenting_problem: TRIAGE_PROBLEM_FALLS,
        neuro_signs: serializeMultiSelect([TRIAGE_SIGN_BALANCE, "Weakness on one side"]),
      },
      { offered: all }
    );
    expect(s.suggested).toBe("neuro");
  });

  it("keeps a stroke referral neurological whatever the age", () => {
    expect(suggestSpecialtyFromTriage({ age_band: TRIAGE_AGE_65_PLUS, presenting_problem: TRIAGE_PROBLEM_STROKE }, { offered: all }).suggested).toBe("neuro");
  });

  it("suggests Cardiopulmonary for a heart or lung referral, before any sign", () => {
    const s = suggestSpecialtyFromTriage(
      { age_band: ADULT, presenting_problem: TRIAGE_PROBLEM_HEART_LUNG, neuro_signs: TRIAGE_SIGN_BALANCE },
      { offered: all }
    );
    expect(s.suggested).toBe("cardiopulmonary");
    expect(s.because).toMatch(/heart or lung/);
  });

  it("never suggests either new type for a child", () => {
    expect(suggestSpecialtyFromTriage({ age_band: TRIAGE_AGE_UNDER_18, presenting_problem: TRIAGE_PROBLEM_HEART_LUNG }, { offered: all }).suggested).toBe("ortho");
    expect(suggestSpecialtyFromTriage({ age_band: TRIAGE_AGE_UNDER_18, presenting_problem: TRIAGE_PROBLEM_FALLS }, { offered: all }).suggested).toBe("ortho");
  });

  it("only suggests a type that is offered, and says which was passed over", () => {
    const falls = suggestSpecialtyFromTriage({ age_band: TRIAGE_AGE_65_PLUS, presenting_problem: TRIAGE_PROBLEM_FALLS }, { offered: defaults });
    expect(falls.suggested).toBe("ortho");
    expect(falls.because).toMatch(/Geriatric would fit, but it is switched off in Settings/);
    const heart = suggestSpecialtyFromTriage({ age_band: ADULT, presenting_problem: TRIAGE_PROBLEM_HEART_LUNG }, { offered: defaults });
    expect(heart.suggested).toBe("ortho");
    expect(heart.because).toMatch(/Cardiopulmonary would fit/);
    // The falls patient with a balance sign falls through to the next offered rule.
    const balance = suggestSpecialtyFromTriage(
      { age_band: TRIAGE_AGE_65_PLUS, presenting_problem: TRIAGE_PROBLEM_FALLS, neuro_signs: TRIAGE_SIGN_BALANCE },
      { offered: defaults }
    );
    expect(balance.suggested).toBe("neuro");
  });

  it("never pre-selects a switched-off neurological type either", () => {
    const s = suggestSpecialtyFromTriage({ age_band: ADULT, presenting_problem: TRIAGE_PROBLEM_STROKE }, { offered: ["ortho", "pediatrics"] });
    expect(s.suggested).toBe("ortho");
    expect(s.because).toMatch(/Neurological would fit/);
  });

  it("always has an answer: orthopaedic cannot be switched off", () => {
    expect(suggestSpecialtyFromTriage({ age_band: ADULT, presenting_problem: TRIAGE_PROBLEM_FALLS }, { offered: [] }).suggested).toBe("ortho");
  });

  it("is unchanged for the original cases when everything is offered", () => {
    expect(suggestSpecialtyFromTriage({ age_band: ADULT, presenting_problem: "Injury, strain or overuse" }).suggested).toBe("ortho");
    expect(
      suggestSpecialtyFromTriage({ age_band: TRIAGE_AGE_UNDER_18, presenting_problem: "Injury, strain or overuse", development_concern: "Yes" }).suggested
    ).toBe("pediatrics");
  });
});
