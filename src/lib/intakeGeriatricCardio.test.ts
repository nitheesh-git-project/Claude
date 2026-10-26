import { describe, expect, it } from "vitest";
import {
  CLINICAL_QUESTIONS_BY_SPECIALTY,
  INTAKE_QUESTIONS_BY_SPECIALTY,
  countedQuestions,
  findMissingRequiredKeys,
  intakeNeedsAnotherLook,
  intakeVersionForSpecialty,
  mergeSpecialtyAnswers,
  questionKeysForSpecialty,
  visibleQuestions,
} from "./conditionIntake";
import {
  GERI_CARER_KEYS,
  GERI_DAILY_HELP_NONE,
  GERI_FALLS_NONE,
  GERI_FALLS_ONE,
  GERI_FALLS_ONE_INJURED,
  GERI_FALLS_TWO_PLUS,
  GERI_KATZ_ACTIVITIES,
} from "./intakeGeriatric";
import {
  CARDIO_CONDITION_OPEN_HEART,
  CARDIO_CONDITION_OPTIONS,
  CARDIO_HOME_OXYGEN_YES,
  CARDIO_LUNG_CONDITIONS,
  CARDIO_MMRC_OPTIONS,
} from "./intakeCardio";
import { outcomeMeasure } from "./outcomeMeasures";

// Phase 6a: the geriatric and cardiopulmonary question sets.

const geri = INTAKE_QUESTIONS_BY_SPECIALTY.geriatric;
const cardio = INTAKE_QUESTIONS_BY_SPECIALTY.cardiopulmonary;

describe("the geriatric set", () => {
  it("has seven counted questions, every key geri_-prefixed, each with a short label", () => {
    expect(CLINICAL_QUESTIONS_BY_SPECIALTY.geriatric).toHaveLength(7);
    expect(countedQuestions(geri, {})).toHaveLength(7);
    for (const q of geri) {
      expect(q.key, q.key).toMatch(/^geri_/);
      expect(q.shortLabel, q.key).toBeTruthy();
    }
    for (const q of geri.filter((q) => !q.excludeFromCount && q.key !== "geri_carer_relationship")) expect(q.helpText, q.key).toBeTruthy();
  });

  it("carries the carer as an optional pre-step that is never counted or required", () => {
    expect(geri.slice(0, 2).map((q) => q.key)).toEqual([...GERI_CARER_KEYS]);
    for (const key of GERI_CARER_KEYS) {
      const q = geri.find((x) => x.key === key)!;
      expect(q.excludeFromCount).toBe(true);
      expect(q.required).toBe(false);
    }
  });

  it("asks the three STEADI questions as required, and the falls answer can say an injury", () => {
    const required = geri.filter((q) => q.required).map((q) => q.key);
    expect(required).toEqual(["geri_concern", "geri_falls_12m", "geri_unsteady", "geri_fall_worry"]);
    expect(geri.find((q) => q.key === "geri_falls_12m")!.options).toEqual([
      GERI_FALLS_NONE,
      GERI_FALLS_ONE,
      GERI_FALLS_ONE_INJURED,
      GERI_FALLS_TWO_PLUS,
    ]);
  });

  it("lists the Katz six in the score sheet's order, with an exclusive 'None'", () => {
    const help = geri.find((q) => q.key === "geri_daily_help")!;
    expect(help.inputType).toBe("multi_select");
    expect(help.options).toEqual([...GERI_KATZ_ACTIVITIES, GERI_DAILY_HELP_NONE]);
    expect(help.exclusiveOptions).toEqual([GERI_DAILY_HELP_NONE]);
    expect(outcomeMeasure("katz_adl")!.scoreSheet!.itemCount).toBe(GERI_KATZ_ACTIVITIES.length);
  });
});

describe("the cardiopulmonary set", () => {
  it("has seven questions always asked, every key cardio_-prefixed", () => {
    expect(countedQuestions(cardio, {})).toHaveLength(7);
    for (const q of cardio) {
      expect(q.key, q.key).toMatch(/^cardio_/);
      expect(q.shortLabel, q.key).toBeTruthy();
    }
  });

  it("asks the surgeon's precautions only after open-heart surgery, and the prescription only with home oxygen", () => {
    const shown = (answers: Record<string, string>) => visibleQuestions(cardio, answers).map((q) => q.key);
    expect(shown({ cardio_condition: "COPD (long-term lung disease)" })).not.toContain("cardio_sternal_precautions");
    expect(shown({ cardio_condition: CARDIO_CONDITION_OPEN_HEART })).toEqual(
      expect.arrayContaining(["cardio_sternal_precautions", "cardio_sternal_precautions_until"])
    );
    expect(shown({ cardio_home_oxygen: "No" })).not.toContain("cardio_oxygen_prescription");
    expect(shown({ cardio_home_oxygen: CARDIO_HOME_OXYGEN_YES })).toContain("cardio_oxygen_prescription");
    expect(countedQuestions(cardio, { cardio_condition: CARDIO_CONDITION_OPEN_HEART, cardio_home_oxygen: "Yes" })).toHaveLength(10);
  });

  it("never requires a hidden follow-up", () => {
    const answers = {
      cardio_condition: CARDIO_CONDITION_OPEN_HEART,
      cardio_beta_blocker: "Yes",
      cardio_breathlessness: CARDIO_MMRC_OPTIONS[1],
      cardio_home_oxygen: "No",
    };
    expect(findMissingRequiredKeys(cardio, answers)).toEqual([]);
  });

  it("offers five mMRC grades in plain words and names the lung conditions it defaults to 88% for", () => {
    expect(CARDIO_MMRC_OPTIONS).toHaveLength(5);
    expect(cardio.find((q) => q.key === "cardio_breathlessness")!.options).toEqual([...CARDIO_MMRC_OPTIONS]);
    for (const c of CARDIO_LUNG_CONDITIONS) expect(CARDIO_CONDITION_OPTIONS as readonly string[]).toContain(c);
  });

  it("asks the beta-blocker with 'Not sure', since not knowing is not 'no'", () => {
    expect(cardio.find((q) => q.key === "cardio_beta_blocker")!.options).toEqual(["Yes", "No", "Not sure"]);
  });
});

describe("both sets in the flat blob", () => {
  it("start at schema_version 1 and nag nobody", () => {
    expect(intakeVersionForSpecialty("geriatric")).toBe(1);
    expect(intakeVersionForSpecialty("cardiopulmonary")).toBe(1);
    expect(
      intakeNeedsAnotherLook({ status: "active", schemaVersion: 1, currentVersion: 1, questions: geri, answers: {} })
    ).toBe(false);
  });

  it("keep another type's answers when merged in", () => {
    const merged = mergeSpecialtyAnswers(
      { pain_level: "6", neuro_diagnosis: "Stroke" },
      { geri_concern: "Falls on the stairs" },
      questionKeysForSpecialty("geriatric")
    );
    expect(merged.pain_level).toBe("6");
    expect(merged.neuro_diagnosis).toBe("Stroke");
    expect(merged.geri_concern).toBe("Falls on the stairs");
    expect(merged.geri_falls_12m).toBe("");
  });
});
