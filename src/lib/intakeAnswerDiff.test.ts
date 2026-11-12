import { describe, expect, it } from "vitest";
import type { IntakeQuestion } from "./conditionIntake";
import { answerText, describeAnswerChanges, diffIntakeAnswers } from "./intakeAnswerDiff";

const q = (key: string, inputType: IntakeQuestion["inputType"], label = key): IntakeQuestion =>
  ({ key, label, inputType, required: false }) as IntakeQuestion;

describe("answerText", () => {
  it("reads each input type as a line, and empty as null", () => {
    expect(answerText(q("a", "text"), "  hi ")).toBe("hi");
    expect(answerText(q("a", "scale_0_10"), "7")).toBe("7/10");
    expect(answerText(q("a", "multi_select"), "Knee\nHip")).toBe("Knee, Hip");
    expect(answerText(q("a", "text"), "   ")).toBeNull();
    expect(answerText(q("a", "text"), undefined)).toBeNull();
  });

  it("never shows area-pain JSON", () => {
    const raw = JSON.stringify([{ region: "knee", side: "left", pain: 6 }]);
    const text = answerText(q("a", "area_pain_list"), raw, () => "Knee");
    expect(text).toContain("Knee");
    expect(text).not.toContain("{");
  });
});

describe("diffIntakeAnswers", () => {
  const questions = [q("pain", "scale_0_10", "Pain level"), q("note", "text", "Notes")];

  it("lists only what changed, as read", () => {
    const changes = diffIntakeAnswers(questions, { pain: "5", note: "same" }, { pain: "7", note: " same " });
    expect(changes).toEqual([{ key: "pain", label: "Pain level", before: "5/10", after: "7/10" }]);
  });

  it("reports an added and a cleared answer", () => {
    const changes = diffIntakeAnswers(questions, { pain: "5" }, { note: "new" });
    expect(changes.map((c) => [c.key, c.before, c.after])).toEqual([
      ["pain", "5/10", null],
      ["note", null, "new"],
    ]);
  });

  it("says nothing when nothing changed", () => {
    expect(diffIntakeAnswers(questions, { pain: "5" }, { pain: "5" })).toEqual([]);
  });
});

describe("describeAnswerChanges", () => {
  it("names the patient and each change", () => {
    const text = describeAnswerChanges("Asha", [{ key: "pain", label: "Pain level", before: "5/10", after: "7/10" }]);
    expect(text).toContain("Save 1 change to Asha's Health Profile");
    expect(text).toContain("Pain level: 5/10 → 7/10");
  });
});
