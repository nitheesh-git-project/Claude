import { describe, expect, it } from "vitest";
import { oxygenBar, stopAtOnceItems, walkTrack } from "./cardioPicture";
import { CARDIO_STOP_AT_ONCE } from "./cardioSafety";

const walk = (first: number | null, latest: number | null, prediction: unknown) =>
  ({
    walk: {
      first: first === null ? null : { value: first, measuredAt: "2026-08-01T00:00:00Z", measurementId: "a" },
      latest: latest === null ? null : { value: latest, measuredAt: "2026-10-01T00:00:00Z", measurementId: "b" },
      prediction,
    },
    predictionNeeds: ["height", "weight"],
    measuresFailed: false,
    personFailed: false,
  }) as never;

describe("the six-minute walk track", () => {
  it("scales to the biggest of first, latest and predicted, and states the change", () => {
    const m = walkTrack(walk(285, 430, { status: "ok", predictedMetres: 565, percent: 76, equation: "X", working: "" }), "clinician")!;
    expect(m.max).toBe(700);
    expect(m.predicted).toMatchObject({ value: 565, percentText: "76%" });
    expect(m.first?.pct).toBeCloseTo((285 / 700) * 100);
    expect(m.changeText).toBe("A change of about 25 to 35 metres is a real one; gained 145.");
  });
  it("names what is missing instead of a percentage", () => {
    const m = walkTrack(walk(null, 430, { status: "missing", text: "x" }), "patient")!;
    expect(m.predicted).toBeNull();
    expect(m.first).toBeNull();
    expect(m.predictionText).toBe("The expected distance for someone like you needs height, weight.");
  });
  it("is nothing before a walk", () => {
    expect(walkTrack(walk(null, null, { status: "not_chosen", text: "" }), "patient")).toBeNull();
  });
});

describe("the oxygen bar", () => {
  const vitals = (rest: number | null, lowest: number | null) => ({
    spo2Rest: rest === null ? null : { value: rest, measuredAt: "", measurementId: "" },
    spo2Lowest: lowest === null ? null : { value: lowest, measuredAt: "", measurementId: "" },
  });
  it("marks the patient's own limit on an 80-100 scale", () => {
    const m = oxygenBar({ limit: { percent: 88 } as never, vitals: vitals(97, 91) as never });
    expect(m.limit).toEqual({ percent: 88, pct: 40 });
    expect(m.rest?.pct).toBeCloseTo(85);
    expect(m.lowest?.pct).toBeCloseTo(55);
  });
  it("keeps a reading under the scale at the edge and says so", () => {
    const m = oxygenBar({ limit: { percent: 88 } as never, vitals: vitals(null, 76) as never });
    expect(m.lowest?.pct).toBe(0);
    expect(m.lowestBelowScale).toBe(true);
    expect(m.rest).toBeNull();
  });
});

describe("the stop-at-once list", () => {
  it("names the patient's own oxygen limit", () => {
    const items = stopAtOnceItems(CARDIO_STOP_AT_ONCE, 88, "patient");
    expect(items).toContain("Your oxygen reading falls below 88%");
    expect(items).toContain("Chest pain or tightness");
    expect(stopAtOnceItems(CARDIO_STOP_AT_ONCE, 90, "clinician")).toContain("Oxygen below the patient's stop limit (90%)");
  });
});
