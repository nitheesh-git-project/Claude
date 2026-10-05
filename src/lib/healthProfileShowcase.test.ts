import { describe, expect, it } from "vitest";
import { painTrendSeries } from "./healthProfileSummary";
import {
  SAMPLE_INDEPENDENCE,
  SAMPLE_MILESTONE_COUNTS,
  SAMPLE_PAIN_ASSESSMENTS,
  SHOWCASE_PROFILES,
  enabledShowcaseProfiles,
  sampleMilestones,
} from "./healthProfileShowcase";

describe("health profile showcase", () => {
  it("quotes on the home page exactly what its sample charts draw", () => {
    const pain = painTrendSeries(SAMPLE_PAIN_ASSESSMENTS);
    const ortho = SHOWCASE_PROFILES.find((p) => p.specialty === "ortho")!;
    expect(`${pain[0].percent / 10}/10`).toBe(ortho.headline.from);
    expect(`${pain[pain.length - 1].percent / 10}/10`).toBe(ortho.headline.to);

    const neuro = SHOWCASE_PROFILES.find((p) => p.specialty === "neuro")!;
    expect(`${SAMPLE_INDEPENDENCE[0].value}/10`).toBe(neuro.headline.from);
    expect(`${SAMPLE_INDEPENDENCE.at(-1)!.value}/10`).toBe(neuro.headline.to);

    const paeds = SHOWCASE_PROFILES.find((p) => p.specialty === "pediatrics")!;
    expect(String(SAMPLE_MILESTONE_COUNTS[0].value)).toBe(paeds.headline.from);
    expect(String(SAMPLE_MILESTONE_COUNTS.at(-1)!.value)).toBe(paeds.headline.to);
    expect(sampleMilestones().filter((m) => m.done)).toHaveLength(SAMPLE_MILESTONE_COUNTS.at(-1)!.value);
  });

  it("asks the real intake questions, and only for enabled specialties", () => {
    for (const p of SHOWCASE_PROFILES) expect(p.asks.length).toBeGreaterThan(3);
    expect(enabledShowcaseProfiles(["neuro"]).map((p) => p.specialty)).toEqual(["neuro"]);
    expect(enabledShowcaseProfiles([])).toEqual([]);
  });
});
