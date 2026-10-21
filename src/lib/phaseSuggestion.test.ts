import { describe, expect, it } from "vitest";
import { describePhase, phaseBarState } from "./phaseSuggestion";

describe("describePhase", () => {
  it("a stored phase wins and is plain", () => {
    expect(describePhase({ phase: "Strengthen", suggested: false, voice: "patient" })).toEqual({ headline: "Strengthen", detail: null, state: "confirmed" });
  });
  it("labels an inferred phase as a suggestion in each voice", () => {
    expect(describePhase({ phase: "New skills", suggested: true, voice: "patient", child: true })).toEqual({
      headline: "Suggested stage: New skills.",
      detail: "Your child's physiotherapist will confirm.",
      state: "suggested",
    });
    expect(describePhase({ phase: "Strengthen", suggested: true, voice: "patient" }).detail).toBe("Your physiotherapist will confirm.");
    const c = describePhase({ phase: "New skills", suggested: true, voice: "clinician" });
    expect(`${c.headline} ${c.detail}`).toBe("Suggested: New skills (from the milestones) - set the phase to confirm");
  });
  it("keeps Phase not set when nothing can be inferred", () => {
    expect(describePhase({ phase: null, suggested: false, voice: "clinician" }).headline).toBe("Phase not set");
  });
});

describe("phaseBarState", () => {
  it("a stored phase fills the stages behind it; a suggestion marks only its own", () => {
    expect([0, 1, 2, 3].map((i) => phaseBarState(i, 2, false))).toEqual(["done", "done", "current", "ahead"]);
    expect([0, 1, 2, 3].map((i) => phaseBarState(i, 2, true))).toEqual(["ahead", "ahead", "suggested", "ahead"]);
    expect([0, 1].map((i) => phaseBarState(i, -1, true))).toEqual(["ahead", "ahead"]);
  });
});
