import { describe, expect, it } from "vitest";
import { composeFeedback, picksFor, ratingWord, splitFeedback } from "./feedbackPicks";

describe("picksFor", () => {
  it("offers nothing before a star is chosen", () => {
    expect(picksFor("patient", 0)).toEqual([]);
  });
  it("asks what went well from three stars up, and what could be better below", () => {
    expect(picksFor("patient", 4)).toContain("Clear explanations");
    expect(picksFor("patient", 2)).toContain("Started late");
    expect(picksFor("therapist", 3)).toContain("Engaged and motivated");
    expect(picksFor("therapist", 1)).toContain("Connection issues");
  });
});

describe("composeFeedback / splitFeedback", () => {
  it("round-trips picks and a typed note", () => {
    const saved = composeFeedback(["Clear explanations", "Felt better after"], "  More stretches next time ");
    expect(saved).toBe("Clear explanations · Felt better after · More stretches next time");
    expect(splitFeedback(saved)).toEqual({
      picks: ["Clear explanations", "Felt better after"],
      note: "More stretches next time",
    });
  });

  it("saves picks alone, or a note alone", () => {
    expect(composeFeedback(["Started late"], "")).toBe("Started late");
    expect(composeFeedback([], "Just a note")).toBe("Just a note");
    expect(composeFeedback([], "   ")).toBe("");
  });

  it("reads an old free-text note as a note with no picks", () => {
    expect(splitFeedback("Great session, thank you")).toEqual({ picks: [], note: "Great session, thank you" });
  });

  it("only treats leading phrases as picks", () => {
    expect(splitFeedback("Loved it · Clear explanations")).toEqual({
      picks: [],
      note: "Loved it · Clear explanations",
    });
  });

  it("is empty for nothing saved", () => {
    expect(splitFeedback(null)).toEqual({ picks: [], note: "" });
    expect(splitFeedback("")).toEqual({ picks: [], note: "" });
  });
});

describe("ratingWord", () => {
  it("names each star count", () => {
    expect([1, 2, 3, 4, 5].map(ratingWord)).toEqual(["Poor", "Fair", "Good", "Great", "Excellent"]);
  });
  it("is empty outside 1-5", () => {
    expect(ratingWord(0)).toBe("");
    expect(ratingWord(null)).toBe("");
    expect(ratingWord(6)).toBe("");
  });
});
