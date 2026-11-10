import { describe, expect, it } from "vitest";
import { changeWord, inferPhase, keyTile, seriesDelta, directionHint, pickHeadlineSeries, readingText, riskLineFor, scaleLine, seriesName } from "@/lib/progressView";
import { changeDirection } from "@/lib/outcomeMeasures";
import type { MeasureSeries } from "@/lib/outcomeSeries";

const line = (over: Partial<MeasureSeries>, points = 2): MeasureSeries => ({
  key: over.key ?? "k",
  measureKey: "lefs",
  variant: null,
  side: null,
  medicationState: null,
  joinPoints: true,
  known: true,
  label: "Lower Extremity Functional Scale",
  plainName: "Everyday activities",
  variantLabel: null,
  unit: "0-80",
  decimals: 0,
  better: "higher",
  points: Array.from({ length: points }, (_, i) => ({
    measurementId: `m${i}`,
    value: i,
    measuredAt: "2026-10-01T00:00:00.000Z",
    reviewKey: `r${i}`,
    appointmentId: null,
    setting: null,
    recordedBy: "t",
    testerName: null,
    estimatedFromImage: false,
    readFrom: null,
    readingsInReview: 1,
  })),
  ...over,
});

describe("seriesName", () => {
  it("uses the plain name for a patient and the test's own for a clinician", () => {
    expect(seriesName(line({}), "patient")).toBe("Everyday activities");
    expect(seriesName(line({}), "clinician")).toBe("Lower Extremity Functional Scale");
  });
  it("keeps variant, side and medication state in the name so two lines never look alike", () => {
    const s = line({ variantLabel: "Knee bend", side: "right", medicationState: "off" });
    expect(seriesName(s, "patient")).toBe("Everyday activities - Knee bend (right, OFF)");
  });
});

describe("scaleLine and directionHint", () => {
  it("names the scale, its range and its direction", () => {
    expect(scaleLine("lefs")).toBe("Lower Extremity Functional Scale, 0 to 80. Higher is better.");
  });
  it("is null for an unknown key", () => {
    expect(scaleLine("nope")).toBeNull();
  });
  it("hints for every direction", () => {
    expect(directionHint("lower")).toBe("Lower is better.");
    expect(directionHint(null)).toBeNull();
    expect(directionHint("hold")).toMatch(/level/);
  });
});

describe("riskLineFor", () => {
  it("returns the fixed cut-off that applies to the profile kind", () => {
    expect(riskLineFor("gait_speed_4m", "geriatric")?.value).toBe(0.8);
  });
  it("returns a fixed norm when there is no cut-off", () => {
    expect(riskLineFor("strength_symmetry", "ortho")?.value).toBe(90);
  });
  it("draws nothing for a line that needs the patient's age, sex or own limit", () => {
    expect(riskLineFor("chair_stand_30s", "geriatric")).toBeNull();
    expect(riskLineFor("lowest_spo2", "cardiopulmonary")).toBeNull();
  });
  it("is null for an unknown key", () => {
    expect(riskLineFor("nope", "ortho")).toBeNull();
  });
});

describe("pickHeadlineSeries", () => {
  it("prefers lines with a trend, keeps registry order among equals and skips unknown lines", () => {
    const a = line({ key: "a" }, 1);
    const b = line({ key: "b" }, 4);
    const c = line({ key: "c" }, 4);
    const unknown = line({ key: "u", known: false }, 9);
    const empty = line({ key: "e" }, 0);
    expect(pickHeadlineSeries([a, b, c, unknown, empty], 2).map((s) => s.key)).toEqual(["b", "c"]);
    expect(pickHeadlineSeries([a, b, c], 4).map((s) => s.key)).toEqual(["b", "c", "a"]);
  });
});

describe("readingText", () => {
  it("joins number and unit", () => {
    expect(readingText(122, 0, "degrees")).toBe("122°");
  });
});

