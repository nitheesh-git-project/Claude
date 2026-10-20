import { describe, it, expect } from "vitest";
import { intakePrefillAnswers, mergeSpecialtyAnswers, questionKeysForSpecialty } from "./conditionIntake";

// Orthopaedic -> neurological -> back to orthopaedic opened the orthopaedic
// questions blank, although re-triage had kept every orthopaedic answer in
// the same blob. The owner's rule: the latest answers for that specialty
// prefill the fill, ready to edit.

const ORTHO = { chief_complaint: "Right knee pain", since_when: "About 6 weeks", severity: "6" };
const NEURO = { neuro_diagnosis: "Stroke, March 2026", neuro_mobility: "Walk with a stick or frame" };

// What /onboard leaves on file after ortho, then a re-triage to neuro.
const onFile = mergeSpecialtyAnswers(
  mergeSpecialtyAnswers({}, ORTHO, questionKeysForSpecialty("ortho")),
  NEURO,
  questionKeysForSpecialty("neuro")
);

describe("intakePrefillAnswers", () => {
  it("returns the earlier orthopaedic answers when a patient is taken back to orthopaedic", () => {
    expect(intakePrefillAnswers({ specialty: "ortho", onFile })).toEqual(ORTHO);
  });

  it("returns only the picked specialty's keys, never another set's", () => {
    const neuro = intakePrefillAnswers({ specialty: "neuro", onFile });
    expect(neuro).toEqual(NEURO);
    expect(Object.keys(neuro).every((k) => k.startsWith("neuro_"))).toBe(true);
  });

  it("drops blank values -- the wizard saves its full key set, empties included", () => {
    expect(Object.values(onFile)).toContain("");
    for (const v of Object.values(intakePrefillAnswers({ specialty: "ortho", onFile }))) {
      expect(v.trim()).not.toBe("");
    }
  });

  it("is empty for a specialty never filled", () => {
    expect(intakePrefillAnswers({ specialty: "pediatrics", onFile })).toEqual({});
    expect(intakePrefillAnswers({ specialty: "ortho", onFile: null })).toEqual({});
  });

  it("prefers an unfinished fill for the same specialty over what is on file", () => {
    const draft = { ...ORTHO, severity: "3" };
    expect(
      intakePrefillAnswers({ specialty: "ortho", onFile, draft, draftSpecialty: "ortho" })
    ).toEqual(draft);
  });

  it("ignores a draft for a different specialty and falls back to the answers on file", () => {
    expect(
      intakePrefillAnswers({ specialty: "ortho", onFile, draft: NEURO, draftSpecialty: "neuro" })
    ).toEqual(ORTHO);
  });

  it("ignores an empty draft rather than letting it blank the answers on file", () => {
    const emptyDraft = Object.fromEntries(questionKeysForSpecialty("ortho").map((k) => [k, ""]));
    expect(
      intakePrefillAnswers({ specialty: "ortho", onFile, draft: emptyDraft, draftSpecialty: "ortho" })
    ).toEqual(ORTHO);
  });
});
