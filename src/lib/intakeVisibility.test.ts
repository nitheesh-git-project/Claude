import { describe, expect, it } from "vitest";
import {
  assertShowWhenWellFormed,
  countAnswered,
  countedQuestions,
  describeShowWhen,
  findMissingRequiredKeys,
  intakeNeedsAnotherLook,
  intakeVersionForSpecialty,
  isQuestionVisible,
  questionKeysForSpecialty,
  questionsForSpecialty,
  visibleQuestions,
  type IntakeQuestion,
} from "@/lib/conditionIntake";
import { NEURO_INTAKE_QUESTIONS, NEURO_PARKINSONS_QUESTIONS, NEURO_SUBTYPE_OPTIONS } from "@/lib/intakeNeuro";
import { TRIAGE_QUESTIONS } from "@/lib/conditionSpecialty";
import { NEURO_SUBTYPE_KEY, NEURO_SUBTYPE_PARKINSONS, profileKindFor } from "@/lib/profileKind";

// Conditional questions (Health Profile redesign, phase 4a): the Parkinson's
// follow-ups are asked only when the neurological condition group says so,
// and a hidden question is never counted, required or listed.

/** A complete v1 neurological record: the seven questions every existing
 *  neurological patient answered, and no condition group. */
const V1_NEURO: Record<string, string> = {
  neuro_diagnosis: "Stroke affecting the right side, March 2026",
  neuro_affected_side: "Right side",
  neuro_mobility: "Walk with a stick or frame",
  neuro_independence: "6",
  neuro_symptoms: "Weakness",
  neuro_falls: "None",
  neuro_goal: "Walk to the gate",
};

const PD_KEYS = NEURO_PARKINSONS_QUESTIONS.map((q) => q.key);

describe("the neurological set's condition group and Parkinson's follow-ups", () => {
  it("keeps every key neuro_-prefixed and owned by the neurological set", () => {
    for (const key of questionKeysForSpecialty("neuro")) expect(key.startsWith("neuro_")).toBe(true);
    expect(questionKeysForSpecialty("neuro")).toContain(NEURO_SUBTYPE_KEY);
    for (const key of PD_KEYS) expect(key.startsWith("neuro_pd_")).toBe(true);
  });

  it("gives every new question help text and a short label", () => {
    for (const q of NEURO_INTAKE_QUESTIONS) {
      expect(q.helpText, q.key).toBeTruthy();
      expect(q.shortLabel, q.key).toBeTruthy();
    }
  });

  it("offers the six condition groups, Parkinson's being the one profileKindFor reads", () => {
    expect(NEURO_SUBTYPE_OPTIONS).toHaveLength(6);
    expect(NEURO_SUBTYPE_OPTIONS).toContain(NEURO_SUBTYPE_PARKINSONS);
    expect(profileKindFor("neuro", { [NEURO_SUBTYPE_KEY]: NEURO_SUBTYPE_PARKINSONS })).toBe("neuro_parkinsons");
    expect(profileKindFor("neuro", { [NEURO_SUBTYPE_KEY]: "Multiple sclerosis" })).toBe("neuro");
  });

  it("keeps the condition group optional, so a v1 record stays complete", () => {
    const subtype = NEURO_INTAKE_QUESTIONS.find((q) => q.key === NEURO_SUBTYPE_KEY)!;
    expect(subtype.required).toBe(false);
    expect(findMissingRequiredKeys(questionsForSpecialty("neuro"), V1_NEURO)).toEqual([]);
  });

  it("puts the follow-ups straight after the question that opens them", () => {
    const keys = NEURO_INTAKE_QUESTIONS.map((q) => q.key);
    const at = keys.indexOf(NEURO_SUBTYPE_KEY);
    expect(keys.slice(at + 1, at + 1 + PD_KEYS.length)).toEqual(PD_KEYS);
  });

  it("bumps only the neurological schema version", () => {
    expect(intakeVersionForSpecialty("neuro")).toBe(2);
    expect(intakeVersionForSpecialty("ortho")).toBe(2);
    expect(intakeVersionForSpecialty("pediatrics")).toBe(1);
  });
});

