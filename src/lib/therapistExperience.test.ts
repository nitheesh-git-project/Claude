import { describe, it, expect } from "vitest";
import {
  MAX_YEARS_EXPERIENCE,
  parseYearsExperience,
} from "@/lib/therapistExperience";

describe("years of experience", () => {
  it("reads a plain whole number, as a string or a number", () => {
    expect(parseYearsExperience("6")).toBe(6);
    expect(parseYearsExperience(6)).toBe(6);
    expect(parseYearsExperience(" 12 ")).toBe(12);
  });

  it("treats nothing said as null rather than zero", () => {
    // Zero is a real answer -- somebody who qualified this year -- so it must
    // not be what an unanswered question stores.
    expect(parseYearsExperience(null)).toBeNull();
    expect(parseYearsExperience(undefined)).toBeNull();
    expect(parseYearsExperience("")).toBeNull();
    expect(parseYearsExperience("   ")).toBeNull();
    expect(parseYearsExperience("0")).toBe(0);
  });

  it("refuses a value that was given and cannot be used", () => {
    // The commonest of these is the year they qualified, typed into the box
    // asking how many years it has been.
    expect(parseYearsExperience("2024")).toBeUndefined();
    expect(parseYearsExperience("-3")).toBeUndefined();
    expect(parseYearsExperience("6.5")).toBeUndefined();
    expect(parseYearsExperience("six")).toBeUndefined();
    expect(parseYearsExperience(MAX_YEARS_EXPERIENCE + 1)).toBeUndefined();
  });

  it("allows the bound itself", () => {
    expect(parseYearsExperience(MAX_YEARS_EXPERIENCE)).toBe(MAX_YEARS_EXPERIENCE);
  });

  it("tells a blank apart from a refusal", () => {
    // The whole reason the return type is `number | null | undefined`: a
    // caller that collapsed these two would save a typo as "not said".
    expect(parseYearsExperience("")).not.toBe(parseYearsExperience("2024"));
  });
});
