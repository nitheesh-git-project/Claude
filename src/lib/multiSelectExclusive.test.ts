import { describe, it, expect } from "vitest";
import {
  INTAKE_QUESTIONS_BY_SPECIALTY,
  findContradictoryMultiSelects,
  parseMultiSelect,
  serializeMultiSelect,
  toggleMultiSelectOption,
  type IntakeQuestion,
} from "./conditionIntake";
import {
  TRIAGE_NEURO_NONE,
  TRIAGE_QUESTIONS,
  sanitiseTriageAnswers,
  suggestSpecialtyFromTriage,
} from "./conditionSpecialty";

// Triage -> "Any of these present?" let "None of these" and "Weakness on one
// side" both stay ticked, so the record said the patient had no neurological
// signs and a one-sided weakness at once.

const neuroSigns = TRIAGE_QUESTIONS.find((q) => q.key === "neuro_signs")!;
const WEAKNESS = "Weakness on one side";
const NUMBNESS = "Numbness or altered sensation";

describe("toggleMultiSelectOption", () => {
  it("clears 'None of these' when a sign is ticked after it", () => {
    const afterNone = toggleMultiSelectOption(neuroSigns, [], TRIAGE_NEURO_NONE);
    expect(afterNone).toEqual([TRIAGE_NEURO_NONE]);
    expect(toggleMultiSelectOption(neuroSigns, afterNone, WEAKNESS)).toEqual([WEAKNESS]);
  });

  it("clears every sign when 'None of these' is ticked after them", () => {
    expect(toggleMultiSelectOption(neuroSigns, [WEAKNESS, NUMBNESS], TRIAGE_NEURO_NONE)).toEqual([
      TRIAGE_NEURO_NONE,
    ]);
  });

  it("still lets several ordinary options be ticked together", () => {
    expect(toggleMultiSelectOption(neuroSigns, [WEAKNESS], NUMBNESS)).toEqual([WEAKNESS, NUMBNESS]);
  });

  it("unticks an option that is already ticked, exclusive or not", () => {
    expect(toggleMultiSelectOption(neuroSigns, [WEAKNESS, NUMBNESS], WEAKNESS)).toEqual([NUMBNESS]);
    expect(toggleMultiSelectOption(neuroSigns, [TRIAGE_NEURO_NONE], TRIAGE_NEURO_NONE)).toEqual([]);
  });

  it("is a plain toggle for a question with no exclusive option", () => {
    const plain: Pick<IntakeQuestion, "exclusiveOptions"> = {};
    expect(toggleMultiSelectOption(plain, ["A"], "B")).toEqual(["A", "B"]);
    expect(toggleMultiSelectOption(plain, ["A", "B"], "A")).toEqual(["B"]);
  });
});

describe("findContradictoryMultiSelects", () => {
  it("flags 'None of these' stored beside a sign", () => {
    const answers = { neuro_signs: serializeMultiSelect([TRIAGE_NEURO_NONE, WEAKNESS]) };
    expect(findContradictoryMultiSelects(TRIAGE_QUESTIONS, answers)).toEqual(["neuro_signs"]);
  });

  it("passes 'None of these' alone, signs alone, and no answer at all", () => {
    for (const neuro_signs of [TRIAGE_NEURO_NONE, serializeMultiSelect([WEAKNESS, NUMBNESS]), "", undefined]) {
      const answers: Record<string, string> = neuro_signs === undefined ? {} : { neuro_signs };
      expect(findContradictoryMultiSelects(TRIAGE_QUESTIONS, answers)).toEqual([]);
    }
  });
});

describe("every 'None' option is exclusive", () => {
  // The rule applies to every multi_select whose list carries a "none of the
  // others" answer, not only the one the finding named -- a new question
  // with a "None" option that forgot to declare it would reopen the bug.
  const everySet: IntakeQuestion[] = [
    ...TRIAGE_QUESTIONS,
    ...Object.values(INTAKE_QUESTIONS_BY_SPECIALTY).flat(),
  ];
  for (const q of everySet.filter((q) => q.inputType === "multi_select")) {
    it(`${q.key} declares its "None" options exclusive`, () => {
      const noneOptions = (q.options ?? []).filter((o) => /^none\b/i.test(o));
      for (const option of noneOptions) expect(q.exclusiveOptions ?? []).toContain(option);
      for (const option of q.exclusiveOptions ?? []) expect(q.options ?? []).toContain(option);
    });
  }
});

describe("sanitiseTriageAnswers", () => {
  it("keeps known triage keys with string values and drops everything else", () => {
    expect(
      sanitiseTriageAnswers({
        age_band: "18 to 64",
        neuro_signs: WEAKNESS,
        injected: "x",
        presenting_problem: 42,
      })
    ).toEqual({ age_band: "18 to 64", neuro_signs: WEAKNESS });
  });

  it("reads anything that is not an object as no answers", () => {
    for (const raw of [null, undefined, "x", 3, ["age_band"]]) expect(sanitiseTriageAnswers(raw)).toEqual({});
  });
});

it("the suggestion reads a normalised selection the way the clinician meant it", () => {
  const signs = toggleMultiSelectOption(neuroSigns, [TRIAGE_NEURO_NONE], WEAKNESS);
  const suggestion = suggestSpecialtyFromTriage({
    age_band: "18 to 64",
    presenting_problem: "Injury, strain or overuse",
    neuro_signs: serializeMultiSelect(signs),
  });
  expect(parseMultiSelect(serializeMultiSelect(signs))).toEqual([WEAKNESS]);
  expect(suggestion.suggested).toBe("neuro");
});
