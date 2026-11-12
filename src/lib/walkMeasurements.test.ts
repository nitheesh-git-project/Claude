import { describe, expect, it } from "vitest";
import { restingReadings, unsavedBloodPressure } from "@/lib/walkMeasurements";

describe("a half-entered blood pressure", () => {
  const base = { measuredAt: "2026-10-27T10:00:00.000Z", conditions: { setting: "in_person" as const } };

  it("is not stored, and is named so the screen can say so", () => {
    expect(restingReadings({ systolic: 200 }, base).map((r) => r.measurement.measureKey)).toEqual([]);
    expect(unsavedBloodPressure({ systolic: 200 }, "Blood pressure before the walk")).toEqual([
      "Blood pressure before the walk (the bottom number was missing, so it needs both)",
    ]);
    expect(unsavedBloodPressure({ diastolic: 110 }, "Blood pressure after the walk")[0]).toContain("the top number was missing");
  });

  it("names nothing when both or neither number is there", () => {
    expect(unsavedBloodPressure({ systolic: 120, diastolic: 80 }, "x")).toEqual([]);
    expect(unsavedBloodPressure({ spo2: 96 }, "x")).toEqual([]);
    expect(restingReadings({ systolic: 120, diastolic: 80 }, base).map((r) => r.measurement.measureKey)).toEqual(["blood_pressure"]);
  });
});
