import { describe, expect, it } from "vitest";
import { childWords, speaksToParent, subjectWords } from "@/lib/childVoice";
import { statusReasonText, type StatusReasonCode } from "@/lib/profileStatus";

describe("childWords", () => {
  it("turns the patient's sentences into the parent's", () => {
    expect(
      childWords("Your physiotherapist will mark which stage you are in."),
    ).toBe(
      "Your child's physiotherapist will mark which stage your child is in.",
    );
    expect(childWords("Where you are in your care")).toBe(
      "Where your child is in their care",
    );
    expect(childWords(" (you are here)")).toBe(" (your child is here)");
    expect(
      childWords(
        "Your progress graph appears once your physiotherapist has measured you at two reviews.",
      ),
    ).toBe(
      "Your child's progress graph appears once your child's physiotherapist has measured your child at two reviews.",
    );
    expect(
      childWords(
        "Your physiotherapist will set your goal with you, in your own words, at your next visit.",
      ),
    ).toBe(
      "Your child's physiotherapist will set your child's goal with you, at your child's next visit.",
    );
    expect(
      childWords(
        "Your latest reading meets this target. Your physiotherapist will confirm it.",
      ),
    ).toBe(
      "Your child's latest reading meets this target. Your child's physiotherapist will confirm it.",
    );
    expect(childWords("Are you getting better?")).toBe(
      "Is your child getting better?",
    );
    expect(childWords("at your latest review")).toBe("at their latest review");
    expect(childWords("how you are doing and what comes next")).toBe(
      "how your child is doing and what comes next",
    );
  });

  it("leaves a sentence with nothing to change, and is idempotent", () => {
    expect(childWords("Nothing here.")).toBe("Nothing here.");
    const once = childWords("Your physiotherapist will help.");
    expect(childWords(once)).toBe(once);
  });

  it("covers every status reason the pill can give a parent", () => {
    const codes: StatusReasonCode[] = [
      "red_flag",
      "new_fall",
      "worse_than_first",
      "worse_than_previous",
      "better_meaningful",
      "better_not_meaningful",
      "within_error",
      "no_direction",
      "single_review",
      "no_measure",
    ];
    for (const code of codes) {
      const text = childWords(statusReasonText(code, "patient"));
      // Any remaining "your" is "your child's" (or "your child" itself).
      expect(text.replace(/your child/gi, "").match(/\byou(r)?\b/i)).toBeNull();
    }
  });

  it("subjectWords is a no-op for the person themselves and for clinician text", () => {
    expect(subjectWords("self", "patient")("Your physiotherapist")).toBe("Your physiotherapist");
    expect(subjectWords(undefined, "patient")("Your physiotherapist")).toBe("Your physiotherapist");
    expect(subjectWords("child", "clinician")("Your physiotherapist")).toBe("Your physiotherapist");
    expect(subjectWords("child", "patient")("Your physiotherapist")).toBe("Your child's physiotherapist");
    expect(subjectWords("child")("Your physiotherapist")).toBe("Your child's physiotherapist");
  });

  it("speaksToParent only for a child's record in the patient voice", () => {
    expect(speaksToParent("child", "patient")).toBe(true);
    expect(speaksToParent("child", "clinician")).toBe(false);
    expect(speaksToParent("self", "patient")).toBe(false);
    expect(speaksToParent(undefined, "patient")).toBe(false);
  });

});
