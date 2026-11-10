import { describe, expect, it } from "vitest";
import { PAIN_SCORES, painChangeWords, painPercentFromScore, painScoreFromPercent, painStepStartArea } from "@/lib/painScale";
import { formatPainOutOfTen, PAIN_MAP_REGIONS } from "@/lib/painMap";

const known = new Set(PAIN_MAP_REGIONS.map((r) => r.key as string));

describe("the 0-10 pain buttons", () => {
  it("offers eleven whole numbers and stores each times ten, as the column always held", () => {
    expect(PAIN_SCORES).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(painPercentFromScore(6)).toBe(60);
    expect(painPercentFromScore(0)).toBe(0);
    expect(painPercentFromScore(11)).toBeNull();
    expect(painPercentFromScore(5.5)).toBeNull();
  });
  it("lands a stored reading on its button, and leaves an older in-between one off the buttons", () => {
    expect(painScoreFromPercent(70)).toBe(7);
    expect(painScoreFromPercent(34)).toBeNull();
    // The one pain scale rule still holds: the in-between reading is shown out of ten.
    expect(formatPainOutOfTen(34)).toBe("3.4/10");
  });
  it("says the change out of ten", () => {
    expect(painChangeWords(60, 60)).toBe("Same as last time");
    expect(painChangeWords(60, 40)).toBe("Down 2 from last time");
    expect(painChangeWords(34, 50)).toBe("Up 1.6 from last time");
  });
});

describe("where the pain step starts", () => {
  it("prefers the latest exam, then the worst intake area, then the protocol's joint", () => {
    const exams = [
      { region: "hip", side: "left", created_at: "2026-10-01T10:00:00Z" },
      { region: "knee", side: "right", created_at: "2026-10-20T10:00:00Z" },
    ];
    expect(painStepStartArea({ exams, intakeAreas: [], knownRegions: known })).toEqual({ region: "knee", side: "right" });
    expect(
      painStepStartArea({
        exams: [],
        intakeAreas: [
          { region: "lower_back", side: "na", pain: 3 },
          { region: "knee", side: "left", pain: 8 },
        ],
        knownRegions: known,
      })
    ).toEqual({ region: "knee", side: "left" });
    expect(painStepStartArea({ exams: [], intakeAreas: [], fallbackRegion: "knee", knownRegions: known })).toEqual({ region: "knee", side: "na" });
    expect(painStepStartArea({ exams: [], intakeAreas: [], knownRegions: known })).toBeNull();
  });
});
