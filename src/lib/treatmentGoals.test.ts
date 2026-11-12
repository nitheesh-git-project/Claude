import { describe, expect, it } from "vitest";
import { formatGoalValue, TREATMENT_GOALS } from "./treatmentGoals";
import { SHOWCASE_PROFILES } from "./healthProfileShowcase";

describe("what treatment works towards", () => {
  it("has six kinds of care, each with its own photograph", () => {
    expect(TREATMENT_GOALS.map((g) => g.key)).toEqual(["ortho", "desk", "neuro", "paeds", "balance", "heart"]);
    expect(new Set(TREATMENT_GOALS.map((g) => g.photo)).size).toBe(TREATMENT_GOALS.length);
  });

  it("moves each figure towards better, within its scale", () => {
    for (const g of TREATMENT_GOALS) {
      expect(g.from).toBeLessThanOrEqual(g.max);
      expect(g.to).toBeLessThanOrEqual(g.max);
      const lowerIsBetter = g.format === "of-10";
      expect(lowerIsBetter ? g.to < g.from : g.to > g.from, g.key).toBe(true);
    }
  });

  it("agrees with the health-profile sample wherever the two share a patient", () => {
    const pairs: [string, string][] = [["ortho", "ortho"], ["neuro", "neuro"], ["paeds", "pediatrics"], ["balance", "geriatric"], ["heart", "cardiopulmonary"]];
    for (const [goalKey, specialty] of pairs) {
      const g = TREATMENT_GOALS.find((x) => x.key === goalKey)!;
      const p = SHOWCASE_PROFILES.find((x) => x.specialty === specialty)!;
      expect(formatGoalValue(g, g.from), goalKey).toBe(p.headline.from);
      expect(formatGoalValue(g, g.to), goalKey).toBe(p.headline.to);
      expect(g.sample, goalKey).toContain(p.sample.name);
    }
  });

  it("labels every story as a sample and never promises an outcome", () => {
    for (const g of TREATMENT_GOALS) {
      expect(g.sample).toMatch(/^Sample patient /);
      const words = [g.goal, ...g.after].join(" ").toLowerCase();
      expect(words, g.key).not.toMatch(/\b(guarantee|cure|cured|pain-free|100%)\b/);
    }
  });

  it("writes figures the way the band prints them", () => {
    expect(formatGoalValue({ format: "of-10", max: 10 }, 6.6)).toBe("7/10");
    expect(formatGoalValue({ format: "x-of-n", max: 5 }, 4)).toBe("4 of 5");
    expect(formatGoalValue({ format: "metres", max: 450 }, 372)).toBe("372 m");
  });
});