describe("visibleQuestions", () => {
  const neuro = questionsForSpecialty("neuro");

  it("hides the Parkinson's follow-ups until the group reads Parkinson's", () => {
    const keys = (answers: Record<string, string>) => visibleQuestions(neuro, answers).map((q) => q.key);
    expect(keys({})).not.toContain("neuro_pd_freezing");
    expect(keys({ [NEURO_SUBTYPE_KEY]: "Stroke or brain injury" })).not.toContain("neuro_pd_freezing");
    expect(keys({ [NEURO_SUBTYPE_KEY]: NEURO_SUBTYPE_PARKINSONS })).toEqual(expect.arrayContaining(PD_KEYS));
  });

  it("treats a typographic apostrophe and stray spacing as the same answer", () => {
    const shown = visibleQuestions(neuro, { [NEURO_SUBTYPE_KEY]: "  parkinson’s   Disease " });
    expect(shown.map((q) => q.key)).toContain("neuro_pd_year_diagnosed");
  });

  it("hides a follow-up whose controlling question is itself hidden", () => {
    const set: IntakeQuestion[] = [
      { key: "a", label: "A", inputType: "select", options: ["yes", "no"], required: false },
      { key: "b", label: "B", inputType: "select", options: ["yes", "no"], required: false, showWhen: { key: "a", equals: "yes" } },
      { key: "c", label: "C", inputType: "text", required: true, showWhen: { key: "b", equals: "yes" } },
    ];
    // b's stored "yes" outlives a's change of mind; c must close with b.
    expect(visibleQuestions(set, { a: "no", b: "yes" }).map((q) => q.key)).toEqual(["a"]);
    expect(visibleQuestions(set, { a: "yes", b: "yes" }).map((q) => q.key)).toEqual(["a", "b", "c"]);
    expect(isQuestionVisible(set[2], set, { a: "no", b: "yes" })).toBe(false);
  });

  it("judges a controller missing from a slice on the answer alone", () => {
    const pdOnly = NEURO_PARKINSONS_QUESTIONS;
    expect(visibleQuestions(pdOnly, { [NEURO_SUBTYPE_KEY]: NEURO_SUBTYPE_PARKINSONS })).toHaveLength(pdOnly.length);
    expect(visibleQuestions(pdOnly, {})).toHaveLength(0);
  });

  it("still hides triage's development question unless the patient is a child", () => {
    const keys = (answers: Record<string, string>) => visibleQuestions(TRIAGE_QUESTIONS, answers).map((q) => q.key);
    expect(keys({})).not.toContain("development_concern");
    const under18 = TRIAGE_QUESTIONS.find((q) => q.key === "development_concern")!.showWhen!.equals;
    expect(keys({ age_band: under18 })).toContain("development_concern");
  });
});

describe("a hidden question is never unanswered", () => {
  const neuro = questionsForSpecialty("neuro");

  it("is not required while hidden, and is once shown", () => {
    const stroke = { ...V1_NEURO, [NEURO_SUBTYPE_KEY]: "Stroke or brain injury" };
    expect(findMissingRequiredKeys(neuro, stroke)).toEqual([]);
    const parkinsons = { ...V1_NEURO, [NEURO_SUBTYPE_KEY]: NEURO_SUBTYPE_PARKINSONS };
    expect(findMissingRequiredKeys(neuro, parkinsons).sort()).toEqual(["neuro_pd_freezing", "neuro_pd_year_diagnosed"]);
  });

  it("is not in the N of M total, which grows when the follow-ups open", () => {
    expect(countedQuestions(neuro, V1_NEURO)).toHaveLength(8);
    expect(countAnswered(neuro, V1_NEURO)).toBe(7);
    const parkinsons = { ...V1_NEURO, [NEURO_SUBTYPE_KEY]: NEURO_SUBTYPE_PARKINSONS, neuro_pd_freezing: "Most days" };
    expect(countedQuestions(neuro, parkinsons)).toHaveLength(8 + PD_KEYS.length);
    expect(countAnswered(neuro, parkinsons)).toBe(9);
  });

  it("does not count a kept answer to a follow-up that has since closed", () => {
    const changedMind = { ...V1_NEURO, [NEURO_SUBTYPE_KEY]: "Multiple sclerosis", neuro_pd_freezing: "Most days" };
    expect(countAnswered(neuro, changedMind)).toBe(8);
    expect(countedQuestions(neuro, changedMind).map((q) => q.key)).not.toContain("neuro_pd_freezing");
  });
});

