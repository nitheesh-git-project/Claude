import { describe, expect, it } from "vitest";
import { FINISH_STEPS, fillEmptyOnly, treatedLineFromRun } from "@/lib/finishFromRun";

describe("finishing a session from a guided assessment (B3)", () => {
  it("fills only the blank fields and never the physiotherapist's own text", () => {
    const now = { treated: "My own words", home_exercise: "", red_flags: "   ", next_plan: "" };
    const out = fillEmptyOnly(now, { treated: "From the run", home_exercise: "Sit to stand: 2 sets of 8", red_flags: "A near-fall in the chair stand", next_plan: "" });
    expect(out).toEqual({ treated: "My own words", home_exercise: "Sit to stand: 2 sets of 8", red_flags: "A near-fall in the chair stand", next_plan: "" });
    // The input is not changed.
    expect(now.treated).toBe("My own words");
  });
  it("writes what was treated from the run's results, and nothing when nothing was recorded", () => {
    const line = treatedLineFromRun("Knee pain: video assessment", [
      { id: "safety", label: "Safety check", value: "All clear", tone: "done" },
      { id: "chair_stand", label: "Sit to stand for 30 seconds", value: "12 stands", tone: "done" },
      { id: "walk", label: "Walking speed", value: "Skipped", tone: "skipped" },
      { id: "knee_bend", label: "Knee bend", value: "Not done", tone: "todo" },
    ]);
    expect(line).toBe("Guided video assessment (Knee pain: video assessment): Safety check all clear; Sit to stand for 30 seconds 12 stands; Walking speed: skipped.");
    expect(treatedLineFromRun("x", [{ id: "a", label: "A", value: "Not done", tone: "todo" }])).toBeNull();
  });
  it("names three steps for the checklist", () => {
    expect(FINISH_STEPS.map((s) => s.key)).toEqual(["noteSaved", "summarySaved", "sessionClosed"]);
  });
});
