import { describe, expect, it } from "vitest";
import { singularUnit, unitForValue } from "./unitPlural";
import { formatReading, describeDelta } from "./progressChart";

describe("unitForValue", () => {
  it("singularises registry word units at exactly 1", () => {
    expect(unitForValue("steps", "1")).toBe("step");
    expect(unitForValue("seconds", 1)).toBe("second");
    expect(unitForValue("episodes / week", "1")).toBe("episode / week");
    expect(unitForValue("minutes", "1")).toBe("minute");
    expect(unitForValue("stands", "1")).toBe("stand");
    expect(unitForValue("metres", "1")).toBe("metre");
  });
  it("leaves other values and non-plural units alone", () => {
    expect(unitForValue("steps", "2")).toBe("steps");
    expect(unitForValue("steps", "1.5")).toBe("steps");
    expect(unitForValue("steps", "0")).toBe("steps");
    expect(unitForValue("m/s", "1")).toBe("m/s");
    expect(unitForValue("min / week", "1")).toBe("min / week");
    expect(unitForValue("degrees", "1")).toBe("degrees");
    expect(singularUnit("months (corrected age)")).toBe("month (corrected age)");
  });
});

describe("readings use it", () => {
  it("formatReading and describeDelta", () => {
    expect(formatReading(1, 0, "steps")).toBe("1 step");
    expect(formatReading(3, 0, "steps")).toBe("3 steps");
    expect(formatReading(1, 0, "episodes / week")).toBe("1 episode / week");
    expect(formatReading(1, 0, "degrees")).toBe("1°");
    expect(describeDelta({ first: 4, now: 5, decimals: 0, unit: "seconds", change: "better" })?.text).toContain("1 second");
  });
});