describe("intakeNeedsAnotherLook (the 'we've changed some of these questions' banner)", () => {
  const neuro = questionsForSpecialty("neuro");
  const base = { status: "active", schemaVersion: 1, currentVersion: intakeVersionForSpecialty("neuro"), questions: neuro };

  it("does not nag an existing neurological patient whose answers are all still valid", () => {
    expect(intakeNeedsAnotherLook({ ...base, answers: V1_NEURO })).toBe(false);
  });

  it("shows when a now-required visible question is unanswered", () => {
    const parkinsons = { ...V1_NEURO, [NEURO_SUBTYPE_KEY]: NEURO_SUBTYPE_PARKINSONS };
    expect(intakeNeedsAnotherLook({ ...base, answers: parkinsons })).toBe(true);
    // An admin making the group required is a real change worth a look.
    const requiredGroup = neuro.map((q) => (q.key === NEURO_SUBTYPE_KEY ? { ...q, required: true } : q));
    expect(intakeNeedsAnotherLook({ ...base, questions: requiredGroup, answers: V1_NEURO })).toBe(true);
  });

  it("never shows on a current-version, unversioned or not-live record", () => {
    const missing = { neuro_diagnosis: "Stroke" };
    expect(intakeNeedsAnotherLook({ ...base, schemaVersion: 2, answers: missing })).toBe(false);
    expect(intakeNeedsAnotherLook({ ...base, schemaVersion: null, answers: missing })).toBe(false);
    expect(intakeNeedsAnotherLook({ ...base, status: "draft", answers: missing })).toBe(false);
  });
});

describe("assertShowWhenWellFormed", () => {
  it("passes every real set, triage included", () => {
    expect(() => assertShowWhenWellFormed(TRIAGE_QUESTIONS, "triage")).not.toThrow();
    expect(() => assertShowWhenWellFormed(questionsForSpecialty("neuro"), "neuro")).not.toThrow();
  });

  it("refuses a controller that comes later or does not exist", () => {
    const later: IntakeQuestion[] = [
      { key: "b", label: "B", inputType: "text", required: false, showWhen: { key: "a", equals: "yes" } },
      { key: "a", label: "A", inputType: "select", options: ["yes"], required: false },
    ];
    expect(() => assertShowWhenWellFormed(later, "test")).toThrow(/not earlier/);
  });

  it("refuses an answer the controlling select cannot give", () => {
    const typo: IntakeQuestion[] = [
      { key: "a", label: "A", inputType: "select", options: ["Parkinson's disease"], required: false },
      { key: "b", label: "B", inputType: "text", required: false, showWhen: { key: "a", equals: "Parkinsons" } },
    ];
    expect(() => assertShowWhenWellFormed(typo, "test")).toThrow(/not one of/);
  });
});

describe("describeShowWhen (the admin question bank's note)", () => {
  it("names the controlling question by its short label and the answer", () => {
    const neuro = questionsForSpecialty("neuro");
    const freezing = neuro.find((q) => q.key === "neuro_pd_freezing")!;
    expect(describeShowWhen(freezing, neuro)).toBe(`Asked only when "Condition group" is "${NEURO_SUBTYPE_PARKINSONS}".`);
    expect(describeShowWhen(neuro[0], neuro)).toBeNull();
  });
});