describe("seriesDelta", () => {
  const withValues = (values: number[], over: Partial<MeasureSeries> = {}): MeasureSeries => {
    const base = line({ measureKey: "lefs", ...over }, values.length);
    return { ...base, points: base.points.map((p, i) => ({ ...p, value: values[i] })) };
  };
  it("is null for one review or an unknown line", () => {
    expect(seriesDelta(withValues([30]), "ortho")).toBeNull();
    expect(seriesDelta(withValues([30, 50], { known: false }), "ortho")).toBeNull();
  });
  it("calls a real move the right way good, with the unit", () => {
    expect(seriesDelta(withValues([32, 58]), "ortho")).toMatchObject({ text: "Up 26", tone: "good" });
  });
  it("calls a move inside the error neutral", () => {
    expect(seriesDelta(withValues([32, 34]), "ortho")?.tone).toBe("neutral");
  });
  it("calls a real move the wrong way bad", () => {
    expect(seriesDelta(withValues([58, 32]), "ortho")).toMatchObject({ text: "Down 26", tone: "bad" });
  });
});

describe("keyTile", () => {
  const two = (() => {
    const base = line({ measureKey: "lefs" }, 2);
    return { ...base, points: base.points.map((p, i) => ({ ...p, value: [32, 58][i] })) } as MeasureSeries;
  })();
  it("shows the latest reading, the move since the first and the goal", () => {
    const tile = keyTile(
      two,
      [{ id: "m", linkedMeasureKey: "lefs", linkedVariant: null, linkedSide: null, targetValue: 70, sortOrder: 1, status: "working", reachedAt: null }],
      "ortho",
      "patient"
    );
    expect(tile).toMatchObject({ valueText: "58", deltaText: "Up 26 from 32", deltaTone: "good", goalText: "Goal: 70" });
    expect(tile.sparkPath).toMatch(/^M /);
  });
  it("has no sparkline or judgement on the first reading", () => {
    const one = { ...two, points: [two.points[0]] };
    const tile = keyTile(one, [], "ortho", "patient");
    expect(tile).toMatchObject({ deltaText: "First reading", sparkPath: null, goalText: null });
  });
});

describe("inferPhase", () => {
  const ms = (sortOrder: number, phase: string | null, reached: boolean) => ({
    status: reached ? "reached" : "planned",
    reachedAt: reached ? "2026-09-01T00:00:00.000Z" : null,
    phase,
    sortOrder,
  });
  it("is the phase of the first milestone not yet reached", () => {
    expect(inferPhase([ms(2, "Strengthen", false), ms(1, "Restore movement", true)], "ortho")).toBe("Strengthen");
  });
  it("is the last reached phase when everything is reached", () => {
    expect(inferPhase([ms(1, "Settle pain", true), ms(2, "Restore movement", true)], "ortho")).toBe("Restore movement");
  });
  it("ignores a phase that is not one of the kind's own and gives null with none", () => {
    expect(inferPhase([ms(1, "Not a phase", false)], "ortho")).toBeNull();
    expect(inferPhase([], "ortho")).toBeNull();
  });
});

describe("change words come from changeDirection and the better direction", () => {
  const rowChange = (key: string, from: number, to: number) => changeDirection(key, from, to, { profileKind: "ortho" });
  it("reads a higher-is-better percentage measure as Better, not Changed", () => {
    const change = rowChange("strength_symmetry", 60, 78);
    expect(change).toBe("better");
    expect(changeWord(change!)).toBe("Better");
    expect(changeWord(rowChange("strength_symmetry", 78, 60)!)).toBe("Worse");
  });
  it("uses the same word as a degrees measure that moved the right way", () => {
    expect(changeWord(changeDirection("joint_range", 80, 117, { profileKind: "ortho", normal: 135 })!)).toBe(changeWord(rowChange("strength_symmetry", 60, 78)!));
  });
  it("keeps the other words", () => {
    expect(changeWord("no_change")).toBe("No real change");
    expect(changeWord("changed")).toBe("Changed");
  });
});

describe("keyTile labels", () => {
  it("uses the short label with the full name kept for assistive text", () => {
    const base = line({ measureKey: "pain_nprs", plainName: "Pain score" }, 2);
    const tile = keyTile(base, [], "ortho", "patient", [base]);
    expect(tile.label).toBe("Pain score");
    expect(tile.fullLabel).toBe("Pain score");
  });
});
