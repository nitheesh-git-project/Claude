import { describe, expect, it } from "vitest";
import { JOINT_MOVEMENTS, outcomeMeasure } from "@/lib/outcomeMeasures";
import { JOINT_LANDMARKS, joinJointVariant, landmarksFor, splitJointVariant } from "@/lib/jointLandmarks";

describe("jointLandmarks", () => {
  it("has a how-to-measure card for every movement the registry lists, and no others", () => {
    expect(Object.keys(JOINT_LANDMARKS).sort()).toEqual(JOINT_MOVEMENTS.map((m) => m.key).sort());
    for (const m of JOINT_MOVEMENTS) {
      const l = landmarksFor(m.key)!;
      expect(l.position.length).toBeGreaterThan(3);
      expect(l.centre.length).toBeGreaterThan(3);
    }
  });

  it("splits and joins exactly the variants the registry stores", () => {
    const variants = outcomeMeasure("joint_range")!.variants!;
    for (const v of variants) {
      const split = splitJointVariant(v.key);
      expect(split).not.toBeNull();
      expect(joinJointVariant(split!.movement, split!.mode)).toBe(v.key);
    }
    expect(variants.length).toBe(JOINT_MOVEMENTS.length * 2);
  });

  it("refuses what is not a joint variant", () => {
    expect(splitJointVariant(null)).toBeNull();
    expect(splitJointVariant("knee_flexion")).toBeNull();
    expect(splitJointVariant("nonsense_active")).toBeNull();
    expect(joinJointVariant("knee_flexion", "")).toBe("");
    expect(joinJointVariant("nonsense", "active")).toBe("");
  });

  it("explains the knee extension lag and the minus sign", () => {
    expect(landmarksFor("knee_extension")!.note).toMatch(/extension lag/);
    expect(landmarksFor("knee_extension")!.note).toMatch(/minus/);
  });
});
